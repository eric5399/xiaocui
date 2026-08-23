import { ok } from "@/lib/api/response";
import { clearAdminSessionCookie } from "@/lib/security/admin-auth-service";

export async function POST() {
  const response = ok({ signedOut: true });
  response.headers.set("Set-Cookie", clearAdminSessionCookie());
  return response;
}
