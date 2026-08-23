"use client";

import { usePathname } from "next/navigation";
import { AdminAccessGate } from "./AdminAccessGate";
import { AdminShell } from "./AdminShell";

export function AdminRouteFrame({
  children,
  authEnabled,
  providerLabel,
}: {
  children: React.ReactNode;
  authEnabled: boolean;
  providerLabel: string;
}) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;
  return (
    <AdminAccessGate enabled={authEnabled}>
      <AdminShell providerLabel={providerLabel}>{children}</AdminShell>
    </AdminAccessGate>
  );
}
