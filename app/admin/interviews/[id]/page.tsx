import { InterviewDetail } from "@/components/admin/InterviewDetail";

export default async function InterviewDetailPage({ params }: PageProps<"/admin/interviews/[id]">) {
  const { id } = await params;
  return <InterviewDetail id={id} />;
}

