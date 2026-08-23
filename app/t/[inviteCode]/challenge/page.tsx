import type { Metadata } from "next";
import { ChallengeCase } from "@/components/h5/ChallengeCase";

export const metadata: Metadata = {
  title: "业务案例挑战",
};

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const normalizedCode = inviteCode.toUpperCase();

  return <ChallengeCase inviteCode={normalizedCode} />;
}
