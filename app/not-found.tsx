import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--paper)] px-5">
      <section className="surface-card w-full max-w-[520px] p-8 text-center sm:p-12">
        <p className="font-mono text-[12px] font-bold tracking-[0.14em] text-[var(--teal)]">404 · ROUTE NOT FOUND</p>
        <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em]">这个页面不在当前任务里</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">链接可能已过期，或任务仍在配置中。你可以返回平台入口重新选择。</p>
        <Link className="app-button mt-7" href="/">返回平台入口</Link>
      </section>
    </main>
  );
}
