import { z } from "zod";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

const payloadSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  return route(async () => {
    const { taskId } = await context.params;
    const { link, token } = await (await getRequestExperienceService(request, "admin"))
      .createParticipantAccessLink(taskId, payloadSchema.parse(await parseJson(request)).expiresAt);
    const origin = new URL(request.url).origin;
    return { link, accessUrl: `${origin}/access/${token}` };
  }, 201);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  return route(async () => {
    const { taskId } = await context.params;
    const { accessLinkId } = z.object({ accessLinkId: z.uuid() }).parse(await parseJson(request));
    return (await getRequestExperienceService(request, "admin")).revokeParticipantAccessLink(taskId, accessLinkId);
  });
}
