"use client";

import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { clearAllData, db } from "@/lib/db";
import { exportCsv, exportJson, importJson } from "@/lib/backup";
import { isClientGeminiConfigured } from "@/lib/gemini-client";

export function SettingsPanel() {
  const [counts, setCounts] = useState({
    journals: 0,
    vocab: 0,
    reviews: 0,
  });
  const [geminiOk, setGeminiOk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [journals, vocab, reviews] = await Promise.all([
        db.journals.count(),
        db.vocab.count(),
        db.reviews.count(),
      ]);
      return { journals, vocab, reviews };
    }).subscribe({
      next: setCounts,
      error: () => setCounts({ journals: 0, vocab: 0, reviews: 0 }),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    setGeminiOk(isClientGeminiConfigured());
  }, []);

  async function onImport(file: File | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const result = await importJson(file);
      setMessage(
        `导入成功：${result.journals} 篇日记 · ${result.vocab} 个词汇`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onClear() {
    if (
      !window.confirm(
        "确定清空本地全部数据？此操作不可撤销（请先导出备份）。",
      )
    ) {
      return;
    }
    await clearAllData();
    setMessage("本地数据已清空");
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-medium text-ink">
          Data & Backup
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Local First · IndexedDB · Gemini 在浏览器侧调用（走系统代理）
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          ["日记", counts.journals],
          ["词汇", counts.vocab],
          ["复习", counts.reviews],
        ].map(([label, n]) => (
          <div
            key={label as string}
            className="rounded-2xl bg-white/60 px-3 py-4 text-center ring-1 ring-[var(--line)]"
          >
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="font-display mt-1 text-2xl text-ink">{n}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-2xl bg-white/55 px-4 py-4 ring-1 ring-[var(--line)]">
        <p className="text-sm font-medium text-ink">环境</p>
        <p className="mt-2 text-sm text-ink-soft">
          NEXT_PUBLIC_GEMINI_API_KEY：{geminiOk ? "已配置" : "未配置"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft/80">
          密钥暴露在前端打包中（个人本地工具可接受）。国内请开启 Clash
          等系统/浏览器代理后再用 Journal / 词汇提取。修改 .env.local
          后必须重启 dev server。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void exportJson()}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          导出 JSON
        </button>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-xl bg-white/80 px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-[var(--line)] hover:bg-white"
        >
          导出 CSV
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-xl bg-white/80 px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-[var(--line)] hover:bg-white"
        >
          导入 JSON
        </button>
        <button
          type="button"
          onClick={() => void onClear()}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--danger)] ring-1 ring-[var(--danger)]/30 hover:bg-red-50/50"
        >
          清空本地
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
      </div>

      {message && <p className="text-sm text-accent">{message}</p>}
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">
        导入会覆盖当前本地库。请定期导出 JSON 作为完整备份。
      </p>
    </div>
  );
}
