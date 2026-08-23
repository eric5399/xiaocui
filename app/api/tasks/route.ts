import { createTaskSchema } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function GET(request: Request) {
  return route(async () => (await getRequestExperienceService(request, "admin")).listTasks());
}

export async function POST(request: Request) {
  return route(async () => {
    const payload = createTaskSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "admin")).createTask(payload);
  }, 201);
}
