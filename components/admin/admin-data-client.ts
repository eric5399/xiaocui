import type {
  DashboardStats,
  FusionJob,
  InterviewDetail,
  InterviewSummary,
  ReferenceFile,
  ScenarioWithFields,
  Task,
} from "@/lib/domain";

type ApiResponse<T> = { data: T } | { error: { code: string; message: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !("data" in body)) {
    throw new Error("error" in body ? body.error.message : "请求失败，请稍后重试");
  }
  return body.data;
}

export type AdminTask = Task & { scenarioName: string; completedInterviewCount: number };

export function listAdminScenarios() {
  return request<ScenarioWithFields[]>("/api/scenarios");
}

export function listAdminTasks() {
  return request<AdminTask[]>("/api/tasks");
}

export function listAdminInterviews(query = "") {
  return request<InterviewSummary[]>(`/api/interviews${query}`);
}

export function getAdminInterview(id: string) {
  return request<InterviewDetail>(`/api/interviews/${id}`);
}

export function getAdminStats() {
  return request<DashboardStats>("/api/admin/stats");
}

export function createAdminScenario(payload: Record<string, unknown>) {
  return request<ScenarioWithFields>("/api/scenarios", { method: "POST", body: JSON.stringify(payload) });
}

export function createAdminTask(payload: Record<string, unknown>) {
  return request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
}

export function createParticipantAccessLink(taskId: string) {
  return request<{ accessUrl: string }>(`/api/tasks/${taskId}/access-links`, { method: "POST", body: "{}" });
}

export function listFusionJobs(scenarioId?: string) {
  const query = scenarioId ? `?scenarioId=${encodeURIComponent(scenarioId)}` : "";
  return request<FusionJob[]>(`/api/fusion/create${query}`);
}

export function createFusionJob(scenarioId: string, interviewIds: string[]) {
  return request<{ fusionJob: FusionJob; referenceFile: ReferenceFile }>("/api/fusion/create", {
    method: "POST",
    body: JSON.stringify({ scenarioId, interviewIds }),
  });
}

export function getReference(fusionJobId?: string) {
  const query = fusionJobId ? `?fusionJobId=${encodeURIComponent(fusionJobId)}&format=json` : "?format=json";
  return request<ReferenceFile>(`/api/reference/export${query}`);
}
