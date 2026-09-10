import React, { useState, useEffect } from 'react';
import { WordExplanation } from '../types';
import { X, Volume2, Sparkles, BookOpen, Loader2 } from 'lucide-react';

interface WordExplainerModalProps {
  word: string | null;
  sentence: string;
  onClose: () => void;
  onWordSaved?: (explanation: WordExplanation) => void;
}

export const WordExplainerModal: React.FC<WordExplainerModalProps> = ({
  word,
  sentence,
  onClose,
  onWordSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WordExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedToQueue, setSavedToQueue] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    if (!word) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setSavedToQueue(false);

    const cleanWord = word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    const fetchWordData = async () => {
      try {
        let resData: any = null;
        try {
          const res = await fetch('/api/ai/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: cleanWord || word, sentence }),
          });
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            resData = await res.json();
          }
        } catch {}

        if (isMounted && resData?.success && resData?.explanation) {
          setData(resData.explanation);
          if (onWordSaved) {
            onWordSaved(resData.explanation);
            setSavedToQueue(true);
          }
          return;
        }

        // Direct browser translation fallback (CORS enabled)
        const targetWord = cleanWord || word.trim();
        const transRes = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ka&dt=t&q=${encodeURIComponent(
            targetWord
          )}`
        );
        const transData = await transRes.json();
        const georgianTrans = transData?.[0]?.[0]?.[0] || targetWord;

        const fallbackExplanation: WordExplanation = {
          word: targetWord,
          phonetic: '',
          georgianTranslation: georgianTrans,
          simpleExplanation: `The English word "${targetWord}".`,
          georgianExplanation: `სიტყვა "${targetWord}" ქართულად ნიშნავს: ${georgianTrans}.`,
          exampleSentence: sentence && sentence.length > 5 ? sentence : `Practice using "${targetWord}" in context.`,
        };

        if (isMounted) {
          setData(fallbackExplanation);
          if (onWordSaved) {
            onWordSaved(fallbackExplanation);
            setSavedToQueue(true);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('სიტყვის ახსნა დროებით ვერ მოხერხდა. სცადეთ ხელახლა.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchWordData();

    return () => {
      isMounted = false;
    };
  }, [word, sentence, onWordSaved, retryTrigger]);

  const speakWord = () => {
    if (!word || typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  if (!word) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        id="word-explainer-dialog"
        className="relative w-full max-w-lg bg-stone-900 border border-stone-700/80 rounded-2xl p-6 shadow-2xl text-stone-100"
      >
        {/* Close Button */}
        <button
          id="close-explainer-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Vocabulary & Georgian Tutor
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <p className="text-xs">Analyzing word with Gemini...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-rose-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => setRetryTrigger((prev) => prev + 1)}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>🔄 ხელახლა ცდა</span>
            </button>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Word & Audio pronunciation */}
            <div className="flex items-baseline justify-between border-b border-stone-800 pb-3">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
                  {data.word}
                  <button
                    id="speak-word-btn"
                    onClick={speakWord}
                    type="button"
                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-sky-400 transition-colors"
                    title="Pronounce word"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </h2>
                {data.phonetic && (
                  <span className="text-xs font-mono text-stone-400">
                    /{data.phonetic}/
                  </span>
                )}
              </div>

              {/* Georgian Translation Pill */}
              <div className="text-right">
                <span className="text-xs text-stone-400 block mb-0.5">ქართულად:</span>
                <span className="text-base font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-lg">
                  {data.georgianTranslation}
                </span>
              </div>
            </div>

            {/* Spaced repetition indicator badge */}
            <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-xl">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>სიტყვა დაემატა შეხსენებებში: შემოწმება 5 წუთში (შემდეგ 10წთ, 20წთ...)</span>
            </div>

            {/* Simple English Explanation */}
            <div>
              <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                English Meaning
              </h4>
              <p className="text-sm text-stone-200 leading-relaxed bg-stone-950/60 p-3 rounded-xl border border-stone-800/60">
                {data.simpleExplanation}
              </p>
            </div>

            {/* Georgian Explanation */}
            {data.georgianExplanation && (
              <div>
                <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  ახსნა ქართულად
                </h4>
                <p className="text-sm text-stone-300 leading-relaxed bg-stone-950/60 p-3 rounded-xl border border-stone-800/60">
                  {data.georgianExplanation}
                </p>
              </div>
            )}

            {/* Example sentence */}
            {data.exampleSentence && (
              <div>
                <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Example
                </h4>
                <p className="text-xs text-stone-300 italic bg-stone-950/40 p-2.5 rounded-lg border border-stone-800/40">
                  "{data.exampleSentence}"
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
