"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAdministrator } from "./admin-auth-client";

const NAV_ITEMS = [
  { href: "/admin", label: "总览", code: "01", exact: true },
  { href: "/admin/scenarios", label: "萃取任务", code: "02" },
  { href: "/admin/fusion", label: "经验融合", code: "03" },
  { href: "/admin/references/preview", label: "Reference", code: "04" },
];

function isCurrent(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function AdminShell({ children, providerLabel }: { children: React.ReactNode; providerLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await signOutAdministrator();
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="admin-brand">
          <span className="admin-brand__mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>
            <strong>小萃</strong>
            <small>机构经验萃取平台</small>
          </span>
        </div>

        <nav className="admin-nav" aria-label="管理端导航">
          <p className="admin-nav__label">工作台</p>
          {NAV_ITEMS.map((item) => {
            const current = isCurrent(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={current ? "is-current" : undefined}
                aria-current={current ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span>{item.code}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar__foot">
          <div className="admin-mode-card">
            <span className="admin-mode-card__signal" aria-hidden="true" />
            <div>
              <strong>{providerLabel}</strong>
              <small>管理页面仍含演示内容</small>
            </div>
          </div>
          <div className="admin-user">
            <span className="admin-avatar" aria-hidden="true">
              A
            </span>
            <span>
              <strong>admin03</strong>
              <small>机构管理员</small>
            </span>
            <button className="admin-logout" type="button" onClick={logout} disabled={loggingOut}>
              {loggingOut ? "退出中" : "退出"}
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          className="admin-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="admin-workspace">
        <header className="admin-mobile-header">
          <Link href="/admin" className="admin-mobile-brand">
            <span className="admin-brand__mark" aria-hidden="true">
              <i />
              <i />
            </span>
            <strong>小萃</strong>
          </Link>
          <button
            type="button"
            className="admin-menu-button"
            aria-label={mobileOpen ? "关闭导航" : "打开导航"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
