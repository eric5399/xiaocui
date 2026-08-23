import Link from "next/link";
import type { ReactNode } from "react";

type DisplayScenarioStatus = "published" | "draft" | "closed";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="admin-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function StatusBadge({ status }: { status: DisplayScenarioStatus | "completed" | "processing" }) {
  const labels = {
    published: "已发布",
    draft: "草稿",
    closed: "已结束",
    completed: "已完成",
    processing: "进行中",
  } as const;

  return <span className={`admin-status admin-status--${status}`}>{labels[status]}</span>;
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="admin-button admin-button--primary" href={href}>
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="admin-button admin-button--secondary" href={href}>
      {children}
    </Link>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div
      className="admin-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="admin-demo-notice" role="note">
      <span className="admin-demo-notice__mark" aria-hidden="true" />
      <div>
        <strong>演示模式</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty-state">
      <div className="admin-empty-state__shape" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
