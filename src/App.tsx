import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  SubtitleSegment,
  PracticeSettings,
  VideoPlan,
  VocabularyItem,
  WordExplanation,
  SavedVideoProgress,
  MemoryTaskType,
} from './types';
import { YouTubePlayer } from './components/YouTubePlayer';
import { DictationInput } from './components/DictationInput';
import { WordExplainerModal } from './components/WordExplainerModal';
import { ReviewNotificationToast } from './components/ReviewNotificationToast';
import { VocabularyDrawer } from './components/VocabularyDrawer';
import { SavedVideosList } from './components/SavedVideosList';
import { ScientificMemoryTaskModal } from './components/ScientificMemoryTaskModal';
import { PhoneNotificationModal } from './components/PhoneNotificationModal';
import {
  extractYouTubeVideoId,
  extractYouTubeStartTime,
  parseSRT,
  parseTimestampedText,
  findSegmentIndexAtTime,
} from './utils/subtitleParser';
import {
  loadVocabulary,
  saveVocabulary,
  addWordToVocabulary,
  getDueItems,
  recordReviewResult,
} from './utils/spacedRepetition';
import {
  initNotificationService,
  checkAndNotifyDueWords,
  areNotificationsEnabled,
} from './utils/notificationService';
import {
  loadAllSavedVideos,
  saveVideoProgress,
  getVideoProgress,
  deleteSavedVideo,
} from './utils/videoStorage';
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Plus,
  BookMarked,
  Bell,
  Bookmark,
  Smartphone,
  Brain,
} from 'lucide-react';

