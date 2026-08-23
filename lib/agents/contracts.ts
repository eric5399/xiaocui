import type {
  CaseTemplate,
  ChallengeCaseSource,
  ExtractedCase,
  ExperienceRule,
  FusionResult,
  InterviewAgentTurn,
  InterviewExtractionState,
  JsonObject,
  Message,
  Scenario,
} from "@/lib/domain";

export interface GeneratedChallengeCase {
  title: string;
  description: string;
  caseData: JsonObject;
  source: ChallengeCaseSource;
}

export interface CaseGeneratorInput {
  scenario: Pick<Scenario, "name" | "topic" | "background" | "objective" | "keywords">;
  template: CaseTemplate;
  seed?: string;
}

export interface CaseGeneratorAgent {
  generate(input: CaseGeneratorInput): Promise<GeneratedChallengeCase>;
}

export interface InterviewAgentInput {
  challengeTitle: string;
  challengeDescription: string;
  extractionState: InterviewExtractionState;
  conversationHistory: Message[];
  userMessage?: string;
}

export interface InterviewAgent {
  start(input: Omit<InterviewAgentInput, "userMessage">): Promise<InterviewAgentTurn>;
  reply(input: InterviewAgentInput & { userMessage: string }): Promise<InterviewAgentTurn>;
}

export type ExtractedCaseDraft = Omit<ExtractedCase, "id" | "interviewId" | "createdAt" | "updatedAt">;
export type ExperienceRuleDraft = Omit<ExperienceRule, "id" | "extractedCaseId" | "createdAt">;

export interface FusionCaseInput {
  interviewId: string;
  extractedCase: ExtractedCase;
  rules: ExperienceRule[];
}

export interface FusionAgentInput {
  scenarioName: string;
  scenarioTopic: string;
  cases: FusionCaseInput[];
}

export interface FusionAgent {
  fuse(input: FusionAgentInput): Promise<FusionResult>;
}
