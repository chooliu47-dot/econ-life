import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  ArticleVocab,
  JournalAnalyzeResult,
  SentenceCheckResult,
} from "./types";

/** Current Flash alias — resolves to a live model on Google's side. */
const MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;

export type BusyHint = (message: string | null) => void;

function readClientKey(): string | null {
  const value = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!value || value.trim() === "" || value.startsWith("your-")) {
    return null;
  }
  return value.trim();
}

export function isClientGeminiConfigured(): boolean {
  return readClientKey() !== null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isBusyOrRetryable(err: unknown): boolean {
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("high demand") ||
    msg.includes("resource_exhausted") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("try again")
  );
}

/** Soft, user-facing message — never leak raw API status codes. */
function softFailMessage(err: unknown): string {
  if (isBusyOrRetryable(err)) {
    return "服务暂时繁忙，请稍后再试一次。";
  }
  if (errorText(err).includes("TIMEOUT")) {
    return "等待时间有点长，请检查网络后重试。";
  }
  if (errorText(err).includes("未配置")) {
    return "请先在 .env.local 配置 NEXT_PUBLIC_GEMINI_API_KEY 并重启。";
  }
  return "暂时没能生成，请稍后再试。";
}

async function callGeminiText(
  prompt: string,
  onBusy?: BusyHint,
): Promise<string> {
  const apiKey = readClientKey();
  if (!apiKey) {
    throw new Error("未配置 NEXT_PUBLIC_GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent(prompt),
        TIMEOUT_MS,
      );
      const raw = result.response.text()?.trim() ?? "";
      if (!raw) throw new Error("empty");
      onBusy?.(null);
      return raw;
    } catch (err) {
      lastErr = err;
      if (isBusyOrRetryable(err) && attempt < MAX_ATTEMPTS) {
        onBusy?.("AI 正在排队，正在为您生成更地道的表达...");
        await sleep(1000 * attempt);
        continue;
      }
      break;
    }
  }

  throw new Error(softFailMessage(lastErr));
}

async function callGeminiJson(
  prompt: string,
  onBusy?: BusyHint,
): Promise<unknown> {
  const raw = await callGeminiText(prompt, onBusy);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as unknown;
  } catch {
    throw new Error("暂时没能生成，请稍后再试。");
  }
}

export async function analyzeJournalClient(
  text: string,
  onBusy?: BusyHint,
): Promise<JournalAnalyzeResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("请先输入日记内容");
  if (trimmed.length > 8000) throw new Error("日记有点长，请稍作删减后再试。");

  const prompt = `You are a Native English writing coach and gentle mood observer.
Rewrite the user's journal (may be speech transcript) into polished, idiomatic, advanced Native-Speaker English. Keep the same meaning and facts.

Return ONLY valid JSON:
{
  "polishedText": "the full rewritten English paragraph(s)",
  "tipsZh": "用中文分点列出：改了哪些词/句式，以及为什么这样改（条理清晰，3-8 条）",
  "emotionEmoji": "exactly ONE emoji that best represents the dominant mood of this entry (required)"
}

User text:
"""
${trimmed}
"""`;

  const parsed = (await callGeminiJson(prompt, onBusy)) as {
    polishedText?: string;
    tipsZh?: string;
    emotionEmoji?: string;
    correctedText?: string;
  };

  const polishedText = (
    parsed.polishedText ??
    parsed.correctedText ??
    ""
  ).trim();
  const tipsZh = (parsed.tipsZh ?? "").trim();
  const emotionEmoji =
    (typeof parsed.emotionEmoji === "string" &&
      parsed.emotionEmoji.trim().slice(0, 8)) ||
    "📝";

  if (!polishedText) {
    throw new Error("暂时没能生成，请稍后再试。");
  }

  return { polishedText, tipsZh, emotionEmoji };
}

