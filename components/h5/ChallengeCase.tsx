"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { challengeMock } from "./mock-data";
import { H5Frame, LoadingPanel } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import styles from "./h5.module.css";

export function ChallengeCase({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);

  useEffect(() => {
    if (!ready) return;
    if (!progress.privacyAccepted) {
      router.replace(`/t/${inviteCode}`);
      return;
    }
    if (!progress.profile.name) {
      router.replace(`/t/${inviteCode}/profile`);
    }
  }, [inviteCode, progress.privacyAccepted, progress.profile.name, ready, router]);

  if (!ready || !progress.privacyAccepted || !progress.profile.name) {
    return (
      <H5Frame activeStep={2} backHref={`/t/${inviteCode}/profile`}>
        <LoadingPanel label="正在准备挑战案例" />
      </H5Frame>
    );
  }

  const challengeTitle = progress.apiChallenge?.title ?? challengeMock.title;
  const challengeDescription =
    progress.apiChallenge?.description ?? challengeMock.description;

  function startInterview() {
    updateProgress({ status: "interview" });
    router.push(`/t/${inviteCode}/interview`);
  }

  return (
    <H5Frame activeStep={2} backHref={`/t/${inviteCode}/profile`}>
      <article className={styles.casePage}>
        <header className={styles.caseHeader}>
          <div>
            <p className={styles.eyebrow}>案例挑战</p>
            <h1>{challengeTitle}</h1>
          </div>
          <span className={styles.caseNumber}>CASE 01</span>
        </header>

        <section className={styles.caseNarrative} aria-labelledby="case-context">
          <div className={styles.caseSectionLabel}>
            <span>01</span>
            <h2 id="case-context">业务背景</h2>
          </div>
          <p>{challengeDescription}</p>
        </section>

        <section className={styles.caseMetrics} aria-labelledby="case-data">
          <div className={styles.caseSectionLabel}>
            <span>02</span>
            <h2 id="case-data">关键数据</h2>
          </div>
          <dl>
            {challengeMock.metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
                <small>{metric.note}</small>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.eventStrip}>
          <span>同期变化</span>
          <strong>{challengeMock.event}</strong>
        </section>

        <section className={styles.challengeQuestion} aria-labelledby="challenge-title">
          <span className={styles.questionMark} aria-hidden="true">
            ?
          </span>
          <div>
            <p className={styles.eyebrow}>请你分析</p>
            <h2 id="challenge-title">{challengeMock.question}</h2>
            <p>
              不必追求标准答案。访谈助手会根据你的第一反应继续追问。
            </p>
          </div>
        </section>

        <div className={styles.stickyAction}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={startInterview}
          >
            我已了解案例，开始分析
          </button>
        </div>
      </article>
    </H5Frame>
  );
}
