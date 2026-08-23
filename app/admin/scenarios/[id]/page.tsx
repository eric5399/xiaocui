import { ScenarioDetail } from "@/components/admin/ScenarioDetail";

export default async function ScenarioDetailPage({ params }: PageProps<"/admin/scenarios/[id]">) {
  const { id } = await params;
  return <ScenarioDetail id={id} />;
}
