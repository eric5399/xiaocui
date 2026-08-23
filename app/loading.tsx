export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--paper)] px-5" aria-busy="true" aria-live="polite">
      <div className="text-center">
        <span className="mx-auto block h-8 w-8 animate-pulse rounded-[9px] bg-[var(--navy)]" aria-hidden="true" />
        <p className="mt-4 text-[13px] font-semibold text-[var(--muted)]">正在载入经验工作台…</p>
      </div>
    </main>
  );
}
