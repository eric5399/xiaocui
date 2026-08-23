import type { Metadata } from "next";
import { TaskLanding } from "@/components/h5/TaskLanding";

export const metadata: Metadata = {
  title: "网点续保异常诊断任务",
};

export default async function TaskPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const normalizedCode = inviteCode.toUpperCase();

  return <TaskLanding inviteCode={normalizedCode} />;
}
