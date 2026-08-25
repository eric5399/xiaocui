import type { Metadata } from "next";
import { InterviewRoom } from "@/components/h5/InterviewRoom";

export const metadata: Metadata = {
  title: "AI访谈",
};

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const normalizedCode = inviteCode.toUpperCase();

  return <InterviewRoom inviteCode={normalizedCode} />;
}
