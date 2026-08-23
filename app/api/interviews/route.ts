import { asJsonObject, startInterviewSchema, type InterviewStatus } from "@/lib/domain";
import { parseJson, route } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { getRequestExperienceService } from "@/lib/security/request-service";

const INTERVIEW_STATUSES = new Set<InterviewStatus>(["in_progress", "completed", "abandoned"]);

export async function GET(request: Request) {
  return route(async () => {
    const searchParams = new URL(request.url).searchParams;
    const statusValue = searchParams.get("status");
    if (statusValue && !INTERVIEW_STATUSES.has(statusValue as InterviewStatus)) {
      throw new ApiError(422, "INVALID_INTERVIEW_STATUS", "访谈状态参数无效");
    }
    return (await getRequestExperienceService(request, "admin")).listInterviews({
      taskId: searchParams.get("taskId") ?? undefined,
      scenarioId: searchParams.get("scenarioId") ?? undefined,
      status: (statusValue as InterviewStatus | null) ?? undefined,
    });
  });
}

/** Convenience alias for clients that model interviews as a collection. */
export async function POST(request: Request) {
  return route(async () => {
    const payload = startInterviewSchema.parse(await parseJson(request));
    return (await getRequestExperienceService(request, "participant")).startInterview({ ...payload, profile: asJsonObject(payload.profile) });
  }, 201);
}
