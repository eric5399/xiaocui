import type { ApiFailure, ApiSuccess } from "@/lib/domain";
import { toApiError } from "./errors";

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data } satisfies ApiSuccess<T>, { status });
}

export async function route<T>(handler: () => Promise<T>, successStatus = 200): Promise<Response> {
  try {
    return ok(await handler(), successStatus);
  } catch (error) {
    const apiError = toApiError(error);
    const body: ApiFailure = {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details === undefined ? {} : { details: apiError.details }),
      },
    };
    return Response.json(body, { status: apiError.status });
  }
}

export async function parseJson(request: Request): Promise<unknown> {
  return request.json();
}
