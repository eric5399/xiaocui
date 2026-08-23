import { generateChallengeSchema } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

/** Generates a synthetic challenge case; extracted cases are created on interview completion. */
export async function POST(request: Request) {
  return route(async () => {
    const { taskId } = generateChallengeSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "admin")).generateChallenge(taskId);
  }, 201);
}
