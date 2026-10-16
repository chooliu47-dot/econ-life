export type TabId = "journal" | "cards" | "feed" | "settings";

export interface JournalEntry {
  id?: number;
  date: string;
  rawText: string;
  /** Polished native English (also stored as correctedText for older backups) */
  correctedText: string;
  tipsZh?: string;
  /** Dominant mood emoji for the calendar */
  emotionEmoji?: string;
  createdAt: number;
}

export interface VocabWord {
  id?: number;
  word: string;
  phonetic?: string;
  definitionZh: string;
  definitionEn: string;
  example?: string;
  sourceArticleId?: string;
  createdAt: number;
  /** Unix ms when due for review */
  nextReviewAt: number;
  intervalDays: number;
  ease: number;
  repetitions: number;
  /** Higher = surface sooner in tomorrow’s deck (again / sentence errors) */
  priority?: number;
  /** Times marked known today is tracked via ReviewLog */
  mastered: boolean;
}

export interface SentenceCheckResult {
  correct: boolean;
  natural: boolean;
  feedbackZh: string;
  betterExpression: string;
}

export interface ReviewLog {
  id?: number;
  date: string;
  wordId: number;
  grade: "again" | "hard" | "good" | "easy";
  createdAt: number;
}

export interface ReadingProgress {
  id?: number;
  articleId: string;
  readAt: number;
  vocabExtracted: boolean;
}

export interface ArticleVocab {
  word: string;
  phonetic?: string;
  definitionZh: string;
  definitionEn: string;
  example?: string;
}

export interface Article {
  id: string;
  titleEn: string;
  titleZh: string;
  category: string;
  minutes: number;
  publishedAt: string;
  bodyEn: string[];
  bodyZh: string[];
  vocab: ArticleVocab[];
}

export interface JournalAnalyzeResult {
  polishedText: string;
  tipsZh: string;
  emotionEmoji: string;
}

export interface ExportPayload {
  version: 1;
  exportedAt: string;
  journals: JournalEntry[];
  vocab: VocabWord[];
  reviews: ReviewLog[];
  reading: ReadingProgress[];
}

export const DAILY_CARD_MIN = 20;
export const DAILY_CARD_MAX = 30;
export const DAILY_CARD_TARGET = 25;
