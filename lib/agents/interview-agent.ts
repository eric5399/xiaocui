import {
  INTERVIEW_STAGES,
  type InformationState,
  type InterviewAgentTurn,
  type InterviewExtractionState,
  type InterviewStage,
} from "@/lib/domain";
import { z } from "zod";
import { createConfiguredLlmGateway } from "@/lib/llm/llm-gateway";
import { loadPrompt } from "@/lib/llm/prompt-loader";
import type {
  ExperienceRuleDraft,
  ExtractedCaseDraft,
  InterviewAgent,
  InterviewAgentInput,
} from "./contracts";

const SIGNALS: Record<InterviewStage, RegExp> = {
  discovery: /(发现|观察到|数据|信号|漏斗|对比|异常|注意到|看出)/,
  judgement: /(因为|所以|判断|依据|原因|说明|认为|意味着|排除)/,
  action: /(采取|动作|然后|沟通|回访|建立|调整|推动|安排|跟进|处理|我会|我们会|具体做)/,
  result: /(结果|效果|回升|提升(?:了|到)|下降(?:了|到)|改善|百分点|验证(?:了|后)|最终)/,
  limitation: /(如果|除非|不适用|前提|边界|情况下|不能|例外|但当)/,
};

function cleanAnswer(answer: string): string {
  return answer.replace(/\s+/g, " ").trim();
}

function excerpt(answer: string, length = 28): string {
  const cleaned = cleanAnswer(answer);
  return cleaned.length <= length ? cleaned : `${cleaned.slice(0, length)}…`;
}

export function getInformationState(state: InterviewExtractionState): InformationState {
  return Object.fromEntries(
    INTERVIEW_STAGES.map((stage) => [stage, state[stage]?.trim() ? "captured" : "missing"]),
  ) as InformationState;
}

export function getNextMissingStage(state: InterviewExtractionState): InterviewStage | null {
  return INTERVIEW_STAGES.find((stage) => !state[stage]?.trim()) ?? null;
}

