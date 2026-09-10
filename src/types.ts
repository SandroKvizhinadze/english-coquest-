export interface SubtitleSegment {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  completed?: boolean;
  userTyped?: string;
  attempts?: number;
}

export interface PodcastLesson {
  id: string;
  title: string;
  speaker: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  videoId: string;
  durationFormatted: string;
  description: string;
  subtitles: SubtitleSegment[];
}

export interface PracticeSettings {
  playbackRate: number;
  mode: 'dictation' | 'shadowing' | 'masked';
  ignorePunctuation: boolean;
  ignoreCase: boolean;
  autoReplayOnFail: boolean;
  soundEffects: boolean;
  autoResumeNext: boolean;
}

export interface VideoPlan {
  title: string;
  summary: string;
  level: string;
  keyVocabulary?: string[];
}

export interface WordExplanation {
  word: string;
  phonetic?: string;
  georgianTranslation: string;
  simpleExplanation: string;
  georgianExplanation: string;
  exampleSentence?: string;
}

export interface VocabularyItem {
  id: string;
  word: string;
  sentence: string;
  georgianTranslation: string;
  simpleExplanation: string;
  georgianExplanation: string;
  addedAt: number;
  stage: number; // 0 = 30min, 1 = 1hour, 2 = 4hours, 3 = 1day, 4 = 3days, 5 = 7days, 6 = 14days, 7 = 30days
  nextReviewAt: number; // timestamp in ms
  lastReviewedAt?: number;
  reviewCount: number;
  retentionScore?: number; // 0 - 100
  history?: {
    timestamp: number;
    stage: number;
    success: boolean;
    taskType: 'active_recall' | 'sentence_generation' | 'audio_rehearsal' | 'semantic_quiz';
  }[];
}

export type MemoryTaskType = 'active_recall' | 'sentence_generation' | 'audio_rehearsal' | 'semantic_quiz';

export interface SentenceEvaluationResult {
  isCorrect: boolean;
  score: number; // 0 - 100
  feedbackInGeorgian: string;
  improvedSentence?: string;
  grammaticalNotes?: string;
}


export interface SavedVideoProgress {
  videoId: string;
  videoUrl: string;
  title: string;
  summary?: string;
  totalSubtitles: number;
  completedSubtitlesCount: number;
  currentSegmentIndex: number;
  currentTime: number;
  lastUpdated: number;
  completedIds?: number[];
}
