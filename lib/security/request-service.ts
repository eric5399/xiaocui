import "server-only";

import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { getDataProviderStatus } from "@/lib/repository/provider";
import { SupabaseExperienceRepository } from "@/lib/repository/supabase-repository";
import { ExperienceService } from "@/lib/services/experience-service";
import { MockSpeechRepository, SupabaseSpeechRepository } from "@/lib/speech/speech-repository";
import { SpeechService } from "@/lib/speech/speech-service";

type AccessScope = "admin" | "participant" | "authenticated";

type MembershipRow = { organization_id: string; role: "admin" | "member" };

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function bearerToken(request: Request, allowAdminCookie = false): string {
  const value = request.headers.get("authorization")?.trim();
  const token = value?.startsWith("Bearer ")
    ? value.slice("Bearer ".length).trim()
    : allowAdminCookie
      ? cookieValue(request, "experience_admin_session")
      : undefined;
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Supabase 模式需要有效登录身份");
  return token;
}

/**
 * Produces a request-scoped repository whose Supabase client carries the user's
 * JWT. This is deliberately separate from the service-role client used only by
 * trusted server maintenance code: RLS must remain active for every API call.
 */
export async function getRequestExperienceService(request: Request, scope: AccessScope): Promise<ExperienceService> {
  const status = getDataProviderStatus();
  if (status.provider === "mock") {
    // Do not instantiate the service-role Repository on the Supabase request
    // path. The shared Mock service is loaded only for explicit Mock mode.
    const { mockExperienceService } = await import("@/lib/services/mock-experience-service");
    return mockExperienceService;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new ApiError(503, "SUPABASE_AUTH_UNCONFIGURED", "Supabase 模式还需要 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // The HttpOnly cookie is accepted only for management requests. Participant
  // calls must explicitly carry their anonymous-session JWT so an admin's
  // browser session can never be reused as participant authority.
  const token = bearerToken(request, scope === "admin");
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    throw new ApiError(401, "AUTH_INVALID", "登录身份无效或已过期");
  }

  let organizationId: string | undefined;
  if (scope === "admin") {
    const { data, error } = await client
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userData.user.id);
    if (error) throw new ApiError(403, "ORGANIZATION_MEMBERSHIP_REQUIRED", "无法确认机构成员身份");
    const memberships = (data ?? []) as MembershipRow[];
    const requestedOrganizationId = request.headers.get("x-organization-id")?.trim();
    const selected = requestedOrganizationId
      ? memberships.find((item) => item.organization_id === requestedOrganizationId)
      : memberships.length === 1 ? memberships[0] : undefined;
    if (!selected) {
      throw new ApiError(403, "ORGANIZATION_CONTEXT_REQUIRED", "管理操作需要所属机构上下文；多机构账号请传 X-Organization-Id");
    }
    if (selected.role !== "admin") {
      throw new ApiError(403, "ADMIN_REQUIRED", "此操作需要机构管理员权限");
    }
    organizationId = selected.organization_id;
  }

  return new ExperienceService(new SupabaseExperienceRepository(client, { organizationId }));
}

/** Speech uses the same request-scoped JWT client as interview data, so Storage
 * and transcript RLS are never bypassed by a service-role key. */
export async function getRequestSpeechService(request: Request): Promise<SpeechService> {
  const status = getDataProviderStatus();
  if (status.provider === "mock") {
    const { mockExperienceService } = await import("@/lib/services/mock-experience-service");
    return new SpeechService(new MockSpeechRepository(), mockExperienceService, "mock-participant");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new ApiError(503, "SUPABASE_AUTH_UNCONFIGURED", "Supabase 模式还需要 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const token = bearerToken(request);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "AUTH_INVALID", "登录身份无效或已过期");
  return new SpeechService(new SupabaseSpeechRepository(client), new ExperienceService(new SupabaseExperienceRepository(client)), data.user.id);
}
