import { describe, expect, it } from "vitest";
import type { ExtractedCase, ExperienceRule, FusionResult } from "../lib/domain/types";
import { fuseExperience } from "../lib/agents/fusion-agent";
import {
  generateReferenceFilename,
  generateReferenceMarkdown,
} from "../lib/reference/markdown-generator";

function extractedCase(id: string, interviewId: string, suffix: string): ExtractedCase {
  return {
    id,
    interviewId,
    title: `案例${suffix}`,
    summary: `摘要${suffix}`,
    background: `报价率稳定但成交率下降的场景${suffix}`,
    discovery: `漏斗数据出现异常${suffix}`,
    judgement: `执行环节可能存在问题${suffix}`,
    action: `回访客户并校准触达${suffix}`,
    result: `成交率回升${suffix}`,
    limitation: `报价率同步下降时不适用${suffix}`,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

function rule(id: string, item: ExtractedCase): ExperienceRule {
  return {
    id,
    extractedCaseId: item.id,
    condition: item.discovery,
    judgement: item.judgement,
    strategy: item.action,
    limitation: item.limitation,
    createdAt: item.createdAt,
  };
}

describe("experience fusion", () => {
  it("rejects a single source and preserves provenance for multiple sources", () => {
    const first = extractedCase("case-1", "interview-00000001", "A");
    const second = extractedCase("case-2", "interview-00000002", "B");
    const base = { scenarioName: "续保萃取", scenarioTopic: "续保异常诊断" };

    expect(() =>
      fuseExperience({
        ...base,
        cases: [{ interviewId: first.interviewId, extractedCase: first, rules: [rule("rule-1", first)] }],
      }),
    ).toThrow("至少需要两条");

    const result = fuseExperience({
      ...base,
      cases: [
        { interviewId: first.interviewId, extractedCase: first, rules: [rule("rule-1", first)] },
        { interviewId: second.interviewId, extractedCase: second, rules: [rule("rule-2", second)] },
      ],
    });
    expect(result.strategyName).toBe("续保异常诊断共性策略");
    expect(result.sourceInterviewIds).toEqual(["interview-00000001", "interview-00000002"]);
    expect(result.recommendedActions).toHaveLength(2);
  });
});

describe("Reference Markdown", () => {
  const result: FusionResult = {
    strategyName: "续保/异常：诊断策略",
    applicableScenarios: ["报价率稳定、成交率下降"],
    triggerConditions: ["续保率连续两周下降"],
    judgements: ["先区分价格、执行与价值表达"],
    recommendedActions: ["拆解漏斗", "抽样回访"],
    executionSteps: ["统一口径", "验证原因"],
    cautions: ["需业务负责人复核"],
    inapplicableConditions: ["报价率同步下降"],
    sourceInterviewIds: ["60000000-0000-4000-8000-000000000001"],
  };

  it("emits every required section and anonymizes the source", () => {
    const markdown = generateReferenceMarkdown(result);

    for (const heading of [
      "## 适用场景",
      "## 触发条件",
      "## 判断逻辑",
      "## 推荐动作",
      "## 注意事项",
      "## 不适用条件",
      "## 经验来源",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("60000000…0001");
    expect(markdown).not.toContain("60000000-0000-4000-8000-000000000001");
  });

  it("creates a filesystem-safe Markdown filename", () => {
    expect(generateReferenceFilename(result.strategyName)).toBe("续保-异常：诊断策略.md");
  });
});