export default function App() {
  // Input screen state
  const [youtubeInput, setYoutubeInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualText, setManualText] = useState('');

  // Saved videos & history
  const [savedVideos, setSavedVideos] = useState<SavedVideoProgress[]>([]);
  const [isSavedVideosOpen, setIsSavedVideosOpen] = useState(false);

  // Active video & study plan state
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [hasStartedSession, setHasStartedSession] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isPausedForDictation, setIsPausedForDictation] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Spaced Repetition Vocabulary & Scientific Memory Tasks State
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [activeReviewItem, setActiveReviewItem] = useState<VocabularyItem | null>(null);
  const [activeMemoryTaskItem, setActiveMemoryTaskItem] = useState<VocabularyItem | null>(null);
  const [isVocabDrawerOpen, setIsVocabDrawerOpen] = useState(false);
  const [isPhoneNotificationModalOpen, setIsPhoneNotificationModalOpen] = useState(false);
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);

  // Player actions ref
  const playerControlsRef = useRef<{
    play: (force?: boolean) => void;
    pause: () => void;
    seekTo: (seconds: number) => void;
    replayCurrentSegment: () => void;
  } | null>(null);

  // Practice Settings
  const [settings, setSettings] = useState<PracticeSettings>({
    playbackRate: 1.0,
    mode: 'dictation', // 'dictation' (subtitles hidden until typed) or 'shadowing' (visible)
    ignorePunctuation: true,
    ignoreCase: true,
    autoReplayOnFail: false,
    soundEffects: true,
    autoResumeNext: true,
  });

  // Word Explainer
  const [explainingWord, setExplainingWord] = useState<string | null>(null);
  const [explainingSentence, setExplainingSentence] = useState('');

  // Load saved vocabulary and saved video progress on mount & initialize PWA notifications
  useEffect(() => {
    setVocabulary(loadVocabulary());
    setSavedVideos(loadAllSavedVideos());
    initNotificationService().then(() => {
      setNotificationsAllowed(areNotificationsEnabled());
    });
  }, []);

  // Scientific spaced repetition check (every 30s: triggers phone notifications & due modal)
  useEffect(() => {
    const runCheck = () => {
      const due = getDueItems();
      if (due.length > 0) {
        // Trigger phone / desktop push notification with sound & vibration
        checkAndNotifyDueWords(due);

        // Queue on-screen review toast if no modal is active
        if (!activeReviewItem && !activeMemoryTaskItem) {
          setActiveReviewItem(due[0]);
        }
      }
    };

    runCheck();
    const checkInterval = setInterval(runCheck, 25000);

    return () => clearInterval(checkInterval);
  }, [activeReviewItem, activeMemoryTaskItem]);

  // Main Action: Analyze Video Link & Plan
  const handleAnalyzeVideo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAnalysisError(null);
    setShowManualFallback(false);

    const extractedId = extractYouTubeVideoId(youtubeInput);
    const startSec = extractYouTubeStartTime(youtubeInput);

    if (!extractedId) {
      setAnalysisError('გთხოვთ მიუთითოთ ვალიდური YouTube ლინკი ან ვიდეოს 11-ნიშნა ID.');
      return;
    }

    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: extractedId }),
      });

      const data = await res.json();

      if (data.success && data.subtitles && data.subtitles.length > 0) {
        const saved = getVideoProgress(extractedId);
        const completedIdsSet = new Set(saved?.completedIds || []);

        const loadedSubtitles: SubtitleSegment[] = data.subtitles.map(
          (s: SubtitleSegment, idx: number) => ({
            ...s,
            id: idx + 1,
            completed: completedIdsSet.has(idx + 1),
          })
        );
        setVideoId(extractedId);
        setVideoPlan(data.plan || (saved?.title ? { title: saved.title, summary: saved.summary || '', level: 'Auto' } : null));
        setSubtitles(loadedSubtitles);

        let initialIndex = 0;
        if (startSec > 0) {
          const found = loadedSubtitles.findIndex(
            (s) => s.start >= startSec || (s.start <= startSec && s.end >= startSec)
          );
          if (found !== -1) initialIndex = found;
        } else if (
          saved &&
          typeof saved.currentSegmentIndex === 'number' &&
          saved.currentSegmentIndex > 0 &&
          saved.currentSegmentIndex < loadedSubtitles.length
        ) {
          initialIndex = saved.currentSegmentIndex;
        }

        const initialStartTime = loadedSubtitles[initialIndex]?.start || 0;
        setCurrentSegmentIndex(initialIndex);
        setCurrentTime(initialStartTime);
        setIsPausedForDictation(false);

        if (playerControlsRef.current) {
          playerControlsRef.current.seekTo(initialStartTime);
        }

        // Persist to saved videos
        saveVideoProgress({
          videoId: extractedId,
          videoUrl: youtubeInput.trim() || `https://youtu.be/${extractedId}`,
          title: data.plan?.title || saved?.title || 'YouTube ვიდეო',
          summary: data.plan?.summary || saved?.summary || '',
          totalSubtitles: loadedSubtitles.length,
          completedSubtitlesCount: completedIdsSet.size,
          currentSegmentIndex: initialIndex,
          currentTime: initialStartTime,
          completedIds: Array.from(completedIdsSet),
        });
        setSavedVideos(loadAllSavedVideos());
      } else {
        setVideoId(extractedId);
        setAnalysisError(
          data.error ||
            'ამ ვიდეოზე ავტომატური სუბტიტრები ვერ მოიძებნა. შეგიძლიათ ჩასვათ ტრანსკრიპტი ან SRT ქვემოთ:'
        );
        setShowManualFallback(true);
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Select video from saved history
  const handleSelectSavedVideo = async (savedVideoId: string, savedVideoUrl: string) => {
    setYoutubeInput(savedVideoUrl);
    setAnalysisError(null);
    setShowManualFallback(false);
    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: savedVideoId }),
      });

      const data = await res.json();

      if (data.success && data.subtitles && data.subtitles.length > 0) {
        const saved = getVideoProgress(savedVideoId);
        const completedIdsSet = new Set(saved?.completedIds || []);

        const loadedSubtitles: SubtitleSegment[] = data.subtitles.map(
          (s: SubtitleSegment, idx: number) => ({
            ...s,
            id: idx + 1,
            completed: completedIdsSet.has(idx + 1),
          })
        );

        setVideoId(savedVideoId);
        setVideoPlan(
          data.plan || (saved?.title ? { title: saved.title, summary: saved.summary || '', level: 'Auto' } : null)
        );
        setSubtitles(loadedSubtitles);

        const targetIdx =
          saved && typeof saved.currentSegmentIndex === 'number' && saved.currentSegmentIndex < loadedSubtitles.length
            ? saved.currentSegmentIndex
            : 0;

        const targetStartTime = loadedSubtitles[targetIdx]?.start ?? (saved?.currentTime ?? 0);

        setCurrentSegmentIndex(targetIdx);
        setCurrentTime(targetStartTime);
        setIsPausedForDictation(false);
        setHasStartedSession(true);
        setIsSavedVideosOpen(false);

        if (playerControlsRef.current) {
          playerControlsRef.current.seekTo(targetStartTime);
        }
      } else {
        setVideoId(savedVideoId);
        setAnalysisError(data.error || 'ვიდეოს სუბტიტრები ვერ ჩაიტვირთა.');
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'ვიდეოს ჩატვირთვა ვერ მოხერხდა.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteSavedVideo = (targetVideoId: string) => {
    const updated = deleteSavedVideo(targetVideoId);
    setSavedVideos(updated);
  };

  // Fallback for custom pasted transcript / SRT
  const handleApplyManualText = async () => {
    if (!manualText.trim() || !videoId) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    // If SRT
    if (manualText.includes('-->')) {
      const parsed = parseSRT(manualText);
      if (parsed.length > 0) {
        setSubtitles(parsed.map((s, idx) => ({ ...s, id: idx + 1, completed: false })));
        setVideoPlan({
          title: `YouTube Video (${videoId})`,
          summary: 'მომხმარებლის მიერ ჩატვირთული სუბტიტრები.',
          level: 'Custom',
        });
        setShowManualFallback(false);
        setIsAnalyzing(false);
        return;
      }
    }

    // Timestamped
    const parsedTs = parseTimestampedText(manualText);
    if (parsedTs.length > 0) {
      setSubtitles(parsedTs.map((s, idx) => ({ ...s, id: idx + 1, completed: false })));
      setVideoPlan({
        title: `YouTube Video (${videoId})`,
        summary: 'მომხმარებლის მიერ ჩატვირთული სუბტიტრები.',
        level: 'Custom',
      });
      setShowManualFallback(false);
      setIsAnalyzing(false);
      return;
    }

    // Otherwise align with Gemini
    try {
      const res = await fetch('/api/ai/parse-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: manualText, videoId }),
      });
      const data = await res.json();
      if (data.success && data.segments && data.segments.length > 0) {
        setSubtitles(
          data.segments.map((s: SubtitleSegment, idx: number) => ({
            ...s,
            id: idx + 1,
            completed: false,
          }))
        );
        setVideoPlan({
          title: `YouTube Video (${videoId})`,
          summary: 'AI-ით დაყოფილი და სინქრონიზებული ტრანსკრიპტი.',
          level: 'Custom',
        });
        setShowManualFallback(false);
      } else {
        setAnalysisError('ტექსტის დამუშავება ვერ მოხერხდა.');
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'დამუშავების შეცდომა');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Dictation flow handlers
  const handleSegmentEndReached = useCallback((segmentIndex: number) => {
    setIsPausedForDictation(true);
  }, []);

  // When user seeks/scrubs to any second or minute in the video,
  // automatically synchronize the subtitle segment and dictation exercise!
  const handleSeek = useCallback(
    (seekTime: number) => {
      setCurrentTime(seekTime);
      if (!subtitles || subtitles.length === 0) return;

      const targetIdx = findSegmentIndexAtTime(subtitles, seekTime);
      setCurrentSegmentIndex(targetIdx);

      const targetSeg = subtitles[targetIdx];
      // If sought into the segment before its end, allow listening through to the end
      if (targetSeg && seekTime < targetSeg.end - 0.15) {
        setIsPausedForDictation(false);
      } else {
        setIsPausedForDictation(true);
      }

      // Persist progress
      if (videoId) {
        const completedIds = subtitles.filter((s) => s.completed).map((s) => s.id);
        saveVideoProgress({
          videoId,
          videoUrl: `https://youtu.be/${videoId}`,
          title: videoPlan?.title || 'YouTube ვიდეო',
          summary: videoPlan?.summary || '',
          totalSubtitles: subtitles.length,
          completedSubtitlesCount: completedIds.length,
          currentSegmentIndex: targetIdx,
          currentTime: targetSeg ? targetSeg.start : seekTime,
          completedIds,
        });
        setSavedVideos(loadAllSavedVideos());
      }
    },
    [subtitles, videoId, videoPlan]
  );

  const handleTimeUpdate = useCallback(
    (time: number) => {
      setCurrentTime(time);

      if (!subtitles || subtitles.length === 0) return;

      const currentSeg = subtitles[currentSegmentIndex];
      if (currentSeg) {
        const nextSeg = subtitles[currentSegmentIndex + 1];
        const isPastEnd = time >= currentSeg.end - 0.05;
        const isEnteringNext = nextSeg ? time >= nextSeg.start - 0.04 : false;

        if (isPastEnd || isEnteringNext) {
          if (!isPausedForDictation) {
            setIsPausedForDictation(true);
            if (playerControlsRef.current) {
              playerControlsRef.current.pause();
            }
          }
        }
      }
    },
    [subtitles, currentSegmentIndex, isPausedForDictation]
  );

  const handleDictationSuccess = useCallback(() => {
    setSubtitles((prev) => {
      const updated = prev.map((seg, idx) =>
        idx === currentSegmentIndex ? { ...seg, completed: true } : seg
      );

      // Persist progress to localStorage
      if (videoId) {
        const completedIds = updated.filter((s) => s.completed).map((s) => s.id);
        const nextIdx = Math.min(currentSegmentIndex + 1, updated.length - 1);
        saveVideoProgress({
          videoId,
          videoUrl: `https://youtu.be/${videoId}`,
          title: videoPlan?.title || 'YouTube ვიდეო',
          summary: videoPlan?.summary || '',
          totalSubtitles: updated.length,
          completedSubtitlesCount: completedIds.length,
          currentSegmentIndex: nextIdx,
          currentTime: updated[nextIdx]?.start || 0,
          completedIds,
        });
        setSavedVideos(loadAllSavedVideos());
      }

      return updated;
    });

    setIsPausedForDictation(false);

    if (currentSegmentIndex < subtitles.length - 1) {
      const nextIndex = currentSegmentIndex + 1;
      setCurrentSegmentIndex(nextIndex);
      const nextSeg = subtitles[nextIndex];
      if (nextSeg && playerControlsRef.current) {
        playerControlsRef.current.seekTo(nextSeg.start);
        playerControlsRef.current.play(true);
      }
    } else {
      if (playerControlsRef.current) {
        playerControlsRef.current.pause();
      }
    }
  }, [currentSegmentIndex, subtitles, videoId, videoPlan]);

  const handleReplaySegment = useCallback(() => {
    const seg = subtitles[currentSegmentIndex];
    if (seg && playerControlsRef.current) {
      playerControlsRef.current.seekTo(seg.start);
      playerControlsRef.current.play(true);
      setIsPausedForDictation(false);
    }
  }, [currentSegmentIndex, subtitles]);

  const handleSkipSegment = useCallback(() => {
    setIsPausedForDictation(false);
    if (currentSegmentIndex < subtitles.length - 1) {
      const nextIndex = currentSegmentIndex + 1;
      setCurrentSegmentIndex(nextIndex);
      const nextSeg = subtitles[nextIndex];
      if (nextSeg && playerControlsRef.current) {
        playerControlsRef.current.seekTo(nextSeg.start);
        playerControlsRef.current.play(true);
      }

      // Persist progress
      if (videoId) {
        const completedIds = subtitles.filter((s) => s.completed).map((s) => s.id);
        saveVideoProgress({
          videoId,
          videoUrl: `https://youtu.be/${videoId}`,
          title: videoPlan?.title || 'YouTube ვიდეო',
          summary: videoPlan?.summary || '',
          totalSubtitles: subtitles.length,
          completedSubtitlesCount: completedIds.length,
          currentSegmentIndex: nextIndex,
          currentTime: nextSeg ? nextSeg.start : 0,
          completedIds,
        });
        setSavedVideos(loadAllSavedVideos());
      }
    }
  }, [currentSegmentIndex, subtitles, videoId, videoPlan]);

  const handleResetVideo = () => {
    setVideoId(null);
    setVideoPlan(null);
    setSubtitles([]);
    setCurrentSegmentIndex(0);
    setIsPausedForDictation(false);
    setHasStartedSession(false);
    setAnalysisError(null);
    setShowManualFallback(false);
  };

  // When a word explanation is loaded from Gemini, automatically register it for spaced repetition!
  const handleWordSaved = useCallback((explanation: WordExplanation) => {
    if (!explainingWord) return;
    const added = addWordToVocabulary(explainingWord, explanation, explainingSentence);
    setVocabulary(loadVocabulary());
  }, [explainingWord, explainingSentence]);

  // Spaced repetition review outcome handler
  const handleReviewedItem = (id: string, remembered: boolean) => {
    recordReviewResult(id, remembered);
    setVocabulary(loadVocabulary());
    setActiveReviewItem(null);
  };

  // Scientific cognitive memory task completion handler
  const handleMemoryTaskComplete = (
    id: string,
    remembered: boolean,
    taskType?: MemoryTaskType,
    score?: number
  ) => {
    recordReviewResult(id, remembered, taskType, score);
    setVocabulary(loadVocabulary());
    setActiveMemoryTaskItem(null);
    setActiveReviewItem(null);
  };

  const handleRemoveVocabularyItem = (id: string) => {
    const nextList = vocabulary.filter((i) => i.id !== id);
    setVocabulary(nextList);
    saveVocabulary(nextList);
  };

  const currentSegment = subtitles[currentSegmentIndex] || null;
  const dueCount = vocabulary.filter((i) => i.nextReviewAt <= Date.now()).length;

  // View 1: Clean Minimalist Input Screen (when no video is active)
  if (!videoId || subtitles.length === 0) {
    return (
      <div className="h-screen w-screen bg-[#0c0c0d] text-stone-200 flex flex-col items-center justify-between p-4 relative overflow-y-auto">
        {/* Top Floating Actions Bar */}
        <div className="w-full max-w-4xl flex items-center justify-between pt-2 px-2 z-20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider uppercase text-stone-300">
              English Podcast Dictation
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Phone Notifications Button */}
            <button
              onClick={() => setIsPhoneNotificationModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 hover:border-amber-500/40 text-amber-300 text-xs font-medium transition-colors cursor-pointer shadow-sm"
              title="შეტყობინებების მართვა ტელეფონზე"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">შეტყობინებები ტელეფონზე</span>
              <span className="sm:hidden">შეტყობინებები</span>
            </button>

            {/* Vocabulary Button */}
            <button
              onClick={() => setIsVocabDrawerOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                dueCount > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 ring-1 ring-amber-500/30'
                  : 'bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5 text-amber-400" />
              <span>სიტყვები ({vocabulary.length})</span>
              {dueCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Center Card */}
        <div className="w-full max-w-xl text-center space-y-6 animate-fade-in my-auto py-6">
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-stone-100">
              English Podcast Dictation
            </h1>
            <p className="text-xs sm:text-sm text-stone-400 font-normal">
              ჩასვით YouTube პოდკასტის ან ვიდეოს ლინკი. სისტემა გაანალიზებს მთელ ვიდეოს,
              სუბტიტრებს და შექმნის სასწავლო გეგმას.
            </p>
          </div>

          <form onSubmit={handleAnalyzeVideo} className="space-y-3">
            <div className="relative flex items-center shadow-lg">
              <input
                id="youtube-url-input"
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={isAnalyzing}
                className="w-full bg-stone-900 border border-stone-700/80 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
                autoFocus
              />
              <button
                id="analyze-video-btn"
                type="submit"
                disabled={isAnalyzing || !youtubeInput.trim()}
                className={`absolute right-1.5 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isAnalyzing || !youtubeInput.trim()
                    ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer shadow-md'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>ანალიზი...</span>
                  </>
                ) : (
                  <>
                    <span>გაანალიზე ვიდეო</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {analysisError && (
              <div className="text-left p-3 rounded-lg bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}
          </form>

          {/* Saved Videos Progress History */}
          <div className="text-left">
            <SavedVideosList
              savedVideos={savedVideos}
              currentVideoId={videoId}
              onSelectVideo={handleSelectSavedVideo}
              onDeleteVideo={handleDeleteSavedVideo}
            />
          </div>

          {/* Fallback if YouTube captions are not automated */}
          {showManualFallback && (
            <div className="text-left space-y-3 p-4 rounded-xl bg-stone-900/80 border border-stone-800 animate-fade-in">
              <span className="text-xs text-stone-300 block font-medium">
                ჩასვით ვიდეოს ტრანსკრიპტი ან SRT:
              </span>
              <textarea
                rows={4}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="ჩასვით ტექსტი ან სუბტიტრები აქ..."
                className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyManualText}
                  disabled={isAnalyzing || !manualText.trim()}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isAnalyzing ? 'დამუშავება...' : 'სუბტიტრების გააქტიურება'}
                </button>
              </div>
            </div>
          )}

          <div className="pt-4 text-stone-500 text-[11px] leading-relaxed">
            მეთოდი: ვიდეო ჩერდება ყოველ სუბტიტრზე • აკრიფეთ ტექსტი • მეცნიერული შეხსენების სისტემა (30წთ → 1სთ → 4სთ → 1დღე...) შეტყობინებებით ტელეფონზე
          </div>
        </div>

        {/* Modals & Drawers Available from Landing Screen */}
        <VocabularyDrawer
          isOpen={isVocabDrawerOpen}
          onClose={() => setIsVocabDrawerOpen(false)}
          items={vocabulary}
          onRemoveItem={handleRemoveVocabularyItem}
          onReviewNow={(item) => {
            setIsVocabDrawerOpen(false);
            setActiveMemoryTaskItem(item);
          }}
          onOpenNotificationSettings={() => {
            setIsVocabDrawerOpen(false);
            setIsPhoneNotificationModalOpen(true);
          }}
        />

        {activeReviewItem && (
          <ReviewNotificationToast
            item={activeReviewItem}
            onReviewed={handleReviewedItem}
            onOpenTask={(item) => {
              setActiveReviewItem(null);
              setActiveMemoryTaskItem(item);
            }}
            onDismiss={() => setActiveReviewItem(null)}
          />
        )}

        {activeMemoryTaskItem && (
          <ScientificMemoryTaskModal
            item={activeMemoryTaskItem}
            onClose={() => setActiveMemoryTaskItem(null)}
            onTaskCompleted={handleMemoryTaskComplete}
          />
        )}

        <PhoneNotificationModal
          isOpen={isPhoneNotificationModalOpen}
          onClose={() => setIsPhoneNotificationModalOpen(false)}
        />
      </div>
    );
  }

  // View 2: Focused Minimalist Single-Screen Layout (Right Panel Removed, Custom Player Controls)
  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#0c0c0d] text-stone-200">
      {/* Sleek Minimalist Top Header */}
      <header className="h-12 border-b border-stone-800/80 px-4 flex items-center justify-between shrink-0 bg-stone-900/50">
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-300">
            English Podcast Dictation
          </h1>

          {videoPlan?.title && (
            <span className="hidden md:inline-block text-xs text-stone-400 font-mono truncate max-w-sm border-l border-stone-800 pl-3">
              {videoPlan.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Phone Notifications Button in active session */}
          <button
            onClick={() => setIsPhoneNotificationModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-stone-800/80 hover:bg-stone-700 text-amber-300 transition-colors cursor-pointer border border-amber-500/20"
            title="ტელეფონზე შეტყობინებები"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">შეტყობინებები</span>
          </button>

          {/* Spaced Repetition Vocabulary Button */}
          <button
            onClick={() => setIsVocabDrawerOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              dueCount > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-800/80 hover:bg-stone-700 text-stone-300'
            }`}
            title="შენახული სიტყვები და განმეორების სტატუსი"
          >
            <BookMarked className="w-3.5 h-3.5 text-amber-400" />
            <span>სიტყვები ({vocabulary.length})</span>
            {dueCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* Saved Videos History Button in active session */}
          {savedVideos.length > 0 && (
            <button
              onClick={() => setIsSavedVideosOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isSavedVideosOpen
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-stone-800/80 hover:bg-stone-700 text-stone-300'
              }`}
              title="შენახული ვიდეოების სია და პროგრესი"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">ვიდეოები</span>
              <span>({savedVideos.length})</span>
            </button>
          )}

          {/* Mode Switch: Dictation vs Shadowing */}
          <div className="flex items-center bg-stone-950 rounded-lg p-0.5 border border-stone-800 text-[11px]">
            <button
              onClick={() => setSettings((s) => ({ ...s, mode: 'dictation' }))}
              className={`px-2 py-0.5 rounded transition-colors ${
                settings.mode === 'dictation'
                  ? 'bg-stone-800 text-amber-300 font-medium'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Dictation
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, mode: 'shadowing' }))}
              className={`px-2 py-0.5 rounded transition-colors ${
                settings.mode === 'shadowing'
                  ? 'bg-stone-800 text-stone-100 font-medium'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Shadowing
            </button>
          </div>

          {/* Speed Selector */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-stone-400">
            {[0.75, 1.0, 1.25].map((spd) => (
              <button
                key={spd}
                onClick={() => setSettings((s) => ({ ...s, playbackRate: spd }))}
                className={`px-1.5 py-0.5 rounded ${
                  settings.playbackRate === spd
                    ? 'bg-stone-800 text-amber-300 font-bold'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* New link / Change video button */}
          <button
            id="change-video-btn"
            onClick={handleResetVideo}
            className="px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors text-xs flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>ახალი ლინკი</span>
          </button>
        </div>
      </header>

      {/* Main Single-Screen Focused Workspace (100% focused on Video + Subtitle + Input) */}
      <main className="flex-1 min-h-0 px-4 py-3 flex flex-col items-center justify-between overflow-hidden relative">
        {!hasStartedSession && videoId && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm">
            <button
              onClick={() => {
                setHasStartedSession(true);
                const seg = subtitles[currentSegmentIndex];
                if (seg && playerControlsRef.current) {
                  playerControlsRef.current.seekTo(seg.start);
                  playerControlsRef.current.play(true);
                } else if (playerControlsRef.current) {
                  playerControlsRef.current.play(true);
                }
              }}
              className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-2xl font-bold text-2xl shadow-xl hover:scale-105 transition-all cursor-pointer flex items-center gap-3"
            >
              <ArrowRight className="w-6 h-6" />
              დაწყება
            </button>
          </div>
        )}
        <div className="w-full max-w-4xl flex-1 flex flex-col justify-between gap-3 min-h-0">
          {/* 1. Video Player with Custom Scrubber & Clean Controls (Native YouTube controls 100% hidden) */}
          <div className="shrink-0">
            <YouTubePlayer
              videoId={videoId}
              subtitles={subtitles}
              currentSegmentIndex={currentSegmentIndex}
              isPausedForDictation={isPausedForDictation}
              playbackRate={settings.playbackRate}
              autoPauseEnabled={true}
              onTimeUpdate={handleTimeUpdate}
              onSeek={handleSeek}
              onSegmentEndReached={handleSegmentEndReached}
              playerRefCallback={(actions) => {
                playerControlsRef.current = actions;
              }}
            />
          </div>

          {/* 2. Current Subtitle & Dictation Typing Input (Directly below video) */}
          <div className="shrink-0 flex flex-col justify-end">
            <DictationInput
              currentSegment={currentSegment}
              totalSegments={subtitles.length}
              currentIndex={currentSegmentIndex}
              isPausedForDictation={isPausedForDictation}
              settings={settings}
              onSuccess={handleDictationSuccess}
              onReplaySegment={handleReplaySegment}
              onSkipSegment={handleSkipSegment}
              onExplainWord={(word, sentence) => {
                setExplainingWord(word);
                setExplainingSentence(sentence);
              }}
            />

            {/* Quick Minimalist Helper Bar */}
            <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-stone-500 font-mono px-1 gap-2">
              <div className="flex items-center gap-3">
                <span>Enter: დადასტურება</span>
                <span>Shift+Enter: გამეორება</span>
                <span className="text-amber-400/90">🎙️ ვოისი: თქვით ინგლისურად</span>
              </div>
              <span className="text-stone-400">
                მარცხენა წკაპი: ქართული თარგმანი • <strong className="text-amber-300 font-normal">მარჯვენა წკაპი: გამოთქმის მოსმენა 🔊</strong>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Word Explainer / Georgian Translation Modal */}
      <WordExplainerModal
        word={explainingWord}
        sentence={explainingSentence}
        onClose={() => setExplainingWord(null)}
        onWordSaved={handleWordSaved}
      />

      {/* Spaced Repetition Due Review Notification Toast */}
      {activeReviewItem && (
        <ReviewNotificationToast
          item={activeReviewItem}
          onReviewed={handleReviewedItem}
          onOpenTask={(item) => {
            setActiveReviewItem(null);
            setActiveMemoryTaskItem(item);
          }}
          onDismiss={() => setActiveReviewItem(null)}
        />
      )}

      {/* Saved Vocabulary List & Spaced Repetition Stages Drawer */}
      <VocabularyDrawer
        isOpen={isVocabDrawerOpen}
        onClose={() => setIsVocabDrawerOpen(false)}
        items={vocabulary}
        onRemoveItem={handleRemoveVocabularyItem}
        onReviewNow={(item) => {
          setIsVocabDrawerOpen(false);
          setActiveMemoryTaskItem(item);
        }}
        onOpenNotificationSettings={() => {
          setIsVocabDrawerOpen(false);
          setIsPhoneNotificationModalOpen(true);
        }}
      />

      {/* Scientific Memory Consolidation Task Modal */}
      {activeMemoryTaskItem && (
        <ScientificMemoryTaskModal
          item={activeMemoryTaskItem}
          onClose={() => setActiveMemoryTaskItem(null)}
          onTaskCompleted={handleMemoryTaskComplete}
        />
      )}

      {/* Phone Push Notification Settings Modal */}
      <PhoneNotificationModal
        isOpen={isPhoneNotificationModalOpen}
        onClose={() => setIsPhoneNotificationModalOpen(false)}
      />

      {/* Saved Videos Modal / Drawer in active session */}
      {isSavedVideosOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-2xl space-y-3 animate-fade-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
              <span className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-400" />
                შენახული ვიდეოები და პროგრესი
              </span>
              <button
                type="button"
                onClick={() => setIsSavedVideosOpen(false)}
                className="text-stone-400 hover:text-stone-100 text-xs px-2 py-1 rounded hover:bg-stone-800 transition-colors cursor-pointer"
              >
                ✕ დახურვა
              </button>
            </div>
            <SavedVideosList
              savedVideos={savedVideos}
              currentVideoId={videoId}
              onSelectVideo={handleSelectSavedVideo}
              onDeleteVideo={handleDeleteSavedVideo}
            />
          </div>
        </div>
      )}
    </div>
  );
}
