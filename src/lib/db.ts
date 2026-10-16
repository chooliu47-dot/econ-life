import Dexie, { type EntityTable } from "dexie";
import type {
  JournalEntry,
  ReadingProgress,
  ReviewLog,
  VocabWord,
} from "./types";
import { DAILY_CARD_MAX, DAILY_CARD_TARGET } from "./types";

export class EconLifeDB extends Dexie {
  journals!: EntityTable<JournalEntry, "id">;
  vocab!: EntityTable<VocabWord, "id">;
  reviews!: EntityTable<ReviewLog, "id">;
  reading!: EntityTable<ReadingProgress, "id">;

  constructor() {
    super("econ-life-local");
    this.version(1).stores({
      journals: "++id, date, createdAt",
      vocab: "++id, word, nextReviewAt, mastered, sourceArticleId",
      reviews: "++id, date, wordId, createdAt",
      reading: "++id, articleId, readAt",
    });
  }
}

export const db = new EconLifeDB();

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getTodayReviewCount(date = todayKey()): Promise<number> {
  return db.reviews.where("date").equals(date).count();
}

/** Due / available words not yet reviewed today, capped for the daily budget. */
export async function getTodaysDeck(
  limit = DAILY_CARD_TARGET,
): Promise<VocabWord[]> {
  const date = todayKey();
  const reviewedToday = await db.reviews.where("date").equals(date).toArray();
  const reviewedIds = new Set(reviewedToday.map((r) => r.wordId));
  const remaining = Math.max(
    0,
    Math.min(DAILY_CARD_MAX, limit) - reviewedIds.size,
  );
  if (remaining <= 0) return [];

  const now = Date.now();
  const all = await db.vocab.toArray();
  const candidates = all.filter(
    (w) => w.id != null && !w.mastered && !reviewedIds.has(w.id),
  );

  const byPriority = (a: VocabWord, b: VocabWord) =>
    (b.priority ?? 0) - (a.priority ?? 0) ||
    a.ease - b.ease ||
    a.nextReviewAt - b.nextReviewAt;

  const due = candidates
    .filter((w) => w.nextReviewAt <= now)
    .sort(byPriority);

  const later = candidates
    .filter((w) => w.nextReviewAt > now)
    .sort(
      (a, b) =>
        byPriority(a, b) ||
        a.repetitions - b.repetitions ||
        a.createdAt - b.createdAt,
    );

  // Prefer high-priority / due cards (forgotten + sentence errors resurface soon)
  return [...due, ...later].slice(0, remaining);
}

export async function gradeWord(
  word: VocabWord,
  grade: ReviewLog["grade"],
): Promise<void> {
  if (word.id == null) return;

  const date = todayKey();
  await db.reviews.add({
    date,
    wordId: word.id,
    grade,
    createdAt: Date.now(),
  });

  let { intervalDays, ease, repetitions } = word;
  let priority = word.priority ?? 0;

  if (grade === "again") {
    // Forgotten → reset + resurface tomorrow / day-after with high priority
    repetitions = 0;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.25);
    priority += 3;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * ease);

    if (grade === "hard") {
      ease = Math.max(1.3, ease - 0.15);
      priority += 1;
    }
    if (grade === "good") priority = Math.max(0, priority - 1);
    if (grade === "easy") {
      ease += 0.15;
      intervalDays = Math.round(intervalDays * 1.3);
      priority = 0;
    }
  }

  // 「重来」：约 20–36 小时后到期，确保明后天优先抽到
  const nextReviewAt =
    grade === "again"
      ? Date.now() + (20 + Math.floor(Math.random() * 16)) * 60 * 60 * 1000
      : grade === "hard"
        ? Date.now() + Math.max(1, intervalDays) * 20 * 60 * 60 * 1000
        : Date.now() + intervalDays * 24 * 60 * 60 * 1000;

  await db.vocab.update(word.id, {
    intervalDays,
    ease,
    repetitions,
    nextReviewAt,
    priority,
    mastered: repetitions >= 8 && intervalDays >= 30,
  });
}

/** Sentence usage failed → bump priority and schedule for tomorrow / day-after. */
export async function penalizeSentenceError(word: VocabWord): Promise<void> {
  if (word.id == null) return;
  const hours = 18 + Math.floor(Math.random() * 20); // ~18–38h
  await db.vocab.update(word.id, {
    repetitions: 0,
    intervalDays: 0,
    ease: Math.max(1.3, word.ease - 0.2),
    priority: (word.priority ?? 0) + 2,
    nextReviewAt: Date.now() + hours * 60 * 60 * 1000,
    mastered: false,
  });
}

function toVocabRecord(
  item: {
    word: string;
    phonetic?: string;
    definitionZh: string;
    definitionEn: string;
    example?: string;
  },
  sourceArticleId: string,
): Omit<VocabWord, "id"> | null {
  const normalized = item.word?.trim();
  if (!normalized) return null;
  const definitionZh = (item.definitionZh ?? "").trim() || "（暂无中文释义）";
  const definitionEn = (item.definitionEn ?? "").trim() || normalized;
  return {
    word: normalized,
    phonetic: item.phonetic?.trim() || undefined,
    definitionZh,
    definitionEn,
    example: item.example?.trim() || undefined,
    sourceArticleId,
    createdAt: Date.now(),
    nextReviewAt: Date.now(),
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    priority: 0,
    mastered: false,
  };
}

export async function upsertVocabFromArticle(
  articleId: string,
  items: Array<{
    word: string;
    phonetic?: string;
    definitionZh: string;
    definitionEn: string;
    example?: string;
  }>,
): Promise<number> {
  if (!items?.length) return 0;

  const existing = await db.vocab.toArray();
  const known = new Set(existing.map((w) => w.word.toLowerCase()));

  const rows: Omit<VocabWord, "id">[] = [];
  for (const item of items) {
    const row = toVocabRecord(item, articleId);
    if (!row) continue;
    const key = row.word.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    rows.push(row);
  }

  if (rows.length === 0) return 0;
  await db.vocab.bulkAdd(rows as VocabWord[]);
  return rows.length;
}

/** Seed 30 advanced test words into the same Dexie `vocab` table used by Feed. */
export async function seedTestVocab(
  items: Array<{
    word: string;
    phonetic?: string;
    definitionZh: string;
    definitionEn: string;
    example?: string;
  }>,
): Promise<number> {
  return upsertVocabFromArticle("seed-test-pack", items);
}

export async function getVocabStats(): Promise<{
  total: number;
  active: number;
}> {
  const all = await db.vocab.toArray();
  return {
    total: all.length,
    active: all.filter((w) => !w.mastered).length,
  };
}

export async function markArticleRead(articleId: string): Promise<void> {
  const existing = await db.reading.where("articleId").equals(articleId).first();
  if (existing?.id != null) {
    await db.reading.update(existing.id, {
      readAt: Date.now(),
      vocabExtracted: true,
    });
  } else {
    await db.reading.add({
      articleId,
      readAt: Date.now(),
      vocabExtracted: true,
    });
  }
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.journals.clear(),
    db.vocab.clear(),
    db.reviews.clear(),
    db.reading.clear(),
  ]);
}
