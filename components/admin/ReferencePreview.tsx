"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReferenceFile } from "@/lib/domain";
import { getReference } from "./admin-data-client";
import { PageHeader, SecondaryLink } from "./ui";

export function ReferencePreview() {
  const search = useSearchParams();
  const [reference, setReference] = useState<ReferenceFile | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const fusionJobId = search.get("fusionJobId") ?? undefined;
  useEffect(() => { let active = true; getReference(fusionJobId).then((item) => active && setReference(item)).catch((reason) => active && setError(reason instanceof Error ? reason.message : "尚未生成 Reference")); return () => { active = false; }; }, [fusionJobId]);
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  async function copyMarkdown() { if (!reference) return; try { await navigator.clipboard.writeText(reference.markdownContent); showToast("Markdown 已复制。"); } catch { showToast("浏览器未授权剪贴板，请使用下载功能。"); } }
  function download() { if (!reference) return; const blob = new Blob([reference.markdownContent], { type: "text/markdown;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = reference.filename; anchor.click(); URL.revokeObjectURL(url); showToast("Reference 已下载。"); }

  return <div className="admin-reference-page"><div className="admin-reference-screen-header"><PageHeader eyebrow="Reference Export / 05" title="Reference 预览" description="在导出前核对策略、证据来源、边界条件与风险声明。" actions={<SecondaryLink href="/admin/fusion">返回经验融合</SecondaryLink>} /></div>
    {error ? <section className="admin-card"><div className="admin-empty-state"><h2>尚无可预览的 Reference</h2><p>{error}</p><Link className="admin-button admin-button--primary" href="/admin/fusion">进入经验融合</Link></div></section> : reference ? <><div className="admin-reference-toolbar"><div className="admin-reference-toolbar__version"><label>文件</label><span className="admin-select">{reference.filename}</span></div><span className="admin-reference-toolbar__state">待业务审核</span><div className="admin-reference-toolbar__actions"><button className="admin-button admin-button--secondary" type="button" onClick={copyMarkdown}>复制 Markdown</button><button className="admin-button admin-button--secondary" type="button" onClick={() => window.print()}>打印 / PDF</button><button className="admin-button admin-button--primary" type="button" onClick={download}>下载 .md <span aria-hidden="true">↓</span></button></div></div><div className="admin-reference-layout"><aside className="admin-reference-toc"><p className="admin-kicker">TRACEABLE REFERENCE</p><div className="admin-reference-toc__meta"><span>文档标识</span><code>{reference.id}</code><span>融合任务</span><code>{reference.fusionJobId}</code><span>生成日期</span><code>{new Intl.DateTimeFormat("zh-CN").format(new Date(reference.createdAt))}</code></div></aside><article className="admin-reference-document"><header className="admin-reference-cover"><div className="admin-reference-cover__top"><span>EXPERIENCE REFERENCE</span><span>待审核</span></div><div className="admin-reference-cover__mark" aria-hidden="true"><i /><i /></div><p>机构经验萃取</p><h1>{reference.filename.replace(/\.md$/i, "")}</h1><div className="admin-reference-cover__meta"><div><span>状态</span><strong>融合草稿 · 待审核</strong></div><div><span>来源</span><strong>可追溯至访谈 ID</strong></div><div><span>生成日期</span><strong>{new Intl.DateTimeFormat("zh-CN").format(new Date(reference.createdAt))}</strong></div></div></header><div className="admin-reference-body"><section className="admin-reference-section"><div className="admin-reference-section__number">MD</div><div><p className="admin-kicker">SOURCE MARKDOWN</p><h2>可追溯内容</h2><pre className="admin-reference-markdown">{reference.markdownContent}</pre></div></section></div><footer className="admin-reference-document__footer"><div><strong>小萃</strong><span>机构经验萃取平台</span></div><span>待人工审核后方可使用</span></footer></article></div></> : <section className="admin-card"><div className="admin-empty-state"><h2>正在读取 Reference</h2><p>正在从受机构权限保护的存储中加载。</p></div></section>}
    {toast ? <div className="admin-toast" role="status">{toast}</div> : null}</div>;
}
