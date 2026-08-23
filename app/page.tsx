import Link from "next/link";

const stages = [
  ["01", "配置任务", "定义场景、对象与萃取目标"],
  ["02", "案例挑战", "用同一业务情境激活隐性判断"],
  ["03", "深度复盘", "围绕证据、动作与边界动态追问"],
  ["04", "经验融合", "保留来源后提炼机构共性策略"],
] as const;

function ProductMark() {
  return (
    <span className="inline-flex items-center gap-3" aria-label="小萃机构经验萃取平台">
      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--navy)] text-[13px] font-bold tracking-tight text-white shadow-sm">萃</span>
      <span>
        <span className="block text-[15px] font-bold tracking-[0.08em] text-[var(--navy)]">小萃</span>
        <span className="block text-[10px] tracking-[0.14em] text-[var(--muted)]">经验资产工作台</span>
      </span>
    </span>
  );
}

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[var(--paper)]">
      <header className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <ProductMark />
        <div className="demo-ribbon hidden max-w-[410px] md:flex">
          <span className="demo-ribbon-mark" aria-hidden="true" />
          演示模式 · 当前使用合成数据与确定性 Mock Agent
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1320px] gap-8 px-5 pb-8 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)] lg:px-10 lg:pb-12 lg:pt-12">
        <div className="flex flex-col justify-center py-4 lg:py-10">
          <p className="mb-5 flex items-center gap-3 text-[12px] font-bold tracking-[0.16em] text-[var(--teal)]">
            <span className="h-px w-8 bg-[var(--teal)]" aria-hidden="true" />
            EXPERIENCE INTELLIGENCE
          </p>
          <h1 className="max-w-[760px] text-[clamp(40px,6vw,78px)] font-semibold leading-[1.04] tracking-[-0.055em] text-[var(--ink)]">
            把高手的判断，<span className="text-[var(--navy)]">变成组织的方法。</span>
          </h1>
          <p className="mt-7 max-w-[650px] text-[17px] leading-8 text-[var(--muted-strong)] sm:text-[19px]">
            通过“案例挑战 + AI 深度复盘”，将保险机构一线人员的隐性经验沉淀为可追溯的案例、业务规则与共性策略。
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="app-button min-w-[168px]" href="/admin">进入管理工作台 <span aria-hidden="true">→</span></Link>
            <Link className="app-button secondary min-w-[168px]" href="/join">体验业务员访谈</Link>
          </div>

          <div className="demo-ribbon mt-6 md:hidden">
            <span className="demo-ribbon-mark" aria-hidden="true" />
            演示模式 · 合成数据与确定性 Mock Agent
          </div>
        </div>

        <div className="relative min-h-[500px] overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--navy)] p-5 shadow-[var(--shadow-2)] sm:p-7 lg:min-h-[610px]">
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
          <div className="absolute -right-8 -top-2 h-40 w-40 rounded-full border border-white/10" aria-hidden="true" />

          <div className="relative flex items-center justify-between border-b border-white/15 pb-5 text-white">
            <div>
              <p className="text-[11px] font-bold tracking-[0.15em] text-white/55">MVP CORE LOOP</p>
              <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em]">经验如何被萃取</h2>
            </div>
            <span className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white/70">4 个阶段</span>
          </div>

          <ol className="relative mt-6 space-y-3">
            {stages.map(([index, title, description], stageIndex) => (
              <li key={index} className="group grid grid-cols-[44px_1fr] gap-4 rounded-[14px] border border-white/12 bg-white/[0.07] p-4 text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/[0.11]">
                <span className="font-mono grid h-10 w-10 place-items-center rounded-[10px] bg-white/10 text-[12px] font-bold text-[#a9d7cc]">{index}</span>
                <span>
                  <span className="flex items-center justify-between gap-3 text-[16px] font-semibold">
                    {title}
                    {stageIndex < stages.length - 1 ? <span className="text-white/30">↓</span> : <span className="text-[#a9d7cc]">完成</span>}
                  </span>
                  <span className="mt-1 block text-[13px] leading-6 text-white/60">{description}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="relative mt-5 rounded-[14px] bg-[#eef5f2] p-4 text-[var(--ink)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-bold tracking-[0.12em] text-[var(--teal)]">REFERENCE OUTPUT</span>
              <span className="status-pill success">待审核草稿</span>
            </div>
            <p className="mt-3 text-[16px] font-semibold">成熟网点续保转化异常诊断策略</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[var(--muted)]">
              <span className="rounded-md border border-[var(--line)] bg-white px-2 py-2 text-center">判断逻辑</span>
              <span className="rounded-md border border-[var(--line)] bg-white px-2 py-2 text-center">推荐动作</span>
              <span className="rounded-md border border-[var(--line)] bg-white px-2 py-2 text-center">证据来源</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1320px] flex-col gap-2 border-t border-[var(--line)] px-5 py-5 text-[12px] text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <span>机构经验萃取 Agent · MVP V1.0</span>
        <span>仅用于产品验证，不承载真实机构敏感数据</span>
      </footer>
    </main>
  );
}
