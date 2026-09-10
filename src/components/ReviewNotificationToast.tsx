import React, { useState } from 'react';
import { VocabularyItem } from '../types';
import { Volume2, Check, RotateCcw, X, Bell, Eye, Brain, Sparkles } from 'lucide-react';
import { playSuccessSound, playPauseTone } from '../utils/audioEffects';
import { getStageInfo } from '../utils/spacedRepetition';

interface ReviewNotificationToastProps {
  item: VocabularyItem;
  onReviewed: (id: string, remembered: boolean) => void;
  onOpenTask: (item: VocabularyItem) => void;
  onDismiss: () => void;
}

export const ReviewNotificationToast: React.FC<ReviewNotificationToastProps> = ({
  item,
  onReviewed,
  onOpenTask,
  onDismiss,
}) => {
  const [revealed, setRevealed] = useState(false);
  const stageInfo = getStageInfo(item.stage);

  const speak = () => {
    if (typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(item.word);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const handleRemembered = () => {
    playSuccessSound(true);
    onReviewed(item.id, true);
  };

  const handleForgot = () => {
    playPauseTone();
    onReviewed(item.id, false);
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full animate-bounce-short">
      <div
        id="spaced-repetition-toast"
        className="bg-stone-900/95 border border-amber-500/60 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-stone-100 ring-1 ring-amber-500/30 space-y-2.5"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-800">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
            <Bell className="w-3.5 h-3.5 animate-pulse text-amber-400" />
            <span>დროა სიტყვის გამეორების!</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {stageInfo.shortLabel}
            </span>
            <button
              onClick={onDismiss}
              className="text-stone-400 hover:text-stone-200 p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Word display with active recall challenge */}
        <div className="py-2 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-400">ქართული მნიშვნელობა:</span>
            <span className="font-bold text-emerald-400 text-sm">{item.georgianTranslation}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-950/90 border border-stone-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">ინგლისურად:</span>
              {revealed ? (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <h3 className="text-lg font-bold tracking-wide text-amber-300">
                    {item.word}
                  </h3>
                  <button
                    onClick={speak}
                    className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                    title="წარმოთქმა"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-mono text-stone-400 text-sm tracking-widest bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                  <span>{Array.from({ length: item.word.length }).map(() => '•').join('')}</span>
                  <span className="text-[10px] font-sans text-stone-500 font-medium tracking-normal">
                    ({item.word.length} ასო)
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setRevealed((p) => !p)}
              className="text-xs px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Eye className="w-3 h-3" />
              <span>{revealed ? 'დამალვა' : 'მაჩვენე'}</span>
            </button>
          </div>

          {revealed && item.simpleExplanation && (
            <p className="text-[11px] text-stone-400 italic px-1 animate-fade-in">
              {item.simpleExplanation}
            </p>
          )}
        </div>

        {/* Primary Action: Launch Scientific Cognitive Task */}
        <button
          onClick={() => onOpenTask(item)}
          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
        >
          <Brain className="w-3.5 h-3.5 text-stone-950" />
          <span>დავალების შესრულება (მეხსიერების გადაყვანა)</span>
          <Sparkles className="w-3 h-3 text-stone-900" />
        </button>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-800/60">
          <button
            onClick={handleForgot}
            className="px-2.5 py-1.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-rose-300 text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
            title="დაბრუნება 30 წუთიან ინტერვალზე"
          >
            <RotateCcw className="w-3 h-3" />
            <span>გამეორება (30 წთ)</span>
          </button>

          <button
            onClick={handleRemembered}
            className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-emerald-600/80 text-emerald-300 hover:text-white text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-emerald-500/30"
          >
            <Check className="w-3 h-3" />
            <span>მახსოვს (+ეტაპი)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

