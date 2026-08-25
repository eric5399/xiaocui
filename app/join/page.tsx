import type { Metadata } from "next";
import { InviteEntry } from "@/components/h5/InviteEntry";
import { getDataProviderStatus } from "@/lib/repository/provider";

export const metadata: Metadata = {
  title: "参与任务",
  description: "通过邀请码参与演示任务。",
};

export default function JoinPage() {
  return <InviteEntry demoMode={getDataProviderStatus().provider === "mock"} />;
}
