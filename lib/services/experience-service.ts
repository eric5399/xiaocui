import "server-only";
import { createHash, randomBytes } from "node:crypto";

import {
  buildExperienceRuleDraft,
  buildExtractedCaseDraft,
  caseGeneratorAgent,
  generateExtractedCaseWithGateway,
  fusionAgent,
  interviewAgent,
  reviseExtractedCaseWithGateway,
} from "@/lib/agents";
import {
  generateInviteCode,
  type CreateFusionInput,
  type CreateFusionResult,
  type CreateScenarioInput,
  type CreateTaskInput,
  type ExtractedCase,
  type ReviewExtractedCasePayload,
  type SendInterviewMessageInput,
  type SendMessageResult,
  type StartInterviewInput,
} from "@/lib/domain";
import { ApiError } from "@/lib/api/errors";
import { generateReferenceFilename, generateReferenceMarkdown } from "@/lib/reference/markdown-generator";
import type { ExperienceRepository, InterviewFilters } from "@/lib/repository/experience-repository";

function extractedCaseDraft(value: ExtractedCase) {
  return {
    title: value.title,
    summary: value.summary,
    background: value.background,
    discovery: value.discovery,
    judgement: value.judgement,
    action: value.action,
    result: value.result,
    limitation: value.limitation,
  };
}

function hasProfileValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

export class ExperienceService {
  private readonly messageRequests = new Map<
    string,
    Promise<SendMessageResult>
  >();

  constructor(private readonly store: ExperienceRepository) {}

  async listScenarios() {
    return this.store.listScenarios();
  }

  async createScenario(input: CreateScenarioInput) {
    return this.store.createScenario(input);
  }

  async listTasks() {
    return this.store.listTasks();
  }

  async createTask(input: CreateTaskInput) {
    const scenario = await this.store.getScenario(input.scenarioId);
    if (!scenario) throw new ApiError(404, "SCENARIO_NOT_FOUND", "未找到对应的萃取场景");

    const inviteCode =
      input.inviteCode?.toUpperCase() ??
      generateInviteCode(`${scenario.id}:${scenario.name}`, await this.store.listInviteCodes());
    if ((await this.store.listInviteCodes()).includes(inviteCode)) {
      throw new ApiError(409, "INVITE_CODE_EXISTS", "邀请码已存在，请更换后重试");
    }

    return this.store.createTask({
      scenarioId: input.scenarioId,
      inviteCode,
      targetUser: input.targetUser ?? "",
      expectedDurationMinutes: input.expectedDurationMinutes ?? 15,
      status: input.status ?? "active",
    });
  }

