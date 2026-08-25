import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./h5.module.css";

type H5FrameProps = {
  children: ReactNode;
  activeStep?: number;
  backHref?: string;
  backLabel?: string;
  quietHeader?: boolean;
};

export function H5Frame({
  children,
  backHref,
  backLabel = "返回",
}: H5FrameProps) {
  return (
    <div className={styles.viewport}>
      <div className={styles.ambient} aria-hidden="true" />
      <main className={styles.phoneCanvas}>
        <header className={styles.siteHeader}>
          <div className={styles.headerLine}>
            {backHref ? (
              <Link className={styles.backLink} href={backHref}>
                <span aria-hidden="true">‹</span>
                {backLabel}
              </Link>
            ) : (
              <div className={styles.brand}>
                <span className={styles.brandMark} aria-hidden="true">
                  <span />
                  <span />
                </span>
                <span>
                  <strong>小萃</strong>
                  <small>参与任务</small>
                </span>
              </div>
            )}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function LoadingPanel({ label = "正在恢复进度" }: { label?: string }) {
  return (
    <div className={styles.loadingPanel} role="status" aria-live="polite">
      <span className={styles.loadingBar} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function InvalidInvite({ inviteCode }: { inviteCode: string }) {
  return (
    <H5Frame quietHeader>
      <section className={styles.centerState}>
        <span className={styles.stateIndex} aria-hidden="true">
          404
        </span>
        <p className={styles.eyebrow}>邀请码无效</p>
        <h1>未找到这项萃取任务</h1>
        <p>
          邀请码 <strong>{inviteCode}</strong> 不存在或已失效。请检查后重新输入。
        </p>
        <Link className={styles.primaryButton} href="/join">
          重新输入邀请码
        </Link>
      </section>
    </H5Frame>
  );
}
