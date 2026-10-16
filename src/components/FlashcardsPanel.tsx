"use client";

import { useCallback, useEffect, useState } from "react";
import { SEED_VOCAB } from "@/data/seed-vocab";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import {
  getTodaysDeck,
  getTodayReviewCount,
  getVocabStats,
  gradeWord,
  penalizeSentenceError,
  seedTestVocab,
  todayKey,
} from "@/lib/db";
import { checkSentenceUsage } from "@/lib/gemini-client";
import {
  DAILY_CARD_MAX,
  DAILY_CARD_MIN,
  DAILY_CARD_TARGET,
  type ReviewLog,
  type SentenceCheckResult,
  type VocabWord,
} from "@/lib/types";
import { SpeakWordButton } from "./SpeakWordButton";

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={active ? "text-white" : "text-current"}
    >
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FlashcardsPanel() {
  const [deck, setDeck] = useState<VocabWord[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneToday, setDoneToday] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayLabel, setTodayLabel] = useState("");

  const [sentence, setSentence] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkHint, setCheckHint] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<SentenceCheckResult | null>(
    null,
  );

  const { listening, unsupported, toggle: toggleMic, stop: stopMic } =
    useSpeechToText(sentence, setSentence);

  const resetSentence = useCallback(() => {
    stopMic();
    setSentence("");
    setCheckResult(null);
    setCheckHint(null);
    setChecking(false);
  }, [stopMic]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTodayLabel(todayKey());
      const [cards, count, stats] = await Promise.all([
        getTodaysDeck(DAILY_CARD_TARGET),
        getTodayReviewCount(),
        getVocabStats(),
      ]);
      setDeck(cards);
      setDoneToday(count);
      setPoolSize(stats.active);
      setIndex(0);
      setFlipped(false);
      resetSentence();
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载词库失败");
      setDeck([]);
      setPoolSize(0);
    } finally {
      setLoading(false);
    }
  }, [resetSentence]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = deck[index];
  const remainingBudget = Math.max(0, DAILY_CARD_MAX - doneToday);
  const isEmpty = !loading && poolSize === 0;
  const finished =
    !loading &&
    poolSize > 0 &&
    (remainingBudget <= 0 || (!current && doneToday >= DAILY_CARD_MIN));
  const noDueYet =
    !loading &&
    poolSize > 0 &&
    !current &&
    remainingBudget > 0 &&
    doneToday < DAILY_CARD_MIN;

  function goNextCard() {
    resetSentence();
    setFlipped(false);
  }

  async function onGrade(grade: ReviewLog["grade"]) {
    if (!current) return;
    try {
      await gradeWord(current, grade);
      const nextDone = doneToday + 1;
      setDoneToday(nextDone);

      if (index + 1 < deck.length && nextDone < DAILY_CARD_MAX) {
        setIndex((i) => i + 1);
        goNextCard();
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "评分保存失败");
    }
  }

  async function onCheckUsage() {
    if (!current || !sentence.trim()) return;
    setChecking(true);
    setCheckHint(null);
    setCheckResult(null);
    try {
      const result = await checkSentenceUsage(
        current.word,
        sentence,
        (hint) => setCheckHint(hint),
      );
      setCheckResult(result);
      setCheckHint(null);
      if (!result.correct || !result.natural) {
        await penalizeSentenceError(current);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "暂时没能点评，请稍后再试。";
      setCheckHint(
        msg.replace(/\b(503|429|404|High Demand)\b/gi, "").trim() ||
          "暂时没能点评，请稍后再试。",
      );
    } finally {
      setChecking(false);
    }
  }

  async function onSeed() {
    setSeeding(true);
    setMessage(null);
    setError(null);
    try {
      const added = await seedTestVocab(SEED_VOCAB);
      setMessage(
        added > 0
          ? `已写入 ${added} 个测试单词到本地 IndexedDB`
          : "测试词已在词库中（未重复写入）",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "写入测试词库失败");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">
            Flashcards
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            每日 {DAILY_CARD_MIN}–{DAILY_CARD_MAX} 词 · 今日已背 {doneToday} ·
            词库 {poolSize}
          </p>
        </div>
        <button
          type="button"
          disabled={seeding}
          onClick={() => void onSeed()}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {seeding ? "写入中…" : "一键写入 30 个测试单词"}
        </button>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/50 ring-1 ring-[var(--line)]">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{
            width: `${Math.min(100, (doneToday / DAILY_CARD_TARGET) * 100)}%`,
          }}
        />
      </div>

      {message && <p className="text-sm text-accent">{message}</p>}
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-ink-soft">从本地 IndexedDB 加载词卡…</p>
      )}

      {isEmpty && (
        <div className="rounded-2xl bg-accent-soft/60 px-5 py-8 text-center ring-1 ring-[var(--line)]">
          <p className="font-display text-xl text-ink">当前词库为空</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            您可以点击下方按钮生成测试词汇，或前往阅读页提取生词。
          </p>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void onSeed()}
            className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {seeding ? "写入中…" : "一键写入 30 个测试单词"}
          </button>
        </div>
      )}

      {!loading && poolSize > 0 && finished && (
        <div className="rounded-2xl bg-white/70 px-5 py-10 text-center ring-1 ring-[var(--line)]">
          <p className="font-display text-2xl text-ink">今日额度已完成</p>
          <p className="mt-2 text-sm text-ink-soft">
            已复习 {doneToday} 词（上限 {DAILY_CARD_MAX}）。明天再来。
          </p>
          <p className="mt-1 text-xs text-ink-soft/80">{todayLabel}</p>
        </div>
      )}

      {!loading && current && remainingBudget > 0 && (
        <div className="space-y-5">
          <div className="mx-auto w-full max-w-md">
            {!flipped ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFlipped(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFlipped(true);
                  }
                }}
                className="flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-white/85 px-6 py-8 text-ink ring-1 ring-[var(--line)] transition duration-300 hover:scale-[1.01]"
                aria-label="翻转词卡"
              >
                <p className="text-xs tracking-[0.2em] text-ink-soft uppercase">
                  {index + 1} / {deck.length}
                </p>
                <div className="mt-4 flex items-center gap-1.5">
                  <p className="font-display text-3xl font-medium">
                    {current.word}
                  </p>
                  <SpeakWordButton word={current.word} />
                </div>
                {current.phonetic && (
                  <p className="mt-2 text-sm text-ink-soft">{current.phonetic}</p>
                )}
                <p className="mt-6 text-xs text-ink-soft">点击查看释义 · 造句</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-accent px-5 py-6 text-white transition duration-300">
                <button
                  type="button"
                  onClick={() => {
                    stopMic();
                    setFlipped(false);
                  }}
                  className="text-[0.65rem] tracking-[0.18em] text-white/70 uppercase hover:text-white"
                >
                  ← 正面
                </button>
                <p className="mt-3 text-lg font-medium">{current.definitionZh}</p>
                <p className="mt-2 text-sm text-white/80">{current.definitionEn}</p>
                {current.example && (
                  <p className="mt-3 text-sm italic text-white/65">
                    {current.example}
                  </p>
                )}

                <div className="mt-5 border-t border-white/20 pt-4">
                  <p className="text-[0.65rem] tracking-[0.16em] text-white/65 uppercase">
                    用这个词造句
                  </p>
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={sentence}
                      onChange={(e) => setSentence(e.target.value)}
                      rows={2}
                      placeholder={`Make a sentence with “${current.word}”…`}
                      className="min-h-[64px] flex-1 resize-none rounded-xl border-0 bg-white/15 px-3 py-2.5 text-sm leading-relaxed text-white placeholder:text-white/45 outline-none focus:bg-white/20"
                    />
                    <button
                      type="button"
                      onClick={toggleMic}
                      title={listening ? "停止录音" : "语音输入"}
                      aria-label={listening ? "停止录音" : "语音输入"}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                        listening
                          ? "listening bg-warm text-white"
                          : "bg-white/15 text-white hover:bg-white/25"
                      }`}
                    >
                      <MicIcon active={listening} />
                    </button>
                  </div>
                  {unsupported && (
                    <p className="mt-2 text-xs text-white/70">
                      当前浏览器不支持语音输入，请改用 Chrome / Edge。
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={checking || !sentence.trim()}
                    onClick={() => void onCheckUsage()}
                    className="mt-3 w-full rounded-xl bg-white/95 py-2.5 text-sm font-semibold text-accent transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {checking ? "点评中…" : "Check Usage"}
                  </button>
                  {checkHint && (
                    <p className="mt-2 text-xs leading-relaxed text-white/75">
                      {checkHint}
                    </p>
                  )}
                  {checkResult && (
                    <div className="mt-3 space-y-2 rounded-xl bg-black/15 px-3 py-3 text-sm">
                      <p className="text-xs tracking-wide text-white/70">
                        {checkResult.correct && checkResult.natural
                          ? "用法正确 · 表达自然"
                          : "需要加强 · 已加入明后天优先复习"}
                      </p>
                      <p className="leading-relaxed text-white/90">
                        {checkResult.feedbackZh}
                      </p>
                      {checkResult.betterExpression && (
                        <p className="font-display leading-relaxed text-white">
                          Better: {checkResult.betterExpression}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["again", "重来"],
                ["hard", "较难"],
                ["good", "记住"],
                ["easy", "简单"],
              ] as const
            ).map(([grade, label]) => (
              <button
                key={grade}
                type="button"
                onClick={() => void onGrade(grade)}
                className="rounded-xl bg-white/80 py-2.5 text-sm font-medium text-ink ring-1 ring-[var(--line)] transition hover:bg-white"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {noDueYet && (
        <div className="rounded-2xl bg-white/60 px-5 py-8 text-center ring-1 ring-[var(--line)]">
          <p className="text-sm text-ink-soft">
            暂无可用词卡。可点上方按钮补充测试词，或去 Read 提取生词。
          </p>
          <button
            type="button"
            className="mt-4 text-sm font-medium text-accent hover:underline"
            onClick={() => void refresh()}
          >
            重新加载词库
          </button>
        </div>
      )}
    </div>
  );
}
