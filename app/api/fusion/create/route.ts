import { createFusionSchema } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(request: Request) {
  return route(async () => {
    const scenarioId = new URL(request.url).searchParams.get("scenarioId") ?? undefined;
    return (await getRequestExperienceService(request, "admin")).listFusionJobs(scenarioId);
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const payload = createFusionSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "admin")).createFusion(payload);
  }, 201);
}
