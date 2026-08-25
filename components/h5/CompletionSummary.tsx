"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { participantHeaders } from "./auth-client";
import { personalSummaryMock } from "./mock-data";
import { H5Frame, LoadingPanel } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import type { ApiExtractedCaseSummary } from "./types";
import styles from "./h5.module.css";

type ReviewPayload = {
  data?: {
    extractedCase: ApiExtractedCaseSummary;
    reviewStatus: "user_confirmed" | "user_corrected";
    changedFields: string[];
  };
  error?: { message?: string };
};

const fieldLabels: Record<string, string> = {
  title: "案例标题", summary: "核心经验", background: "问题场景",
  discovery: "问题发现", judgement: "关键判断", action: "关键动作",
  result: "结果", limitation: "适用边界",
};

function compact(value: string, max = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

function fallbackCase(): ApiExtractedCaseSummary {
  return {
    title: personalSummaryMock.title, summary: personalSummaryMock.action,
    background: personalSummaryMock.scene, discovery: personalSummaryMock.scene,
    judgement: personalSummaryMock.judgement, action: personalSummaryMock.action,
    result: personalSummaryMock.action, limitation: personalSummaryMock.risk,
  };
}

function localCorrection(current: ApiExtractedCaseSummary, correction: string) {
  const next = { ...current };
  const changedFields: string[] = [];
  if (/(动作|步骤|先|调整|沟通|回访)/.test(correction)) {
    next.action = correction; changedFields.push("action");
  } else if (/(结果|效果|提升|下降|恢复|改善)/.test(correction)) {
    next.result = correction; changedFields.push("result");
  } else if (/(不适用|边界|失效|例外|前提)/.test(correction)) {
    next.limitation = correction; changedFields.push("limitation");
  } else {
    next.judgement = correction; changedFields.push("judgement");
  }
  next.summary = `${next.judgement.replace(/[。；;]+$/, "")}；${next.action}`;
  changedFields.push("summary");
  return { extractedCase: next, changedFields };
}

export function CompletionSummary({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correction, setCorrection] = useState("");
  const [correctionResult, setCorrectionResult] = useState<string[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (progress.status !== "submitted") router.replace(`/t/${inviteCode}/interview`);
  }, [inviteCode, progress.status, ready, router]);

  const extractedCase = progress.apiExtractedCase ?? fallbackCase();
  const displayTitle = extractedCase.title.replace(/^待审核个人经验案例[:：]\s*/, "");
  const reviewItems = useMemo(() => [
    { number: "01", label: "当时的问题 / 场景", content: compact(extractedCase.background || extractedCase.discovery) },
    { number: "02", label: "你的关键判断", content: compact(extractedCase.judgement) },
    { number: "03", label: "你采取的关键动作", content: compact(extractedCase.action) },
    { number: "04", label: "最值得复用的经验", content: compact(`${extractedCase.result}；${extractedCase.limitation}`) },
  ], [extractedCase]);

  if (!ready || progress.status !== "submitted") {
    return <H5Frame quietHeader><LoadingPanel label="正在生成案例" /></H5Frame>;
  }

  async function submitReview(action: "confirm" | "correct") {
    if (working || (action === "correct" && !correction.trim())) return;
    setWorking(true); setError("");
    try {
      let payload: ReviewPayload["data"];
      const clientMessageId = `case-correction-${Date.now()}`;
      if (progress.apiInterviewId) {
        const response = await fetch(`/api/interviews/${encodeURIComponent(progress.apiInterviewId)}/review`, {
          method: "POST",
          headers: await participantHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(action === "confirm" ? { action: "confirm" } : { action: "correct", correction: correction.trim(), clientMessageId }),
        });
        const result = (await response.json()) as ReviewPayload;
        if (!response.ok || !result.data) throw new Error(result.error?.message || "案例确认失败");
        payload = result.data;
      } else if (action === "correct") {
        const local = localCorrection(extractedCase, correction.trim());
        payload = { ...local, reviewStatus: "user_corrected" };
      }

      if (action === "confirm") {
        updateProgress({
          caseReviewStatus: progress.caseReviewStatus === "user_corrected" ? "user_corrected" : "user_confirmed",
          caseReviewConfirmed: true,
          apiSyncState: progress.apiInterviewId ? "synced" : progress.apiSyncState,
        });
        return;
      }
      if (!payload) throw new Error("案例修正未返回结果");
      updateProgress((current) => ({
        ...current,
        apiExtractedCase: payload!.extractedCase,
        caseReviewStatus: "user_corrected",
        caseReviewConfirmed: false,
        messages: current.messages.some((message) => message.id === clientMessageId)
          ? current.messages
          : [...current.messages, { id: clientMessageId, role: "user", content: correction.trim(), createdAt: new Date().toISOString() }],
        apiSyncState: current.apiInterviewId ? "synced" : current.apiSyncState,
      }));
      setCorrectionResult(payload.changedFields);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "案例确认失败");
    } finally {
      setWorking(false);
    }
  }

  if (progress.caseReviewConfirmed) {
    return (
      <H5Frame quietHeader>
        <article className={styles.confirmedPage}>
          <span className={styles.confirmedMark} aria-hidden="true"><i /></span>
          <p className={styles.eyebrow}>已确认提交</p>
          <h1>谢谢，这段经验已经保存</h1>
          <p>后台保留了完整访谈、结构化案例和经验规则，之后会继续进入机构审核流程。</p>
          <button className={styles.primaryButton} type="button" onClick={() => router.push("/join")}>完成</button>
        </article>
      </H5Frame>
    );
  }

  return (
    <H5Frame quietHeader>
      <article className={styles.caseReviewPage}>
        <header className={styles.caseReviewHeader}>
          <p className={styles.eyebrow}>{progress.caseReviewStatus === "user_corrected" ? "已按你的说明调整" : "AI 已整理"}</p>
          <h1>看看我理解得对不对</h1>
          <p>不用逐字审稿，只需确认下面四点没有理解错。</p>
        </header>
        <section className={styles.caseReviewCard} aria-label="案例理解摘要">
          <h2>{displayTitle}</h2>
          <div className={styles.caseReviewList}>
            {reviewItems.map((item) => (
              <section key={item.number}><span>{item.number}</span><div><h3>{item.label}</h3><p>{item.content}</p></div></section>
            ))}
          </div>
        </section>
        {error && <p className={styles.caseReviewError} role="alert">{error}。已生成的案例和原始对话都没有丢失。</p>}
        <div className={styles.caseReviewActions}>
          <button className={styles.primaryButton} type="button" disabled={working} onClick={() => void submitReview("confirm")}>{working ? "正在保存…" : "确认提交"}</button>
          <button className={styles.caseCorrectionLink} type="button" onClick={() => { setCorrectionOpen(true); setCorrectionResult(null); setError(""); }}>有地方不对</button>
        </div>
      </article>

      {correctionOpen && (
        <div className={styles.submitOverlay} role="dialog" aria-modal="true" aria-labelledby="case-correction-title">
          <section className={styles.caseCorrectionDialog}>
            <header><span className={styles.assistantAvatar} aria-hidden="true" /><div><strong>访谈助手</strong><p id="case-correction-title">哪里需要调整？直接告诉我就行。</p></div></header>
            {correctionResult ? (
              <>
                <div className={styles.correctionUserBubble}>{correction}</div>
                <div className={styles.correctionAssistantReply}>已经按你的说明调整了{correctionResult.filter((field) => field !== "summary").map((field) => fieldLabels[field] ?? field).join("、") || "案例内容"}。</div>
                <button className={styles.primaryButton} type="button" onClick={() => { setCorrectionOpen(false); setCorrection(""); setCorrectionResult(null); }}>查看调整结果</button>
              </>
            ) : (
              <>
                <label className={styles.srOnly} htmlFor="case-correction-input">说明需要调整的地方</label>
                <textarea id="case-correction-input" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="例如：不是因为竞争对手降价，是因为销售顾问不愿意推。" autoFocus />
                {error && <p className={styles.caseReviewError} role="alert">{error}</p>}
                <div className={styles.caseCorrectionActions}>
                  <button type="button" onClick={() => setCorrectionOpen(false)}>暂不修改</button>
                  <button className={styles.primaryButton} type="button" disabled={!correction.trim() || working} onClick={() => void submitReview("correct")}>{working ? "正在调整…" : "发送调整"}</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </H5Frame>
  );
}
