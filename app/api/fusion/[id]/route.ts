import { route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(
  request: Request,
  context: RouteContext<"/api/fusion/[id]">,
) {
  return route(async () => {
    const { id } = await context.params;
    return (await getRequestExperienceService(request, "admin")).getFusionJob(id);
  });
}
