import React from 'react';
import { VocabularyItem } from '../types';
import { X, Volume2, Clock, Trash2, BookMarked, Check, Brain, Bell, Sparkles } from 'lucide-react';
import { getStageInfo, SCIENTIFIC_STAGES } from '../utils/spacedRepetition';

interface VocabularyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: VocabularyItem[];
  onRemoveItem: (id: string) => void;
  onReviewNow: (item: VocabularyItem) => void;
  onOpenNotificationSettings?: () => void;
}

export const VocabularyDrawer: React.FC<VocabularyDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onReviewNow,
  onOpenNotificationSettings,
}) => {
  if (!isOpen) return null;

  const speak = (word: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const formatCountdown = (nextReviewAt: number) => {
    const diffMs = nextReviewAt - Date.now();
    if (diffMs <= 0) return 'გასამეორებელია ახლა!';
    const minutes = Math.ceil(diffMs / (60 * 1000));
    if (minutes < 60) return `${minutes} წუთში`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} სთ-ში`;
    const days = Math.floor(hours / 24);
    return `${days} დღეში`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fade-in">
      <div
        id="vocabulary-drawer"
        className="w-full max-w-md bg-stone-900 border-l border-stone-800 h-full flex flex-col p-5 shadow-2xl text-stone-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white">
                შენახული სიტყვები ({items.length})
              </h2>
              <span className="text-[10px] text-amber-400/90 font-medium">
                გრძელვადიანი მეხსიერების სისტემა
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenNotificationSettings && (
              <button
                onClick={onOpenNotificationSettings}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-400 transition-colors cursor-pointer text-xs flex items-center gap-1"
                title="შეტყობინებების მართვა"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">შეტყობინებები</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scientific Interval Explainer */}
        <div className="py-2.5 px-3 my-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-stone-300 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px]">
            <Brain className="w-3.5 h-3.5" />
            <span>მეცნიერული ინტერვალები (30წთ → 1სთ → 4სთ → 1დღე...)</span>
          </div>
          <p className="text-[10.5px] text-stone-400 leading-snug">
            სისტემა ავტომატურად გაწვდით დავალებებს და გიგზავნით შეტყობინებას ტელეფონზე.
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 py-1 pr-1">
          {items.length === 0 ? (
            <div className="text-center py-12 text-stone-500 text-xs">
              ჯერ არცერთი სიტყვა არ გაქვთ შენახული.
              <br />
              დააწკაპუნეთ ნებისმიერ უცნობ სიტყვაზე სუბტიტრში დასამატებლად!
            </div>
          ) : (
            items.map((item) => {
              const isDue = item.nextReviewAt <= Date.now();
              const stageInfo = getStageInfo(item.stage);

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                    isDue
                      ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/20'
                      : 'bg-stone-950/60 border-stone-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-stone-100">{item.word}</span>
                      <button
                        onClick={() => speak(item.word)}
                        className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                        title="წარმოთქმა"
                      >
                        <Volume2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          isDue
                            ? 'bg-amber-500 text-stone-950 font-bold animate-pulse'
                            : 'bg-stone-800 text-stone-400'
                        }`}
                      >
                        {formatCountdown(item.nextReviewAt)}
                      </span>

                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="text-stone-500 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                        title="წაშლა"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-stone-300">
                    <span className="text-emerald-400 font-medium">
                      {item.georgianTranslation}
                    </span>
                    <span className="text-[10.5px] text-amber-400/90 font-mono">
                      ეტაპი: {stageInfo.shortLabel}
                    </span>
                  </div>

                  {item.simpleExplanation && (
                    <p className="text-[11px] text-stone-400 leading-snug pt-1 border-t border-stone-800/50">
                      {item.simpleExplanation}
                    </p>
                  )}

                  {/* Task Launcher Button */}
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] text-stone-500">
                      {stageInfo.scientificGoal.slice(0, 35)}...
                    </span>
                    <button
                      onClick={() => onReviewNow(item)}
                      className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                        isDue
                          ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-sm'
                          : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <Brain className="w-3 h-3" />
                      <span>{isDue ? 'დავალება (დროა!)' : 'პრაქტიკა'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
