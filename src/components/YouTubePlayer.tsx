import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SubtitleSegment } from '../types';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Tv,
} from 'lucide-react';
import { formatTime } from '../utils/subtitleParser';
import { playPauseTone } from '../utils/audioEffects';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string;
  subtitles: SubtitleSegment[];
  currentSegmentIndex: number;
  isPausedForDictation: boolean;
  playbackRate: number;
  autoPauseEnabled: boolean;
  onTimeUpdate: (currentTime: number) => void;
  onSeek?: (seconds: number) => void;
  onSegmentEndReached: (segmentIndex: number) => void;
  onRateChange?: (rate: number) => void;
  playerRefCallback?: (actions: {
    play: () => void;
    pause: () => void;
    seekTo: (seconds: number) => void;
    replayCurrentSegment: () => void;
  }) => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  subtitles,
  currentSegmentIndex,
  isPausedForDictation,
  playbackRate,
  autoPauseEnabled,
  onTimeUpdate,
  onSeek,
  onSegmentEndReached,
  onRateChange,
  playerRefCallback,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const playerInstanceRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTimeState] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isCleanMode, setIsCleanMode] = useState(true); // Pure video mode: crops YouTube title bar & branding

  const intervalRef = useRef<number | null>(null);
  const lastPolledTimeRef = useRef<number>(0);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const subtitlesRef = useRef(subtitles);
  subtitlesRef.current = subtitles;

  const currentSegmentIndexRef = useRef(currentSegmentIndex);
  currentSegmentIndexRef.current = currentSegmentIndex;

  const isPausedForDictationRef = useRef(isPausedForDictation);
  isPausedForDictationRef.current = isPausedForDictation;

  const autoPauseEnabledRef = useRef(autoPauseEnabled);
  autoPauseEnabledRef.current = autoPauseEnabled;

  // Local latch to guarantee exactly one auto-pause trigger per segment
  const isAlreadyPausedRef = useRef<boolean>(false);
  const currentSeg = subtitles[currentSegmentIndex];

  useEffect(() => {
    isAlreadyPausedRef.current = false;
  }, [currentSegmentIndex]);

  useEffect(() => {
    if (!isPausedForDictation) {
      isAlreadyPausedRef.current = false;
    }
  }, [isPausedForDictation]);

  // Load YouTube Iframe API Script
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiLoaded(true);
      return;
    }

    const existingScript = document.getElementById('youtube-iframe-api');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      setIsApiLoaded(true);
    };
  }, []);

  // Initialize Player with controls=0 (YouTube player completely hidden!)
  useEffect(() => {
    if (!isApiLoaded || !containerRef.current) return;

    const playerId = `yt-embed-player-${videoId}`;
    let playerDiv = document.getElementById(playerId);

    if (!playerDiv && containerRef.current) {
      containerRef.current.innerHTML = `<div id="${playerId}" class="w-full h-full"></div>`;
    }

    if (playerInstanceRef.current) {
      try {
        playerInstanceRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying player:', e?.message || 'unknown error');
      }
      playerInstanceRef.current = null;
      setIsPlayerReady(false);
    }

    const newPlayer = new window.YT.Player(playerId, {
      videoId: videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0, // Completely hide YouTube default controls
        disablekb: 1, // Strictly disable keyboard controls
        fs: 0,
        iv_load_policy: 3, // Disable annotations/video title cards
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        playsinline: 1,
        enablejsapi: 1,
        cc_load_policy: 0, // Disable YouTube's built-in subtitles so they don't cover the video
        origin: window.location.origin,
      },
      events: {
        onReady: (event: any) => {
          playerInstanceRef.current = event.target;
          setIsPlayerReady(true);
          try {
            event.target.setPlaybackRate(playbackRate);
            const d = event.target.getDuration();
            if (d && !isNaN(d)) setDuration(d);
            // Disable YouTube native captions so they do not clash with dictation
            event.target.unloadModule('captions');
            event.target.unloadModule('cc');
          } catch {}
        },
        onStateChange: (event: any) => {
          const isNowPlaying = event.data === 1;
          setIsPlaying(isNowPlaying);
          if (isNowPlaying && playerInstanceRef.current) {
            const d = playerInstanceRef.current.getDuration();
            if (d && !isNaN(d)) setDuration(d);

            // Strict enforcement: if paused for dictation, NEVER ALLOW PLAYING
            if (isPausedForDictationRef.current) {
              try {
                playerInstanceRef.current.pauseVideo();
              } catch {}
              setIsPlaying(false);
              return;
            }

            // Strict enforcement: if current segment is at or beyond the segment end, pause immediately!
            const idx = currentSegmentIndexRef.current;
            const segs = subtitlesRef.current;
            const currentSeg = segs && segs[idx];
            if (currentSeg) {
              const curT = playerInstanceRef.current.getCurrentTime();
              if (curT >= currentSeg.end - 0.06) {
                try {
                  playerInstanceRef.current.pauseVideo();
                } catch {}
                setIsPlaying(false);
              }
            }
          }
        },
      },
    });

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isApiLoaded, videoId]);

  useEffect(() => {
    if (playerInstanceRef.current && isPlayerReady) {
      try {
        playerInstanceRef.current.setPlaybackRate(playbackRate);
      } catch {}
    }
  }, [playbackRate, isPlayerReady]);

  const replayCurrentSegment = useCallback(() => {
    const idx = currentSegmentIndexRef.current;
    const segs = subtitlesRef.current;
    if (segs && segs[idx]) {
      isAlreadyPausedRef.current = false;
      isPausedForDictationRef.current = false;
      const startSec = Math.max(0, segs[idx].start);
      if (playerInstanceRef.current && isPlayerReady) {
        try {
          playerInstanceRef.current.seekTo(startSec, true);
          setCurrentTimeState(startSec);
          lastPolledTimeRef.current = startSec;
          playerInstanceRef.current.playVideo();
          setIsPlaying(true);
        } catch {}
      }
    }
  }, [isPlayerReady]);

  const play = useCallback(
    (force: boolean = false) => {
      if (playerInstanceRef.current && isPlayerReady) {
        const idx = currentSegmentIndexRef.current;
        const segs = subtitlesRef.current;
        const seg = segs && segs[idx];
        const curT = playerInstanceRef.current.getCurrentTime() || 0;

        // If at or past segment end, replay from start of this segment so they can hear it
        if (!force && seg && curT >= seg.end - 0.1) {
          replayCurrentSegment();
          return;
        }

        try {
          isAlreadyPausedRef.current = false;
          isPausedForDictationRef.current = false;
          setIsPlaying(true);
          playerInstanceRef.current.playVideo();
        } catch {}
      }
    },
    [isPlayerReady, replayCurrentSegment]
  );

  const pause = useCallback(() => {
    if (playerInstanceRef.current && isPlayerReady) {
      try {
        setIsPlaying(false);
        playerInstanceRef.current.pauseVideo();
      } catch {}
    }
  }, [isPlayerReady]);

  // Programmatic seek (e.g. Next segment or reset)
  const seekTo = useCallback((seconds: number) => {
    if (playerInstanceRef.current && isPlayerReady) {
      try {
        isAlreadyPausedRef.current = false;
        playerInstanceRef.current.seekTo(seconds, true);
        setCurrentTimeState(seconds);
        lastPolledTimeRef.current = seconds;
      } catch {}
    }
  }, [isPlayerReady]);

  const programmaticSeek = useCallback(
    (seconds: number) => {
      if (playerInstanceRef.current && isPlayerReady) {
        isAlreadyPausedRef.current = false;
        isPausedForDictationRef.current = false;
        playerInstanceRef.current.seekTo(seconds, true);
        setCurrentTimeState(seconds);
        lastPolledTimeRef.current = seconds;
      }
    },
    [isPlayerReady]
  );

  // User manual seek (clicking progress bar, scrubbing, or +-5s)
  const handleUserSeek = useCallback(
    (seconds: number) => {
      if (playerInstanceRef.current && isPlayerReady) {
        let target = seconds;
        const idx = currentSegmentIndexRef.current;
        const segs = subtitlesRef.current;
        const seg = segs[idx];

        // Strict Enforcement: Cannot manually seek past the end of an uncompleted segment
        if (autoPauseEnabledRef.current && seg && !seg.completed) {
          if (target > seg.end - 0.05) {
            target = seg.end - 0.05;
          }
        }

        try {
          isAlreadyPausedRef.current = false;
          playerInstanceRef.current.seekTo(target, true);
          setCurrentTimeState(target);
          lastPolledTimeRef.current = target;
          onSeek?.(target);
        } catch {}
      }
    },
    [isPlayerReady, onSeek]
  );

  const skipSeconds = (delta: number) => {
    if (!playerInstanceRef.current) return;
    const target = Math.max(0, Math.min(duration || 9999, currentTime + delta));
    handleUserSeek(target);
  };

  const toggleMute = () => {
    if (!playerInstanceRef.current) return;
    if (isMuted) {
      playerInstanceRef.current.unMute();
      setIsMuted(false);
    } else {
      playerInstanceRef.current.mute();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    if (!playerInstanceRef.current) return;
    setVolume(newVol);
    playerInstanceRef.current.setVolume(newVol);
    if (newVol > 0 && isMuted) {
      playerInstanceRef.current.unMute();
      setIsMuted(false);
    }
  };

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Progress Bar Seek / Scrubbing by User
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percentage * duration;
    handleUserSeek(targetTime);
  };

  useEffect(() => {
    if (playerRefCallback) {
      playerRefCallback({
        play: (force = false) => play(force),
        pause,
        seekTo,
        replayCurrentSegment,
      });
    }
  }, [playerRefCallback, play, pause, seekTo, replayCurrentSegment]);

  // Polling loop for precise subtitle tracking & auto-pause
  useEffect(() => {
    if (!isPlayerReady) return;

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      if (!playerInstanceRef.current) return;

      try {
        const time = playerInstanceRef.current.getCurrentTime();
        if (typeof time === 'number' && !isNaN(time)) {
          setCurrentTimeState(time);
          onTimeUpdate(time);
          lastPolledTimeRef.current = time;

          if (!duration || duration === 0) {
            const d = playerInstanceRef.current.getDuration();
            if (d && !isNaN(d) && d > 0) setDuration(d);
          }

          const idx = currentSegmentIndexRef.current;
          const segs = subtitlesRef.current;
          const currentSeg = segs && segs[idx];

          if (currentSeg) {
            const nextSeg = segs[idx + 1];
            // Auto pause cleanly when reaching the end of the current subtitle segment
            // or upon crossing into the next subtitle segment
            const isAtOrPastEnd = time >= currentSeg.end - 0.05;
            const isEnteringNext = nextSeg ? time >= nextSeg.start - 0.04 : false;

            if (isAtOrPastEnd || isEnteringNext) {
              try {
                playerInstanceRef.current.pauseVideo();
              } catch {}
              setIsPlaying(false);

              if (!isAlreadyPausedRef.current) {
                isAlreadyPausedRef.current = true;
                isPausedForDictationRef.current = true;
                playPauseTone();
                onSegmentEndReached(idx);
              }
            }
          }
        }
      } catch (err) {}
    }, 30);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlayerReady, duration, onTimeUpdate, onSegmentEndReached]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      id="custom-youtube-wrapper"
      className="relative w-full bg-black rounded-2xl overflow-hidden border border-stone-800/80 shadow-2xl flex flex-col group"
    >
      {/* 1. Pure Video Display (No YouTube UI & No Titles/Overlays) */}
      <div className="relative w-full aspect-video max-h-[52vh] mx-auto bg-black overflow-hidden select-none">
        <div
          ref={containerRef}
          className={`w-full h-full pointer-events-auto transition-transform duration-300 origin-center ${
            isCleanMode ? 'scale-[1.16] -translate-y-[2%]' : 'scale-100'
          }`}
        />

        {/* Dictation Pause Overlay */}
        {isPausedForDictation && currentSeg && (
          <div
            onClick={replayCurrentSegment}
            className="absolute inset-0 z-20 bg-stone-950/65 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 cursor-pointer transition-all hover:bg-stone-950/75"
            title="დააჭირეთ ხელახლა მოსასმენად (Replay)"
          >
            <div className="flex flex-col items-center text-center max-w-sm px-4 py-3 rounded-xl bg-stone-900/90 border border-amber-500/40 shadow-2xl">
              <div className="flex items-center gap-2 text-amber-400 font-medium text-xs sm:text-sm mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>დაპაუზებულია სუბტიტრის ბოლოს</span>
              </div>
              <p className="text-[11px] sm:text-xs text-stone-300 mb-2.5 leading-relaxed">
                აკრიფეთ კარნახი ქვემოთ ან მოუსმინეთ ამ სუბტიტრს ხელახლა.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  replayCurrentSegment();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold shadow transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>ხელახლა მოსმენა (Shift + Enter)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Custom Minimalist Progress Scrubber Bar */}
      <div
        ref={progressBarRef}
        onClick={handleProgressClick}
        className="relative w-full h-2 bg-stone-800/90 transition-all flex items-center hover:h-3.5 cursor-pointer group/bar"
      >
        {/* Subtitle segment markers on timeline */}
        {duration > 0 &&
          subtitles.map((seg, i) => {
            const leftPct = (seg.start / duration) * 100;
            if (leftPct > 100) return null;
            return (
              <div
                key={seg.id}
                title={`#${i + 1}: ${seg.text.slice(0, 30)}...`}
                className={`absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none ${
                  seg.completed ? 'bg-emerald-400/70' : 'bg-stone-500/50'
                }`}
                style={{ left: `${leftPct}%` }}
              />
            );
          })}

        {/* Played track */}
        <div
          className="h-full bg-amber-500 transition-all pointer-events-none relative"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        >
          {/* Scrubber thumb */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-400 rounded-full shadow opacity-0 group-hover/bar:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* 3. Custom Minimalist Controls Row */}
      <div className="flex items-center justify-between px-4 py-2 bg-stone-900/95 border-t border-stone-800/80 text-stone-300 text-xs font-mono select-none">
        {/* Left: Playback & Rewind/Forward Controls */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-3 ${isPausedForDictation ? 'opacity-50 pointer-events-none' : ''}`}>
            <button
              id="custom-play-btn"
              onClick={() => (isPlaying ? pause() : play())}
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              title={isPlaying ? 'პაუზა' : 'დაკვრა'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
            </button>

            {/* Rewind -5s */}
            <button
              id="custom-rewind-5s-btn"
              onClick={() => skipSeconds(-5)}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer flex items-center gap-1"
              title="გადახვევა -5 წამი"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[11px]">-5s</span>
            </button>

            {/* Forward +5s */}
            <button
              id="custom-forward-5s-btn"
              onClick={() => skipSeconds(5)}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer flex items-center gap-1"
              title="გადახვევა +5 წამი"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[11px]">+5s</span>
            </button>
          </div>

          {/* Replay Current Subtitle Segment */}
          <button
            id="custom-replay-sub-btn"
            onClick={replayCurrentSegment}
            className="px-2.5 py-1 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
            title="მიმდინარე სუბტიტრის გამეორება (Shift + Enter)"
          >
            <RotateCcw className="w-3 h-3 text-amber-400" />
            <span className="text-[11px]">სუბტიტრის გამეორება</span>
          </button>

          {/* Time Display */}
          <span className="text-stone-400 text-xs ml-1 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Dictation pause status indicator */}
          {isPausedForDictation && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              <span>სუბტიტრი დასრულდა</span>
            </div>
          )}
        </div>

        {/* Right: Clean Mode Toggle, Volume & Fullscreen */}
        <div className="flex items-center gap-2.5">
          {/* Clean Mode Toggle */}
          <button
            onClick={() => setIsCleanMode(!isCleanMode)}
            className={`px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
              isCleanMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            }`}
            title={
              isCleanMode
                ? 'სუფთა რეჟიმი: სათაურებისა და წარწერების გარეშე (დააწკაპუნეთ ორიგინალისთვის)'
                : 'სრული კადრი: დააწკაპუნეთ წარწერების დასამალად'
            }
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isCleanMode ? 'სუფთა ვიდეო' : 'სრული კადრი'}</span>
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="p-1 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
              title={isMuted ? 'ხმის ჩართვა' : 'ხმის გათიშვა'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-16 h-1 accent-amber-500 bg-stone-800 rounded cursor-pointer"
            />
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1 text-stone-400 hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'სრულეკრანიანიდან გამოსვლა' : 'სრულ ეკრანზე'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
