"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--paper)] px-5">
      <section className="surface-card w-full max-w-[520px] p-8 text-center sm:p-12">
        <p className="font-mono text-[12px] font-bold tracking-[0.14em] text-[var(--danger)]">PAGE ERROR</p>
        <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em]">页面暂时没有完成加载</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">演示数据不会因此丢失。请重试；如果问题持续出现，再返回入口。</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button className="app-button" type="button" onClick={reset}>重新加载</button>
          <Link className="app-button secondary" href="/">返回平台入口</Link>
        </div>
      </section>
    </main>
  );
}
