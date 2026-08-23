import "server-only";

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
import type { ExperienceRepository } from "./experience-repository";

interface StoreState {
  scenarios: Scenario[];
  customFields: CustomField[];
  tasks: Task[];
  userProfiles: UserProfile[];
  challengeCases: ChallengeCase[];
  interviews: Interview[];
  messages: Message[];
  extractedCases: ExtractedCase[];
  experienceRules: ExperienceRule[];
  fusionJobs: FusionJob[];
  referenceFiles: ReferenceFile[];
  participantAccessLinks: ParticipantAccessLink[];
}

const SCENARIO_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "20000000-0000-4000-8000-000000000001";
const CHALLENGE_ID = "40000000-0000-4000-8000-000000000001";
const BASE_DATE = "2026-08-20T02:00:00.000Z";

function seedState(): StoreState {
  const scenario: Scenario = {
    id: SCENARIO_ID,
    name: "车险续保异常经验萃取",
    topic: "如何诊断并改善合作网点续保率异常",
    background: "某区域合作网点近期续保率持续下降，总部希望识别一线优秀人员的诊断与行动经验。",
    objective: "提炼机会发现、判断依据、关键动作、效果反馈与适用边界。",
    agentPrompt: "基于回答缺失的信息动态追问，避免固定问卷。",
    keywords: ["续保率", "报价率", "成交率", "竞品", "客户触达"],
    outputSchema: {
      sections: ["background", "discovery", "judgement", "action", "result", "limitation"],
    },
    caseTemplate: {
      instruction: "生成一个网点续保异常案例",
      metrics: ["续保率变化", "报价率", "成交率", "竞品情况", "网点类型"],
    },
    status: "published",
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
  };

  const task: Task = {
    id: TASK_ID,
    scenarioId: SCENARIO_ID,
    inviteCode: "XC2026",
    qrCode: null,
    targetUser: "优秀车代业务人员",
    expectedDurationMinutes: 15,
    status: "active",
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
  };

  const challengeCase: ChallengeCase = {
    id: CHALLENGE_ID,
    taskId: TASK_ID,
    title: "核心合作网点续保转化突然下降",
    description:
      "某 4S 店与机构合作三年，近一个月续保率由 72% 降至 58%。报价率保持正常，成交率下降 15%，同期竞品增加驻店活动。如果你负责该网点，你会如何分析并处理？",
    caseData: {
      outletType: "4S店",
      cooperationYears: 3,
      renewalRateBefore: 72,
      renewalRateNow: 58,
      quoteRate: "正常",
      conversionChange: -15,
      competitorActivity: "增加驻店活动",
    },
    source: "mock",
    createdAt: BASE_DATE,
  };

  const customFields: CustomField[] = [
    ["姓名", "text", [], true, 10],
    ["机构", "select", ["华东分部", "华南分部", "西南分部"], true, 20],
    ["从业年限", "number", [], false, 30],
  ].map(([fieldName, fieldType, options, required, sortOrder], index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    scenarioId: SCENARIO_ID,
    fieldName: fieldName as string,
    fieldType: fieldType as CustomField["fieldType"],
    options: options as string[],
    required: required as boolean,
    sortOrder: sortOrder as number,
    createdAt: BASE_DATE,
  }));

  const profiles: UserProfile[] = [
    ["示例顾问A", "华东分部", "渠道经理", 8],
    ["示例顾问B", "华南分部", "续保经理", 6],
    ["示例顾问C", "西南分部", "客户经理", 10],
  ].map(([name, organization, role, years], index) => ({
    id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    taskId: TASK_ID,
    profile: { 姓名: name, 机构: organization, 岗位: role, 从业年限: years } as JsonObject,
    createdAt: new Date(Date.parse(BASE_DATE) + index * 60_000).toISOString(),
  }));

  const extractionStates: InterviewExtractionState[] = [
    {
      discovery: "从分渠道漏斗发现成交环节异常",
      judgement: "报价正常而成交下降，优先判断竞品截流与门店执行",
      action: "分层回访未成交客户并与店总重排触达节点",
      result: "两周后成交率回升 9 个百分点",
      limitation: "报价率同步下降时需先排查系统与价格",
    },
    {
      discovery: "对比到店客户和续保名单的触达时间发现响应延迟",
      judgement: "竞品活动只是表象，首触延迟放大了流失",
      action: "建立当日线索看板并将高意向客户分配到人",
      result: "首触时长降到两小时内，续保率回升 7 个百分点",
      limitation: "线索质量异常时不能仅靠提速",
    },
    {
      discovery: "抽样复盘客户异议记录发现权益表达不清",
      judgement: "客户未感知本机构差异化价值",
      action: "统一权益对比话术并陪访关键客户",
      result: "高价值客户成交率回升 11 个百分点",
      limitation: "产品价格明显无竞争力时应先升级定价问题",
    },
  ];

  const interviews: Interview[] = profiles.map((profile, index) => {
    const timestamp = new Date(Date.parse(BASE_DATE) + (index + 1) * 3_600_000).toISOString();
    return {
      id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      taskId: TASK_ID,
      userProfileId: profile.id,
      challengeCaseId: CHALLENGE_ID,
      status: "completed",
      extractionState: extractionStates[index],
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
    };
  });

  const caseValues = [
    {
      title: "用漏斗定位网点续保成交异常",
      summary: "报价正常但成交下降时，先拆漏斗再验证竞品截流。",
      background: "合作网点续保率由 72% 降至 58%。",
    },
    {
      title: "用首触时效改善高意向客户流失",
      summary: "对比名单流转和首触时长，确认执行延迟是否放大流失。",
      background: "竞品驻店期间，高意向客户成交率下滑。",
    },
    {
      title: "用权益对比化解竞品驻店截流",
      summary: "从客户异议记录识别价值表达缺口，并用对比话术改善。",
      background: "竞品加大驻店权益宣传，本机构高价值客户流失。",
    },
  ];

  const extractedCases: ExtractedCase[] = interviews.map((interview, index) => ({
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    interviewId: interview.id,
    ...caseValues[index],
    discovery: extractionStates[index].discovery ?? "",
    judgement: extractionStates[index].judgement ?? "",
    action: extractionStates[index].action ?? "",
    result: extractionStates[index].result ?? "",
    limitation: extractionStates[index].limitation ?? "",
    createdAt: interview.completedAt ?? interview.createdAt,
    updatedAt: interview.completedAt ?? interview.updatedAt,
  }));

  const rules: ExperienceRule[] = extractedCases.map((extractedCase, index) => ({
    id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    extractedCaseId: extractedCase.id,
    condition: extractedCase.discovery,
    judgement: extractedCase.judgement,
    strategy: extractedCase.action,
    limitation: extractedCase.limitation,
    createdAt: extractedCase.createdAt,
  }));

  return {
    scenarios: [scenario],
    customFields,
    tasks: [task],
    userProfiles: profiles,
    challengeCases: [challengeCase],
    interviews,
    messages: interviews.flatMap((interview, index) => [
      {
        id: `70000000-0000-4000-8000-${String(index * 2 + 1).padStart(12, "0")}`,
        interviewId: interview.id,
        role: "assistant" as const,
        messageType: "text" as const,
        content: "你最先从哪个信号发现问题？",
        audioUrl: null,
        metadata: {},
        createdAt: interview.createdAt,
      },
      {
        id: `70000000-0000-4000-8000-${String(index * 2 + 2).padStart(12, "0")}`,
        interviewId: interview.id,
        role: "user" as const,
        messageType: "text" as const,
        content: extractionStates[index].discovery ?? "",
        audioUrl: null,
        metadata: {},
        createdAt: new Date(Date.parse(interview.createdAt) + 120_000).toISOString(),
      },
    ]),
    extractedCases,
    experienceRules: rules,
    fusionJobs: [],
    referenceFiles: [],
    participantAccessLinks: [],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function displayValue(profile: UserProfile, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = profile.profile[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

export class MockExperienceStore implements ExperienceRepository {
  readonly providerName = "mock" as const;
  private state: StoreState;

  constructor(initialState = seedState()) {
    this.state = clone(initialState);
  }

  reset(): void {
    this.state = seedState();
  }

  listScenarios(): ScenarioWithFields[] {
    return this.state.scenarios
      .map((scenario) => this.toScenarioWithFields(scenario))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getScenario(id: string): ScenarioWithFields | undefined {
    const scenario = this.state.scenarios.find((item) => item.id === id);
    return scenario ? this.toScenarioWithFields(scenario) : undefined;
  }

  createScenario(input: CreateScenarioInput): ScenarioWithFields {
    const timestamp = new Date().toISOString();
    const scenario: Scenario = {
      id: crypto.randomUUID(),
      name: input.name,
      topic: input.topic,
      background: input.background,
      objective: input.objective,
      agentPrompt: input.agentPrompt,
      keywords: [...input.keywords],
      outputSchema: clone(input.outputSchema ?? {}),
      caseTemplate: clone(input.caseTemplate),
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.state.scenarios.push(scenario);

    for (const field of input.customFields ?? []) {
      this.state.customFields.push({
        id: crypto.randomUUID(),
        scenarioId: scenario.id,
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        options: [...(field.options ?? [])],
        required: field.required,
        sortOrder: field.sortOrder,
        createdAt: timestamp,
      });
    }

    return this.toScenarioWithFields(scenario);
  }

  listTasks(): Array<Task & { scenarioName: string; completedInterviewCount: number }> {
    return this.state.tasks
      .map((task) => ({
        ...clone(task),
        scenarioName: this.state.scenarios.find(({ id }) => id === task.scenarioId)?.name ?? "未知场景",
        completedInterviewCount: this.state.interviews.filter(
          (interview) => interview.taskId === task.id && interview.status === "completed",
        ).length,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getTask(id: string): Task | undefined {
    const task = this.state.tasks.find((item) => item.id === id);
    return task ? clone(task) : undefined;
  }

  getPublicTaskByInviteCode(inviteCode: string): PublicTaskDetail | undefined {
    const task = this.state.tasks.find((item) => item.inviteCode === inviteCode.toUpperCase());
    if (!task) return undefined;
    const scenario = this.getScenario(task.scenarioId);
    if (!scenario) return undefined;
    const challengeCase = this.state.challengeCases.find((item) => item.taskId === task.id) ?? null;
    return { ...clone(task), scenario, challengeCase: challengeCase ? clone(challengeCase) : null };
  }

  createTask(input: Required<Omit<CreateTaskInput, "inviteCode">> & { inviteCode: string }): Task {
    const timestamp = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      scenarioId: input.scenarioId,
      inviteCode: input.inviteCode,
      qrCode: null,
      targetUser: input.targetUser,
      expectedDurationMinutes: input.expectedDurationMinutes,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.state.tasks.push(task);

    const scenario = this.state.scenarios.find(({ id }) => id === input.scenarioId);
    if (scenario && input.status === "active") {
      scenario.status = "published";
      scenario.updatedAt = timestamp;
    }
    return clone(task);
  }

  createParticipantAccessLink(taskId: string, _tokenHash: string, expiresAt: string): ParticipantAccessLink {
    if (!this.getTask(taskId)) throw new Error("未找到对应任务");
    const link: ParticipantAccessLink = { id: crypto.randomUUID(), organizationId: "mock-organization", taskId, status: "active", expiresAt, claimedBy: null, claimedAt: null, createdAt: new Date().toISOString() };
    this.state.participantAccessLinks.push(link);
    return clone(link);
  }

  revokeParticipantAccessLink(taskId: string, accessLinkId: string): ParticipantAccessLink | undefined {
    const link = this.state.participantAccessLinks.find((item) => item.id === accessLinkId && item.taskId === taskId && item.status === "active");
    if (!link) return undefined;
    link.status = "revoked";
    return clone(link);
  }

  listInviteCodes(): string[] {
    return this.state.tasks.map(({ inviteCode }) => inviteCode);
  }

  listChallengesForTask(taskId: string): ChallengeCase[] {
    return this.state.challengeCases.filter((item) => item.taskId === taskId).map(clone);
  }

  getChallenge(id: string): ChallengeCase | undefined {
    const challenge = this.state.challengeCases.find((item) => item.id === id);
    return challenge ? clone(challenge) : undefined;
  }

  createChallenge(taskId: string, generated: GeneratedChallengeCase): ChallengeCase {
    const challenge: ChallengeCase = {
      id: crypto.randomUUID(),
      taskId,
      ...clone(generated),
      createdAt: new Date().toISOString(),
    };
    this.state.challengeCases.push(challenge);
    return clone(challenge);
  }

  createUserProfile(taskId: string, profile: JsonObject): UserProfile {
    const userProfile: UserProfile = {
      id: crypto.randomUUID(),
      taskId,
      profile: clone(profile),
      createdAt: new Date().toISOString(),
    };
    this.state.userProfiles.push(userProfile);
    return clone(userProfile);
  }

  createInterview(
    taskId: string,
    userProfileId: string,
    challengeCaseId: string,
    extractionState: InterviewExtractionState,
  ): Interview {
    const task = this.state.tasks.find((item) => item.id === taskId);
    const profile = this.state.userProfiles.find((item) => item.id === userProfileId);
    const challenge = this.state.challengeCases.find((item) => item.id === challengeCaseId);
    if (!task || !profile || profile.taskId !== taskId || !challenge || challenge.taskId !== taskId) {
      throw new Error("访谈关联对象与任务不匹配");
    }
    const timestamp = new Date().toISOString();
    const interview: Interview = {
      id: crypto.randomUUID(),
      taskId,
      userProfileId,
      challengeCaseId,
      status: "in_progress",
      extractionState: clone(extractionState),
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    this.state.interviews.push(interview);
    return clone(interview);
  }

  getInterview(id: string): Interview | undefined {
    const interview = this.state.interviews.find((item) => item.id === id);
    return interview ? clone(interview) : undefined;
  }

  updateInterviewState(id: string, extractionState: InterviewExtractionState): Interview | undefined {
    const interview = this.state.interviews.find((item) => item.id === id);
    if (!interview) return undefined;
    interview.extractionState = clone(extractionState);
    interview.updatedAt = new Date().toISOString();
    return clone(interview);
  }

  addMessage(
    interviewId: string,
    input: Pick<Message, "role" | "messageType" | "content" | "audioUrl"> &
      Partial<Pick<Message, "metadata">>,
  ): Message {
    const interview = this.state.interviews.find((item) => item.id === interviewId);
    if (!interview) throw new Error("未找到对应访谈");
    if (interview.status !== "in_progress") {
      throw new Error("访谈已提交，不能继续写入消息");
    }
    const message: Message = {
      id: crypto.randomUUID(),
      interviewId,
      role: input.role,
      messageType: input.messageType,
      content: input.content,
      audioUrl: input.audioUrl,
      metadata: clone(input.metadata ?? {}),
      createdAt: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return clone(message);
  }

  findMessageByClientMessageId(interviewId: string, clientMessageId: string): Message | undefined {
    const message = this.state.messages.find(
      (item) =>
        item.interviewId === interviewId &&
        item.metadata.clientMessageId === clientMessageId,
    );
    return message ? clone(message) : undefined;
  }

  listMessages(interviewId: string): Message[] {
    return this.state.messages
      .filter((message) => message.interviewId === interviewId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  listInterviews(filters: {
    taskId?: string;
    scenarioId?: string;
    status?: InterviewStatus;
  } = {}): InterviewSummary[] {
    return this.state.interviews
      .filter((interview) => !filters.taskId || interview.taskId === filters.taskId)
      .filter((interview) => !filters.status || interview.status === filters.status)
      .filter((interview) => {
        if (!filters.scenarioId) return true;
        return this.state.tasks.find(({ id }) => id === interview.taskId)?.scenarioId === filters.scenarioId;
      })
      .map((interview) => {
        const profile = this.state.userProfiles.find(({ id }) => id === interview.userProfileId);
        const task = this.state.tasks.find(({ id }) => id === interview.taskId);
        const scenario = this.state.scenarios.find(({ id }) => id === task?.scenarioId);
        return {
          ...clone(interview),
          displayName: profile ? displayValue(profile, ["姓名", "name"], "匿名业务员") : "匿名业务员",
          organization: profile ? displayValue(profile, ["机构", "organization"], "未填写机构") : "未填写机构",
          scenarioName: scenario?.name ?? "未知场景",
          messageCount: this.state.messages.filter(({ interviewId }) => interviewId === interview.id).length,
          extractedCase: clone(this.state.extractedCases.find(({ interviewId }) => interviewId === interview.id) ?? null),
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getInterviewDetail(id: string): InterviewDetail | undefined {
    const interview = this.state.interviews.find((item) => item.id === id);
    if (!interview) return undefined;
    const task = this.state.tasks.find((item) => item.id === interview.taskId);
    const scenario = task && this.getScenario(task.scenarioId);
    const userProfile = this.state.userProfiles.find((item) => item.id === interview.userProfileId);
    const challengeCase = this.state.challengeCases.find((item) => item.id === interview.challengeCaseId);
    if (!task || !scenario || !userProfile || !challengeCase) return undefined;
    const extractedCase = this.state.extractedCases.find((item) => item.interviewId === interview.id) ?? null;
    return {
      ...clone(interview),
      task: clone(task),
      scenario,
      userProfile: clone(userProfile),
      challengeCase: clone(challengeCase),
      messages: this.listMessages(interview.id),
      extractedCase: clone(extractedCase),
      experienceRules: extractedCase
        ? this.state.experienceRules.filter(({ extractedCaseId }) => extractedCaseId === extractedCase.id).map(clone)
        : [],
    };
  }

  saveExtraction(
    interviewId: string,
    extractedDraft: ExtractedCaseDraft,
    ruleDraft: ExperienceRuleDraft,
  ): CompleteInterviewResult | undefined {
    const interview = this.state.interviews.find((item) => item.id === interviewId);
    if (!interview) return undefined;

    let extractedCase = this.state.extractedCases.find((item) => item.interviewId === interviewId);
    const timestamp = new Date().toISOString();
    if (!extractedCase) {
      extractedCase = {
        id: crypto.randomUUID(),
        interviewId,
        ...clone(extractedDraft),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.state.extractedCases.push(extractedCase);
    }

    let experienceRule = this.state.experienceRules.find(
      (item) => item.extractedCaseId === extractedCase?.id,
    );
    if (!experienceRule) {
      experienceRule = {
        id: crypto.randomUUID(),
        extractedCaseId: extractedCase.id,
        ...clone(ruleDraft),
        createdAt: timestamp,
      };
      this.state.experienceRules.push(experienceRule);
    }

    interview.status = "completed";
    interview.completedAt = interview.completedAt ?? timestamp;
    interview.updatedAt = timestamp;

    return {
      interview: clone(interview),
      extractedCase: clone(extractedCase),
      experienceRule: clone(experienceRule),
    };
  }

  getFusionCaseInputs(interviewIds: string[]) {
    return interviewIds.map((interviewId) => {
      const extractedCase = this.state.extractedCases.find((item) => item.interviewId === interviewId);
      if (!extractedCase) return null;
      return {
        interviewId,
        extractedCase: clone(extractedCase),
        rules: this.state.experienceRules
          .filter((rule) => rule.extractedCaseId === extractedCase.id)
          .map(clone),
      };
    });
  }

  createFusionJob(scenarioId: string, interviewIds: string[], result: FusionResult): FusionJob {
    const timestamp = new Date().toISOString();
    const fusionJob: FusionJob = {
      id: crypto.randomUUID(),
      scenarioId,
      selectedInterviewIds: [...interviewIds],
      status: "completed",
      result: clone(result),
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
    };
    this.state.fusionJobs.push(fusionJob);
    return clone(fusionJob);
  }

  listFusionJobs(scenarioId?: string): FusionJob[] {
    return this.state.fusionJobs
      .filter((job) => !scenarioId || job.scenarioId === scenarioId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  getFusionJob(id: string): FusionJob | undefined {
    const job = this.state.fusionJobs.find((item) => item.id === id);
    return job ? clone(job) : undefined;
  }

  createReferenceFile(fusionJobId: string, filename: string, markdownContent: string): ReferenceFile {
    const reference: ReferenceFile = {
      id: crypto.randomUUID(),
      fusionJobId,
      filename,
      markdownContent,
      createdAt: new Date().toISOString(),
    };
    this.state.referenceFiles.push(reference);
    return clone(reference);
  }

  getReferenceByFusionJob(fusionJobId: string): ReferenceFile | undefined {
    const reference = this.state.referenceFiles.find((item) => item.fusionJobId === fusionJobId);
    return reference ? clone(reference) : undefined;
  }

  getLatestReference(): ReferenceFile | undefined {
    const reference = [...this.state.referenceFiles].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    )[0];
    return reference ? clone(reference) : undefined;
  }

  getStats(): DashboardStats {
    return {
      taskCount: this.state.tasks.length,
      activeTaskCount: this.state.tasks.filter(({ status }) => status === "active").length,
      completedInterviewCount: this.state.interviews.filter(({ status }) => status === "completed").length,
      extractedCaseCount: this.state.extractedCases.length,
      experienceRuleCount: this.state.experienceRules.length,
      referenceCount: this.state.referenceFiles.length,
    };
  }

  private toScenarioWithFields(scenario: Scenario): ScenarioWithFields {
    return {
      ...clone(scenario),
      customFields: this.state.customFields
        .filter(({ scenarioId }) => scenarioId === scenario.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(clone),
    };
  }
}

const globalStore = globalThis as typeof globalThis & {
  __experienceAgentMockStore?: MockExperienceStore;
};

export const experienceStore =
  globalStore.__experienceAgentMockStore ?? new MockExperienceStore();

if (process.env.NODE_ENV !== "production") {
  globalStore.__experienceAgentMockStore = experienceStore;
}
