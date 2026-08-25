import { z } from "zod";
import { createConfiguredLlmGateway } from "@/lib/llm/llm-gateway";
import { loadPrompt } from "@/lib/llm/prompt-loader";
import type { JsonObject } from "@/lib/domain";
import type { CaseGeneratorAgent, CaseGeneratorInput, ExtractedCaseDraft, GeneratedChallengeCase } from "./contracts";

const OUTLET_TYPES = ["核心 4S 店", "区域直营网点", "重点合作网点"] as const;
const COMPETITOR_MOVES = ["增加驻店活动", "上线限时权益包", "强化客户提前触达"] as const;

function stableIndex(seed: string, length: number): number {
  let value = 0;
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % length;
}

/** Deterministic provider used until a real LLM provider is connected. */
export class MockCaseGeneratorAgent implements CaseGeneratorAgent {
  async generate(input: CaseGeneratorInput): Promise<GeneratedChallengeCase> {
    const seed = input.seed ?? `${input.scenario.name}:${input.template.instruction}`;
    const outletType = OUTLET_TYPES[stableIndex(seed, OUTLET_TYPES.length)];
    const competitorActivity = COMPETITOR_MOVES[stableIndex(`${seed}:competitor`, COMPETITOR_MOVES.length)];
    const before = 70 + stableIndex(`${seed}:before`, 7);
    const decrease = 11 + stableIndex(`${seed}:decrease`, 8);
    const now = before - decrease;
    const conversionChange = -(8 + stableIndex(`${seed}:conversion`, 9));

    return {
      title: `${outletType}续保转化异常`,
      description: [
        `某${outletType}与机构合作三年，近一个月续保率由 ${before}% 降至 ${now}%。`,
        `报价率保持正常，成交率下降 ${Math.abs(conversionChange)}%，同期竞品${competitorActivity}。`,
        "如果你负责该网点，你会如何分析并处理？",
      ].join(""),
      caseData: {
        outletType,
        cooperationYears: 3,
        renewalRateBefore: before,
        renewalRateNow: now,
        quoteRate: "正常",
        conversionChange,
        competitorActivity,
        configuredMetrics: input.template.metrics.join("、"),
      },
      source: "mock",
    };
  }
}

const challengeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(3000),
  caseData: z.record(z.string(), z.unknown()),
});

/** Uses the Gateway only; no model SDK or API Route is coupled to a provider. */
export class GatewayCaseGeneratorAgent implements CaseGeneratorAgent {
  constructor(private readonly fallback = new MockCaseGeneratorAgent()) {}
  async generate(input: CaseGeneratorInput): Promise<GeneratedChallengeCase> {
    const gateway = createConfiguredLlmGateway();
    if (gateway.getProviderName() === "mock") return this.fallback.generate(input);
    const prompt = await loadPrompt("case-generator");
    const { data, response } = await gateway.generateStructured(challengeSchema, {
      messages: [
        { role: "system", content: `${prompt}\n只输出 JSON，不得包含 Markdown。` },
        { role: "user", content: JSON.stringify({ scenario: input.scenario, template: input.template, seed: input.seed ?? null }) },
      ],
      temperature: Number(process.env.LLM_TEMPERATURE ?? 0.4), maxTokens: 1200,
    });
    return { ...data, caseData: { ...data.caseData, generationProvider: response.provider, generationModel: response.model, generationLatencyMs: response.latencyMs, generationInputTokens: response.usage.inputTokens, generationOutputTokens: response.usage.outputTokens } as JsonObject, source: "ai" };
  }
}

export const caseGeneratorAgent: CaseGeneratorAgent = new GatewayCaseGeneratorAgent();

const extractedCaseSchema = z.object({
  title: z.string().trim().min(1).max(180), summary: z.string().trim().min(1).max(1000),
  background: z.string().trim().min(1).max(5000), discovery: z.string().trim().min(1).max(5000),
  judgement: z.string().trim().min(1).max(5000), action: z.string().trim().min(1).max(5000),
  result: z.string().trim().min(1).max(5000), limitation: z.string().trim().min(1).max(5000),
});

