import { route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(
  request: Request,
  context: RouteContext<"/api/tasks/by-invite/[inviteCode]">,
) {
  return route(async () => {
    const { inviteCode } = await context.params;
    return (await getRequestExperienceService(request, "participant")).getPublicTaskByInviteCode(inviteCode);
  });
}
