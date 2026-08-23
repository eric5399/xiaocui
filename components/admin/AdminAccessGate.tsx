"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAdministratorSession } from "./admin-auth-client";

export function AdminAccessGate({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"checking" | "allowed" | "denied">(enabled ? "checking" : "allowed");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getAdministratorSession()
      .then(() => active && setState("allowed"))
      .catch(() => {
        if (!active) return;
        setState("denied");
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      });
    return () => {
      active = false;
    };
  }, [enabled, pathname, router]);

  if (state === "allowed") return <>{children}</>;
  return <main className="admin-auth-loading" aria-live="polite">正在验证管理员身份…</main>;
}
