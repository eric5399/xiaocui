import { route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(
  request: Request,
  context: RouteContext<"/api/interviews/[id]">,
) {
  return route(async () => {
    const { id } = await context.params;
    // RLS grants this query to either the assigned participant or an
    // administrator of the owning organisation. Do not force a participant
    // refresh/recovery request through the admin-only membership check.
    return (await getRequestExperienceService(request, "authenticated")).getInterviewDetail(id);
  });
}
