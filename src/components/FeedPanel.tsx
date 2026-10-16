"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import articlesData from "@/data/articles.json";
import {
  db,
  getVocabStats,
  markArticleRead,
  upsertVocabFromArticle,
} from "@/lib/db";
import { extractAdvancedVocabClient } from "@/lib/gemini-client";
import type { Article, ArticleVocab, ReadingProgress } from "@/lib/types";
import { PlayAudioButton } from "./PlayAudioButton";

const articles = articlesData as Article[];

export function FeedPanel() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ArticleVocab[] | null>(null);

  useEffect(() => {
    const sub = liveQuery(() => db.reading.toArray()).subscribe({
      next: setProgress,
      error: () => setProgress([]),
    });
    return () => sub.unsubscribe();
  }, []);

  const readSet = new Set(progress.map((p) => p.articleId));
  const active = articles.find((a) => a.id === activeId) ?? null;

  async function extractVocab(article: Article) {
    setSaving(true);
    setToast(null);
    setError(null);
    try {
      const english = [article.titleEn, ...article.bodyEn].join("\n\n");
      let items: ArticleVocab[];
      try {
        items = await extractAdvancedVocabClient(
          english,
          article.titleEn,
          (hint) => {
            if (hint) setToast(hint);
          },
        );
      } catch {
        // Fallback: curated advanced seed list — never hang or dump raw API errors
        items = article.vocab;
        setError("AI 暂时繁忙，已改用文内精选高级词库。");
      }

      setExtracted(items);
      const added = await upsertVocabFromArticle(article.id, items);
      await markArticleRead(article.id);
      // Same Dexie DB (`econ-life-local` → table `vocab`) that Flashcards reads
      const stats = await getVocabStats();
      setToast(
        added > 0
          ? `已写入 ${added} 词到本地 IndexedDB · 词库共 ${stats.total} 个（闪卡页可直接背）`
          : `这些词已在词库中 · 当前共 ${stats.total} 个 · 阅读进度已记录`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "提取失败");
    } finally {
      setSaving(false);
    }
  }

  if (active) {
    const displayVocab = extracted ?? active.vocab;

    return (
      <div className="space-y-7">
        <button
          type="button"
          onClick={() => {
            setActiveId(null);
            setToast(null);
            setError(null);
            setExtracted(null);
          }}
          className="text-sm font-medium text-accent hover:underline"
        >
          ← 返回 Feed
        </button>

        <header className="space-y-3 border-b border-[var(--line)] pb-5">
          <p className="text-xs tracking-[0.18em] text-ink-soft uppercase">
            {active.category} · {active.minutes} min read
          </p>
          <h2 className="font-display text-2xl font-medium leading-snug text-ink sm:text-3xl">
            {active.titleEn}
          </h2>
          <p className="text-base text-ink-soft">{active.titleZh}</p>
          <div className="pt-1">
            <PlayAudioButton englishParagraphs={active.bodyEn} />
            <p className="mt-2 text-xs text-ink-soft">
              仅朗读英文正文 · 中文对照保留在下方供边听边看
            </p>
          </div>
        </header>

        <article className="space-y-8">
          {active.bodyEn.map((para, i) => (
            <div key={i} className="space-y-2.5">
              <p className="font-display text-[1.05rem] leading-[1.85] text-ink">
                {para}
              </p>
              <p className="border-l-2 border-accent/25 pl-3 text-[0.9rem] leading-relaxed text-ink-soft">
                {active.bodyZh[i]}
              </p>
            </div>
          ))}
        </article>

        <section className="rounded-2xl bg-accent-soft/50 px-4 py-4 ring-1 ring-[var(--line)]">
          <h3 className="font-display text-lg text-ink">高级词汇</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Gemini 只提取雅思 / GRE / 经济与女性主义专业词；失败时回退到文内精选词库
          </p>
          <ul className="mt-3 space-y-2">
            {displayVocab.map((v) => (
              <li key={v.word} className="text-sm">
                <span className="font-semibold text-ink">{v.word}</span>
                <span className="text-ink-soft"> — {v.definitionZh}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={saving}
            onClick={() => void extractVocab(active)}
            className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Gemini 提取中…" : "提取高级词汇到闪卡 · 标记已读"}
          </button>
          {toast && <p className="mt-3 text-sm text-accent">{toast}</p>}
          {error && (
            <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-medium text-ink">Bilingual Feed</h2>
        <p className="mt-1 text-sm text-ink-soft">
          宏观 / 微观 / 女性主义长文 · 精读排版 · 一键提取高级词汇
        </p>
      </div>

      <ul className="space-y-3">
        {articles.map((a) => {
          const read = readSet.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveId(a.id);
                  setExtracted(null);
                  setToast(null);
                  setError(null);
                }}
                className="w-full rounded-2xl bg-white/60 px-4 py-4 text-left ring-1 ring-[var(--line)] transition hover:bg-white/90"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] tracking-[0.16em] text-ink-soft uppercase">
                      {a.category}
                    </p>
                    <p className="font-display mt-1 text-lg leading-snug text-ink">
                      {a.titleEn}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{a.titleZh}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-ink-soft">
                    <p>{a.minutes} min</p>
                    <p className="mt-1">{read ? "已读" : "未读"}</p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
