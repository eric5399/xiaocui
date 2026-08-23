import type { Metadata } from "next";
import { ProfileForm } from "@/components/h5/ProfileForm";

export const metadata: Metadata = {
  title: "填写业务背景",
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const normalizedCode = inviteCode.toUpperCase();

  return <ProfileForm inviteCode={normalizedCode} />;
}
