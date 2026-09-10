import { VocabularyItem, WordExplanation, MemoryTaskType } from '../types';

const STORAGE_KEY = 'eng_podcast_spaced_vocabulary_v2';

// Scientifically proven spaced repetition intervals (Ebbinghaus & synaptic memory consolidation)
// Stage 0: 30 minutes (immediate post-learning consolidation)
// Stage 1: 1 hour (working memory stabilization)
// Stage 2: 4 hours (same-day reactivation before sleep)
// Stage 3: 1 day / 24 hours (overnight sleep consolidation)
// Stage 4: 3 days (short-to-medium term transfer)
// Stage 5: 7 days / 1 week (episodic to semantic memory consolidation)
// Stage 6: 14 days / 2 weeks (stabilization)
// Stage 7: 30 days / 1 month (permanent long-term schema integration)
export interface SpacedStageInfo {
  stage: number;
  minutes: number;
  label: string;
  shortLabel: string;
  scientificGoal: string;
}

export const SCIENTIFIC_STAGES: SpacedStageInfo[] = [
  {
    stage: 0,
    minutes: 30,
    label: '30 წუთი (პირველი დაფიქსირება)',
    shortLabel: '30 წთ',
    scientificGoal: 'მეხსიერების პირველადი კვალიფიკაცია (Ebbinghaus-ის 50% კლების შეჩერება)',
  },
  {
    stage: 1,
    minutes: 60,
    label: '1 საათი (მუშა მეხსიერება)',
    shortLabel: '1 სთ',
    scientificGoal: 'მუშა მეხსიერებიდან მოკლევადიან საცავში გადატანა',
  },
  {
    stage: 2,
    minutes: 240,
    label: '4 საათი (დღის შუალედური)',
    shortLabel: '4 სთ',
    scientificGoal: 'შუალედური რეაქტივაცია დღის მეორე ნახევარში',
  },
  {
    stage: 3,
    minutes: 1440,
    label: '1 დღე (ძილის შემდგომი)',
    shortLabel: '1 დღე',
    scientificGoal: 'ღამის ძილის შემდგომი სინაფსური კონსოლიდაცია',
  },
  {
    stage: 4,
    minutes: 4320,
    label: '3 დღე (სინაფსური გამყარება)',
    shortLabel: '3 დღე',
    scientificGoal: 'გრძელვადიან მეხსიერებაში გადასვლის კრიტიკული ფაზა',
  },
  {
    stage: 5,
    minutes: 10080,
    label: '7 დღე (1 კვირა - გრძელვადიანი)',
    shortLabel: '7 დღე',
    scientificGoal: 'ეპიზოდური მეხსიერებიდან სემანტიკურ ბადეში ინტეგრაცია',
  },
  {
    stage: 6,
    minutes: 20160,
    label: '14 დღე (2 კვირა - სისტემური)',
    shortLabel: '14 დღე',
    scientificGoal: 'სისტემური სტაბილიზაცია',
  },
  {
    stage: 7,
    minutes: 43200,
    label: '30 დღე (1 თვე - მუდმივი ოსტატობა)',
    shortLabel: '30 დღე',
    scientificGoal: 'მუდმივი გრძელვადიანი მეხსიერება (Mastery)',
  },
];

export function getStageInfo(stage: number): SpacedStageInfo {
  const safeStage = Math.max(0, Math.min(stage, SCIENTIFIC_STAGES.length - 1));
  return SCIENTIFIC_STAGES[safeStage];
}

export function getIntervalMs(stage: number): number {
  const info = getStageInfo(stage);
  return info.minutes * 60 * 1000;
}

export function loadVocabulary(): VocabularyItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Check legacy key v1 for backwards compatibility
      const legacyRaw = localStorage.getItem('eng_podcast_spaced_vocabulary_v1');
      if (legacyRaw) {
        const legacyItems: VocabularyItem[] = JSON.parse(legacyRaw);
        saveVocabulary(legacyItems);
        return legacyItems;
      }
      return [];
    }
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('Error loading vocabulary from localStorage:', err?.message || 'unknown error');
    return [];
  }
}

export function saveVocabulary(items: VocabularyItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err: any) {
    console.error('Error saving vocabulary to localStorage:', err?.message || 'unknown error');
  }
}

export function addWordToVocabulary(
  word: string,
  explanation: WordExplanation,
  sentence: string
): VocabularyItem {
  const items = loadVocabulary();
  const cleanWord = word.trim().toLowerCase();

  // If already exists, update explanation and reset to stage 0 (30m)
  const existingIndex = items.findIndex((i) => i.word.toLowerCase() === cleanWord);
  const now = Date.now();
  const nextReview = now + getIntervalMs(0); // 30 mins

  if (existingIndex >= 0) {
    const updated: VocabularyItem = {
      ...items[existingIndex],
      sentence: sentence || items[existingIndex].sentence,
      georgianTranslation: explanation.georgianTranslation || items[existingIndex].georgianTranslation,
      simpleExplanation: explanation.simpleExplanation || items[existingIndex].simpleExplanation,
      georgianExplanation: explanation.georgianExplanation || items[existingIndex].georgianExplanation,
      stage: 0,
      nextReviewAt: nextReview,
    };
    items[existingIndex] = updated;
    saveVocabulary(items);
    return updated;
  }

  const newItem: VocabularyItem = {
    id: `vocab-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    word: word.trim(),
    sentence: sentence || '',
    georgianTranslation: explanation.georgianTranslation || '',
    simpleExplanation: explanation.simpleExplanation || '',
    georgianExplanation: explanation.georgianExplanation || '',
    addedAt: now,
    stage: 0, // Starts at 30 minutes
    nextReviewAt: nextReview,
    reviewCount: 0,
    retentionScore: 0,
    history: [],
  };

  items.unshift(newItem);
  saveVocabulary(items);
  return newItem;
}

export function getDueItems(): VocabularyItem[] {
  const items = loadVocabulary();
  const now = Date.now();
  return items.filter((item) => item.nextReviewAt <= now);
}

export function recordReviewResult(
  id: string,
  remembered: boolean,
  taskType?: MemoryTaskType,
  score?: number
): VocabularyItem | null {
  const items = loadVocabulary();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return null;

  const current = items[index];
  const now = Date.now();

  let nextStage: number;
  if (remembered) {
    nextStage = Math.min(current.stage + 1, SCIENTIFIC_STAGES.length - 1);
  } else {
    // Forgot -> reset to stage 0 (30 minutes)
    nextStage = 0;
  }

  const nextInterval = getIntervalMs(nextStage);
  const retentionScore = remembered
    ? Math.min(100, (current.retentionScore || 0) + (score ? Math.round(score / 4) : 25))
    : Math.max(10, (current.retentionScore || 50) - 20);

  const historyEntry = {
    timestamp: now,
    stage: nextStage,
    success: remembered,
    taskType: taskType || ('active_recall' as MemoryTaskType),
  };

  const updated: VocabularyItem = {
    ...current,
    stage: nextStage,
    lastReviewedAt: now,
    nextReviewAt: now + nextInterval,
    reviewCount: current.reviewCount + 1,
    retentionScore,
    history: [...(current.history || []).slice(-10), historyEntry],
  };

  items[index] = updated;
  saveVocabulary(items);
  return updated;
}

