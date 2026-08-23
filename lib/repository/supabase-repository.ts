import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChallengeCase,
  CompleteInterviewResult,
  CreateScenarioInput,
  CreateTaskInput,
  CustomField,
  DashboardStats,
  ExtractedCase,
  ExperienceRule,
  FusionJob,
  FusionResult,
  Interview,
  InterviewDetail,
  InterviewExtractionState,
  InterviewStatus,
  InterviewSummary,
  JsonObject,
  JsonValue,
  Message,
  ParticipantAccessLink,
  PublicTaskDetail,
  ReferenceFile,
  Scenario,
  ScenarioWithFields,
  Task,
  UserProfile,
} from "@/lib/domain";
import type {
  ExperienceRuleDraft,
  ExtractedCaseDraft,
  GeneratedChallengeCase,
} from "@/lib/agents/contracts";
import type { ExperienceRepository, InterviewFilters } from "./experience-repository";

type DbRecord = Record<string, unknown>;
type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null };

export class RepositoryError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

function unwrap<T>(result: DbResult<T>): T {
  if (result.error) throw new RepositoryError(result.error.message, result.error.code);
  if (result.data === null) throw new RepositoryError("数据库未返回预期数据");
  return result.data;
}

function record(value: unknown, label: string): DbRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepositoryError(`${label} 数据格式无效`);
  }
  return value as DbRecord;
}

function stringValue(row: DbRecord, field: string, nullable = false): string | null {
  const value = row[field];
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string") throw new RepositoryError(`${field} 数据类型无效`);
  return value;
}

function numberValue(row: DbRecord, field: string): number {
  const value = row[field];
  if (typeof value !== "number") throw new RepositoryError(`${field} 数据类型无效`);
  return value;
}

function booleanValue(row: DbRecord, field: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") throw new RepositoryError(`${field} 数据类型无效`);
  return value;
}

function jsonObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepositoryError(`${field} 必须是 JSON object`);
  }
  return value as JsonObject;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RepositoryError(`${field} 必须是字符串数组`);
  }
  return [...value];
}

function toScenario(row: unknown): Scenario {
  const item = record(row, "scenario");
  const template = jsonObject(item.case_template, "case_template");
  return {
    id: stringValue(item, "id")!,
    name: stringValue(item, "name")!,
    topic: stringValue(item, "topic")!,
    background: stringValue(item, "background")!,
    objective: stringValue(item, "objective")!,
    agentPrompt: stringValue(item, "agent_prompt")!,
    keywords: stringArray(item.keywords, "keywords"),
    outputSchema: jsonObject(item.output_schema, "output_schema"),
    caseTemplate: {
      instruction: stringValue(template, "instruction")!,
      metrics: stringArray(template.metrics, "case_template.metrics"),
      ...(Array.isArray(template.constraints)
        ? { constraints: stringArray(template.constraints, "case_template.constraints") }
        : {}),
    },
    status: stringValue(item, "status")! as Scenario["status"],
    createdAt: stringValue(item, "created_at")!,
    updatedAt: stringValue(item, "updated_at")!,
  };
}

function toCustomField(row: unknown): CustomField {
  const item = record(row, "custom_field");
  return {
    id: stringValue(item, "id")!,
    scenarioId: stringValue(item, "scenario_id")!,
    fieldName: stringValue(item, "field_name")!,
    fieldType: stringValue(item, "field_type")! as CustomField["fieldType"],
    options: stringArray(item.options, "options"),
    required: booleanValue(item, "required"),
    sortOrder: numberValue(item, "sort_order"),
    createdAt: stringValue(item, "created_at")!,
  };
}

function toTask(row: unknown): Task {
  const item = record(row, "task");
  return {
    id: stringValue(item, "id")!,
    scenarioId: stringValue(item, "scenario_id")!,
    inviteCode: stringValue(item, "invite_code")!,
    qrCode: stringValue(item, "qr_code", true),
    targetUser: stringValue(item, "target_user")!,
    expectedDurationMinutes: numberValue(item, "expected_duration_minutes"),
    status: stringValue(item, "status")! as Task["status"],
    createdAt: stringValue(item, "created_at")!,
    updatedAt: stringValue(item, "updated_at")!,
  };
}

