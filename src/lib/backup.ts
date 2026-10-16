import { db, clearAllData } from "./db";
import type { ExportPayload, JournalEntry, VocabWord } from "./types";

export async function buildExportPayload(): Promise<ExportPayload> {
  const [journals, vocab, reviews, reading] = await Promise.all([
    db.journals.toArray(),
    db.vocab.toArray(),
    db.reviews.toArray(),
    db.reading.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    journals,
    vocab,
    reviews,
    reading,
  };
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportJson(): Promise<void> {
  const payload = await buildExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const stamp = payload.exportedAt.slice(0, 10);
  downloadBlob(`econ-life-backup-${stamp}.json`, blob);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function exportCsv(): Promise<void> {
  const payload = await buildExportPayload();

  const journalHeader = [
    "type",
    "date",
    "rawText",
    "correctedText",
    "tipsZh",
    "emotionEmoji",
    "createdAt",
  ];
  const journalRows = payload.journals.map((j) =>
    [
      "journal",
      j.date,
      j.rawText,
      j.correctedText,
      j.tipsZh ?? "",
      j.emotionEmoji ?? "",
      String(j.createdAt),
    ]
      .map(csvEscape)
      .join(","),
  );

  const vocabHeader = [
    "type",
    "word",
    "phonetic",
    "definitionZh",
    "definitionEn",
    "example",
    "sourceArticleId",
    "nextReviewAt",
    "intervalDays",
    "ease",
    "repetitions",
    "mastered",
    "createdAt",
  ];
  const vocabRows = payload.vocab.map((v) =>
    [
      "vocab",
      v.word,
      v.phonetic ?? "",
      v.definitionZh,
      v.definitionEn,
      v.example ?? "",
      v.sourceArticleId ?? "",
      String(v.nextReviewAt),
      String(v.intervalDays),
      String(v.ease),
      String(v.repetitions),
      String(v.mastered),
      String(v.createdAt),
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [
    "# Econ Life backup (journals + vocab)",
    journalHeader.join(","),
    ...journalRows,
    "",
    vocabHeader.join(","),
    ...vocabRows,
  ].join("\n");

  const stamp = payload.exportedAt.slice(0, 10);
  downloadBlob(
    `econ-life-backup-${stamp}.csv`,
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
}

export async function importJson(file: File): Promise<{
  journals: number;
  vocab: number;
}> {
  const text = await file.text();
  const data = JSON.parse(text) as ExportPayload;

  if (!data || data.version !== 1 || !Array.isArray(data.journals)) {
    throw new Error("无效的备份文件：需要 Econ Life JSON（version: 1）");
  }

  await clearAllData();

  const journals: JournalEntry[] = data.journals.map(
    ({ id: _id, ...rest }) => rest,
  );
  const vocab: VocabWord[] = (data.vocab ?? []).map(
    ({ id: _id, ...rest }) => rest,
  );
  const reviews = (data.reviews ?? []).map(({ id: _id, ...rest }) => rest);
  const reading = (data.reading ?? []).map(({ id: _id, ...rest }) => rest);

  if (journals.length) await db.journals.bulkAdd(journals);
  if (vocab.length) await db.vocab.bulkAdd(vocab);
  if (reviews.length) await db.reviews.bulkAdd(reviews);
  if (reading.length) await db.reading.bulkAdd(reading);

  return { journals: journals.length, vocab: vocab.length };
}
