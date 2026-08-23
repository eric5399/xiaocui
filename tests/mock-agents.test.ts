import { describe, expect, it } from "vitest";
import { MockCaseGeneratorAgent } from "../lib/agents/case-generator";
import {
  buildExperienceRuleDraft,
  buildExtractedCaseDraft,
  MockInterviewAgent,
} from "../lib/agents/interview-agent";

const caseInput = {
  scenario: {
    name: "续保异常萃取",
    topic: "续保率下降",
    background: "合作网点续保率下降",
    objective: "提炼诊断策略",
    keywords: ["续保率", "报价率"],
  },
  template: {
    instruction: "生成续保异常挑战",
    metrics: ["续保率", "报价率", "成交率"],
  },
  seed: "stable-seed",
};

describe("MockCaseGeneratorAgent", () => {
  it("generates the same challenge for the same seed", async () => {
    const agent = new MockCaseGeneratorAgent();
    const first = await agent.generate(caseInput);
    const second = await agent.generate(caseInput);

    expect(first).toEqual(second);
    expect(first.source).toBe("mock");
    expect(first.description).toContain("如果你负责该网点");
  });
});

describe("MockInterviewAgent", () => {
  it("advances by information gaps and skips dimensions already answered", async () => {
    const agent = new MockInterviewAgent();
    const base = {
      challengeTitle: "核心网点续保转化异常",
      challengeDescription: "续保率下降，报价率正常。",
      conversationHistory: [],
    };

    const start = await agent.start({ ...base, extractionState: {} });
    expect(start.currentStage).toBe("discovery");

    const discovery = await agent.reply({
      ...base,
      extractionState: start.extractionState,
      userMessage: "我从报价到成交漏斗的数据对比中发现异常。",
    });
    expect(discovery.informationState.discovery).toBe("captured");
    expect(discovery.currentStage).toBe("judgement");
    expect(discovery.nextQuestion).toContain("你刚才提到");

    const judgementAndAction = await agent.reply({
      ...base,
      extractionState: discovery.extractionState,
      userMessage: "因为报价率没有变，我判断不是价格问题；我会先回访流失客户并与店总沟通。",
    });
    expect(judgementAndAction.informationState.judgement).toBe("captured");
    expect(judgementAndAction.informationState.action).toBe("captured");
    expect(judgementAndAction.currentStage).toBe("result");

    const result = await agent.reply({
      ...base,
      extractionState: judgementAndAction.extractionState,
      userMessage: "两周后成交率回升了 9 个百分点。",
    });
    expect(result.currentStage).toBe("limitation");

    const limitation = await agent.reply({
      ...base,
      extractionState: result.extractionState,
      userMessage: "如果报价率也同步下降，这套做法不适用，要先排查价格和系统。",
    });
    expect(limitation.currentStage).toBe("complete");
    expect(limitation.isComplete).toBe(true);
    expect(limitation.nextQuestion).toBeNull();

    const extracted = buildExtractedCaseDraft(
      base.challengeTitle,
      base.challengeDescription,
      limitation.extractionState,
    );
    const rule = buildExperienceRuleDraft(extracted);
    expect(extracted.summary).toContain("报价率");
    expect(rule.strategy).toContain("回访");
    expect(rule.limitation).toContain("不适用");
  });
});
