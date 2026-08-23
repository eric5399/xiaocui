import { route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(request: Request) {
  return route(async () => (await getRequestExperienceService(request, "admin")).getStats());
}
