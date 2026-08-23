import { sendInterviewMessageSchema } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function POST(request: Request) {
  return route(async () => {
    const payload = sendInterviewMessageSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "participant")).sendMessage(payload);
  });
}
