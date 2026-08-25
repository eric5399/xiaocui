import { describe, expect, it } from "vitest";
import { MockCaseGeneratorAgent } from "../lib/agents/case-generator";
import {
  buildExperienceRuleDraft,
  buildExtractedCaseDraft,
  isConciseUserFacingQuestion,
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
    expect(discovery.nextQuestion).toBeTruthy();
    expect(isConciseUserFacingQuestion(discovery.nextQuestion!)).toBe(true);

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
    expect(result.nextQuestion).toContain("什么情况");
    expect(result.nextQuestion).toContain("失效");

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

    const userFacingQuestions = [
      start.nextQuestion,
      discovery.nextQuestion,
      judgementAndAction.nextQuestion,
      result.nextQuestion,
    ].filter((question): question is string => Boolean(question));
    expect(userFacingQuestions.every(isConciseUserFacingQuestion)).toBe(true);

    const legacyQuestions = [
      "面对“核心网点续保转化异常”，你最先从哪个数据、客户反馈或现场信号发现问题？",
      "你刚才提到“我从报价到成交漏斗的数据对比中发现异常。”。是什么依据让你作出这个判断？当时排除了哪些其他可能？",
      "你刚才提到“因为报价率没有变，我判断不是价格问题；我会先回访流…”。你会用什么指标和时间窗口验证动作有效？如果是过往经历，结果有什么变化？",
      "你刚才提到“两周后成交率回升了 9 个百分点。”。这套方法成立需要哪些前提？出现什么情况时不适用或必须换一种做法？",
    ];
    const averageLength = (questions: string[]) =>
      questions.reduce((total, question) => total + question.length, 0) /
      questions.length;
    expect(averageLength(userFacingQuestions)).toBeLessThan(
      averageLength(legacyQuestions) * 0.75,
    );
  });

  it("不会因普通或极短回答提前结束", async () => {
    const agent = new MockInterviewAgent();
    const base = {
      challengeTitle: "网点续保异常",
      challengeDescription: "续保率下降。",
      conversationHistory: [],
    };
    const start = await agent.start({ ...base, extractionState: {} });
    const veryShort = await agent.reply({
      ...base,
      extractionState: start.extractionState,
      userMessage: "先看数据。",
    });
    expect(veryShort.isComplete).toBe(false);
    expect(veryShort.currentStage).toBe("judgement");

    const ordinary = await agent.reply({
      ...base,
      extractionState: veryShort.extractionState,
      userMessage: "因为成交比之前低，我判断要先回访客户。",
    });
    expect(ordinary.isComplete).toBe(false);
    expect(ordinary.currentStage).toBe("result");
    expect(ordinary.informationState.result).toBe("missing");
    expect(ordinary.informationState.limitation).toBe("missing");
  });

  it("rejects multi-question and internal-state language", () => {
    expect(isConciseUserFacingQuestion("你为什么这样判断？后来又做了什么？")).toBe(false);
    expect(isConciseUserFacingQuestion("当前阶段缺少 missing_fields，请补充判断依据？")).toBe(false);
    expect(isConciseUserFacingQuestion("哪个信号让你确定需要介入？")).toBe(true);
  });
});
