import { route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/interviews/[id]/complete">,
) {
  return route(async () => {
    const { id } = await context.params;
    return (await getRequestExperienceService(request, "participant")).completeInterview(id);
  });
}
