"use client";

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { db, todayKey } from "@/lib/db";
import {
  analyzeJournalClient,
  generatePeriodInsight,
} from "@/lib/gemini-client";
import type { JournalAnalyzeResult, JournalEntry } from "@/lib/types";
import { PlayAudioButton } from "./PlayAudioButton";

function daysAgoKey(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function JournalPanel() {
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<JournalAnalyzeResult | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<{
    y: number;
    m: number;
  } | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightStatus, setInsightStatus] = useState<string | null>(null);
  const [insightReport, setInsightReport] = useState<string | null>(null);
  const [insightRange, setInsightRange] = useState<"week" | "month" | null>(
    null,
  );

  const { listening, unsupported, toggle: toggleVoice } = useSpeechToText(
    text,
    setText,
  );

  useEffect(() => {
    if (unsupported) {
      setStatus("当前浏览器不支持语音输入，请改用 Chrome / Edge。");
    }
  }, [unsupported]);

  useEffect(() => {
    const now = new Date();
    setMonthAnchor({ y: now.getFullYear(), m: now.getMonth() });
  }, []);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.journals.orderBy("createdAt").reverse().toArray(),
    ).subscribe({
      next: setEntries,
      error: () => setEntries([]),
    });
    return () => sub.unsubscribe();
  }, []);

  const moodCalendar = useMemo(() => {
    if (!monthAnchor) {
      return {
        cells: [] as Array<{
          day: number;
          emoji: string | null;
          stack: string[];
        }>,
        monthLabel: "",
      };
    }
    const { y, m } = monthAnchor;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Group by date; latest entry first within each day
    const byDate = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    }

    // Monday-first padding (对齐「一…日」表头)
    const jsWeekday = new Date(y, m, 1).getDay(); // 0=Sun
    const pad = jsWeekday === 0 ? 6 : jsWeekday - 1;

    const cells: Array<{
      day: number | null;
      emoji: string | null;
      stack: string[];
    }> = [];
    for (let i = 0; i < pad; i++) {
      cells.push({ day: null, emoji: null, stack: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayEntries = (byDate.get(key) ?? []).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      const stack = dayEntries
        .map((e) => e.emotionEmoji)
        .filter((x): x is string => Boolean(x));
      const unique = [...new Set(stack)].slice(0, 3);
      cells.push({
        day: d,
        emoji: stack[0] ?? null,
        stack: unique,
      });
    }

    return { cells, monthLabel: `${y} · ${m + 1}月` };
  }, [entries, monthAnchor]);

  async function analyzeAndSave() {
    setStatus(null);
    setBusy(true);
    setPreview(null);
    try {
      const result = await analyzeJournalClient(text, (hint) => {
        setStatus(hint);
      });
      setPreview(result);
      setStatus(null);

      await db.journals.add({
        date: todayKey(),
        rawText: text.trim(),
        correctedText: result.polishedText,
        tipsZh: result.tipsZh,
        emotionEmoji: result.emotionEmoji,
        createdAt: Date.now(),
      });
      setText("");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "暂时没能生成，请稍后再试。";
      setStatus(
        msg.replace(/\b(503|429|404|High Demand)\b/gi, "").trim() ||
          "暂时没能生成，请稍后再试。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runInsight(range: "week" | "month") {
    setInsightBusy(true);
    setInsightStatus(null);
    setInsightReport(null);
    setInsightRange(range);
    try {
      const since = daysAgoKey(range === "week" ? 7 : 30);
      const slice = entries
        .filter((e) => e.date >= since)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

      const report = await generatePeriodInsight(
        range,
        slice.map((e) => ({
          date: e.date,
          rawText: e.rawText,
          correctedText: e.correctedText,
          emotionEmoji: e.emotionEmoji,
        })),
        (hint) => setInsightStatus(hint),
      );
      setInsightReport(report);
      setInsightStatus(null);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "暂时没能生成回顾，请稍后再试。";
      setInsightStatus(
        msg.replace(/\b(503|429|404|High Demand)\b/gi, "").trim() ||
          "暂时没能生成回顾，请稍后再试。",
      );
    } finally {
      setInsightBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-medium text-ink">
          Voice Journal
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          润色 · 情绪打卡 · 周期洞察 — 全部留在本地
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Write or dictate in English…"
          className="w-full resize-y rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-[0.95rem] leading-relaxed text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              listening
                ? "listening bg-warm text-white"
                : "bg-white/80 text-ink ring-1 ring-[var(--line)] hover:bg-white"
            }`}
          >
            {listening ? "停止录音" : "语音输入"}
          </button>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={analyzeAndSave}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "生成中…" : "润色 · 存入本地"}
          </button>
        </div>
        {status && (
          <p className="text-sm leading-relaxed text-ink-soft" role="status">
            {status}
          </p>
        )}
      </div>

      {preview && (
        <div className="animate-rise space-y-4">
          <p className="text-center text-3xl" title="今日情绪">
            {preview.emotionEmoji}
          </p>
          <section className="rounded-2xl bg-white/75 px-4 py-4 ring-1 ring-[var(--line)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.65rem] tracking-[0.2em] text-ink-soft uppercase">
                优化版本
              </p>
              <PlayAudioButton
                englishParagraphs={[preview.polishedText]}
                label="Play Audio"
              />
            </div>
            <p className="font-display mt-3 text-[1.05rem] leading-[1.85] text-ink">
              {preview.polishedText}
            </p>
          </section>

          <section className="rounded-2xl bg-accent-soft/55 px-4 py-4 ring-1 ring-[var(--line)]">
            <p className="text-[0.65rem] tracking-[0.2em] text-ink-soft uppercase">
              优化点解析
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {preview.tipsZh || "（本次未返回解析，可再试一次）"}
            </p>
          </section>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h3 className="font-display text-lg text-ink">情绪日历</h3>
          <span className="text-xs tracking-wide text-ink-soft">
            {moodCalendar.monthLabel}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
            <div
              key={w}
              className="text-center text-[0.6rem] tracking-wide text-ink-soft/70"
            >
              {w}
            </div>
          ))}
          {moodCalendar.cells.map(({ day, emoji, stack }, i) =>
            day == null ? (
              <div key={`pad-${i}`} className="aspect-square" />
            ) : (
              <div
                key={day}
                title={
                  stack.length
                    ? `${day}日 · ${stack.join(" ")}`
                    : `${day} 日`
                }
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${
                  emoji
                    ? "bg-white/90 ring-1 ring-[var(--line)]"
                    : "bg-white/35 text-ink-soft/50"
                }`}
              >
                <span className="text-[0.6rem] text-ink-soft">{day}</span>
                <span className="text-sm leading-none">
                  {stack.length > 1
                    ? stack.slice(0, 2).join("")
                    : emoji ?? "·"}
                </span>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="space-y-4 border-t border-[var(--line)] pt-6">
        <div>
          <h3 className="font-display text-lg text-ink">Insights · 洞察</h3>
          <p className="mt-1 text-sm text-ink-soft">
            从本地日记打包给 AI，生成周 / 月图鉴报告
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={insightBusy}
            onClick={() => void runInsight("week")}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {insightBusy && insightRange === "week"
              ? "生成中…"
              : "生成本周回顾"}
          </button>
          <button
            type="button"
            disabled={insightBusy}
            onClick={() => void runInsight("month")}
            className="rounded-xl bg-white/80 px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-[var(--line)] transition hover:bg-white disabled:opacity-50"
          >
            {insightBusy && insightRange === "month"
              ? "生成中…"
              : "生成本月回顾"}
          </button>
        </div>
        {insightStatus && (
          <p className="text-sm leading-relaxed text-ink-soft" role="status">
            {insightStatus}
          </p>
        )}
        {insightReport && (
          <article className="animate-rise rounded-2xl bg-white/70 px-4 py-5 ring-1 ring-[var(--line)]">
            <p className="text-[0.65rem] tracking-[0.2em] text-ink-soft uppercase">
              {insightRange === "week" ? "Weekly Insight" : "Monthly Insight"}
            </p>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-[1.85] text-ink">
              {insightReport}
            </div>
          </article>
        )}
      </section>

      {entries.length > 0 && (
        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h3 className="font-display text-lg text-ink">最近日记</h3>
          <ul className="space-y-3">
            {entries.slice(0, 6).map((e) => (
              <li
                key={e.id}
                className="rounded-2xl bg-white/55 px-4 py-3 ring-1 ring-[var(--line)]"
              >
                <p className="text-xs text-ink-soft">
                  {e.emotionEmoji ? `${e.emotionEmoji} ` : ""}
                  {e.date}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {e.correctedText}
                </p>
                {e.tipsZh && (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">
                    {e.tipsZh}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
