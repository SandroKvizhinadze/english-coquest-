import React from 'react';
import { PracticeSettings, PodcastLesson } from '../types';
import { Settings, Sliders, Volume2, FastForward, Headphones, Type, PlusCircle, Check } from 'lucide-react';

interface PracticeControlsProps {
  currentLesson: PodcastLesson;
  sampleLessons: PodcastLesson[];
  settings: PracticeSettings;
  onSelectLesson: (lesson: PodcastLesson) => void;
  onUpdateSettings: (newSettings: Partial<PracticeSettings>) => void;
  onOpenImportModal: () => void;
}

export const PracticeControls: React.FC<PracticeControlsProps> = ({
  currentLesson,
  sampleLessons,
  settings,
  onSelectLesson,
  onUpdateSettings,
  onOpenImportModal,
}) => {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Podcast Selector & Import Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-stone-400 mr-1">
            <Headphones className="w-3.5 h-3.5 text-amber-400" />
            <span>Lessons:</span>
          </div>

          {sampleLessons.map((lesson) => {
            const isSelected = lesson.id === currentLesson.id;
            return (
              <button
                key={lesson.id}
                id={`select-lesson-${lesson.id}`}
                onClick={() => onSelectLesson(lesson)}
                className={`text-xs px-3 py-1.5 rounded-xl border transition-all font-medium flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold shadow-md'
                    : 'bg-stone-950/80 text-stone-300 border-stone-800 hover:border-stone-700 hover:text-white'
                }`}
              >
                <span>{lesson.title.split(':')[0]}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-normal ${
                  isSelected ? 'bg-stone-950/20 text-stone-900' : 'text-stone-500'
                }`}>
                  {lesson.level}
                </span>
              </button>
            );
          })}

          <button
            id="open-import-modal-btn"
            onClick={onOpenImportModal}
            className="text-xs px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-emerald-500/10 hover:from-amber-500/20 hover:to-emerald-500/20 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Paste YouTube Link</span>
          </button>
        </div>

        {/* Right: Settings Toolbar */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Mode Switcher */}
          <div className="flex items-center bg-stone-950 rounded-xl p-1 border border-stone-800">
            <button
              id="mode-dictation-btn"
              onClick={() => onUpdateSettings({ mode: 'dictation' })}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                settings.mode === 'dictation'
                  ? 'bg-stone-800 text-amber-300 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Subtitle text is hidden until typed: test your listening ear"
            >
              <Headphones className="w-3 h-3" />
              <span>Dictation (Blind)</span>
            </button>

            <button
              id="mode-shadowing-btn"
              onClick={() => onUpdateSettings({ mode: 'shadowing' })}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                settings.mode === 'shadowing'
                  ? 'bg-stone-800 text-emerald-300 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Subtitle text is visible: read, listen, and type"
            >
              <Type className="w-3 h-3" />
              <span>Shadowing (Visible)</span>
            </button>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-stone-950 rounded-xl px-2.5 py-1 border border-stone-800">
            <FastForward className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-stone-400 mr-1">Speed:</span>
            {[0.75, 1.0, 1.25].map((rate) => (
              <button
                key={rate}
                onClick={() => onUpdateSettings({ playbackRate: rate })}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  settings.playbackRate === rate
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Punctuation Ignore Toggle */}
          <button
            id="toggle-punctuation-btn"
            onClick={() => onUpdateSettings({ ignorePunctuation: !settings.ignorePunctuation })}
            className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 transition-colors ${
              settings.ignorePunctuation
                ? 'bg-stone-950 text-stone-300 border-stone-800'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/80 font-medium'
            }`}
            title="When relaxed, missing commas or periods will not block you"
          >
            <span>Punctuation: {settings.ignorePunctuation ? 'Relaxed' : 'Strict'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
