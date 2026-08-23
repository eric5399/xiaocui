import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

export const ADMIN_SESSION_COOKIE = "experience_admin_session";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

type AdminMembership = { organization_id: string; role: "admin" | "member" };

export type AdminSession = {
  username: string;
  organizationId: string;
  role: "admin";
  expiresAt: string | null;
};

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const username = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const email = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
  if (!url || !anonKey || !username || !email) {
    throw new ApiError(503, "ADMIN_AUTH_UNCONFIGURED", "管理员登录尚未配置；请设置 Supabase 与 ADMIN_LOGIN_USERNAME、ADMIN_LOGIN_EMAIL");
  }
  return { url, anonKey, username, email };
}

function requestClient(token?: string) {
  const { url, anonKey } = configuration();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}

function configuredUsername() {
  return configuration().username.toLocaleLowerCase("en-US");
}

async function sessionForToken(token: string): Promise<AdminSession> {
  const client = requestClient(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new ApiError(401, "AUTH_INVALID", "管理员登录已失效，请重新登录");

  const { data, error } = await client
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin");
  if (error) throw new ApiError(403, "ADMIN_REQUIRED", "无法确认管理员所属机构");
  const memberships = (data ?? []) as AdminMembership[];
  if (memberships.length !== 1) {
    throw new ApiError(403, "ADMIN_REQUIRED", "该账号没有唯一的机构管理员权限");
  }
  return {
    username: configuredUsername(),
    organizationId: memberships[0].organization_id,
    role: "admin",
    expiresAt: null,
  };
}

export async function signInAdministrator(input: unknown): Promise<{ session: AdminSession; accessToken: string; maxAge: number }> {
  const credentials = credentialsSchema.parse(input);
  const { email } = configuration();
  if (credentials.username.toLocaleLowerCase("en-US") !== configuredUsername()) {
    throw new ApiError(401, "LOGIN_FAILED", "账号或密码不正确");
  }

  const client = requestClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: credentials.password });
  if (error || !data.session) throw new ApiError(401, "LOGIN_FAILED", "账号或密码不正确");

  const session = await sessionForToken(data.session.access_token);
  const maxAge = Math.max(60, Math.min(60 * 60 * 8, Math.floor((data.session.expires_at ?? 0) - Date.now() / 1000)));
  return { session: { ...session, expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : null }, accessToken: data.session.access_token, maxAge };
}

export async function getAdministratorSession(token: string | undefined): Promise<AdminSession> {
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "请先登录管理员账号");
  return sessionForToken(token);
}

export function adminSessionCookie(token: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearAdminSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readAdminSessionCookie(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  return value ? decodeURIComponent(value) : undefined;
}
