import type { ReactNode } from "react";
import { AdminRouteFrame } from "@/components/admin/AdminRouteFrame";
import { getDataProviderStatus } from "@/lib/repository/provider";
import "./admin.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const provider = getDataProviderStatus();
  return (
    <AdminRouteFrame authEnabled={provider.provider === "supabase"} providerLabel={provider.label}>
      {children}
    </AdminRouteFrame>
  );
}
