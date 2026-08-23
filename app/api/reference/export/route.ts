import { getRequestExperienceService } from "@/lib/security/request-service";
import { toApiError } from "@/lib/api/errors";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const reference = await (await getRequestExperienceService(request, "admin")).getReference(
      searchParams.get("fusionJobId") ?? searchParams.get("id") ?? undefined,
    );

    if (searchParams.get("format") === "json") {
      return Response.json({ data: reference });
    }

    return new Response(reference.markdownContent, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reference.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const apiError = toApiError(error);
    return Response.json(
      { error: { code: apiError.code, message: apiError.message, details: apiError.details } },
      { status: apiError.status },
    );
  }
}
