"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEMO_INVITE_CODE,
  getResumePath,
  isDemoInviteCode,
} from "./mock-data";
import { H5Frame, MockNotice } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import styles from "./h5.module.css";

export function InviteEntry() {
  const router = useRouter();
  const errorId = useId();
  const helpId = useId();
  const [inviteCode, setInviteCode] = useState(DEMO_INVITE_CODE);
  const [error, setError] = useState("");
  const { progress, ready } = useH5Progress(DEMO_INVITE_CODE);

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = inviteCode.trim().toUpperCase();

    if (!isDemoInviteCode(normalized)) {
      setError(`演示环境中请使用邀请码 ${DEMO_INVITE_CODE}`);
      return;
    }

    setError("");
    router.push(ready ? getResumePath(progress) : `/t/${DEMO_INVITE_CODE}`);
  }

  return (
    <H5Frame>
      <section className={styles.entryHero}>
        <p className={styles.eyebrow}>参与入口</p>
        <h1>分享你的业务判断</h1>
        <p className={styles.lead}>
          通过一个模拟业务案例，与 AI 陪练复盘你的发现、判断和动作。
        </p>
      </section>

      <section className={styles.entryCard} aria-labelledby="invite-title">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIndex}>01</span>
          <div>
            <p className={styles.eyebrow}>参与任务</p>
            <h2 id="invite-title">输入邀请码</h2>
          </div>
        </div>

        <form className={styles.formStack} onSubmit={submitInvite} noValidate>
          <div className={styles.fieldGroup}>
            <label htmlFor="invite-code">任务邀请码</label>
            <input
              id="invite-code"
              name="inviteCode"
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value.toUpperCase());
                if (error) setError("");
              }}
              aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
              aria-invalid={Boolean(error)}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
            />
            <p id={helpId} className={styles.fieldHelp}>
              演示邀请码已预填：{DEMO_INVITE_CODE}
            </p>
            {error && (
              <p id={errorId} className={styles.fieldError} role="alert">
                {error}
              </p>
            )}
          </div>
          <button className={styles.primaryButton} type="submit">
            {ready && progress.status !== "new" ? "继续上次进度" : "查看任务"}
          </button>
        </form>

        <MockNotice>
          本站为 MVP 演示环境；不会连接真实保险业务数据。
        </MockNotice>
      </section>

    </H5Frame>
  );
}