function toParticipantAccessLink(row: unknown): ParticipantAccessLink {
  const item = record(row, "participant_access_link");
  return {
    id: stringValue(item, "id")!,
    organizationId: stringValue(item, "organization_id")!,
    taskId: stringValue(item, "task_id")!,
    status: stringValue(item, "status")! as ParticipantAccessLink["status"],
    expiresAt: stringValue(item, "expires_at")!,
    claimedBy: stringValue(item, "claimed_by", true),
    claimedAt: stringValue(item, "claimed_at", true),
    createdAt: stringValue(item, "created_at")!,
  };
}

function toProfile(row: unknown): UserProfile {
  const item = record(row, "user_profile");
  return {
    id: stringValue(item, "id")!,
    taskId: stringValue(item, "task_id")!,
    profile: jsonObject(item.profile_json, "profile_json"),
    createdAt: stringValue(item, "created_at")!,
  };
}

function toChallenge(row: unknown): ChallengeCase {
  const item = record(row, "challenge_case");
  return {
    id: stringValue(item, "id")!,
    taskId: stringValue(item, "task_id")!,
    title: stringValue(item, "title")!,
    description: stringValue(item, "description")!,
    caseData: jsonObject(item.case_data, "case_data"),
    source: stringValue(item, "source")! as ChallengeCase["source"],
    createdAt: stringValue(item, "created_at")!,
  };
}

function toInterview(row: unknown): Interview {
  const item = record(row, "interview");
  return {
    id: stringValue(item, "id")!,
    taskId: stringValue(item, "task_id")!,
    userProfileId: stringValue(item, "user_profile_id")!,
    challengeCaseId: stringValue(item, "challenge_case_id")!,
    status: stringValue(item, "status")! as InterviewStatus,
    extractionState: jsonObject(item.extraction_state, "extraction_state") as InterviewExtractionState,
    createdAt: stringValue(item, "created_at")!,
    updatedAt: stringValue(item, "updated_at")!,
    completedAt: stringValue(item, "completed_at", true),
    generationStatus: stringValue(item, "generation_status", true) as Interview["generationStatus"],
    generationError: stringValue(item, "generation_error", true),
    generationMetadata: item.generation_metadata ? jsonObject(item.generation_metadata, "generation_metadata") : {},
  };
}

function toMessage(row: unknown): Message {
  const item = record(row, "message");
  return {
    id: stringValue(item, "id")!,
    interviewId: stringValue(item, "interview_id")!,
    role: stringValue(item, "role")! as Message["role"],
    messageType: stringValue(item, "message_type")! as Message["messageType"],
    content: stringValue(item, "content")!,
    audioUrl: stringValue(item, "audio_url", true),
    metadata: jsonObject(item.metadata, "metadata"),
    createdAt: stringValue(item, "created_at")!,
  };
}

function toExtractedCase(row: unknown): ExtractedCase {
  const item = record(row, "extracted_case");
  return {
    id: stringValue(item, "id")!,
    interviewId: stringValue(item, "interview_id")!,
    title: stringValue(item, "title")!,
    summary: stringValue(item, "summary")!,
    background: stringValue(item, "background")!,
    discovery: stringValue(item, "discovery")!,
    judgement: stringValue(item, "judgement")!,
    action: stringValue(item, "action")!,
    result: stringValue(item, "result")!,
    limitation: stringValue(item, "limitation")!,
    createdAt: stringValue(item, "created_at")!,
    updatedAt: stringValue(item, "updated_at")!,
  };
}

