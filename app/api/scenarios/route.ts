import { asJsonObject, createScenarioSchema } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(request: Request) {
  return route(async () => (await getRequestExperienceService(request, "admin")).listScenarios());
}

export async function POST(request: Request) {
  return route(async () => {
    const payload = createScenarioSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "admin")).createScenario({
      ...payload,
      outputSchema: asJsonObject(payload.outputSchema),
    });
  }, 201);
}
