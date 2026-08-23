"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { dimensions, personalSummaryMock, taskMock } from "./mock-data";
import { H5Frame, LoadingPanel, MockNotice } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import styles from "./h5.module.css";

function formatSubmittedAt(value: string | null) {
  if (!value) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function CompletionSummary({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, resetProgress } = useH5Progress(inviteCode);

  useEffect(() => {
    if (!ready) return;
    if (progress.status !== "submitted") {
      router.replace(`/t/${inviteCode}/interview`);
    }
  }, [inviteCode, progress.status, ready, router]);

  if (!ready || progress.status !== "submitted") {
    return (
      <H5Frame activeStep={3} quietHeader>
        <LoadingPanel label="正在确认提交状态" />
      </H5Frame>
    );
  }

  const completeCount = dimensions.filter(
    ({ id }) => progress.coverage[id] === 2,
  ).length;
  const hasApiResult = Boolean(progress.apiExtractedCase);
  const summaryTitle =
    progress.apiExtractedCase?.title ?? personalSummaryMock.title;
  const summaryItems = progress.apiExtractedCase
    ? [
        ["业务背景", progress.apiExtractedCase.background],
        ["问题发现", progress.apiExtractedCase.discovery],
        ["判断逻辑", progress.apiExtractedCase.judgement],
        ["推荐动作", progress.apiExtractedCase.action],
        ["效果反馈", progress.apiExtractedCase.result],
        ["边界条件", progress.apiExtractedCase.limitation],
      ]
    : [
        ["适用场景", personalSummaryMock.scene],
        ["判断逻辑", personalSummaryMock.judgement],
        ["推荐动作", personalSummaryMock.action],
        ["风险提示", personalSummaryMock.risk],
      ];

  function restartDemo() {
    resetProgress();
    router.push(`/t/${inviteCode}`);
  }

  return (
    <H5Frame quietHeader>
      <article className={styles.completePage}>
        <header className={styles.successHeader}>
          <div className={styles.successMark} aria-hidden="true">
            <span />
          </div>
          <p className={styles.eyebrow}>已提交</p>
          <h1>访谈已提交，感谢你贡献一线经验</h1>
          <p>
            {progress.profile.name}，你的回答已保存。
            {hasApiResult
              ? "Mock API 已生成个人案例，等待后台审核。"
              : "以下是本地规则生成的演示摘要。"}
          </p>
        </header>

        <section className={styles.receiptCard} aria-label="提交回执">
          <div>
            <span>任务</span>
            <strong>{taskMock.title}</strong>
          </div>
          <div>
            <span>提交时间</span>
            <strong>{formatSubmittedAt(progress.completedAt)}</strong>
          </div>
          <div>
            <span>信息覆盖</span>
            <strong>{completeCount}/5 个方面已完整</strong>
          </div>
          <div>
            <span>当前状态</span>
            <strong className={styles.readyText}>
              {progress.apiSyncState === "synced"
                ? hasApiResult
                  ? "Mock 案例已生成，待后台审核"
                  : "Mock API 已接收，结果待确认"
                : progress.apiSyncState === "failed"
                  ? "仅保存在本设备，后台未完成"
                  : "纯本地演示已提交"}
            </strong>
          </div>
        </section>

        <section className={styles.summaryCard} aria-labelledby="summary-title">
          <div className={styles.summaryHeading}>
            <div>
              <p className={styles.eyebrow}>个人经验摘要</p>
              <h2 id="summary-title">{summaryTitle}</h2>
            </div>
            <span>{hasApiResult ? "MOCK API" : "LOCAL MOCK"}</span>
          </div>
          <dl className={styles.summaryList}>
            {summaryItems.map(([label, content]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{content}</dd>
              </div>
            ))}
          </dl>
        </section>

        <MockNotice>
          本摘要来自{progress.apiExtractedCase ? " Mock API 的确定性规则" : "固定 Mock 规则"}，未经真实模型分析。机构经验仍需后台审核与多人融合。
          {progress.apiError ? ` 同步说明：${progress.apiError}。` : ""}
        </MockNotice>

        <div className={styles.completeActions}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => router.push("/join")}
          >
            回到邀请码入口
          </button>
          <button
            className={styles.quietButton}
            type="button"
            onClick={restartDemo}
          >
            清空本地进度并重新演示
          </button>
        </div>
      </article>
    </H5Frame>
  );
}
