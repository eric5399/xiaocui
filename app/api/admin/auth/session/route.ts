import { toApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { getAdministratorSession, readAdminSessionCookie } from "@/lib/security/admin-auth-service";

export async function GET(request: Request) {
  try {
    return ok(await getAdministratorSession(readAdminSessionCookie(request)));
  } catch (error) {
    const failure = toApiError(error);
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
  }
}
