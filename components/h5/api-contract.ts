import type {
  InterviewCoverage,
  InterviewDimension,
} from "./types";

export type ApiInterviewStage =
  | "discovery"
  | "judgement"
  | "action"
  | "result"
  | "limitation"
  | "complete";

export type ApiInformationState = Partial<
  Record<Exclude<ApiInterviewStage, "complete">, "missing" | "captured">
>;

export function mapApiStage(
  stage: string,
): InterviewDimension | undefined {
  if (stage === "limitation") return "boundary";
  if (["discovery", "judgement", "action", "result"].includes(stage)) {
    return stage as InterviewDimension;
  }
  return undefined;
}

/** API-confirmed dimensions are authoritative; local partial progress is retained. */
export function mergeApiCoverage(
  current: InterviewCoverage,
  informationState?: ApiInformationState,
): InterviewCoverage {
  if (!informationState) return current;
  const next = { ...current };
  const mapping: Array<
    [keyof ApiInformationState, InterviewDimension]
  > = [
    ["discovery", "discovery"],
    ["judgement", "judgement"],
    ["action", "action"],
    ["result", "result"],
    ["limitation", "boundary"],
  ];

  for (const [apiKey, localKey] of mapping) {
    if (informationState[apiKey] === "captured") next[localKey] = 2;
  }
  return next;
}
