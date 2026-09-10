import React, { useState, useEffect, useRef } from 'react';
import { VocabularyItem, MemoryTaskType, SentenceEvaluationResult } from '../types';
import { getStageInfo, SCIENTIFIC_STAGES } from '../utils/spacedRepetition';
import {
  Volume2,
  Check,
  RotateCcw,
  X,
  Sparkles,
  Mic,
  Loader2,
  Lightbulb,
  HelpCircle,
  TrendingUp,
  Brain,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { playSuccessSound, playErrorSound, playPauseTone } from '../utils/audioEffects';

interface ScientificMemoryTaskModalProps {
  item: VocabularyItem;
  onComplete?: (id: string, remembered: boolean, taskType?: MemoryTaskType, score?: number) => void;
  onTaskCompleted?: (id: string, remembered: boolean, taskType?: MemoryTaskType, score?: number) => void;
  onClose: () => void;
}

export const ScientificMemoryTaskModal: React.FC<ScientificMemoryTaskModalProps> = ({
  item,
  onComplete,
  onTaskCompleted,
  onClose,
}) => {
  const stageInfo = getStageInfo(item.stage);
  const nextStageInfo = getStageInfo(item.stage + 1);

  // By default, the English word is CONCEALED to force true active recall
  const [isWordRevealed, setIsWordRevealed] = useState(false);

  // Active Task Tab: 'active_recall' | 'sentence_generation' | 'audio_rehearsal' | 'semantic_quiz'
  const [activeTab, setActiveTab] = useState<MemoryTaskType>('active_recall');

  // Generated task state
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [taskData, setTaskData] = useState<any>(null);

  // Task 1: Active Cloze State
  const [clozeInput, setClozeInput] = useState('');
  const [clozeChecked, setClozeChecked] = useState(false);
  const [clozeCorrect, setClozeCorrect] = useState(false);
  const [showFirstLetter, setShowFirstLetter] = useState(false);

  // Task 2: Sentence Generation (Generation Effect) State
  const [userSentence, setUserSentence] = useState('');
  const [isEvaluatingSentence, setIsEvaluatingSentence] = useState(false);
  const [sentenceResult, setSentenceResult] = useState<SentenceEvaluationResult | null>(null);

  // Task 3: Audio / Speech Rehearsal State
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [audioScore, setAudioScore] = useState<number | null>(null);

  // Task 4: Semantic Quiz State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const recognitionRef = useRef<any>(null);

  // Pronounce word via SpeechSynthesis
  const speakWord = (speed: number = 0.9) => {
    if (typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(item.word);
      u.lang = 'en-US';
      u.rate = speed;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  // Fetch or generate task from backend
  useEffect(() => {
    let isMounted = true;
    setIsLoadingTask(true);

    fetch('/api/generate-memory-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: item.word,
        sentence: item.sentence,
        georgianTranslation: item.georgianTranslation,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (isMounted && res.success && res.task) {
          setTaskData(res.task);
        }
      })
      .catch((err) => console.warn('Memory task fetch note:', err))
      .finally(() => {
        if (isMounted) setIsLoadingTask(false);
      });

    return () => {
      isMounted = false;
    };
  }, [item.word, item.sentence, item.georgianTranslation]);

  // Handle Cloze Check
  const handleCheckCloze = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = clozeInput.trim().toLowerCase();
    const cleanTarget = item.word.trim().toLowerCase();

    // Check exact match or close match without punctuation
    const isMatch =
      cleanUser === cleanTarget ||
      cleanUser.replace(/[^a-z]/gi, '') === cleanTarget.replace(/[^a-z]/gi, '');
    setClozeChecked(true);
    setClozeCorrect(isMatch);

    if (isMatch) {
      playSuccessSound(true);
      // Automatically reveal word on successful recall
      setIsWordRevealed(true);
    } else {
      playErrorSound(true);
    }
  };

  // Handle Sentence Generation Evaluation
  const handleEvaluateSentence = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userSentence.trim()) return;

    setIsEvaluatingSentence(true);
    try {
      const res = await fetch('/api/evaluate-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: item.word,
          userSentence: userSentence.trim(),
          targetMeaning: item.georgianTranslation,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSentenceResult(data);
        if (data.isCorrect) {
          playSuccessSound(true);
          setIsWordRevealed(true);
        } else {
          playPauseTone();
        }
      }
    } catch (err: any) {
      setSentenceResult({
        isCorrect: userSentence.toLowerCase().includes(item.word.toLowerCase()),
        score: 75,
        feedbackInGeorgian: 'წინადადება მიღებულია!',
      });
    } finally {
      setIsEvaluatingSentence(false);
    }
  };

  // Speech Recognition for Pronunciation Rehearsal & Dictation
  const toggleSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('თქვენს ბრაუზერში ხმის ამოცნობა არ არის მხარდაჭერილი.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript.trim();
        setSpokenText(text);

        if (activeTab === 'active_recall') {
          setClozeInput(text);
        } else if (activeTab === 'sentence_generation') {
          setUserSentence((prev) => (prev ? `${prev} ${text}` : text));
        } else if (activeTab === 'audio_rehearsal') {
          const cleanSpoken = text.toLowerCase().replace(/[^a-z]/g, '');
          const cleanTarget = item.word.toLowerCase().replace(/[^a-z]/g, '');
          const isCorrect = cleanSpoken.includes(cleanTarget);
          setAudioScore(isCorrect ? 100 : 50);
          if (isCorrect) {
            playSuccessSound(true);
            setIsWordRevealed(true);
          }
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  // Dispatch completion safely through whichever callback prop was passed
  const dispatchResult = (remembered: boolean, score: number) => {
    if (onTaskCompleted) {
      onTaskCompleted(item.id, remembered, activeTab, score);
    } else if (onComplete) {
      onComplete(item.id, remembered, activeTab, score);
    }
    onClose();
  };

  // Final confirmation: Remembered (advances to next interval: 1h, 4h, 1d...)
  const handleConfirmMastered = () => {
    playSuccessSound(true);
    let finalScore = 90;
    if (sentenceResult?.score) finalScore = sentenceResult.score;
    if (audioScore) finalScore = audioScore;
    dispatchResult(true, finalScore);
  };

  // Forgot / Reset (returns to 30 min interval)
  const handleNeedsPractice = () => {
    playPauseTone();
    dispatchResult(false, 20);
  };

  // Compute sentence context for cloze (replaces target word with [ ______ ])
  const contextSentence =
    taskData?.clozeSentence ||
    (item.sentence && item.sentence.toLowerCase().includes(item.word.toLowerCase())
      ? item.sentence.replace(new RegExp(`\\b${item.word}\\b`, 'gi'), '[ ______ ]')
      : `The speaker used [ ______ ] to express this idea.`);

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-stone-900 border border-amber-500/40 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 text-stone-100 animate-fade-in my-auto">
        {/* Header with Scientific Memory Tag */}
        <div className="flex items-start justify-between border-b border-stone-800 pb-3 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-amber-500/20 text-amber-300">
                <Brain className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-stone-100 flex items-center gap-2">
                გრძელვადიანი მეხსიერების დავალება
              </h2>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              მეცნიერული ინტერვალი: <span className="text-amber-400 font-medium">{stageInfo.label}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Word Info Banner with Active Recall Mode (Hidden by default) */}
        <div className="p-3.5 rounded-xl bg-stone-950/90 border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 font-medium">ქართული მნიშვნელობა:</span>
              <span className="text-sm sm:text-base font-bold text-emerald-400">
                "{item.georgianTranslation}"
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs text-stone-400 font-medium">ინგლისურად:</span>
              {isWordRevealed ? (
                <div className="flex items-center gap-2 animate-fade-in">
                  <span className="text-xl sm:text-2xl font-bold tracking-wide text-amber-300">
                    {item.word}
                  </span>
                  <button
                    onClick={() => speakWord(0.9)}
                    className="p-1 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                    title="წარმოთქმა"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 font-mono text-stone-400 text-base sm:text-lg tracking-widest bg-stone-900 px-3 py-1 rounded-lg border border-stone-800">
                  <span>{Array.from({ length: item.word.length }).map(() => '•').join(' ')}</span>
                  <span className="text-[11px] font-sans text-stone-500 font-medium tracking-normal ml-1">
                    ({item.word.length} ასო)
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-center justify-end">
            <button
              type="button"
              onClick={() => setIsWordRevealed((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                isWordRevealed
                  ? 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 ring-1 ring-amber-500/20'
              }`}
            >
              {isWordRevealed ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>დამალვა</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>მაჩვენე სიტყვა</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Task Selection Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-stone-950 rounded-xl border border-stone-800/80 text-xs">
          <button
            onClick={() => setActiveTab('active_recall')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center cursor-pointer ${
              activeTab === 'active_recall'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            1. აქტიური ჩასმა
          </button>
          <button
            onClick={() => setActiveTab('sentence_generation')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center cursor-pointer ${
              activeTab === 'sentence_generation'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            2. წინადადება (AI)
          </button>
          <button
            onClick={() => setActiveTab('audio_rehearsal')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center cursor-pointer ${
              activeTab === 'audio_rehearsal'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            3. ხმოვანი კარნახი
          </button>
          <button
            onClick={() => setActiveTab('semantic_quiz')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center cursor-pointer ${
              activeTab === 'semantic_quiz'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            4. ტესტი (Quiz)
          </button>
        </div>

        {/* TAB 1: Active Contextual Recall (Cloze) */}
        {activeTab === 'active_recall' && (
          <div className="space-y-3 bg-stone-950/40 p-3.5 rounded-xl border border-stone-800">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span className="flex items-center gap-1 font-medium text-amber-300">
                <Lightbulb className="w-3.5 h-3.5" />
                ჩასვით გამოტოვებული სიტყვა კონტექსტში
              </span>
              <button
                type="button"
                onClick={() => setShowFirstLetter((p) => !p)}
                className="text-[11px] text-stone-400 hover:text-amber-300 underline cursor-pointer"
              >
                {showFirstLetter ? `მინიშნების დამალვა` : `მინიშნება (პირველი ასო: "${item.word[0].toUpperCase()}")`}
              </button>
            </div>

            <div className="p-3 bg-stone-900/80 rounded-lg border border-stone-800 text-sm leading-relaxed text-stone-200 font-sans">
              {contextSentence}
            </div>

            <form onSubmit={handleCheckCloze} className="space-y-2">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={clozeInput}
                  onChange={(e) => {
                    setClozeInput(e.target.value);
                    setClozeChecked(false);
                  }}
                  placeholder={
                    showFirstLetter
                      ? `${item.word[0]}... (აკრიფეთ ან თქვით მიკროფონით)`
                      : 'გაიხსენეთ და აკრიფეთ ინგლისური სიტყვა...'
                  }
                  className={`w-full bg-stone-950 border rounded-lg px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none transition-all pr-24 ${
                    clozeChecked
                      ? clozeCorrect
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-rose-500 ring-2 ring-rose-500/20'
                      : 'border-stone-700 focus:border-amber-500'
                  }`}
                />

                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                    title="ხმოვანი კარნახი"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-md transition-colors cursor-pointer"
                  >
                    შემოწმება
                  </button>
                </div>
              </div>

              {clozeChecked && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center justify-between animate-fade-in ${
                    clozeCorrect
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {clozeCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>შესანიშნავია! სწორი სიტყვაა: <strong className="underline">{item.word}</strong></span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>არასწორია. სცადეთ ხელახლა ან დააჭირეთ „მაჩვენე სიტყვა“-ს.</span>
                      </>
                    )}
                  </div>

                  {!isWordRevealed && !clozeCorrect && (
                    <button
                      type="button"
                      onClick={() => setIsWordRevealed(true)}
                      className="text-amber-400 font-semibold underline hover:text-amber-300 cursor-pointer text-[11px]"
                    >
                      სიტყვის ჩვენება
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>
        )}

        {/* TAB 2: Generation Effect (User creates a sentence with AI evaluation) */}
        {activeTab === 'sentence_generation' && (
          <div className="space-y-3 bg-stone-950/40 p-3.5 rounded-xl border border-stone-800">
            <div className="text-xs text-stone-300">
              <span className="font-semibold text-amber-300">Generation Effect (მეცნიერული მეთოდი):</span>
              <p className="text-stone-400 text-[11px] mt-0.5">
                საკუთარი წინადადების შექმნა 300%-ით აძლიერებს სიტყვის ნეირონულ ფიქსაციას.
                {isWordRevealed ? (
                  <span> შეადგინეთ წინადადება სიტყვით: <strong className="text-amber-300">"{item.word}"</strong>.</span>
                ) : (
                  <span> შეადგინეთ წინადადება ნასწავლი სიტყვით (მნიშვნელობა: <strong className="text-emerald-400">"{item.georgianTranslation}"</strong>).</span>
                )}
              </p>
            </div>

            <form onSubmit={handleEvaluateSentence} className="space-y-2">
              <div className="relative">
                <textarea
                  rows={2}
                  value={userSentence}
                  onChange={(e) => setUserSentence(e.target.value)}
                  placeholder={
                    isWordRevealed
                      ? `მაგალითად: I want to use ${item.word} in my daily conversation...`
                      : `აკრიფეთ წინადადება ინგლისურად (გამოიყენეთ სიტყვა)...`
                  }
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg p-3 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                />

                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  className={`absolute right-2 bottom-3 p-1.5 rounded-md transition-colors cursor-pointer ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                  title="ხმით კარნახი"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[11px] text-stone-500 font-mono">
                  {isListening ? '🎙️ გისმენთ...' : 'შეგიძლიათ აკრიფოთ ან ხმით გვიკარნახოთ'}
                </span>
                <button
                  type="submit"
                  disabled={isEvaluatingSentence || !userSentence.trim()}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isEvaluatingSentence ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>AI აფასებს...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>შეფასება (AI)</span>
                    </>
                  )}
                </button>
              </div>

              {sentenceResult && (
                <div
                  className={`p-3 rounded-lg text-xs space-y-1.5 animate-fade-in ${
                    sentenceResult.isCorrect
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-stone-200'
                      : 'bg-amber-500/15 border border-amber-500/40 text-stone-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className={sentenceResult.isCorrect ? 'text-emerald-400' : 'text-amber-400'}>
                      {sentenceResult.isCorrect ? '✓ შესანიშნავი გამოყენება!' : 'მცირე კორექცია:'}
                    </span>
                    <span className="text-amber-300 font-mono text-[11px]">
                      ქულა: {sentenceResult.score}/100
                    </span>
                  </div>
                  <p className="text-stone-300">{sentenceResult.feedbackInGeorgian}</p>
                  {sentenceResult.improvedSentence && (
                    <div className="pt-1.5 border-t border-stone-800/80 text-[11px] text-stone-400">
                      <span>ბუნებრივი ვარიანტი: </span>
                      <strong className="text-stone-200 italic">"{sentenceResult.improvedSentence}"</strong>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        )}

        {/* TAB 3: Audio / Phonological Loop */}
        {activeTab === 'audio_rehearsal' && (
          <div className="space-y-3 bg-stone-950/40 p-3.5 rounded-xl border border-stone-800 text-center">
            <div className="text-xs text-stone-300">
              <span className="font-semibold text-amber-300">Phonological Loop (სმენითი და არტიკულაციური მეხსიერება):</span>
              <p className="text-stone-400 text-[11px] mt-0.5">
                {isWordRevealed
                  ? 'მოუსმინეთ და გაიმეორეთ ხმით მიკროფონში.'
                  : 'გაიხსენეთ ინგლისური სიტყვა და წარმოთქვით მიკროფონში.'}
              </p>
            </div>

            <div className="py-3 flex flex-col items-center gap-3">
              {isWordRevealed ? (
                <button
                  type="button"
                  onClick={() => speakWord(0.85)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md transition-all hover:scale-105"
                >
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>მოსმენა (ნელი ტემპით: "{item.word}")</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsWordRevealed(true)}
                  className="px-4 py-2 rounded-xl bg-stone-800/90 hover:bg-stone-700 text-amber-300 text-xs font-medium flex items-center gap-2 cursor-pointer border border-amber-500/30"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>ვერ იხსენებთ? მაჩვენე სიტყვა</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`p-4 rounded-full transition-all shadow-lg cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white ring-4 ring-rose-500/40 animate-pulse'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold'
                }`}
                title="დააჭირეთ და წარმოთქვით"
              >
                <Mic className="w-6 h-6" />
              </button>
              <span className="text-xs text-stone-400 font-mono">
                {isListening ? '🎙️ გისმენთ... თქვით სიტყვა!' : 'დააჭირეთ მიკროფონს და წარმოთქვით'}
              </span>

              {spokenText && (
                <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800 text-xs max-w-sm w-full">
                  <span className="text-stone-400">თქვენი ნათქვამი: </span>
                  <strong className="text-amber-300">"{spokenText}"</strong>
                  {audioScore !== null && (
                    <p className={`mt-1 font-semibold ${audioScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {audioScore >= 80 ? '✓ შესანიშნავი გამოთქმა!' : 'კიდევ სცადეთ უფრო მკაფიოდ'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Semantic Quiz */}
        {activeTab === 'semantic_quiz' && (
          <div className="space-y-3 bg-stone-950/40 p-3.5 rounded-xl border border-stone-800">
            <span className="text-xs font-medium text-amber-300">
              {isWordRevealed
                ? `რა არის სიტყვა "${item.word}"-ის სწორი ქართული მნიშვნელობა?`
                : `რომელი სიტყვა შეესაბამება მნიშვნელობას: "${item.georgianTranslation}"?`}
            </span>

            <div className="space-y-2">
              {(
                taskData?.quizOptions || [
                  isWordRevealed ? item.georgianTranslation : item.word,
                  'different meaning',
                  'unexpected concept',
                  'temporary state',
                ]
              ).map((opt: string, idx: number) => {
                const isSelected = selectedOption === idx;
                const isCorrect = idx === (taskData?.correctOptionIndex ?? 0);

                let btnStyle = 'bg-stone-900/90 border-stone-800 text-stone-300 hover:border-stone-700';
                if (quizSubmitted) {
                  if (isCorrect) {
                    btnStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold';
                  } else if (isSelected) {
                    btnStyle = 'bg-rose-500/20 border-rose-500 text-rose-300';
                  }
                } else if (isSelected) {
                  btnStyle = 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedOption(idx);
                      setQuizSubmitted(true);
                      if (isCorrect) {
                        playSuccessSound(true);
                        setIsWordRevealed(true);
                      } else {
                        playErrorSound(true);
                      }
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all cursor-pointer ${btnStyle}`}
                  >
                    <span className="font-mono text-stone-500 mr-2">{idx + 1}.</span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer: Memory Progress & Final Action Buttons */}
        <div className="pt-2 border-t border-stone-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>
                შემდეგი შეტყობინება:{' '}
                <strong className="text-amber-300">{nextStageInfo.label}</strong>
              </span>
            </div>
            <span className="text-[11px] text-stone-500 font-mono hidden sm:inline">
              ტელეფონზე შეტყობინება ავტომატურია 📲
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleNeedsPractice}
              className="py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-rose-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>გამეორება (30 წუთში)</span>
            </button>

            <button
              onClick={handleConfirmMastered}
              className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>დავალება შესრულდა (+ეტაპი)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

