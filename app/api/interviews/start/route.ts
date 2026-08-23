import { asJsonObject, startInterviewSchema } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function POST(request: Request) {
  return route(async () => {
    const payload = startInterviewSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "participant")).startInterview({ ...payload, profile: asJsonObject(payload.profile) });
  }, 201);
}