export function captureInterviewAnswer(
  current: InterviewExtractionState,
  rawAnswer: string,
): InterviewExtractionState {
  const answer = cleanAnswer(rawAnswer);
  if (!answer) return { ...current };

  const next: InterviewExtractionState = { ...current };
  const sentences = answer
    .split(/[。！？；;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const matchingSentence = (stage: InterviewStage) =>
    sentences.find((sentence) => SIGNALS[stage].test(sentence));
  const matchedStages = INTERVIEW_STAGES.filter((stage) => Boolean(matchingSentence(stage)));

  // The pending stage represents the question the user is answering. Signals can
  // additionally satisfy other dimensions, allowing the path to skip redundant questions.
  const stagesToCapture = new Set<InterviewStage>(matchedStages);
  if (current.pendingStage) stagesToCapture.add(current.pendingStage);
  if (stagesToCapture.size === 0) {
    const firstMissing = getNextMissingStage(current);
    if (firstMissing) stagesToCapture.add(firstMissing);
  }

  for (const stage of stagesToCapture) {
    if (!next[stage]) next[stage] = matchingSentence(stage) ?? answer;
  }

  return next;
}

function buildQuestion(
  stage: InterviewStage,
  input: Pick<InterviewAgentInput, "challengeTitle" | "extractionState" | "userMessage">,
): string {
  const answerReference = input.userMessage ? `你刚才提到“${excerpt(input.userMessage)}”。` : "";

  switch (stage) {
    case "discovery":
      return `${answerReference}面对“${input.challengeTitle}”，你最先从哪个数据、客户反馈或现场信号发现问题？`;
    case "judgement":
      return `${answerReference}是什么依据让你作出这个判断？当时排除了哪些其他可能？`;
    case "action":
      return `${answerReference}基于这个判断，你会先做哪一步，具体找谁、怎么做，为什么按这个顺序？`;
    case "result":
      return `${answerReference}你会用什么指标和时间窗口验证动作有效？如果是过往经历，结果有什么变化？`;
    case "limitation":
      return `${answerReference}这套方法成立需要哪些前提？出现什么情况时不适用或必须换一种做法？`;
  }
}

function toTurn(
  state: InterviewExtractionState,
  input: Pick<InterviewAgentInput, "challengeTitle" | "userMessage">,
): InterviewAgentTurn {
  const nextStage = getNextMissingStage(state);
  const extractionState: InterviewExtractionState = {
    ...state,
    pendingStage: nextStage ?? undefined,
  };

  return {
    nextQuestion: nextStage ? buildQuestion(nextStage, { ...input, extractionState }) : null,
    currentStage: nextStage ?? "complete",
    informationState: getInformationState(extractionState),
    extractionState,
    isComplete: nextStage === null,
  };
}

export class MockInterviewAgent implements InterviewAgent {
  async start(input: Omit<InterviewAgentInput, "userMessage">): Promise<InterviewAgentTurn> {
    return toTurn(input.extractionState, { challengeTitle: input.challengeTitle });
  }

  async reply(input: InterviewAgentInput & { userMessage: string }): Promise<InterviewAgentTurn> {
    const extractionState = captureInterviewAnswer(input.extractionState, input.userMessage);
    return toTurn(extractionState, {
      challengeTitle: input.challengeTitle,
      userMessage: input.userMessage,
    });
  }
}

const interviewReplySchema = z.object({
  nextQuestion: z.string().trim().min(1).max(1000).nullable(),
  currentStage: z.enum(["discovery", "judgement", "action", "result", "limitation", "complete"]),
  informationState: z.object({ discovery: z.enum(["missing", "captured"]), judgement: z.enum(["missing", "captured"]), action: z.enum(["missing", "captured"]), result: z.enum(["missing", "captured"]), limitation: z.enum(["missing", "captured"]) }),
  shouldContinue: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

/** Dynamic stage selection remains deterministic; the model only phrases one validated follow-up. */
export class GatewayInterviewAgent implements InterviewAgent {
  constructor(private readonly fallback = new MockInterviewAgent()) {}
  async start(input: Omit<InterviewAgentInput, "userMessage">): Promise<InterviewAgentTurn> {
    return this.ask(input, input.extractionState);
  }
  async reply(input: InterviewAgentInput & { userMessage: string }): Promise<InterviewAgentTurn> {
    return this.ask(input, captureInterviewAnswer(input.extractionState, input.userMessage));
  }
  private async ask(input: Omit<InterviewAgentInput, "userMessage"> & { userMessage?: string }, state: InterviewExtractionState): Promise<InterviewAgentTurn> {
    const deterministic = toTurn(state, { challengeTitle: input.challengeTitle, userMessage: input.userMessage });
    const gateway = createConfiguredLlmGateway();
    if (gateway.getProviderName() === "mock") return deterministic;
    if (deterministic.isComplete) return { ...deterministic, shouldContinue: false, reason: "核心萃取维度已覆盖。" };
    const prompt = await loadPrompt("interview-agent");
    const history = input.conversationHistory.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 1200) }));
    const { data, response } = await gateway.generateStructured(interviewReplySchema, {
      messages: [
        { role: "system", content: `${prompt}\n仅输出 JSON。只能针对 currentStage 追问一次；不得重复历史 assistant 问题；不得输出个人姓名或机构。` },
        { role: "user", content: JSON.stringify({ challenge: { title: input.challengeTitle, description: input.challengeDescription }, currentStage: deterministic.currentStage, informationState: deterministic.informationState, conversationHistory: history, lastAnswer: input.userMessage ?? null }) },
      ], temperature: Number(process.env.LLM_TEMPERATURE ?? 0.3), maxTokens: 700,
    });
    const alreadyAsked = new Set(input.conversationHistory.filter((message) => message.role === "assistant").map((message) => message.content.replace(/\s+/g, " ").trim()));
    const safeQuestion = data.shouldContinue && data.nextQuestion && !alreadyAsked.has(data.nextQuestion.replace(/\s+/g, " ").trim()) ? data.nextQuestion : deterministic.nextQuestion;
    return { ...deterministic, nextQuestion: safeQuestion, shouldContinue: !deterministic.isComplete, reason: data.reason, diagnostics: { provider: response.provider, model: response.model, latencyMs: response.latencyMs, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } };
  }
}

const UNKNOWN = "本次访谈未形成足够证据，需人工复核。";

export function buildExtractedCaseDraft(
  challengeTitle: string,
  challengeDescription: string,
  state: InterviewExtractionState,
): ExtractedCaseDraft {
  const discovery = state.discovery ?? UNKNOWN;
  const judgement = state.judgement ?? UNKNOWN;
  const action = state.action ?? UNKNOWN;
  const result = state.result ?? UNKNOWN;
  const limitation = state.limitation ?? UNKNOWN;

  return {
    title: `${challengeTitle}的一线处置经验`,
    summary: `${excerpt(judgement, 48)}；${excerpt(action, 48)}`,
    background: challengeDescription,
    discovery,
    judgement,
    action,
    result,
    limitation,
  };
}

export function buildExperienceRuleDraft(extractedCase: ExtractedCaseDraft): ExperienceRuleDraft {
  return {
    condition: extractedCase.discovery,
    judgement: extractedCase.judgement,
    strategy: extractedCase.action,
    limitation: extractedCase.limitation,
  };
}

export const interviewAgent: InterviewAgent = new GatewayInterviewAgent();
