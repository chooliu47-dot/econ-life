import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-16">
          <p className="font-display text-3xl text-ink">Econ Life</p>
          <p className="mt-2 text-sm text-ink-soft">加载本地工作台…</p>
        </div>
      }
    >
      <AppShell />
    </Suspense>
  );
}
