import type { InstitutionCode } from "./institutions";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ScenarioStatus = "draft" | "published" | "archived";
export type TaskStatus = "draft" | "active" | "closed" | "archived";
export type InterviewStatus = "in_progress" | "completed" | "abandoned";
export type FusionStatus = "pending" | "processing" | "completed" | "failed";
export type CustomFieldType = "text" | "number" | "select";
export type MessageRole = "system" | "assistant" | "user";
/** `audioTranscript` is written only after the speaker confirms an ASR result. */
export type MessageType = "text" | "audio" | "audio_transcript" | "system";
export type SpeechTranscriptStatus = "uploaded" | "transcribing" | "completed" | "failed" | "expired";
export type ChallengeCaseSource = "mock" | "ai" | "manual";
export type ParticipantAccessLinkStatus = "active" | "revoked" | "expired";

export interface CaseTemplate {
  instruction: string;
  metrics: string[];
  constraints?: string[];
}

export interface Scenario {
  id: string;
  /** Business reporting dimension selected by the sole platform administrator. */
  institutionCode: InstitutionCode | null;
  name: string;
  topic: string;
  background: string;
  objective: string;
  agentPrompt: string;
  keywords: string[];
  outputSchema: JsonObject;
  caseTemplate: CaseTemplate;
  status: ScenarioStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomField {
  id: string;
  scenarioId: string;
  fieldName: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Task {
  id: string;
  scenarioId: string;
  inviteCode: string;
  /** A URL or data URL supplied for compatibility; normally derived at render time. */
  qrCode: string | null;
  targetUser: string;
  expectedDurationMinutes: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

/** The plaintext token is deliberately never persisted; it is returned once
 * when an administrator creates a controlled no-login participant link. */
export interface ParticipantAccessLink {
  id: string;
  organizationId: string;
  taskId: string;
  status: ParticipantAccessLinkStatus;
  expiresAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  taskId: string;
  profile: JsonObject;
  createdAt: string;
}

export interface ChallengeCase {
  id: string;
  taskId: string;
  title: string;
  description: string;
  caseData: JsonObject;
  source: ChallengeCaseSource;
  createdAt: string;
}

export const INTERVIEW_STAGES = [
  "discovery",
  "judgement",
  "action",
  "result",
  "limitation",
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGES)[number];
export type InformationStatus = "missing" | "captured";

export interface InterviewExtractionState {
  discovery?: string;
  judgement?: string;
  action?: string;
  result?: string;
  limitation?: string;
  pendingStage?: InterviewStage;
  generationStatus?: "pending_review" | "failed";
  generationError?: string;
  generationMetadata?: { provider: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number };
  caseReview?: {
    status: "ai_generated" | "user_confirmed" | "user_corrected";
    originalCase: {
      title: string;
      summary: string;
      background: string;
      discovery: string;
      judgement: string;
      action: string;
      result: string;
      limitation: string;
    };
    confirmedAt?: string;
    revisions?: Array<{
      sourceMessageId: string;
      correction: string;
      changedFields: string[];
      createdAt: string;
      generationMetadata?: { provider: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number };
    }>;
  };
}

export type InformationState = Record<InterviewStage, InformationStatus>;

export interface Interview {
  id: string;
  taskId: string;
  userProfileId: string;
  challengeCaseId: string;
  status: InterviewStatus;
  extractionState: InterviewExtractionState;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  generationStatus?: "pending_review" | "failed";
  generationError?: string | null;
  generationMetadata?: JsonObject;
}

export interface Message {
  id: string;
  interviewId: string;
  role: MessageRole;
  messageType: MessageType;
  content: string;
  audioUrl: string | null;
  metadata: JsonObject;
  createdAt: string;
}

export interface SpeechTranscript {
  id: string;
  organizationId: string | null;
  userId: string | null;
  interviewId: string | null;
  storagePath: string;
  provider: string;
  model: string | null;
  status: SpeechTranscriptStatus;
  text: string | null;
  confidence: number | null;
  language: string;
  durationMs: number | null;
  consentedAt: string | null;
  expiresAt: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedCase {
  id: string;
  interviewId: string;
  title: string;
  summary: string;
  background: string;
  discovery: string;
  judgement: string;
  action: string;
  result: string;
  limitation: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceRule {
  id: string;
  extractedCaseId: string;
  condition: string;
  judgement: string;
  strategy: string;
  limitation: string;
  createdAt: string;
}

export interface FusionResult {
  strategyName: string;
  applicableScenarios: string[];
  triggerConditions: string[];
  judgements: string[];
  recommendedActions: string[];
  executionSteps: string[];
  cautions: string[];
  inapplicableConditions: string[];
  sourceInterviewIds: string[];
  conflictWarnings?: string[];
  reviewStatus?: "draft" | "pending_review";
  generationMetadata?: { provider: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number };
}

export interface FusionJob {
  id: string;
  scenarioId: string;
  selectedInterviewIds: string[];
  status: FusionStatus;
  result: FusionResult | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ReferenceFile {
  id: string;
  fusionJobId: string;
  filename: string;
  markdownContent: string;
  createdAt: string;
}

export interface ScenarioWithFields extends Scenario {
  customFields: CustomField[];
}

export interface PublicTaskDetail extends Task {
  scenario: ScenarioWithFields;
  challengeCase: ChallengeCase | null;
}

export interface InterviewSummary extends Interview {
  displayName: string;
  organization: string;
  scenarioName: string;
  messageCount: number;
  extractedCase: ExtractedCase | null;
}

export interface InterviewDetail extends Interview {
  task: Task;
  scenario: ScenarioWithFields;
  userProfile: UserProfile;
  challengeCase: ChallengeCase;
  messages: Message[];
  extractedCase: ExtractedCase | null;
  experienceRules: ExperienceRule[];
}

export interface DashboardStats {
  taskCount: number;
  activeTaskCount: number;
  completedInterviewCount: number;
  extractedCaseCount: number;
  experienceRuleCount: number;
  referenceCount: number;
}

export interface CreateScenarioInput {
  institutionCode?: InstitutionCode;
  name: string;
  topic: string;
  background: string;
  objective: string;
  agentPrompt: string;
  keywords: string[];
  outputSchema?: JsonObject;
  caseTemplate: CaseTemplate;
  customFields?: Array<{
    fieldName: string;
    fieldType: CustomFieldType;
    options?: string[];
    required: boolean;
    sortOrder: number;
  }>;
}

export interface CreateTaskInput {
  scenarioId: string;
  inviteCode?: string;
  targetUser?: string;
  expectedDurationMinutes?: number;
  status?: TaskStatus;
}

export interface StartInterviewInput {
  taskId: string;
  profile: JsonObject;
  challengeCaseId?: string;
  /** Required in Supabase mode before any participant profile is persisted. */
  privacyConsent?: boolean;
  privacyConsentVersion?: string;
}

export interface SendInterviewMessageInput {
  interviewId: string;
  content: string;
  type?: "text" | "audio" | "audio_transcript";
  audioUrl?: string;
  /** Stable client-side ID used to make retries idempotent in the Mock service. */
  clientMessageId?: string;
}

export interface InterviewAgentTurn {
  nextQuestion: string | null;
  currentStage: InterviewStage | "complete";
  informationState: InformationState;
  extractionState: InterviewExtractionState;
  isComplete: boolean;
  /** Additive LLM contract fields; existing clients can continue using isComplete. */
  shouldContinue?: boolean;
  reason?: string;
  diagnostics?: { provider: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number };
}

export interface StartInterviewResult {
  interview: Interview;
  userProfile: UserProfile;
  challengeCase: ChallengeCase;
  assistantMessage: Message;
  agent: InterviewAgentTurn;
}

export interface SendMessageResult {
  interview: Interview;
  userMessage: Message;
  assistantMessage: Message | null;
  agent: InterviewAgentTurn;
}

export interface CompleteInterviewResult {
  interview: Interview;
  extractedCase: ExtractedCase;
  experienceRule: ExperienceRule;
}

export interface CreateFusionInput {
  scenarioId: string;
  interviewIds: string[];
}

export interface CreateFusionResult {
  fusionJob: FusionJob;
  referenceFile: ReferenceFile;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    details?: JsonValue;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