function toRule(row: unknown): ExperienceRule {
  const item = record(row, "experience_rule");
  return {
    id: stringValue(item, "id")!,
    extractedCaseId: stringValue(item, "extracted_case_id")!,
    condition: stringValue(item, "condition")!,
    judgement: stringValue(item, "judgement")!,
    strategy: stringValue(item, "strategy")!,
    limitation: stringValue(item, "limitation")!,
    createdAt: stringValue(item, "created_at")!,
  };
}

function toReference(row: unknown): ReferenceFile {
  const item = record(row, "reference_file");
  return {
    id: stringValue(item, "id")!,
    fusionJobId: stringValue(item, "fusion_job_id")!,
    filename: stringValue(item, "filename")!,
    markdownContent: stringValue(item, "markdown_content")!,
    createdAt: stringValue(item, "created_at")!,
  };
}

function displayValue(profile: UserProfile, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = profile.profile[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

/** Server-only adapter. It is never imported by Client Components or Route Handlers. */
export class SupabaseExperienceRepository implements ExperienceRepository {
  readonly providerName = "supabase" as const;

  constructor(
    private readonly client: SupabaseClient,
    private readonly context: { organizationId?: string } = {},
  ) {}

  private async rows(query: PromiseLike<DbResult<unknown[]>>): Promise<unknown[]> {
    return unwrap(await query) ?? [];
  }

  private async one(query: PromiseLike<DbResult<unknown>>): Promise<unknown> {
    return unwrap(await query);
  }

  async listScenarios(): Promise<ScenarioWithFields[]> {
    const scenarios = (await this.rows(this.client.from("scenarios").select("*")))
      .map(toScenario)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const fields = scenarios.length
      ? (await this.rows(this.client.from("custom_fields").select("*").in("scenario_id", scenarios.map(({ id }) => id)))).map(toCustomField)
      : [];
    return scenarios.map((scenario) => ({
      ...scenario,
      customFields: fields.filter(({ scenarioId }) => scenarioId === scenario.id).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }

  async getScenario(id: string): Promise<ScenarioWithFields | undefined> {
    const result = await this.client.from("scenarios").select("*").eq("id", id).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    if (!result.data) return undefined;
    const scenario = toScenario(result.data);
    const fields = await this.rows(this.client.from("custom_fields").select("*").eq("scenario_id", id).order("sort_order"));
    return { ...scenario, customFields: fields.map(toCustomField) };
  }

  async createScenario(input: CreateScenarioInput): Promise<ScenarioWithFields> {
    if (!this.context.organizationId) {
      throw new RepositoryError("创建机构任务必须提供 organizationId", "ORGANIZATION_CONTEXT_REQUIRED");
    }
    const scenario = toScenario(await this.one(this.client.from("scenarios").insert({
      organization_id: this.context.organizationId,
      name: input.name, topic: input.topic, background: input.background, objective: input.objective,
      agent_prompt: input.agentPrompt, keywords: input.keywords, output_schema: input.outputSchema ?? {},
      case_template: input.caseTemplate, status: "draft",
    }).select("*").single()));
    const fields = input.customFields?.length
      ? await this.rows(this.client.from("custom_fields").insert(input.customFields.map((field) => ({
          scenario_id: scenario.id, field_name: field.fieldName, field_type: field.fieldType,
          options: field.options ?? [], required: field.required, sort_order: field.sortOrder,
        }))).select("*"))
      : [];
    return { ...scenario, customFields: fields.map(toCustomField) };
  }

  async listTasks(): Promise<Array<Task & { scenarioName: string; completedInterviewCount: number }>> {
    const [tasks, scenarios, interviews] = await Promise.all([
      this.rows(this.client.from("tasks").select("*")),
      this.rows(this.client.from("scenarios").select("id,name")),
      this.rows(this.client.from("interviews").select("task_id,status")),
    ]);
    const names = new Map(scenarios.map((row) => { const item = record(row, "scenario"); return [stringValue(item, "id")!, stringValue(item, "name")!] as const; }));
    const completed = new Map<string, number>();
    for (const row of interviews) {
      const item = record(row, "interview");
      if (item.status === "completed") completed.set(stringValue(item, "task_id")!, (completed.get(stringValue(item, "task_id")!) ?? 0) + 1);
    }
    return tasks.map(toTask).map((task) => ({ ...task, scenarioName: names.get(task.scenarioId) ?? "未知场景", completedInterviewCount: completed.get(task.id) ?? 0 })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const result = await this.client.from("tasks").select("*").eq("id", id).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toTask(result.data) : undefined;
  }

  async getPublicTaskByInviteCode(inviteCode: string): Promise<PublicTaskDetail | undefined> {
    const result = await this.client.from("tasks").select("*").eq("invite_code", inviteCode.toUpperCase()).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    if (!result.data) return undefined;
    const task = toTask(result.data);
    const scenario = await this.getScenario(task.scenarioId);
    if (!scenario) return undefined;
    const challenges = await this.listChallengesForTask(task.id);
    return { ...task, scenario, challengeCase: challenges[0] ?? null };
  }

  async createTask(input: Required<Omit<CreateTaskInput, "inviteCode">> & { inviteCode: string }): Promise<Task> {
    const scenario = await this.getScenario(input.scenarioId);
    if (!scenario) throw new RepositoryError("未找到对应场景", "SCENARIO_NOT_FOUND");
    const task = toTask(await this.one(this.client.from("tasks").insert({
      scenario_id: input.scenarioId, invite_code: input.inviteCode, target_user: input.targetUser,
      expected_duration_minutes: input.expectedDurationMinutes, status: input.status,
    }).select("*").single()));
    if (input.status === "active") {
      await this.one(this.client.from("scenarios").update({ status: "published" }).eq("id", input.scenarioId).select("id").single());
    }
    return task;
  }

  async createParticipantAccessLink(taskId: string, tokenHash: string, expiresAt: string): Promise<ParticipantAccessLink> {
    const task = await this.getTask(taskId);
    if (!task) throw new RepositoryError("未找到对应任务", "TASK_NOT_FOUND");
    if (!this.context.organizationId) throw new RepositoryError("创建参与链接必须提供 organizationId", "ORGANIZATION_CONTEXT_REQUIRED");
    return toParticipantAccessLink(await this.one(this.client.from("participant_access_links").insert({
      organization_id: this.context.organizationId,
      task_id: taskId,
      token_hash: tokenHash,
      status: "active",
      expires_at: expiresAt,
    }).select("*").single()));
  }

  async revokeParticipantAccessLink(taskId: string, accessLinkId: string): Promise<ParticipantAccessLink | undefined> {
    const result = await this.client.from("participant_access_links").update({ status: "revoked" }).eq("id", accessLinkId).eq("task_id", taskId).eq("status", "active").select("*").maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toParticipantAccessLink(result.data) : undefined;
  }

  async listInviteCodes(): Promise<string[]> {
    return (await this.rows(this.client.from("tasks").select("invite_code"))).map((row) => stringValue(record(row, "task"), "invite_code")!);
  }

  async listChallengesForTask(taskId: string): Promise<ChallengeCase[]> {
    return (await this.rows(this.client.from("challenge_cases").select("*").eq("task_id", taskId).order("created_at"))).map(toChallenge);
  }

  async getChallenge(id: string): Promise<ChallengeCase | undefined> {
    const result = await this.client.from("challenge_cases").select("*").eq("id", id).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toChallenge(result.data) : undefined;
  }

  async createChallenge(taskId: string, generated: GeneratedChallengeCase): Promise<ChallengeCase> {
    if (!await this.getTask(taskId)) throw new RepositoryError("未找到对应任务", "TASK_NOT_FOUND");
    return toChallenge(await this.one(this.client.from("challenge_cases").insert({
      task_id: taskId, title: generated.title, description: generated.description,
      case_data: generated.caseData, source: generated.source,
    }).select("*").single()));
  }

  async createUserProfile(taskId: string, profile: JsonObject): Promise<UserProfile> {
    if (!await this.getTask(taskId)) throw new RepositoryError("未找到对应任务", "TASK_NOT_FOUND");
    const result = await this.client.rpc("create_current_participant_profile", {
      input_task_id: taskId,
      input_profile_json: profile,
    }).single();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return toProfile(result.data);
  }

  async createInterview(taskId: string, userProfileId: string, challengeCaseId: string, extractionState: InterviewExtractionState): Promise<Interview> {
    const [task, profile, challenge] = await Promise.all([
      this.getTask(taskId),
      this.client.from("user_profiles").select("id,task_id").eq("id", userProfileId).maybeSingle(),
      this.getChallenge(challengeCaseId),
    ]);
    if (!task || !profile.data || record(profile.data, "user_profile").task_id !== taskId || !challenge || challenge.taskId !== taskId) {
      throw new RepositoryError("访谈关联对象与任务不匹配", "INTERVIEW_TASK_MISMATCH");
    }
    return toInterview(await this.one(this.client.from("interviews").insert({
      task_id: taskId, user_profile_id: userProfileId, challenge_case_id: challengeCaseId,
      extraction_state: extractionState, status: "in_progress",
    }).select("*").single()));
  }

  async updateInterviewState(id: string, extractionState: InterviewExtractionState): Promise<Interview | undefined> {
    const result = await this.client.from("interviews").update({
      extraction_state: extractionState,
      generation_status: extractionState.generationStatus ?? "pending_review",
      generation_error: extractionState.generationError ?? null,
      generation_metadata: extractionState.generationMetadata ?? {},
    }).eq("id", id).select("*").maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toInterview(result.data) : undefined;
  }

  async addMessage(interviewId: string, input: Pick<Message, "role" | "messageType" | "content" | "audioUrl"> & Partial<Pick<Message, "metadata">>): Promise<Message> {
    const detail = await this.getInterviewDetail(interviewId);
    if (!detail) throw new RepositoryError("未找到对应访谈", "INTERVIEW_NOT_FOUND");
    if (detail.status !== "in_progress") {
      throw new RepositoryError("访谈已提交，不能继续写入消息", "INTERVIEW_CLOSED");
    }
    const clientMessageId = typeof input.metadata?.clientMessageId === "string" ? input.metadata.clientMessageId : null;
    if (clientMessageId) {
      const existing = await this.findMessageByClientMessageId(interviewId, clientMessageId);
      if (existing) return existing;
    }
    return toMessage(await this.one(this.client.from("messages").insert({
      interview_id: interviewId, role: input.role, message_type: input.messageType, content: input.content,
      audio_url: input.audioUrl, metadata: input.metadata ?? {}, client_message_id: clientMessageId,
    }).select("*").single()));
  }

  async findMessageByClientMessageId(interviewId: string, clientMessageId: string): Promise<Message | undefined> {
    const result = await this.client.from("messages").select("*").eq("interview_id", interviewId).eq("client_message_id", clientMessageId).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toMessage(result.data) : undefined;
  }

  async listMessages(interviewId: string): Promise<Message[]> {
    return (await this.rows(this.client.from("messages").select("*").eq("interview_id", interviewId).order("created_at"))).map(toMessage);
  }

  async listInterviews(filters: InterviewFilters = {}): Promise<InterviewSummary[]> {
    let query = this.client.from("interviews").select("*");
    if (filters.taskId) query = query.eq("task_id", filters.taskId);
    if (filters.status) query = query.eq("status", filters.status);
    let interviews = (await this.rows(query)).map(toInterview);
    if (filters.scenarioId) {
      const tasks = await this.rows(this.client.from("tasks").select("id").eq("scenario_id", filters.scenarioId));
      const taskIds = new Set(tasks.map((row) => stringValue(record(row, "task"), "id")!));
      interviews = interviews.filter((interview) => taskIds.has(interview.taskId));
    }
    return Promise.all(interviews.map(async (interview) => {
      const detail = await this.getInterviewDetail(interview.id);
      if (!detail) throw new RepositoryError("访谈关联数据不完整");
      return {
        ...interview,
        displayName: displayValue(detail.userProfile, ["姓名", "name"], "匿名业务员"),
        organization: displayValue(detail.userProfile, ["机构", "organization"], "未填写机构"),
        scenarioName: detail.scenario.name,
        messageCount: detail.messages.length,
        extractedCase: detail.extractedCase,
      };
    }));
  }

  async getInterviewDetail(id: string): Promise<InterviewDetail | undefined> {
    const result = await this.client.from("interviews").select("*").eq("id", id).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    if (!result.data) return undefined;
    const interview = toInterview(result.data);
    const [task, profileResult, challenge, messages, caseResult] = await Promise.all([
      this.getTask(interview.taskId),
      this.client.from("user_profiles").select("*").eq("id", interview.userProfileId).maybeSingle(),
      this.getChallenge(interview.challengeCaseId),
      this.listMessages(interview.id),
      this.client.from("extracted_cases").select("*").eq("interview_id", interview.id).maybeSingle(),
    ]);
    if (!task || !profileResult.data || !challenge) throw new RepositoryError("访谈关联数据不完整");
    const scenario = await this.getScenario(task.scenarioId);
    if (!scenario) throw new RepositoryError("访谈场景不存在");
    if (caseResult.error) throw new RepositoryError(caseResult.error.message, caseResult.error.code);
    const extractedCase = caseResult.data ? toExtractedCase(caseResult.data) : null;
    const rules = extractedCase
      ? (await this.rows(this.client.from("experience_rules").select("*").eq("extracted_case_id", extractedCase.id))).map(toRule)
      : [];
    return { ...interview, task, scenario, userProfile: toProfile(profileResult.data), challengeCase: challenge, messages, extractedCase, experienceRules: rules };
  }

  async saveExtraction(interviewId: string, extractedDraft: ExtractedCaseDraft, ruleDraft: ExperienceRuleDraft): Promise<CompleteInterviewResult | undefined> {
    const detail = await this.getInterviewDetail(interviewId);
    if (!detail) return undefined;
    if (detail.status !== "in_progress" && detail.status !== "completed") {
      throw new RepositoryError("当前访谈状态不能生成案例", "INTERVIEW_CLOSED");
    }
    let extractedCase = detail.extractedCase;
    if (!extractedCase) {
      extractedCase = toExtractedCase(await this.one(this.client.from("extracted_cases").insert({ interview_id: interviewId, ...extractedDraft }).select("*").single()));
    }
    let experienceRule = detail.experienceRules[0];
    if (!experienceRule) {
      experienceRule = toRule(await this.one(this.client.from("experience_rules").insert({ extracted_case_id: extractedCase.id, ...ruleDraft }).select("*").single()));
    }
    const interview = toInterview(await this.one(this.client.from("interviews").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", interviewId).select("*").single()));
    return { interview, extractedCase, experienceRule };
  }

  async getFusionCaseInputs(interviewIds: string[]) {
    return Promise.all(interviewIds.map(async (interviewId) => {
      const detail = await this.getInterviewDetail(interviewId);
      if (!detail?.extractedCase) return null;
      return { interviewId, extractedCase: detail.extractedCase, rules: detail.experienceRules };
    }));
  }

  async createFusionJob(scenarioId: string, interviewIds: string[], result: FusionResult): Promise<FusionJob> {
    if (!await this.getScenario(scenarioId)) throw new RepositoryError("未找到对应场景", "SCENARIO_NOT_FOUND");
    const details = await Promise.all(interviewIds.map((id) => this.getInterviewDetail(id)));
    if (details.some((detail) => !detail || detail.status !== "completed" || detail.scenario.id !== scenarioId)) {
      throw new RepositoryError("所选访谈必须已完成且属于同一调研场景", "FUSION_SCENARIO_MISMATCH");
    }
    const jobRow = await this.one(this.client.from("fusion_jobs").insert({ scenario_id: scenarioId, status: "completed", result, completed_at: new Date().toISOString() }).select("*").single());
    const job = await this.toFusionJob(jobRow);
    try {
      await this.rows(this.client.from("fusion_job_interviews").insert(interviewIds.map((interviewId) => ({ fusion_job_id: job.id, interview_id: interviewId }))).select("*"));
    } catch (error) {
      await this.client.from("fusion_jobs").delete().eq("id", job.id);
      throw error;
    }
    return { ...job, selectedInterviewIds: [...interviewIds] };
  }

  private async toFusionJob(row: unknown): Promise<FusionJob> {
    const item = record(row, "fusion_job");
    const links = await this.rows(this.client.from("fusion_job_interviews").select("interview_id").eq("fusion_job_id", stringValue(item, "id")!));
    return {
      id: stringValue(item, "id")!, scenarioId: stringValue(item, "scenario_id")!,
      selectedInterviewIds: links.map((link) => stringValue(record(link, "fusion_job_interview"), "interview_id")!),
      status: stringValue(item, "status")! as FusionJob["status"],
      result: item.result === null ? null : jsonObject(item.result, "result") as unknown as FusionResult,
      errorMessage: stringValue(item, "error_message", true),
      createdAt: stringValue(item, "created_at")!, updatedAt: stringValue(item, "updated_at")!,
      completedAt: stringValue(item, "completed_at", true),
    };
  }

  async listFusionJobs(scenarioId?: string): Promise<FusionJob[]> {
    let query = this.client.from("fusion_jobs").select("*").order("created_at", { ascending: false });
    if (scenarioId) query = query.eq("scenario_id", scenarioId);
    return Promise.all((await this.rows(query)).map((row) => this.toFusionJob(row)));
  }

  async getFusionJob(id: string): Promise<FusionJob | undefined> {
    const result = await this.client.from("fusion_jobs").select("*").eq("id", id).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? this.toFusionJob(result.data) : undefined;
  }

  async createReferenceFile(fusionJobId: string, filename: string, markdownContent: string): Promise<ReferenceFile> {
    const job = await this.getFusionJob(fusionJobId);
    if (!job) throw new RepositoryError("未找到经验融合任务", "FUSION_JOB_NOT_FOUND");
    if (job.status !== "completed" || !job.result) {
      throw new RepositoryError("仅已完成的融合任务可以保存 Reference", "FUSION_NOT_COMPLETED");
    }
    return toReference(await this.one(this.client.from("reference_files").upsert({ fusion_job_id: fusionJobId, filename, markdown_content: markdownContent }, { onConflict: "fusion_job_id" }).select("*").single()));
  }

  async getReferenceByFusionJob(fusionJobId: string): Promise<ReferenceFile | undefined> {
    const result = await this.client.from("reference_files").select("*").eq("fusion_job_id", fusionJobId).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toReference(result.data) : undefined;
  }

  async getLatestReference(): Promise<ReferenceFile | undefined> {
    const result = await this.client.from("reference_files").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new RepositoryError(result.error.message, result.error.code);
    return result.data ? toReference(result.data) : undefined;
  }

  async getStats(): Promise<DashboardStats> {
    const [tasks, interviews, cases, rules, references] = await Promise.all([
      this.rows(this.client.from("tasks").select("status")), this.rows(this.client.from("interviews").select("status")),
      this.rows(this.client.from("extracted_cases").select("id")), this.rows(this.client.from("experience_rules").select("id")),
      this.rows(this.client.from("reference_files").select("id")),
    ]);
    return {
      taskCount: tasks.length,
      activeTaskCount: tasks.filter((row) => record(row, "task").status === "active").length,
      completedInterviewCount: interviews.filter((row) => record(row, "interview").status === "completed").length,
      extractedCaseCount: cases.length, experienceRuleCount: rules.length, referenceCount: references.length,
    };
  }
}

export type { JsonValue };
