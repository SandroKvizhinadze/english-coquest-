import React, { useEffect, useRef, useState } from 'react';
import { SubtitleSegment } from '../types';
import { Check, Play, Search, Clock, BookOpen } from 'lucide-react';
import { formatTime } from '../utils/subtitleParser';

interface SubtitleListProps {
  subtitles: SubtitleSegment[];
  currentSegmentIndex: number;
  plan?: {
    title: string;
    summary: string;
    level: string;
    keyVocabulary?: string[];
  } | null;
  onSelectSegment: (index: number) => void;
  onExplainWord: (word: string, sentence: string) => void;
}

export const SubtitleList: React.FC<SubtitleListProps> = ({
  subtitles,
  currentSegmentIndex,
  plan,
  onSelectSegment,
  onExplainWord,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const activeItemRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeItemRef.current && containerRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentSegmentIndex]);

  const filtered = subtitles.filter((s) =>
    s.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const completedCount = subtitles.filter((s) => s.completed).length;
  const progressPercent =
    subtitles.length > 0 ? Math.round((completedCount / subtitles.length) * 100) : 0;

  return (
    <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl flex flex-col h-full overflow-hidden text-stone-300">
      {/* Plan Header */}
      {plan && (
        <div className="p-3 border-b border-stone-800/70 bg-stone-950/40">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-xs font-semibold text-stone-100 truncate">
              {plan.title}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
              {plan.level}
            </span>
          </div>

          <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed mb-2">
            {plan.summary}
          </p>

          {plan.keyVocabulary && plan.keyVocabulary.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-stone-500 mr-1">სიტყვები:</span>
              {plan.keyVocabulary.map((vocab, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onExplainWord(vocab, '')}
                  className="text-[10px] px-1.5 py-0.2 rounded bg-stone-800 hover:bg-stone-700 text-amber-300/90 font-mono transition-colors cursor-pointer"
                >
                  {vocab}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & Progress bar */}
      <div className="p-2.5 border-b border-stone-800/60 bg-stone-900/30">
        <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
          <span>სუბტიტრები</span>
          <span className="font-mono">
            {completedCount}/{subtitles.length} ({progressPercent}%)
          </span>
        </div>

        <div className="w-full h-1 bg-stone-800/80 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-amber-500 transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            id="search-subtitles-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ძებნა სუბტიტრებში..."
            className="w-full bg-stone-950/80 border border-stone-800 rounded-md pl-7 pr-2.5 py-1 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-stone-600"
          />
        </div>
      </div>

      {/* Subtitles list container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-stone-800/30 font-sans"
      >
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">
            {subtitles.length === 0 ? 'სუბტიტრები ჯერ არ არის ჩატვირთული.' : 'სუბტიტრი ვერ მოიძებნა.'}
          </div>
        ) : (
          filtered.map((item) => {
            const originalIndex = subtitles.findIndex((s) => s.id === item.id);
            const isActive = originalIndex === currentSegmentIndex;
            const isCompleted = item.completed;

            return (
              <div
                key={item.id}
                ref={isActive ? activeItemRef : null}
                id={`subtitle-item-${item.id}`}
                onClick={() => onSelectSegment(originalIndex)}
                className={`pt-1.5 p-2 rounded-lg transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'bg-amber-500/10 border border-amber-500/40 text-stone-100'
                    : 'hover:bg-stone-800/40 border border-transparent text-stone-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1 rounded text-[10px] ${
                        isActive
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'bg-stone-800 text-stone-400'
                      }`}
                    >
                      #{item.id}
                    </span>
                    <span className="text-stone-500">
                      {formatTime(item.start)}
                    </span>
                  </div>

                  {isCompleted && (
                    <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                      <Check className="w-3 h-3" />
                      <span>Done</span>
                    </span>
                  )}
                </div>

                <p
                  className={`text-xs leading-relaxed line-clamp-2 ${
                    isActive ? 'text-stone-100 font-medium' : isCompleted ? 'text-stone-500' : 'text-stone-300'
                  }`}
                >
                  {item.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
