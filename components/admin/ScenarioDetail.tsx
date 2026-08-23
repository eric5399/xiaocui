"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InterviewSummary, ScenarioWithFields } from "@/lib/domain";
import { createParticipantAccessLink, listAdminInterviews, listAdminScenarios, listAdminTasks, listFusionJobs, type AdminTask } from "./admin-data-client";
import { ProgressBar, StatusBadge } from "./ui";
import { InviteQr } from "@/components/shared/invite-qr";

type DetailTab = "config" | "entry" | "interviews" | "fusion";
function taskStatus(status: AdminTask["status"]) { return status === "active" ? "published" : status === "closed" ? "closed" : "draft"; }
function listFromUnknown(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function date(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

export function ScenarioDetail({ id }: { id: string }) {
  const [scenario, setScenario] = useState<ScenarioWithFields | null>(null);
  const [task, setTask] = useState<AdminTask | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [fusionCount, setFusionCount] = useState(0);
  const [tab, setTab] = useState<DetailTab>("config");
  const [accessUrl, setAccessUrl] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { let active = true; Promise.all([listAdminScenarios(), listAdminTasks()]).then(([scenarios, tasks]) => { if (!active) return; const found = scenarios.find((item) => item.id === id) ?? null; const foundTask = tasks.find((item) => item.scenarioId === id) ?? null; setScenario(found); setTask(foundTask); return Promise.all([listAdminInterviews(`?scenarioId=${encodeURIComponent(id)}`), listFusionJobs(id)]); }).then((result) => { if (!active || !result) return; setInterviews(result[0]); setFusionCount(result[1].length); }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "无法读取任务详情")); return () => { active = false; }; }, [id]);
  const completed = interviews.filter((item) => item.status === "completed");
  const dimensions = listFromUnknown(scenario?.outputSchema.selectedDimensions);
  const status = task ? taskStatus(task.status) : "draft";
  const completion = interviews.length ? Math.round(completed.length / interviews.length * 100) : 0;
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  async function generateAccessLink() { if (!task) return; try { const result = await createParticipantAccessLink(task.id); setAccessUrl(result.accessUrl); showToast("受控参与链接已生成；请仅发送给指定参与者。"); } catch (reason) { showToast(reason instanceof Error ? reason.message : "无法生成参与链接"); } }
  async function copyAccessLink() { try { await navigator.clipboard.writeText(accessUrl); showToast("参与链接已复制。"); } catch { showToast("浏览器未授权剪贴板，请手动复制链接。"); } }

  if (error) return <div className="admin-detail-page"><Link href="/admin/scenarios" className="admin-back-link">← 返回任务列表</Link><div className="admin-demo-notice" role="alert"><div><strong>无法读取任务</strong><p>{error}</p></div></div></div>;
  if (!scenario) return <div className="admin-detail-page"><Link href="/admin/scenarios" className="admin-back-link">← 返回任务列表</Link><div className="admin-card"><div className="admin-empty-state"><h2>正在读取任务</h2><p>若持续无法加载，请返回任务列表刷新。</p></div></div></div>;

  return <div className="admin-detail-page">
    <Link href="/admin/scenarios" className="admin-back-link"><span aria-hidden="true">←</span> 返回任务列表</Link>
    <header className="admin-detail-hero"><div className="admin-detail-hero__main"><div className="admin-detail-hero__eyebrow"><span>萃取任务</span><i aria-hidden="true" /><span>{scenario.id}</span></div><div className="admin-detail-hero__title"><h1>{scenario.name}</h1><StatusBadge status={status} /></div><p>{scenario.objective}</p></div><div className="admin-detail-hero__actions"><Link className="admin-button admin-button--secondary" href="/admin/scenarios/create">新建任务</Link>{task ? <button className="admin-button admin-button--primary" type="button" onClick={() => setTab("entry")}>参与入口</button> : null}</div></header>
    <section className="admin-detail-metrics admin-detail-metrics--three"><div><span>访谈进度</span><strong>{completed.length}<small> / {interviews.length || "—"}</small></strong><ProgressBar value={completion} label="访谈进度" /></div><div><span>结构化案例</span><strong>{String(completed.filter((item) => item.extractedCase).length).padStart(2, "0")}</strong><small>均保留来源访谈</small></div><div><span>融合草稿</span><strong>{String(fusionCount).padStart(2, "0")}</strong><small>均为待审核</small></div></section>
    <nav className="admin-detail-tabs" aria-label="任务详情分页">{([{ id: "config", label: "任务配置" }, { id: "entry", label: "参与入口" }, { id: "interviews", label: "访谈记录", count: String(interviews.length).padStart(2, "0") }, { id: "fusion", label: "经验融合", count: String(fusionCount).padStart(2, "0") }] as Array<{ id: DetailTab; label: string; count?: string }>).map((item) => <button key={item.id} type="button" className={tab === item.id ? "is-current" : undefined} aria-selected={tab === item.id} role="tab" onClick={() => setTab(item.id)}>{item.label}{item.count ? <span>{item.count}</span> : null}</button>)}</nav>
    <section className="admin-detail-content" role="tabpanel">
      {tab === "config" ? <div className="admin-detail-config"><div className="admin-card admin-config-overview"><div className="admin-card__header"><div><h2>任务信息</h2><p>本次希望向一线人员萃取的经验</p></div></div><div className="admin-card__body"><dl className="admin-meta-list"><div><dt>希望萃取的经验</dt><dd>{scenario.objective}</dd></div><div><dt>参与者需要填写的信息</dt><dd className="admin-chip-list">{scenario.customFields.map((field) => <span className="admin-chip" key={field.id}>{field.fieldName}{field.required ? " · 必填" : ""}</span>)}</dd></div><div><dt>业务热词</dt><dd className="admin-chip-list">{scenario.keywords.length ? scenario.keywords.map((keyword) => <span className="admin-chip" key={keyword}>{keyword}</span>) : <span className="admin-meta-empty">未设置</span>}</dd></div></dl></div></div><div className="admin-detail-config__rail"><article className="admin-card"><div className="admin-card__header"><div><h2>案例设置</h2><p>由任务配置驱动的模拟案例</p></div></div><div className="admin-card__body"><dl className="admin-meta-list"><div><dt>模拟案例生成</dt><dd>{scenario.caseTemplate.instruction}</dd></div><div><dt>核心萃取维度</dt><dd className="admin-chip-list">{dimensions.map((item) => <span className="admin-chip" key={item}>{item}</span>)}</dd></div><div><dt>参与者案例策略</dt><dd>{scenario.outputSchema.caseMode === "variant" ? "按指标组合生成多种案例" : "使用固定案例策略"}</dd></div></dl></div></article></div></div> : null}
      {tab === "entry" ? <div className="admin-detail-entry"><div className="admin-entry-notice"><strong>受控免登录参与入口</strong><p>链接仅首次领取时绑定匿名参与者身份；原始 token 不落库，也不应在群内公开转发。</p></div>{task?.status === "active" ? <div className="admin-card"><div className="admin-card__body">{accessUrl ? <div className="admin-entry-layout"><InviteQr value={accessUrl} inviteCode={task.inviteCode} /><div><p className="admin-kicker">ONE-TIME ACCESS URL</p><h2>参与链接已生成</h2><p className="admin-entry-url">{accessUrl}</p><button className="admin-button admin-button--primary" type="button" onClick={copyAccessLink}>复制链接</button></div></div> : <button className="admin-button admin-button--primary" type="button" onClick={generateAccessLink}>生成受控参与链接 <span aria-hidden="true">→</span></button>}</div></div> : <div className="admin-card"><div className="admin-card__body">任务尚未发布，不能创建参与入口。</div></div>}</div> : null}
      {tab === "interviews" ? <div className="admin-card admin-interview-list-card"><div className="admin-card__header"><div><h2>访谈记录</h2><p>只显示本机构当前任务的访谈。</p></div></div><div className="admin-table-wrap"><table className="admin-table admin-interview-table"><thead><tr><th>参与者</th><th>机构</th><th>状态</th><th>提交时间</th><th /></tr></thead><tbody>{interviews.length ? interviews.map((item) => <tr key={item.id}><td>{item.displayName}</td><td>{item.organization}</td><td><StatusBadge status={item.status === "completed" ? "completed" : "processing"} /></td><td>{date(item.updatedAt)}</td><td><Link className="admin-button admin-button--quiet" href={`/admin/interviews/${item.id}`}>查看 →</Link></td></tr>) : <tr><td colSpan={5}>暂无访谈记录</td></tr>}</tbody></table></div></div> : null}
      {tab === "fusion" ? <div className="admin-detail-fusion"><div className="admin-detail-fusion__intro"><p className="admin-kicker">规则候选集</p><h2>融合前请核对访谈来源</h2><p>系统只允许选择同一场景中已完成、已生成案例的访谈；结果始终标记为待审核草稿。</p><Link className="admin-button admin-button--primary" href={`/admin/fusion?scenario=${scenario.id}`}>进入经验融合 <span aria-hidden="true">→</span></Link></div></div> : null}
    </section>{toast ? <div className="admin-toast" role="status">{toast}</div> : null}
  </div>;
}
