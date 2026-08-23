export type AdminSession = {
  username: string;
  organizationId: string;
  role: "admin";
  expiresAt: string | null;
};

type ApiResponse<T> = { data: T } | { error: { code: string; message: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !("data" in body)) throw new Error("error" in body ? body.error.message : "请求失败");
  return body.data;
}

export function getAdministratorSession() {
  return request<AdminSession>("/api/admin/auth/session");
}

export function signInAdministrator(username: string, password: string) {
  return request<AdminSession>("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function signOutAdministrator() {
  return request<{ signedOut: true }>("/api/admin/auth/logout", { method: "POST" });
}
