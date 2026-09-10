import React, { useState, useEffect, useRef } from 'react';
import { SubtitleSegment, PracticeSettings } from '../types';
import { compareSubtitles, analyzeWords } from '../utils/subtitleParser';
import {
  playSuccessSound,
  playErrorSound,
  pronounceEnglishWord,
  playMicStartTone,
  playMicStopTone,
} from '../utils/audioEffects';
import {
  RotateCcw,
  Eye,
  EyeOff,
  CornerDownLeft,
  Volume2,
  Mic,
  Sparkles,
  HelpCircle,
  X,
  Clock,
  Keyboard,
} from 'lucide-react';

interface DictationInputProps {
  currentSegment: SubtitleSegment | null;
  totalSegments: number;
  currentIndex: number;
  isPausedForDictation: boolean;
  settings: PracticeSettings;
  onSuccess: () => void;
  onReplaySegment: () => void;
  onSkipSegment: () => void;
  onExplainWord: (word: string, sentence: string) => void;
}

export const DictationInput: React.FC<DictationInputProps> = ({
  currentSegment,
  totalSegments,
  currentIndex,
  isPausedForDictation,
  settings,
  onSuccess,
  onReplaySegment,
  onSkipSegment,
  onExplainWord,
}) => {
  const [userInput, setUserInput] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const [isSuccessAnimated, setIsSuccessAnimated] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [pronouncingWord, setPronouncingWord] = useState<string | null>(null);
  const [secondsUntilCheck, setSecondsUntilCheck] = useState(5);
  const [spaceControlsMic, setSpaceControlsMic] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('linguo_space_controls_mic');
    return saved !== null ? saved === 'true' : true;
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;
  const userInputRef = useRef(userInput);
  userInputRef.current = userInput;

  const toggleSpaceControlsMic = () => {
    setSpaceControlsMic((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('linguo_space_controls_mic', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechSupported(false);
    }
  }, []);

  useEffect(() => {
    setUserInput('');
    setHasError(false);
    setErrorMessage('');
    setIsRevealed(false);
    setIsSuccessAnimated(false);
    setSecondsUntilCheck(5);

    // Stop speech recognition when moving to another segment
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }

    if (isPausedForDictation) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [currentSegment?.id, isPausedForDictation]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // 1. Instant match checker: whenever user types or speaks, if it matches, turn green immediately!
  useEffect(() => {
    if (!currentSegment || isSuccessAnimated || userInput.trim().length === 0) return;

    const { isMatch } = compareSubtitles(
      currentSegment.text,
      userInput,
      settings.ignorePunctuation,
      settings.ignoreCase
    );

    if (isMatch) {
      setHasError(false);
      setErrorMessage('');
      setIsSuccessAnimated(true);
      playSuccessSound(settings.soundEffects);

      const timer = setTimeout(() => {
        setIsSuccessAnimated(false);
        onSuccess();
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [userInput, currentSegment?.text, isSuccessAnimated, settings, onSuccess]);

  // 2. Periodic 5-second Auto-check countdown & evaluation
  useEffect(() => {
    if (!isPausedForDictation || !currentSegment || isSuccessAnimated) return;

    const timer = setInterval(() => {
      setSecondsUntilCheck((prev) => {
        if (prev <= 1) {
          // Trigger 5-second auto-check!
          const currentText = userInputRef.current.trim();
          if (currentText.length > 0) {
            const { isMatch, accuracy } = compareSubtitles(
              currentSegment.text,
              currentText,
              settings.ignorePunctuation,
              settings.ignoreCase
            );

            if (isMatch) {
              setHasError(false);
              setErrorMessage('');
              setIsSuccessAnimated(true);
              playSuccessSound(settings.soundEffects);
              setTimeout(() => {
                setIsSuccessAnimated(false);
                onSuccess();
              }, 450);
            } else {
              setHasError(true);
              setErrorMessage(`ავტო-შემოწმება (5წმ): სიზუსტე ${accuracy}%. შეამოწმეთ სიტყვები.`);
              setTimeout(() => setHasError(false), 900);
            }
          }
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPausedForDictation, currentSegment?.id, currentSegment?.text, isSuccessAnimated, settings, onSuccess]);

  // Voice Input Speech-to-Text handler
  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setErrorMessage('ამ ბრაუზერში ხმოვანი ამოცნობა (Web Speech API) მხარდაჭერილი არ არის.');
      return;
    }

    if (isListeningRef.current) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      isListeningRef.current = false;
      playMicStopTone(settings.soundEffects);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        setHasError(false);
        setErrorMessage('');
        playMicStartTone(settings.soundEffects);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const combined = (finalTranscript + interimTranscript).trim();
        if (combined) {
          setUserInput(combined);
          userInputRef.current = combined;
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('მიკროფონზე წვდომა დაბლოკილია ბრაუზერის მიერ.');
        } else if (event.error !== 'no-speech') {
          setErrorMessage(`ხმის ამოცნობის შეცდომა: ${event.error}`);
        }
        setIsListening(false);
        isListeningRef.current = false;
        playMicStopTone(settings.soundEffects);
      };

      recognition.onend = () => {
        setIsListening(false);
        isListeningRef.current = false;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err?.message || 'unknown error');
      setIsListening(false);
      isListeningRef.current = false;
      setErrorMessage('მიკროფონის ჩართვა ვერ მოხერხდა.');
    }
  };

  // Global Keyboard Controls: Space = Microphone On/Off, Enter = Submit / Check
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in other inputs (e.g. YouTube URL input)
      const target = e.target as HTMLElement;
      const isOurInput = target === inputRef.current;
      const isOtherInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !isOurInput;
      if (isOtherInput) return;

      // 1. SPACE KEY -> Toggle Microphone On / Off
      if (e.code === 'Space' || e.key === ' ') {
        if (spaceControlsMic) {
          // If user holds Shift + Space inside our input, let them type a normal space
          if (e.shiftKey && isOurInput) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          toggleVoiceInput();
          return;
        } else if (!isOurInput) {
          e.preventDefault();
          toggleVoiceInput();
          return;
        }
      }

      // 2. ENTER KEY -> Check answer / Replay / Advance
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          onReplaySegment();
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // If listening, stop listening and finalize
        if (isListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {}
          setIsListening(false);
          isListeningRef.current = false;
        }

        handleSubmit();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [spaceControlsMic, isListening, userInput, currentSegment, settings, onSuccess, onReplaySegment]);

  // Right-click word pronunciation handler
  const handleWordRightClick = (e: React.MouseEvent, word: string) => {
    e.preventDefault(); // Stop native browser context menu
    const clean = word.trim().replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '');
    if (!clean) return;

    setPronouncingWord(clean);
    pronounceEnglishWord(clean);

    setTimeout(() => {
      setPronouncingWord((curr) => (curr === clean ? null : curr));
    }, 1600);
  };

  const handlePronounceWholeSentence = () => {
    if (!currentSegment?.text) return;
    pronounceEnglishWord(currentSegment.text, 0.85);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentSegment) return;

    // Stop listening on submit
    if (isListeningRef.current) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      isListeningRef.current = false;
    }

    const currentVal = userInput.trim() || userInputRef.current.trim();

    if (currentVal.length === 0) {
      if (currentSegment.completed || isRevealed) {
        onSuccess();
        return;
      }
      setErrorMessage('დააჭირეთ Space-ს მიკროფონის ჩასართავად და თქვით ფრაზა, ან აკრიფეთ ტექსტი.');
      setTimeout(() => setErrorMessage(''), 2500);
      return;
    }

    const { isMatch, accuracy } = compareSubtitles(
      currentSegment.text,
      currentVal,
      settings.ignorePunctuation,
      settings.ignoreCase
    );

    if (isMatch || isRevealed) {
      setHasError(false);
      setErrorMessage('');
      setIsSuccessAnimated(true);
      playSuccessSound(settings.soundEffects);

      setTimeout(() => {
        setIsSuccessAnimated(false);
        onSuccess();
      }, 400);
    } else {
      setHasError(true);
      playErrorSound(settings.soundEffects);
      setErrorMessage(`სიზუსტე: ${accuracy}%. შეამოწმეთ სიტყვები ან მოუსმინეთ ხელახლა (Shift+Enter).`);

      setTimeout(() => {
        setHasError(false);
      }, 800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape clears the field
    if (e.key === 'Escape') {
      e.preventDefault();
      setUserInput('');
      setHasError(false);
      setErrorMessage('');
      return;
    }

    // Space with Shift types regular space when spaceControlsMic is active
    if ((e.code === 'Space' || e.key === ' ') && spaceControlsMic && !e.shiftKey) {
      e.preventDefault();
      toggleVoiceInput();
      return;
    }
  };

  if (!currentSegment) {
    return (
      <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-4 text-center text-stone-500 text-xs">
        ვიდეო მზადაა დასაკრავად.
      </div>
    );
  }

  const rawTargetWords = currentSegment.text.split(' ');
  const wordStatuses = React.useMemo(() => analyzeWords(currentSegment.text, userInput), [currentSegment.text, userInput]);

  return (
    <div
      id="dictation-panel"
      className={`relative rounded-xl border transition-all duration-200 p-3.5 bg-stone-900/70 backdrop-blur-sm ${
        isSuccessAnimated
          ? 'border-emerald-500/70 bg-emerald-950/20'
          : hasError
          ? 'border-rose-500/70 bg-rose-950/20 animate-shake'
          : isPausedForDictation
          ? 'border-amber-500/60 ring-1 ring-amber-500/30'
          : 'border-stone-800/70'
      }`}
    >
      {/* Pronouncing floating notification badge */}
      {pronouncingWord && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-40 bg-amber-500 text-stone-950 px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 text-xs font-semibold animate-fade-in pointer-events-none">
          <Volume2 className="w-3.5 h-3.5 animate-pulse" />
          <span>გამოთქმა: "{pronouncingWord}"</span>
        </div>
      )}

      {/* Subtitle & Header Row */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-stone-400">
            #{currentIndex + 1} / {totalSegments}
          </span>
          <span className="text-[11px] text-stone-500 font-mono">
            {currentSegment.start.toFixed(1)}s - {currentSegment.end.toFixed(1)}s
          </span>
          {isPausedForDictation && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 font-mono"
              title="ავტო-შემოწმება ყოველ 5 წამში ერთხელ"
            >
              <Clock className="w-2.5 h-2.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
              <span>ავტო: {secondsUntilCheck}წმ</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Pronounce whole sentence */}
          <button
            type="button"
            onClick={handlePronounceWholeSentence}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-stone-800/70 hover:bg-stone-700/80 text-stone-300 transition-colors cursor-pointer"
            title="მთლიანი წინადადების გამოთქმა"
          >
            <Volume2 className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">გამოთქმა</span>
          </button>

          <button
            type="button"
            onClick={onReplaySegment}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-stone-800/70 hover:bg-stone-700/80 text-stone-300 transition-colors cursor-pointer"
            title="მოსმენის გამეორება (Shift + Enter)"
          >
            <RotateCcw className="w-3 h-3 text-stone-400" />
            <span>გამეორება (⇧↵)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRevealed(!isRevealed)}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-stone-800/70 hover:bg-stone-700/80 text-stone-300 transition-colors cursor-pointer"
            title="ტექსტის გამოჩენა/დამალვა"
          >
            {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{isRevealed ? 'დამალვა' : 'ნახვა'}</span>
          </button>

          <button
            type="button"
            onClick={onSkipSegment}
            className="text-[11px] text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
          >
            გამოტოვება →
          </button>
        </div>
      </div>

      {/* Target Subtitle display */}
      <div className="mb-2.5 min-h-[38px] flex items-center">
        {settings.mode === 'dictation' && !isRevealed ? (
          <div className="flex flex-wrap items-center gap-1.5 py-1">
            <span className="text-xs text-stone-400 mr-1 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              მოისმინეთ და აკრიფეთ ან თქვით ვოისით:
            </span>
            {rawTargetWords.map((word, i) => (
              <span
                key={i}
                onContextMenu={(e) => handleWordRightClick(e, word)}
                title="მაუსის მარჯვენა წკაპი (Right-click): სიტყვის გამოთქმის მოსმენა 🔊"
                className="inline-block h-5 w-8 bg-stone-800/60 hover:bg-stone-700/70 rounded border border-stone-700/40 cursor-help transition-colors"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm sm:text-base font-medium text-stone-100 leading-relaxed">
            {rawTargetWords.map((word, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onExplainWord(word.replace(/[^\w']/g, ''), currentSegment.text)}
                onContextMenu={(e) => handleWordRightClick(e, word)}
                className="hover:text-amber-300 hover:underline underline-offset-4 decoration-amber-400/50 transition-colors mr-1.5 cursor-pointer select-none"
                title="მარცხენა წკაპი: ქართული თარგმანი • მარჯვენა წკაპი (Right-click): გამოთქმა 🔊"
              >
                {word}
              </button>
            ))}
          </p>
        )}
      </div>

      {/* Active Voice Recording Live Banner */}
      {isListening && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/50 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2 text-rose-300 text-xs font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <Mic className="w-4 h-4 text-rose-400" />
            <span>მიკროფონი ჩართულია... ისაუბრეთ ინგლისურად!</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="px-1.5 py-0.5 bg-stone-900/90 rounded border border-rose-500/40 font-mono text-rose-300">
              Space: გათიშვა
            </span>
            <span className="px-1.5 py-0.5 bg-stone-900/90 rounded border border-amber-500/40 font-mono text-amber-300">
              Enter: შემოწმება
            </span>
          </div>
        </div>
      )}

      {/* Input Field with Voice Dictation & Enter Button */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <input
            id="dictation-input-field"
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => {
              setUserInput(e.target.value);
              if (hasError) setHasError(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? '🎙️ გისმენთ... ისაუბრეთ ინგლისურად (Space: გათიშვა, Enter: შემოწმება)...'
                : isPausedForDictation
                ? 'Space: მიკროფონი 🎙️ • Enter: შემოწმება ↵ • Shift+Enter: თავიდან'
                : 'ვიდეო უკრავს... სუბტიტრის დასრულებისას ავტომატურად გაჩერდება.'
            }
            className={`w-full bg-stone-950/90 border text-stone-100 placeholder-stone-500 rounded-lg pl-3.5 pr-28 py-2.5 text-sm font-sans focus:outline-none transition-all ${
              isListening
                ? 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-950/10'
                : hasError
                ? 'border-rose-500/80 focus:border-rose-400'
                : 'border-stone-800 focus:border-amber-500/80'
            }`}
          />

          {/* Action buttons inside right of input */}
          <div className="absolute right-1.5 flex items-center gap-1">
            {/* Clear All Text Button (Backspace / Delete) */}
            {userInput.length > 0 && (
              <button
                id="clear-dictation-btn"
                type="button"
                onClick={() => {
                  setUserInput('');
                  setHasError(false);
                  setErrorMessage('');
                  inputRef.current?.focus();
                }}
                className="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
                title="ყველაფრის წაშლა (Backspace / Delete)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Voice Dictation Button */}
            <button
              id="voice-dictation-btn"
              type="button"
              onClick={toggleVoiceInput}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-950'
                  : 'bg-stone-800/90 hover:bg-stone-700 text-stone-300 hover:text-amber-300'
              }`}
              title={
                isListening
                  ? 'ვოისის შეჩერება (Listening... Click to stop)'
                  : 'ვოისით კარნახი (Click to speak in English)'
              }
            >
              {isListening ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <Mic className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">ვოისი</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">ვოისი</span>
                </>
              )}
            </button>

            {/* Enter / Submit Button */}
            <button
              id="dictation-submit-btn"
              type="submit"
              disabled={userInput.trim().length === 0}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                userInput.trim().length > 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer shadow-sm'
                  : 'bg-stone-800 text-stone-500 cursor-not-allowed'
              }`}
              title="დააჭირეთ Enter-ს დასადასტურებლად"
            >
              <span>Enter</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Word status matching chips */}
        {userInput.trim().length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
            {wordStatuses.map((item, idx) => (
              <span
                key={idx}
                onClick={() => onExplainWord(item.word.replace(/[^\w']/g, ''), currentSegment.text)}
                onContextMenu={(e) => handleWordRightClick(e, item.word)}
                title="მარცხენა წკაპი: თარგმანი • მარჯვენა წკაპი (Right-click): გამოთქმა 🔊"
                className={`px-1.5 py-0.5 rounded font-mono cursor-pointer transition-colors ${
                  item.status === 'correct'
                    ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-900/60 hover:bg-emerald-900/80'
                    : item.status === 'incorrect'
                    ? 'text-rose-400 bg-rose-950/60 border border-rose-900/60 hover:bg-rose-900/80'
                    : 'text-stone-400 bg-stone-800/50 hover:bg-stone-700/60'
                }`}
              >
                {item.word}
              </span>
            ))}
          </div>
        )}

        {errorMessage && (
          <p className="mt-1.5 text-xs text-rose-400 font-sans">
            {errorMessage}
          </p>
        )}

        {/* Keyboard Controls Bar (Space = Mic, Enter = Submit) */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-stone-800/70 pt-2 text-stone-400">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSpaceControlsMic}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer border ${
                spaceControlsMic
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 shadow-sm'
                  : 'bg-stone-800/70 text-stone-400 border-stone-700/60 hover:text-stone-200'
              }`}
              title="Space კლავიშით მიკროფონის ჩართვა/გამორთვა (დააჭირეთ ჩასართავად/გამოსართავად)"
            >
              <span className="px-1 py-0.2 bg-stone-900 rounded text-[10px] font-mono border border-stone-700 text-amber-400">
                Space
              </span>
              <span>{spaceControlsMic ? '🎙️ მიკროფონი (ჩართულია)' : 'მიკროფონი (გამორთულია)'}</span>
            </button>

            <span className="flex items-center gap-1 text-[11px] text-stone-300">
              <span className="px-1 py-0.2 bg-stone-900 rounded text-[10px] font-mono border border-stone-700 text-stone-200">
                Enter
              </span>
              <span>შემოწმება ↵</span>
            </span>

            <span className="hidden sm:flex items-center gap-1 text-[11px] text-stone-400">
              <span className="px-1 py-0.2 bg-stone-900 rounded text-[10px] font-mono border border-stone-700 text-stone-400">
                Shift+Enter
              </span>
              <span>↺ თავიდან მოსმენა</span>
            </span>
          </div>

          <div className="text-[10px] text-stone-500 font-mono">
            {isListening ? (
              <span className="text-rose-400 animate-pulse font-medium">● ხმა იწერება...</span>
            ) : spaceControlsMic ? (
              <span>დააჭირეთ Space-ს სასაუბროდ</span>
            ) : (
              <span>კლავიატურის რეჟიმი</span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

