import type {
  ChallengeCase,
  CompleteInterviewResult,
  CreateScenarioInput,
  CreateTaskInput,
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
  ScenarioWithFields,
  Task,
  UserProfile,
} from "@/lib/domain";
import type {
  ExperienceRuleDraft,
  ExtractedCaseDraft,
  GeneratedChallengeCase,
} from "@/lib/agents/contracts";

/** A value that can be returned synchronously by the in-process demo store. */
export type MaybePromise<T> = T | Promise<T>;

export type InterviewFilters = {
  taskId?: string;
  scenarioId?: string;
  status?: InterviewStatus;
};

export type SaveCaseReviewInput = {
  extractionState: InterviewExtractionState;
  extractedDraft?: ExtractedCaseDraft;
  ruleDraft?: ExperienceRuleDraft;
  correctionMessage?: {
    content: string;
    clientMessageId?: string;
    changedFields: string[];
  };
};

/**
 * The sole persistence boundary used by business services. Implementations may
 * be in-memory (demo) or PostgreSQL/Supabase (server-side persistence).
 */
export interface ExperienceRepository {
  readonly providerName: "mock" | "supabase";
  listScenarios(): MaybePromise<ScenarioWithFields[]>;
  getScenario(id: string): MaybePromise<ScenarioWithFields | undefined>;
  createScenario(input: CreateScenarioInput): MaybePromise<ScenarioWithFields>;
  listTasks(): MaybePromise<Array<Task & { scenarioName: string; completedInterviewCount: number }>>;
  getTask(id: string): MaybePromise<Task | undefined>;
  getPublicTaskByInviteCode(inviteCode: string): MaybePromise<PublicTaskDetail | undefined>;
  createTask(input: Required<Omit<CreateTaskInput, "inviteCode">> & { inviteCode: string }): MaybePromise<Task>;
  createParticipantAccessLink(taskId: string, tokenHash: string, expiresAt: string): MaybePromise<ParticipantAccessLink>;
  revokeParticipantAccessLink(taskId: string, accessLinkId: string): MaybePromise<ParticipantAccessLink | undefined>;
  listInviteCodes(): MaybePromise<string[]>;
  listChallengesForTask(taskId: string): MaybePromise<ChallengeCase[]>;
  getChallenge(id: string): MaybePromise<ChallengeCase | undefined>;
  createChallenge(taskId: string, generated: GeneratedChallengeCase): MaybePromise<ChallengeCase>;
  createUserProfile(taskId: string, profile: JsonObject): MaybePromise<UserProfile>;
  createInterview(
    taskId: string,
    userProfileId: string,
    challengeCaseId: string,
    extractionState: InterviewExtractionState,
  ): MaybePromise<Interview>;
  updateInterviewState(id: string, extractionState: InterviewExtractionState): MaybePromise<Interview | undefined>;
  addMessage(
    interviewId: string,
    input: Pick<Message, "role" | "messageType" | "content" | "audioUrl"> & Partial<Pick<Message, "metadata">>,
  ): MaybePromise<Message>;
  findMessageByClientMessageId(interviewId: string, clientMessageId: string): MaybePromise<Message | undefined>;
  listMessages(interviewId: string): MaybePromise<Message[]>;
  listInterviews(filters?: InterviewFilters): MaybePromise<InterviewSummary[]>;
  getInterviewDetail(id: string): MaybePromise<InterviewDetail | undefined>;
  saveExtraction(
    interviewId: string,
    extractedDraft: ExtractedCaseDraft,
    ruleDraft: ExperienceRuleDraft,
  ): MaybePromise<CompleteInterviewResult | undefined>;
  saveCaseReview(
    interviewId: string,
    input: SaveCaseReviewInput,
  ): MaybePromise<CompleteInterviewResult | undefined>;
  getFusionCaseInputs(interviewIds: string[]): MaybePromise<Array<{
    interviewId: string;
    extractedCase: ExtractedCase;
    rules: ExperienceRule[];
  } | null>>;
  createFusionJob(scenarioId: string, interviewIds: string[], result: FusionResult): MaybePromise<FusionJob>;
  listFusionJobs(scenarioId?: string): MaybePromise<FusionJob[]>;
  getFusionJob(id: string): MaybePromise<FusionJob | undefined>;
  createReferenceFile(fusionJobId: string, filename: string, markdownContent: string): MaybePromise<ReferenceFile>;
  getReferenceByFusionJob(fusionJobId: string): MaybePromise<ReferenceFile | undefined>;
  getLatestReference(): MaybePromise<ReferenceFile | undefined>;
  getStats(): MaybePromise<DashboardStats>;
}
