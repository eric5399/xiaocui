import type { FusionResult } from "@/lib/domain";
import { z } from "zod";
import { createConfiguredLlmGateway } from "@/lib/llm/llm-gateway";
import { loadPrompt } from "@/lib/llm/prompt-loader";
import type { FusionAgent, FusionAgentInput } from "./contracts";

function normalizedUnique(values: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function fuseExperience(input: FusionAgentInput): FusionResult {
  if (input.cases.length < 2) {
    throw new Error("经验融合至少需要两条已完成访谈");
  }

  const conditions = input.cases.flatMap(({ rules, extractedCase }) =>
    rules.length > 0 ? rules.map((rule) => rule.condition) : [extractedCase.discovery],
  );
  const judgements = input.cases.flatMap(({ rules, extractedCase }) =>
    rules.length > 0 ? rules.map((rule) => rule.judgement) : [extractedCase.judgement],
  );
  const actions = input.cases.flatMap(({ rules, extractedCase }) =>
    rules.length > 0 ? rules.map((rule) => rule.strategy) : [extractedCase.action],
  );
  const limitations = input.cases.flatMap(({ rules, extractedCase }) =>
    rules.length > 0 ? rules.map((rule) => rule.limitation) : [extractedCase.limitation],
  );

  return {
    strategyName: `${input.scenarioTopic}共性策略`,
    applicableScenarios: normalizedUnique(input.cases.map(({ extractedCase }) => extractedCase.background), 5),
    triggerConditions: normalizedUnique(conditions),
    judgements: normalizedUnique(judgements),
    recommendedActions: normalizedUnique(actions),
    executionSteps: [
      "统一指标口径并确认异常是否持续",
      "拆解业务漏斗，定位最先出现偏差的环节",
      "结合客户反馈和现场信息验证关键判断",
      "优先对内部可控变量执行小范围干预",
      "在约定时间窗口复盘效果并沉淀边界条件",
    ],
    cautions: [
      "共性策略来自有限访谈样本，推广前需由业务负责人复核。",
      "保留不同受访者的差异，不把相关性直接解释为因果关系。",
    ],
    inapplicableConditions: normalizedUnique(limitations),
    sourceInterviewIds: input.cases.map(({ interviewId }) => interviewId),
  };
}

export class MockFusionAgent implements FusionAgent {
  async fuse(input: FusionAgentInput): Promise<FusionResult> {
    return fuseExperience(input);
  }
}

const fusionSchema = z.object({
  strategyName: z.string().trim().min(1).max(200),
  applicableScenarios: z.array(z.string().trim().min(1)).min(1).max(8), triggerConditions: z.array(z.string().trim().min(1)).min(1).max(8),
  judgements: z.array(z.string().trim().min(1)).min(1).max(8), recommendedActions: z.array(z.string().trim().min(1)).min(1).max(8),
  executionSteps: z.array(z.string().trim().min(1)).min(1).max(8), cautions: z.array(z.string().trim().min(1)).min(1).max(8),
  inapplicableConditions: z.array(z.string().trim().min(1)).min(1).max(8), conflictWarnings: z.array(z.string().trim().min(1)).max(8).default([]),
});
export class GatewayFusionAgent implements FusionAgent {
  constructor(private readonly fallback = new MockFusionAgent()) {}
  async fuse(input: FusionAgentInput): Promise<FusionResult> {
    const gateway = createConfiguredLlmGateway();
    if (gateway.getProviderName() === "mock") return this.fallback.fuse(input);
    const prompt = await loadPrompt("fusion-agent");
    const outputContract = {
      strategyName: "string",
      applicableScenarios: ["string"],
      triggerConditions: ["string"],
      judgements: ["string"],
      recommendedActions: ["string"],
      executionSteps: ["string"],
      cautions: ["string"],
      inapplicableConditions: ["string"],
      conflictWarnings: ["string"],
    };
    const { data, response } = await gateway.generateStructured(fusionSchema, {
      messages: [
        {
          role: "system",
          content: `${prompt}\n输出仅为 draft/pending_review，不得声称已证实机构共性结论。只输出一个 JSON object，不要 Markdown。字段必须完整、名称必须完全一致；每个数组至少放入一条基于输入的非空字符串。JSON 结构：\n${JSON.stringify(outputContract)}`,
        },
        { role: "user", content: JSON.stringify({ scenarioName: input.scenarioName, scenarioTopic: input.scenarioTopic, cases: input.cases.map((item) => ({ interviewId: item.interviewId, extractedCase: item.extractedCase, rules: item.rules })) }) },
      ], temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2), maxTokens: 2200,
    });
    return { ...data, sourceInterviewIds: input.cases.map((item) => item.interviewId), reviewStatus: "pending_review", generationMetadata: { provider: response.provider, model: response.model, latencyMs: response.latencyMs, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } };
  }
}
export const fusionAgent: FusionAgent = new GatewayFusionAgent();