  async createParticipantAccessLink(taskId: string, expiresAt?: string) {
    const task = await this.store.getTask(taskId);
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "未找到对应任务");
    if (task.status !== "active") throw new ApiError(422, "TASK_NOT_ACTIVE", "只有已发布任务可以生成参与链接");
    const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      throw new ApiError(422, "ACCESS_LINK_EXPIRY_INVALID", "参与链接有效期必须是未来时间");
    }
    const token = randomBytes(32).toString("base64url");
    const link = await this.store.createParticipantAccessLink(taskId, createHash("sha256").update(token).digest("hex"), expiry.toISOString());
    return { link, token };
  }

  async revokeParticipantAccessLink(taskId: string, accessLinkId: string) {
    const link = await this.store.revokeParticipantAccessLink(taskId, accessLinkId);
    if (!link) throw new ApiError(404, "ACCESS_LINK_NOT_FOUND", "未找到可撤销的参与链接");
    return link;
  }

  async getPublicTaskByInviteCode(inviteCode: string) {
    const task = await this.store.getPublicTaskByInviteCode(inviteCode);
    if (!task || task.status !== "active") {
      throw new ApiError(404, "TASK_NOT_FOUND", "邀请码无效或任务已结束");
    }
    return task;
  }

  async generateChallenge(taskId: string) {
    const task = await this.store.getTask(taskId);
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "未找到对应任务");
    const scenario = await this.store.getScenario(task.scenarioId);
    if (!scenario) throw new ApiError(404, "SCENARIO_NOT_FOUND", "未找到对应的萃取场景");

    const generated = await caseGeneratorAgent.generate({
      scenario,
      template: scenario.caseTemplate,
      seed: `${scenario.id}:${(await this.store.listChallengesForTask(task.id)).length}`,
    });
    return this.store.createChallenge(task.id, generated);
  }

  async startInterview(input: StartInterviewInput) {
    const task = await this.store.getTask(input.taskId);
    if (!task || task.status !== "active") {
      throw new ApiError(404, "TASK_NOT_FOUND", "任务不存在或已结束");
    }
    const scenario = await this.store.getScenario(task.scenarioId);
    if (!scenario) throw new ApiError(404, "SCENARIO_NOT_FOUND", "未找到对应场景");

    const missingRequiredFields = scenario.customFields
      .filter(({ required }) => required)
      .filter(({ fieldName }) => !hasProfileValue(input.profile[fieldName]))
      .map(({ fieldName }) => fieldName);
    if (missingRequiredFields.length > 0) {
      throw new ApiError(422, "PROFILE_FIELDS_MISSING", "请填写所有必填信息", missingRequiredFields);
    }
    if (this.store.providerName === "supabase" && !input.privacyConsent) {
      throw new ApiError(422, "PRIVACY_CONSENT_REQUIRED", "请先阅读并同意访谈资料处理说明");
    }

    let challenge = input.challengeCaseId ? await this.store.getChallenge(input.challengeCaseId) : undefined;
    if (challenge && challenge.taskId !== task.id) {
      throw new ApiError(422, "CHALLENGE_TASK_MISMATCH", "案例挑战不属于当前任务");
    }
    challenge ??= (await this.store.listChallengesForTask(task.id))[0];
    challenge ??= await this.generateChallenge(task.id);

    const profile = input.privacyConsent
      ? {
          ...input.profile,
          _privacyConsent: {
            version: input.privacyConsentVersion ?? "pilot-v1",
            acceptedAt: new Date().toISOString(),
          },
        }
      : input.profile;
    const userProfile = await this.store.createUserProfile(task.id, profile);
    let interview = await this.store.createInterview(task.id, userProfile.id, challenge.id, {});
    const agent = await interviewAgent.start({
      challengeTitle: challenge.title,
      challengeDescription: challenge.description,
      extractionState: interview.extractionState,
      conversationHistory: [],
    });
    interview = await this.store.updateInterviewState(interview.id, agent.extractionState) ?? interview;
    const assistantMessage = await this.store.addMessage(interview.id, {
      role: "assistant",
      messageType: "text",
      content: agent.nextQuestion ?? "请结合这个案例分享你的处理经验。",
      audioUrl: null,
      metadata: { stage: agent.currentStage, llm: agent.diagnostics ?? { provider: "mock", model: "deterministic-mock-v1", latencyMs: 0, inputTokens: 0, outputTokens: 0 } },
    });

    return { interview, userProfile, challengeCase: challenge, assistantMessage, agent };
  }

  sendMessage(input: SendInterviewMessageInput): Promise<SendMessageResult> {
    const idempotencyKey = input.clientMessageId
      ? `${input.interviewId}:${input.clientMessageId}`
      : null;
    if (idempotencyKey) {
      const existing = this.messageRequests.get(idempotencyKey);
      if (existing) return existing;
    }

    const request = this.processMessage(input).catch((error: unknown) => {
      if (idempotencyKey) this.messageRequests.delete(idempotencyKey);
      throw error;
    });
    if (idempotencyKey) this.messageRequests.set(idempotencyKey, request);
    return request;
  }

  private async processMessage(
    input: SendInterviewMessageInput,
  ): Promise<SendMessageResult> {
    const detail = await this.store.getInterviewDetail(input.interviewId);
    if (!detail) throw new ApiError(404, "INTERVIEW_NOT_FOUND", "未找到对应访谈");
    if (detail.status !== "in_progress") {
      throw new ApiError(409, "INTERVIEW_CLOSED", "访谈已提交，不能继续发送消息");
    }

    const existingUserMessage = input.clientMessageId
      ? await this.store.findMessageByClientMessageId(detail.id, input.clientMessageId)
      : undefined;
    if (existingUserMessage) {
      const existingAssistantMessage = detail.messages.find(
        (message) => message.role === "assistant" && message.metadata.replyToClientMessageId === input.clientMessageId,
      ) ?? null;
      if (existingAssistantMessage) {
        const agent = await interviewAgent.start({
          challengeTitle: detail.challengeCase.title,
          challengeDescription: detail.challengeCase.description,
          extractionState: detail.extractionState,
          conversationHistory: detail.messages,
        });
        return { interview: detail, userMessage: existingUserMessage, assistantMessage: existingAssistantMessage, agent };
      }
      const agent = await interviewAgent.reply({
        challengeTitle: detail.challengeCase.title,
        challengeDescription: detail.challengeCase.description,
        extractionState: detail.extractionState,
        conversationHistory: detail.messages,
        userMessage: existingUserMessage.content,
      });
      const interview = await this.store.updateInterviewState(detail.id, agent.extractionState) ?? detail;
      const assistantMessage = await this.store.addMessage(detail.id, {
        role: "assistant",
        messageType: "text",
        content: agent.nextQuestion ?? "这个案例基本聊清楚了，我帮你整理一下。",
        audioUrl: null,
        metadata: {
          stage: agent.currentStage,
          isComplete: agent.isComplete,
          replyToClientMessageId: input.clientMessageId ?? null,
          llm: agent.diagnostics ?? { provider: "mock", model: "deterministic-mock-v1", latencyMs: 0, inputTokens: 0, outputTokens: 0 },
        },
      });
      return { interview, userMessage: existingUserMessage, assistantMessage, agent };
    }

    const userMessage = await this.store.addMessage(detail.id, {
      role: "user",
      messageType: input.type ?? "text",
      content: input.content,
      audioUrl: input.audioUrl ?? null,
      metadata: { clientMessageId: input.clientMessageId ?? null },
    });
    const agent = await interviewAgent.reply({
      challengeTitle: detail.challengeCase.title,
      challengeDescription: detail.challengeCase.description,
      extractionState: detail.extractionState,
      conversationHistory: [...detail.messages, userMessage],
      userMessage: input.content,
    });
    const interview = await this.store.updateInterviewState(detail.id, agent.extractionState) ?? detail;
    const assistantMessage = await this.store.addMessage(detail.id, {
      role: "assistant",
      messageType: "text",
      content:
        agent.nextQuestion ??
        "这个案例基本聊清楚了，我帮你整理一下。",
      audioUrl: null,
      metadata: {
        stage: agent.currentStage,
        isComplete: agent.isComplete,
        replyToClientMessageId: input.clientMessageId ?? null,
        llm: agent.diagnostics ?? { provider: "mock", model: "deterministic-mock-v1", latencyMs: 0, inputTokens: 0, outputTokens: 0 },
      },
    });

    return { interview, userMessage, assistantMessage, agent };
  }

  async completeInterview(interviewId: string) {
    const detail = await this.store.getInterviewDetail(interviewId);
    if (!detail) throw new ApiError(404, "INTERVIEW_NOT_FOUND", "未找到对应访谈");
    if (detail.extractedCase && detail.experienceRules[0]) {
      const extractionState = detail.extractionState.caseReview
        ? detail.extractionState
        : {
            ...detail.extractionState,
            caseReview: {
              status: "ai_generated" as const,
              originalCase: extractedCaseDraft(detail.extractedCase),
              revisions: [],
            },
          };
      const interview = detail.extractionState.caseReview
        ? detail
        : (await this.store.updateInterviewState(interviewId, extractionState)) ?? detail;
      return {
        interview,
        extractedCase: detail.extractedCase,
        experienceRule: detail.experienceRules[0],
      };
    }
    if (!detail.messages.some(({ role, content }) => role === "user" && content.trim())) {
      throw new ApiError(422, "INTERVIEW_EMPTY", "至少回答一个问题后才能提交访谈");
    }

    let extractedDraft;
    try {
      const generated = await generateExtractedCaseWithGateway({
        challengeTitle: detail.challengeCase.title, challengeDescription: detail.challengeCase.description,
        extractionState: detail.extractionState, messages: detail.messages,
      });
      extractedDraft = generated?.draft ?? buildExtractedCaseDraft(detail.challengeCase.title, detail.challengeCase.description, detail.extractionState);
      await this.store.updateInterviewState(interviewId, { ...detail.extractionState, generationStatus: "pending_review", generationMetadata: generated?.diagnostics });
    } catch (error) {
      await this.store.updateInterviewState(interviewId, { ...detail.extractionState, generationStatus: "failed", generationError: error instanceof Error ? error.message.slice(0, 300) : "LLM generation failed" });
      throw new ApiError(502, "CASE_GENERATION_FAILED", "AI 案例生成失败，已保留访谈原文，可稍后重试");
    }
    const ruleDraft = buildExperienceRuleDraft(extractedDraft);
    const result = await this.store.saveExtraction(detail.id, extractedDraft, ruleDraft);
    if (!result) throw new ApiError(500, "EXTRACTION_SAVE_FAILED", "经验案例保存失败");
    const extractionState = {
      ...detail.extractionState,
      generationStatus: "pending_review" as const,
      caseReview: {
        status: "ai_generated" as const,
        originalCase: extractedCaseDraft(result.extractedCase),
        revisions: [],
      },
    };
    const interview = await this.store.updateInterviewState(interviewId, extractionState);
    return { ...result, interview: interview ?? result.interview };
  }

  async reviewExtractedCase(interviewId: string, input: ReviewExtractedCasePayload) {
    const detail = await this.store.getInterviewDetail(interviewId);
    if (!detail) throw new ApiError(404, "INTERVIEW_NOT_FOUND", "未找到对应访谈");
    if (detail.status !== "completed" || !detail.extractedCase || !detail.experienceRules[0]) {
      throw new ApiError(409, "CASE_NOT_READY", "案例尚未生成，暂时无法确认");
    }
    const originalCase = detail.extractionState.caseReview?.originalCase ?? extractedCaseDraft(detail.extractedCase);
    const now = new Date().toISOString();

    if (input.action === "confirm") {
      const status = detail.extractionState.caseReview?.status === "user_corrected"
        ? "user_corrected" as const
        : "user_confirmed" as const;
      const extractionState = {
        ...detail.extractionState,
        caseReview: {
          status,
          originalCase,
          revisions: detail.extractionState.caseReview?.revisions ?? [],
          confirmedAt: now,
        },
      };
      const result = await this.store.saveCaseReview(interviewId, { extractionState });
      if (!result) throw new ApiError(500, "CASE_REVIEW_SAVE_FAILED", "案例确认保存失败");
      return { ...result, reviewStatus: status, changedFields: [] };
    }

    const clientMessageId = input.clientMessageId ?? `case-correction-${randomBytes(10).toString("hex")}`;
    const existingRevision = detail.extractionState.caseReview?.revisions?.find(
      (revision) => revision.sourceMessageId === clientMessageId,
    );
    if (existingRevision) {
      return {
        interview: detail,
        extractedCase: detail.extractedCase,
        experienceRule: detail.experienceRules[0],
        reviewStatus: "user_corrected" as const,
        changedFields: existingRevision.changedFields,
      };
    }

    let revised;
    try {
      revised = await reviseExtractedCaseWithGateway({
        current: extractedCaseDraft(detail.extractedCase),
        correction: input.correction,
        messages: detail.messages,
      });
    } catch {
      throw new ApiError(502, "CASE_CORRECTION_FAILED", "AI 暂时没有理解这次修正，原案例和对话均已保留");
    }
    const ruleDraft = buildExperienceRuleDraft(revised.draft);
    const extractionState = {
      ...detail.extractionState,
      caseReview: {
        status: "user_corrected" as const,
        originalCase,
        confirmedAt: undefined,
        revisions: [
          ...(detail.extractionState.caseReview?.revisions ?? []),
          {
            sourceMessageId: clientMessageId,
            correction: input.correction,
            changedFields: revised.changedFields,
            createdAt: now,
            generationMetadata: revised.diagnostics ?? undefined,
          },
        ],
      },
    };
    const result = await this.store.saveCaseReview(interviewId, {
      extractionState,
      extractedDraft: revised.draft,
      ruleDraft,
      correctionMessage: {
        content: input.correction,
        clientMessageId,
        changedFields: revised.changedFields,
      },
    });
    if (!result) throw new ApiError(500, "CASE_REVIEW_SAVE_FAILED", "案例修正保存失败");
    return { ...result, reviewStatus: "user_corrected" as const, changedFields: revised.changedFields };
  }

  async listInterviews(filters?: InterviewFilters) {
    return this.store.listInterviews(filters);
  }

  async getInterviewDetail(interviewId: string) {
    const detail = await this.store.getInterviewDetail(interviewId);
    if (!detail) throw new ApiError(404, "INTERVIEW_NOT_FOUND", "未找到对应访谈");
    return detail;
  }

  async createFusion(input: CreateFusionInput): Promise<CreateFusionResult> {
    const scenario = await this.store.getScenario(input.scenarioId);
    if (!scenario) throw new ApiError(404, "SCENARIO_NOT_FOUND", "未找到对应场景");

    const uniqueInterviewIds = [...new Set(input.interviewIds)];
    if (uniqueInterviewIds.length < 2) {
      throw new ApiError(422, "FUSION_NEEDS_MULTIPLE_INTERVIEWS", "至少选择两条不同的访谈");
    }

    for (const interviewId of uniqueInterviewIds) {
      const detail = await this.store.getInterviewDetail(interviewId);
      if (!detail || detail.status !== "completed") {
        throw new ApiError(422, "INTERVIEW_NOT_COMPLETED", "只能融合已完成的访谈");
      }
      if (detail.scenario.id !== input.scenarioId) {
        throw new ApiError(422, "FUSION_SCENARIO_MISMATCH", "所选访谈必须属于同一调研场景");
      }
    }

    const fusionCases = await this.store.getFusionCaseInputs(uniqueInterviewIds);
    if (fusionCases.some((item) => item === null)) {
      throw new ApiError(422, "EXTRACTED_CASE_MISSING", "部分访谈尚未生成个人经验案例");
    }
    const result = await fusionAgent.fuse({
      scenarioName: scenario.name,
      scenarioTopic: scenario.topic,
      cases: fusionCases.filter((item) => item !== null),
    });
    const fusionJob = await this.store.createFusionJob(scenario.id, uniqueInterviewIds, result);
    const markdown = generateReferenceMarkdown(result);
    const referenceFile = await this.store.createReferenceFile(
      fusionJob.id,
      generateReferenceFilename(result.strategyName),
      markdown,
    );
    return { fusionJob, referenceFile };
  }

  async listFusionJobs(scenarioId?: string) {
    return this.store.listFusionJobs(scenarioId);
  }

  async getFusionJob(id: string) {
    const job = await this.store.getFusionJob(id);
    if (!job) throw new ApiError(404, "FUSION_JOB_NOT_FOUND", "未找到经验融合任务");
    return job;
  }

  async getReference(fusionJobId?: string) {
    const reference = fusionJobId
      ? await this.store.getReferenceByFusionJob(fusionJobId)
      : await this.store.getLatestReference();
    if (!reference) throw new ApiError(404, "REFERENCE_NOT_FOUND", "尚未生成对应的 Reference 文件");
    return reference;
  }

  async getStats() {
    return this.store.getStats();
  }
}
