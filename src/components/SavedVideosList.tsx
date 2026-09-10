import React, { useState } from 'react';
import { SavedVideoProgress } from '../types';
import { Play, Trash2, Clock, CheckCircle2, Bookmark, ExternalLink } from 'lucide-react';
import { formatTime } from '../utils/subtitleParser';

interface SavedVideosListProps {
  savedVideos: SavedVideoProgress[];
  currentVideoId: string | null;
  onSelectVideo: (videoId: string, videoUrl: string) => void;
  onDeleteVideo: (videoId: string) => void;
}

export const SavedVideosList: React.FC<SavedVideosListProps> = ({
  savedVideos,
  currentVideoId,
  onSelectVideo,
  onDeleteVideo,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!savedVideos || savedVideos.length === 0) return null;

  return (
    <div className="w-full bg-stone-900/60 border border-stone-800/80 rounded-xl overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-stone-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-amber-400" />
          <span className="text-xs sm:text-sm font-medium text-stone-200">
            შენახული ვიდეოები & პროგრესი ({savedVideos.length})
          </span>
        </div>
        <span className="text-xs text-amber-400/90 font-mono">
          {isOpen ? 'დამალვა ▲' : 'გახსნა ▼'}
        </span>
      </button>

      {isOpen && (
        <div className="p-3 pt-0 border-t border-stone-800/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto mt-2">
          {savedVideos.map((video) => {
            const isCurrent = video.videoId === currentVideoId;
            const percent =
              video.totalSubtitles > 0
                ? Math.round((video.completedSubtitlesCount / video.totalSubtitles) * 100)
                : 0;
            const formattedDate = new Date(video.lastUpdated).toLocaleDateString('ka-GE', {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={video.videoId}
                className={`relative group flex flex-col justify-between p-2.5 rounded-lg border transition-all ${
                  isCurrent
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                    : 'bg-stone-950/70 border-stone-800/80 hover:border-stone-700/80 hover:bg-stone-900/80'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Video Thumbnail */}
                  <div className="relative w-16 h-11 shrink-0 rounded overflow-hidden bg-stone-800">
                    <img
                      src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-stone-950/20 group-hover:bg-transparent transition-colors" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className="text-xs font-medium text-stone-200 truncate leading-snug"
                      title={video.title}
                    >
                      {video.title || 'YouTube ვიდეო'}
                    </h4>

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-400">
                      <span className="flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        {video.completedSubtitlesCount} / {video.totalSubtitles}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5 text-stone-500" />
                        {formattedDate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
                    <span>
                      სუბტიტრი #{video.currentSegmentIndex + 1}
                      {video.currentTime > 0 && (
                        <span className="text-amber-400/90 ml-1 font-mono">
                          ({formatTime(video.currentTime)})
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-amber-400/90">{percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(percent, 4)}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-stone-800/50">
                  <button
                    type="button"
                    onClick={() => onSelectVideo(video.videoId, video.videoUrl)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors cursor-pointer"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>{isCurrent ? 'მიმდინარე' : 'გაგრძელება'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteVideo(video.videoId);
                    }}
                    className="p-1 rounded text-stone-500 hover:text-rose-400 hover:bg-stone-800/60 transition-colors cursor-pointer"
                    title="ისტორიიდან წაშლა"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
