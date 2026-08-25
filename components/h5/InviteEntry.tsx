"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEMO_INVITE_CODE,
  getResumePath,
  isDemoInviteCode,
} from "./mock-data";
import { H5Frame } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";
import styles from "./h5.module.css";

export function InviteEntry({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const errorId = useId();
  const helpId = useId();
  const [inviteCode, setInviteCode] = useState(demoMode ? DEMO_INVITE_CODE : "");
  const [error, setError] = useState("");
  const { progress, ready } = useH5Progress(DEMO_INVITE_CODE);

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = inviteCode.trim().toUpperCase();

    if (!isDemoInviteCode(normalized)) {
      setError(`请输入有效的邀请码（当前体验码：${DEMO_INVITE_CODE}）`);
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
          通过一个业务案例，与访谈助手复盘你的发现、判断和动作。
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

        {demoMode ? <form className={styles.formStack} onSubmit={submitInvite} noValidate>
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
              体验码已预填：{DEMO_INVITE_CODE}
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
        </form> : <p className={styles.fieldHelp}>请通过管理员发送给你的专属任务链接或二维码进入。该链接仅限本人使用，请不要转发。</p>}

      </section>

    </H5Frame>
  );
}
