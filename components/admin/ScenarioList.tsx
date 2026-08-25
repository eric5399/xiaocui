"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { INSTITUTIONS, institutionName, type ScenarioWithFields } from "@/lib/domain";
import { listAdminInterviews, listAdminScenarios, listAdminTasks, type AdminTask } from "./admin-data-client";
import { EmptyState, PageHeader, PrimaryLink, StatusBadge } from "./ui";

type StatusFilter = "all" | "published" | "draft" | "closed";
const statusOptions: Array<{ value: StatusFilter; label: string }> = [{ value: "all", label: "全部状态" }, { value: "published", label: "已发布" }, { value: "draft", label: "草稿" }, { value: "closed", label: "已结束" }];
function taskStatus(status: AdminTask["status"]): "published" | "closed" | "draft" { return status === "active" ? "published" : status === "closed" ? "closed" : "draft"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value)); }

export function ScenarioList() {
  const [scenarios, setScenarios] = useState<ScenarioWithFields[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [completedByTask, setCompletedByTask] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [institution, setInstitution] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { let active = true; Promise.all([listAdminScenarios(), listAdminTasks(), listAdminInterviews()]).then(([nextScenarios, nextTasks, interviews]) => { if (!active) return; setScenarios(nextScenarios); setTasks(nextTasks); setCompletedByTask(new Map(nextTasks.map((task) => [task.id, interviews.filter((item) => item.taskId === task.id && item.status === "completed").length]))); }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "无法读取机构任务")).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);

  const rows = useMemo(() => scenarios.map((scenario) => {
    const task = tasks.find((item) => item.scenarioId === scenario.id);
    const mappedStatus = task ? taskStatus(task.status) : "draft";
    return { scenario, task, status: mappedStatus, completed: task ? completedByTask.get(task.id) ?? 0 : 0 };
  }).filter((row) => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const matchesInstitution = institution === "all" || (institution === "unclassified" ? !row.scenario.institutionCode : row.scenario.institutionCode === institution);
    return matchesInstitution && (status === "all" || row.status === status) && (!normalized || [row.scenario.name, row.scenario.topic, row.scenario.objective, row.task?.inviteCode, institutionName(row.scenario.institutionCode), row.scenario.institutionCode].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(normalized));
  }), [completedByTask, institution, query, scenarios, status, tasks]);

  return <div className="admin-scenario-list">
    <PageHeader eyebrow="Scenario Library / 02" title="萃取任务" actions={<PrimaryLink href="/admin/scenarios/create">新建任务</PrimaryLink>} />
    {error ? <div className="admin-demo-notice" role="alert"><div><strong>读取失败</strong><p>{error}</p></div></div> : null}
    <section className="admin-list-toolbar" aria-label="任务筛选"><label className="admin-search-field"><span aria-hidden="true" /><span className="sr-only">搜索任务</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名、机构或邀请码" /></label><select className="admin-select admin-list-toolbar__select" aria-label="按归属机构筛选" value={institution} onChange={(event) => setInstitution(event.target.value)}><option value="all">全部机构</option>{INSTITUTIONS.map((item) => <option value={item.code} key={item.code}>{item.name} · {item.code}</option>)}<option value="unclassified">未归类历史任务</option></select><select className="admin-select admin-list-toolbar__select" aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>{statusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><span className="admin-list-toolbar__count">{String(rows.length).padStart(2, "0")} / {String(scenarios.length).padStart(2, "0")}</span></section>
    {loading ? <section className="admin-card"><EmptyState title="正在读取任务" description="正在加载工作区内的真实任务数据。" /></section> : rows.length ? <section className="admin-scenario-stack" aria-live="polite"><div className="admin-scenario-stack__heading" aria-hidden="true"><span>任务 / 主题</span><span>采集进度</span><span>产出</span><span>状态 / 更新</span><span /></div>{rows.map(({ scenario, task, status: rowStatus, completed }) => { const total = task?.completedInterviewCount ?? 0; const completion = total ? Math.round(completed / total * 100) : 0; return <article className="admin-scenario-row" key={scenario.id}><div className="admin-scenario-row__title"><span className="admin-scenario-row__topic">{institutionName(scenario.institutionCode)} · {scenario.institutionCode ?? "未归类"}</span><h2><Link href={`/admin/scenarios/${scenario.id}`}>{scenario.name}</Link></h2><p>{task ? `邀请码：${task.inviteCode}` : "尚未创建参与任务"}</p></div><div className="admin-scenario-row__progress"><div><strong>{completed}/{total || "—"}</strong><span>{total ? `${completion}%` : "未开始"}</span></div><div className="admin-progress" role="progressbar" aria-label={`${scenario.name} 采集进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><span style={{ width: `${completion}%` }} /></div><small>已完成访谈</small></div><div className="admin-scenario-row__output"><strong>—</strong><span>待融合生成</span></div><div className="admin-scenario-row__state"><StatusBadge status={rowStatus} /><small>{formatDate(task?.updatedAt ?? scenario.updatedAt)}</small></div><Link href={`/admin/scenarios/${scenario.id}`} className="admin-scenario-row__open" aria-label={`打开${scenario.name}`}>→</Link></article>; })}</section> : <section className="admin-card"><EmptyState title="没有找到匹配任务" description="调整筛选条件，或新建一个萃取任务。" action={<Link className="admin-button admin-button--secondary" href="/admin/scenarios/create">新建任务</Link>} /></section>}
  </div>;
}
