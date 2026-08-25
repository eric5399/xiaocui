export type InterviewDimension =
  | "discovery"
  | "judgement"
  | "action"
  | "result"
  | "boundary";

export type CoverageLevel = 0 | 1 | 2;

export type InterviewCoverage = Record<InterviewDimension, CoverageLevel>;

export type H5ProgressStatus =
  | "new"
  | "profile"
  | "challenge"
  | "interview"
  | "submitted";

export type ParticipantProfile = {
  name: string;
  organization: string;
  role: string;
  years: string;
  networkCount: string;
} & Record<string, string>;

export type ChatMessage = {
  id: string;
  role: "agent" | "user";
  content: string;
  createdAt: string;
  target?: InterviewDimension;
};

export type ApiChallengeSummary = {
  title: string;
  description: string;
};

export type ApiExtractedCaseSummary = {
  title: string;
  summary: string;
  background: string;
  discovery: string;
  judgement: string;
  action: string;
  result: string;
  limitation: string;
};

export type H5Progress = {
  version: 1;
  inviteCode: string;
  privacyAccepted: boolean;
  status: H5ProgressStatus;
  profile: ParticipantProfile;
  messages: ChatMessage[];
  coverage: InterviewCoverage;
  draft: string;
  lastSavedAt: string | null;
  completedAt: string | null;
  apiInterviewId: string | null;
  apiChallenge: ApiChallengeSummary | null;
  apiExtractedCase: ApiExtractedCaseSummary | null;
  caseReviewStatus: "ai_generated" | "user_confirmed" | "user_corrected";
  caseReviewConfirmed: boolean;
  apiSyncState: "local" | "syncing" | "synced" | "failed";
  apiError: string | null;
};
