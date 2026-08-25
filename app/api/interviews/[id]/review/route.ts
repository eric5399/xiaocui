import { route } from "@/lib/api/response";
import { reviewExtractedCaseSchema } from "@/lib/domain";
import { getRequestExperienceService } from "@/lib/security/request-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const { id } = await context.params;
    const payload = reviewExtractedCaseSchema.parse(await request.json());
    return (await getRequestExperienceService(request, "participant")).reviewExtractedCase(id, payload);
  });
}
