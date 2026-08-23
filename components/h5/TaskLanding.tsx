"use client";

import { useRouter } from "next/navigation";
import { getResumePath, taskMock } from "./mock-data";
import { H5Frame, LoadingPanel, MockNotice } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import styles from "./h5.module.css";

export function TaskLanding({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);

  if (!ready) {
    return (
      <H5Frame activeStep={0} backHref="/join">
        <LoadingPanel />
      </H5Frame>
    );
  }

  const canResume = progress.status !== "new";

  function continueTask() {
    if (canResume) {
      router.push(getResumePath(progress));
      return;
    }
    updateProgress({ privacyAccepted: true, status: "profile" });
    router.push(`/t/${inviteCode}/profile`);
  }

  return (
    <H5Frame activeStep={0} backHref="/join">
      <article className={styles.taskPage}>
        <section className={styles.taskIntro}>
          <div className={styles.taskMetaLine}>
            <span className={styles.statusPill}>待参与</span>
            <span>邀请码 {inviteCode}</span>
          </div>
          <p className={styles.eyebrow}>{taskMock.topic}</p>
          <h1>{taskMock.title}</h1>
          <p className={styles.lead}>{taskMock.objective}</p>
        </section>

        <section className={styles.processCard} aria-labelledby="process-title">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIndex}>02</span>
            <div>
              <p className={styles.eyebrow}>你将完成</p>
              <h2 id="process-title">一次场景化经验复盘</h2>
            </div>
          </div>
          <ol className={styles.processList}>
            <li>
              <span>1</span>
              <div>
                <strong>填写基础信息</strong>
                <p>用于理解你的岗位与经验背景</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>分析模拟案例</strong>
                <p>先在具体场景中给出你的初步判断</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>与 AI 陪练复盘</strong>
                <p>围绕依据、动作、效果和边界动态追问</p>
              </div>
            </li>
          </ol>
        </section>

        <MockNotice>
          案例、对话与最终摘要均为预置演示内容，不代表真实业务结论。
        </MockNotice>

        <div className={styles.stickyAction}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={continueTask}
          >
            {canResume ? "继续上次进度" : "开始访谈"}
          </button>
        </div>
      </article>
    </H5Frame>
  );
}
