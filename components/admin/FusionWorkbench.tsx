"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { InterviewSummary, ScenarioWithFields } from "@/lib/domain";
import { createFusionJob, listAdminInterviews, listAdminScenarios } from "./admin-data-client";
import { PageHeader, SecondaryLink } from "./ui";

function coverage(detail: InterviewSummary) { const state = detail.extractionState; return [state.discovery, state.judgement, state.action, state.result, state.limitation].filter(Boolean).length; }

export function FusionWorkbench() {
  const search = useSearchParams();
  const [scenarios, setScenarios] = useState<ScenarioWithFields[]>([]);
  const [scenarioId, setScenarioId] = useState(search.get("scenario") ?? "");
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{ referenceFile: { fusionJobId: string; filename: string }; fusionJob: { id: string; result: { strategyName: string; applicableScenarios: string[]; judgements: string[]; recommendedActions: string[]; cautions: string[]; inapplicableConditions: string[]; conflictWarnings?: string[] } | null } } | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => { let active = true; listAdminScenarios().then((items) => { if (!active) return; setScenarios(items); setScenarioId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? ""); }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "无法读取任务")); return () => { active = false; }; }, []);
  useEffect(() => { if (!scenarioId) return; let active = true; setSelected([]); setResult(null); listAdminInterviews(`?scenarioId=${encodeURIComponent(scenarioId)}&status=completed`).then((items) => active && setInterviews(items.filter((item) => item.extractedCase))).catch((reason) => active && setError(reason instanceof Error ? reason.message : "无法读取可融合访谈")); return () => { active = false; }; }, [scenarioId]);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const chosen = useMemo(() => interviews.filter((item) => selected.includes(item.id)), [interviews, selected]);
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function generate() { if (!scenarioId || selected.length < 2) return; setWorking(true); setError(""); try { setResult(await createFusionJob(scenarioId, selected)); } catch (reason) { setError(reason instanceof Error ? reason.message : "融合生成失败"); } finally { setWorking(false); } }
  const draft = result?.fusionJob.result;

  return <div className="admin-fusion-page"><PageHeader eyebrow="Synthesis Workbench / 04" title="经验融合" description="对比同一场景中多份已完成访谈，将相似经验组织成带证据来源的候选策略。" actions={<SecondaryLink href="/admin/scenarios">返回任务</SecondaryLink>} />
    {error ? <div className="admin-demo-notice" role="alert"><div><strong>操作提示</strong><p>{error}</p></div></div> : null}
    <div className="admin-fusion-context"><div><span>当前任务</span><select className="admin-select" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><span>可用访谈</span><strong>{String(interviews.length).padStart(2, "0")}</strong></div><div><span>已选来源</span><strong>{String(selected.length).padStart(2, "0")}</strong></div><div><span>状态</span><strong>待审核</strong></div></div>
    <div className="admin-fusion-layout"><section className="admin-fusion-sources"><div className="admin-section-heading"><div><h2>选择来源访谈</h2><p>至少选择两份已完成且已生成个人案例的访谈。</p></div><span className="admin-list-toolbar__count">{selected.length}/{interviews.length} SELECTED</span></div><div className="admin-fusion-candidates">{interviews.length ? interviews.map((item, index) => { const checked = selected.includes(item.id); const source = `${item.displayName} · ${item.organization}`; return <label className={`admin-fusion-candidate ${checked ? "is-selected" : ""}`} key={item.id}><input type="checkbox" checked={checked} onChange={() => toggle(item.id)} /><span className="admin-fusion-candidate__number">{String(index + 1).padStart(2, "0")}</span><div><div className="admin-fusion-candidate__meta"><span>{source}</span><span>{coverage(item)}/5 维度</span></div><h3>{item.extractedCase?.title ?? "待生成案例"}</h3><p>{item.extractedCase?.summary ?? "没有可用于融合的案例摘要。"}</p></div></label>; }) : <div className="admin-empty-state"><h3>暂无可融合来源</h3><p>请先完成至少两份访谈并生成个人案例。</p></div>}</div><button className="admin-button admin-button--primary admin-fusion-generate" type="button" disabled={selected.length < 2 || working} onClick={generate}>{working ? "正在生成…" : selected.length < 2 ? "至少选择 2 份访谈" : "生成融合草稿"}{!working && selected.length >= 2 ? <span aria-hidden="true">→</span> : null}</button></section>
      <section className={`admin-fusion-editor ${draft ? "is-generated" : ""}`}><div className="admin-fusion-editor__head"><div><p className="admin-kicker">SYNTHESIZED DRAFT</p><h2>{draft ? draft.strategyName : "等待生成融合草稿"}</h2></div><span>{draft ? "待审核" : "EMPTY"}</span></div>{draft ? <div className="admin-fusion-editor__body"><div className="admin-field"><label>适用场景</label><p>{draft.applicableScenarios.join("；")}</p></div><div className="admin-field"><label>判断逻辑</label><p>{draft.judgements.join("；")}</p></div><div className="admin-field"><label>推荐动作</label><p>{draft.recommendedActions.join("；")}</p></div><div className="admin-field"><label>不适用条件</label><p>{draft.inapplicableConditions.join("；")}</p></div><div className="admin-field"><label>注意事项</label><p>{[...draft.cautions, ...(draft.conflictWarnings ?? [])].join("；")}</p></div><div className="admin-fusion-evidence"><span>证据来源</span><div>{chosen.map((item) => <span key={item.id}>{item.displayName}</span>)}</div></div></div> : <div className="admin-fusion-editor__empty"><div aria-hidden="true"><i /><i /><i /></div><h3>先比较，再融合。</h3><p>系统只会选择当前任务、已完成访谈和对应个人案例。</p></div>}<footer className="admin-fusion-editor__footer">{result ? <Link className="admin-button admin-button--primary" href={`/admin/references/preview?fusionJobId=${result.fusionJob.id}`}>查看 Reference <span aria-hidden="true">→</span></Link> : <button className="admin-button admin-button--primary" type="button" disabled>生成 Reference 预览</button>}</footer></section>
    </div></div>;
}
