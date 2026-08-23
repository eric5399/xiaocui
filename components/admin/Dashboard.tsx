"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InterviewSummary, ScenarioWithFields } from "@/lib/domain";
import { getAdminStats, listAdminInterviews, listAdminScenarios, listAdminTasks, type AdminTask } from "./admin-data-client";
import { PageHeader, PrimaryLink, ProgressBar, StatusBadge } from "./ui";

function taskStatus(status: AdminTask["status"]) {
  return status === "active" ? "published" : status === "closed" ? "closed" : "draft";
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function Dashboard() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getAdminStats>> | null>(null);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioWithFields[]>([]);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getAdminStats(), listAdminTasks(), listAdminScenarios(), listAdminInterviews()])
      .then(([nextStats, nextTasks, nextScenarios, nextInterviews]) => {
        if (!active) return;
        setStats(nextStats); setTasks(nextTasks); setScenarios(nextScenarios); setInterviews(nextInterviews);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "无法读取真实管理数据"));
    return () => { active = false; };
  }, []);

  const scenarioById = useMemo(() => new Map(scenarios.map((item) => [item.id, item])), [scenarios]);
  const currentTask = tasks.find((item) => item.status === "active") ?? tasks[0];
  const currentScenario = currentTask ? scenarioById.get(currentTask.scenarioId) : undefined;
  const completedForCurrent = currentTask ? interviews.filter((item) => item.taskId === currentTask.id && item.status === "completed").length : 0;
  const statCards = [
    { label: "萃取任务", value: tasks.length, note: `${tasks.filter((item) => item.status === "active").length} 个正在进行`, code: "SC" },
    { label: "已完成访谈", value: stats?.completedInterviewCount ?? 0, note: "来自真实受控数据", code: "IV" },
    { label: "结构化案例", value: stats?.extractedCaseCount ?? 0, note: "全部保留源记录", code: "CA" },
    { label: "经验规则", value: stats?.experienceRuleCount ?? 0, note: "均为待审核草稿", code: "RU" },
  ];

  return <div className="admin-dashboard">
    <PageHeader eyebrow="Experience Desk / 01" title="把一线判断，变成机构可用的经验。" description="从任务配置、场景访谈到经验融合，跟踪每条知识的来源与完整度。" actions={<PrimaryLink href="/admin/scenarios/create">新建萃取任务</PrimaryLink>} />
    {error ? <div className="admin-demo-notice" role="alert"><div><strong>读取失败</strong><p>{error}</p></div></div> : null}
    <section className="admin-stat-grid" aria-label="核心指标">{statCards.map((stat) => <article className="admin-stat-card" key={stat.code}><div className="admin-stat-card__top"><span>{stat.code}</span><i aria-hidden="true" /></div><strong>{String(stat.value).padStart(2, "0")}</strong><h2>{stat.label}</h2><p>{stat.note}</p></article>)}</section>
    <section className="admin-dashboard-focus">
      <article className="admin-focus-card"><div className="admin-focus-card__head"><div><p className="admin-kicker">当前重点任务</p><h2>{currentScenario?.name ?? "暂无任务"}</h2></div>{currentTask ? <StatusBadge status={taskStatus(currentTask.status)} /> : null}</div><p className="admin-focus-card__summary">{currentScenario?.objective ?? "创建并发布一个萃取任务后，这里会显示真实访谈进度。"}</p>{currentTask ? <div className="admin-focus-card__progress"><div><span>访谈进度</span><strong>{completedForCurrent} / {currentTask.completedInterviewCount || "—"} 已完成</strong></div><ProgressBar value={currentTask.completedInterviewCount ? Math.round(completedForCurrent / currentTask.completedInterviewCount * 100) : 0} label="访谈进度" /></div> : null}<div className="admin-focus-card__actions">{currentScenario ? <Link className="admin-button admin-button--primary" href={`/admin/scenarios/${currentScenario.id}`}>进入任务<span aria-hidden="true">→</span></Link> : <PrimaryLink href="/admin/scenarios/create">新建任务</PrimaryLink>}<Link className="admin-button admin-button--secondary" href="/admin/fusion">查看融合候选</Link></div></article>
      <article className="admin-card admin-coverage-card"><div className="admin-card__header"><div><h2>真实数据说明</h2><p>AI 生成案例、规则与融合结果均需人工审核</p></div><span className="admin-coverage-card__score">RLS</span></div><div className="admin-card__body"><p className="admin-coverage-card__insight">管理端读取经管理员 JWT 和所属机构 RLS 校验；此处不展示其他机构的访谈、案例或音频。</p></div></article>
    </section>
    <section className="admin-dashboard-lower"><article className="admin-card"><div className="admin-card__header"><div><h2>最近任务</h2><p>来自已受机构权限保护的任务记录</p></div><Link className="admin-button admin-button--quiet" href="/admin/scenarios">全部任务 →</Link></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>任务</th><th>状态</th><th>访谈</th><th>更新</th></tr></thead><tbody>{tasks.slice(0, 5).length ? tasks.slice(0, 5).map((task) => { const scenario = scenarioById.get(task.scenarioId); return <tr key={task.id}><td><Link href={`/admin/scenarios/${task.scenarioId}`}>{scenario?.name ?? task.scenarioName}</Link><small>邀请码：{task.inviteCode}</small></td><td><StatusBadge status={taskStatus(task.status)} /></td><td>{task.completedInterviewCount} 已完成</td><td>{displayDate(task.updatedAt)}</td></tr>; }) : <tr><td colSpan={4}>暂无真实任务</td></tr>}</tbody></table></div></article><aside className="admin-card admin-next-card"><div className="admin-card__header"><div><h2>下一步</h2><p>优先完成采集与人工审核</p></div></div><div className="admin-next-list"><Link href="/admin/scenarios/create"><span>01</span><div><strong>创建并发布任务</strong><p>任务配置将直接写入机构数据库。</p></div><i aria-hidden="true">→</i></Link><Link href="/admin/fusion"><span>02</span><div><strong>融合已完成访谈</strong><p>只允许选择同一场景的已完成访谈。</p></div><i aria-hidden="true">→</i></Link><Link href="/admin/references/preview"><span>03</span><div><strong>核对 Reference</strong><p>在导出前核对来源与待审核状态。</p></div><i aria-hidden="true">→</i></Link></div></aside></section>
  </div>;
}