const correctedCaseSchema = z.object({
  revisedCase: extractedCaseSchema,
  changedFields: z.array(z.enum(["title", "summary", "background", "discovery", "judgement", "action", "result", "limitation"])).min(1),
});

function reviseCaseDeterministically(
  current: ExtractedCaseDraft,
  correction: string,
): { draft: ExtractedCaseDraft; changedFields: string[]; diagnostics: null } {
  const revised = { ...current };
  const changedFields = new Set<string>();
  const setField = (field: keyof ExtractedCaseDraft) => {
    revised[field] = correction;
    changedFields.add(field);
  };

  if (/(怎么做|动作|步骤|先|调整|沟通|回访)/.test(correction)) setField("action");
  else if (/(结果|效果|提升|下降|恢复|改善|百分点)/.test(correction)) setField("result");
  else if (/(不适用|边界|失效|例外|前提|风险)/.test(correction)) setField("limitation");
  else if (/(发现|信号|数据|异常|场景|问题)/.test(correction)) setField("discovery");
  else setField("judgement");

  revised.summary = `${revised.judgement.replace(/[。；;]+$/, "")}；${revised.action}`.slice(0, 1000);
  changedFields.add("summary");
  return { draft: revised, changedFields: [...changedFields], diagnostics: null };
}

/** Case review is a derived-asset revision; it never rewrites interview messages. */
export async function reviseExtractedCaseWithGateway(input: {
  current: ExtractedCaseDraft;
  correction: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<{
  draft: ExtractedCaseDraft;
  changedFields: string[];
  diagnostics: { provider: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number } | null;
}> {
  let gateway;
  try {
    gateway = createConfiguredLlmGateway();
  } catch {
    return reviseCaseDeterministically(input.current, input.correction);
  }
  if (gateway.getProviderName() === "mock") {
    return reviseCaseDeterministically(input.current, input.correction);
  }
  try {
    const { data, response } = await gateway.generateStructured(correctedCaseSchema, {
      messages: [
        {
          role: "system",
          content: "你负责根据受访者的纠错修订已生成的经验案例。用户纠错是修订依据；只修改受影响字段，其他字段必须保留。summary 必须同步，不得删减字段、不得杜撰。只输出 JSON。",
        },
        {
          role: "user",
          content: JSON.stringify({
            currentCase: input.current,
            correction: input.correction,
            sourceMessages: input.messages.slice(-20).map((message) => ({
              role: message.role,
              content: message.content.slice(0, 1500),
            })),
          }),
        },
      ],
      temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
      maxTokens: 1800,
    });
    return {
      draft: data.revisedCase,
      changedFields: [...new Set([...data.changedFields, "summary"])],
      diagnostics: {
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    };
  } catch {
    // A correction should remain usable during an LLM outage. The deterministic
    // fallback changes one evidence field plus summary and preserves all others.
    return reviseCaseDeterministically(input.current, input.correction);
  }
}

export async function generateExtractedCaseWithGateway(input: { challengeTitle: string; challengeDescription: string; extractionState: unknown; messages: Array<{ role: string; content: string }> }): Promise<{ draft: ExtractedCaseDraft; diagnostics: { provider: string; model: string; latencyMs: number; inputTokens: number; outputTokens: number } } | null> {
  const gateway = createConfiguredLlmGateway();
  if (gateway.getProviderName() === "mock") return null;
  const prompt = await loadPrompt("case-generator");
  const { data, response } = await gateway.generateStructured(extractedCaseSchema, {
    messages: [
      { role: "system", content: `${prompt}\n基于访谈内容生成待审核的个人经验案例。只输出 JSON，缺少证据时写“证据不足，待人工复核”，不得杜撰。` },
      { role: "user", content: JSON.stringify({ challenge: { title: input.challengeTitle, description: input.challengeDescription }, extractionState: input.extractionState, messages: input.messages.slice(-20).map((message) => ({ role: message.role, content: message.content.slice(0, 1500) })) }) },
    ], temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2), maxTokens: 1800,
  });
  return { draft: data, diagnostics: { provider: response.provider, model: response.model, latencyMs: response.latencyMs, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } };
}
