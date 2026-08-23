import { toApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { adminSessionCookie, signInAdministrator } from "@/lib/security/admin-auth-service";

export async function POST(request: Request) {
  try {
    const result = await signInAdministrator(await request.json());
    const response = ok(result.session);
    response.headers.set("Set-Cookie", adminSessionCookie(result.accessToken, result.maxAge));
    return response;
  } catch (error) {
    const failure = toApiError(error);
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
  }
}
