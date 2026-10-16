"use client";

import { useState } from "react";
import type { TabId } from "@/lib/types";
import { JournalPanel } from "./JournalPanel";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { FeedPanel } from "./FeedPanel";
import { SettingsPanel } from "./SettingsPanel";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "journal", label: "Journal", hint: "情绪日记" },
  { id: "cards", label: "Cards", hint: "每日闪卡" },
  { id: "feed", label: "Read", hint: "双语长文" },
  { id: "settings", label: "Data", hint: "备份设置" },
];

export function AppShell() {
  const [tab, setTab] = useState<TabId>("journal");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <header className="animate-rise mb-8">
        <p className="font-display text-[0.7rem] tracking-[0.28em] text-ink-soft uppercase">
          Local First · EN / 中
        </p>
        <h1 className="font-display mt-2 text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Econ Life
        </h1>
        <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-ink-soft">
          工作与生活的双语练习场。日记、闪卡与阅读，全部留在你的浏览器里。
        </p>
      </header>

      <nav
        className="panel animate-rise mb-6 grid grid-cols-4 gap-1 p-1.5"
        style={{ animationDelay: "60ms" }}
        aria-label="主模块"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-2 py-2.5 text-center transition-colors duration-200 ${
                active
                  ? "bg-accent text-white"
                  : "text-ink-soft hover:bg-white/60 hover:text-ink"
              }`}
            >
              <span className="block text-sm font-semibold tracking-wide">
                {t.label}
              </span>
              <span
                className={`mt-0.5 block text-[0.65rem] ${
                  active ? "text-white/75" : "text-ink-soft/80"
                }`}
              >
                {t.hint}
              </span>
            </button>
          );
        })}
      </nav>

      <main
        key={tab}
        className="animate-rise panel flex-1 p-5 sm:p-7"
        style={{ animationDelay: "40ms" }}
      >
        {tab === "journal" && <JournalPanel />}
        {tab === "cards" && <FlashcardsPanel />}
        {tab === "feed" && <FeedPanel />}
        {tab === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