export async function generatePeriodInsight(
  range: "week" | "month",
  journals: Array<{
    date: string;
    rawText: string;
    correctedText: string;
    emotionEmoji?: string;
  }>,
  onBusy?: BusyHint,
): Promise<string> {
  if (journals.length === 0) {
    throw new Error(
      range === "week"
        ? "近 7 天还没有日记，先写几篇再来生成回顾吧。"
        : "近 30 天还没有日记，先写几篇再来生成回顾吧。",
    );
  }

  const label = range === "week" ? "本周（过去 7 天）" : "本月（过去 30 天）";
  const packed = journals
    .map(
      (j, i) =>
        `#${i + 1} [${j.date}] mood:${j.emotionEmoji ?? "📝"}\n` +
        `polished: ${j.correctedText}\n` +
        `raw: ${j.rawText}`,
    )
    .join("\n\n")
    .slice(0, 14000);

  const prompt = `你是一位贴心的心理教练与生活洞察伙伴。
请根据用户 ${label} 的本地日记（含情绪 Emoji），写一份温暖、图文并茂（多用 Emoji）的中文「图鉴报告」。

必须包含这四块（用清晰小标题）：
1) 情绪统计 — 粗略统计开心 / 焦虑 / 疲惫等天数或频次（可用 Emoji 列表）
2) 事件摘要 — 最近主要发生了什么
3) 状态与进步反馈 — 积极心态变化、情绪调节或生活上的进步
4) 贴心建议 — 给下一步生活一点具体而温暖的建议

语气：温柔、具体、不说教。不要输出 JSON，直接输出可读报告正文。

日记数据：
"""
${packed}
"""`;

  const raw = await callGeminiText(prompt, onBusy);
  const text = raw.trim();
  if (!text) throw new Error("暂时没能生成回顾，请稍后再试。");
  return text;
}

export async function checkSentenceUsage(
  word: string,
  sentence: string,
  onBusy?: BusyHint,
): Promise<SentenceCheckResult> {
  const trimmed = sentence.trim();
  if (!trimmed) throw new Error("请先造一句英文。");

  const prompt = `You are a concise English usage coach.
Target word/phrase: "${word}"
User sentence: """${trimmed}"""

Judge whether the target word is used correctly and idiomatically.
Return ONLY valid JSON:
{
  "correct": true,
  "natural": true,
  "feedbackZh": "一两句中文点评：用法是否正确、是否地道",
  "betterExpression": "若有语法错误或中式表达，给出改写后的完整英文句子；若已经很好则原句略作润色或原样返回"
}`;

  const parsed = (await callGeminiJson(prompt, onBusy)) as Partial<SentenceCheckResult>;
  const betterExpression = String(parsed.betterExpression ?? trimmed).trim();
  const feedbackZh = String(parsed.feedbackZh ?? "").trim() || "已收到你的造句。";

  return {
    correct: Boolean(parsed.correct),
    natural: Boolean(parsed.natural),
    feedbackZh,
    betterExpression,
  };
}

export async function extractAdvancedVocabClient(
  englishText: string,
  titleEn: string,
  onBusy?: BusyHint,
): Promise<ArticleVocab[]> {
  const prompt = `Extract 8–12 advanced IELTS/GRE/economics/feminism vocabulary items from the article.
Never extract CET-4/6 basic words. Return ONLY JSON:
{"vocab":[{"word":"","phonetic":"","definitionZh":"","definitionEn":"","example":""}]}

Title: ${titleEn}

"""
${englishText.slice(0, 12000)}
"""`;

  const parsed = (await callGeminiJson(prompt, onBusy)) as {
    vocab?: ArticleVocab[];
  };
  if (!Array.isArray(parsed.vocab) || parsed.vocab.length === 0) {
    throw new Error("暂时没能提取词汇，请稍后再试。");
  }

  return parsed.vocab
    .filter(
      (v) =>
        v &&
        typeof v.word === "string" &&
        v.word.trim() &&
        typeof v.definitionZh === "string" &&
        typeof v.definitionEn === "string",
    )
    .map((v) => ({
      word: v.word.trim(),
      phonetic: v.phonetic?.trim() || undefined,
      definitionZh: v.definitionZh.trim(),
      definitionEn: v.definitionEn.trim(),
      example: v.example?.trim() || undefined,
    }))
    .slice(0, 16);
}
