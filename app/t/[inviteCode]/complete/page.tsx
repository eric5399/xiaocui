import type { Metadata } from "next";
import { CompletionSummary } from "@/components/h5/CompletionSummary";

export const metadata: Metadata = {
  title: "访谈已提交",
};

export default async function CompletePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const normalizedCode = inviteCode.toUpperCase();

  return <CompletionSummary inviteCode={normalizedCode} />;
}
