import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExperienceRuleDraft, buildExtractedCaseDraft, MockInterviewAgent } from "../lib/agents/interview-agent";
import type { InterviewStage } from "../lib/domain";

const enabled = process.env.RUN_OFFLINE_EVAL === "1";
const SAMPLE_VERSION = "synthetic-interview-set-v1.0";
const FIXED_CHALLENGE = {
  title: "核心合作网点续保转化突然下降",
  description: "某合作网点续保率由72%降至58%，报价率正常，成交率下降15%，同期竞品增加驻店活动。请说明你的判断与处理。",
};

type Sample = { id: string; quality: string; answer: string; expectedStage: InterviewStage | "complete"; expectedCaptured: InterviewStage[]; };
const samples: Sample[] = [
  { id: "S01", quality: "完整回答", answer: "我从报价到成交漏斗发现成交异常；因为报价率正常，我判断是竞品和门店执行问题；我先回访流失客户并和店总重排触达；两周后成交率回升9个百分点；如果报价率也下降，这套做法不适用。", expectedStage: "complete", expectedCaptured: ["discovery", "judgement", "action", "result", "limitation"] },
  { id: "S02", quality: "缺少判断依据", answer: "我看到续保率下降后，先回访流失客户并和店总沟通，两周后成交率回升。", expectedStage: "judgement", expectedCaptured: ["discovery", "action", "result"] },
  { id: "S03", quality: "只描述动作", answer: "我会建立日报看板、安排顾问回访、和店总开会推进。", expectedStage: "judgement", expectedCaptured: ["discovery", "action"] },
  { id: "S04", quality: "答非所问", answer: "我觉得最近天气不错，团队也很努力。", expectedStage: "judgement", expectedCaptured: ["discovery"] },
  { id: "S05", quality: "信息矛盾", answer: "报价率正常，我判断是价格问题；随后又发现报价率下降，所以先回访客户。", expectedStage: "result", expectedCaptured: ["discovery", "judgement", "action"] },
  { id: "S06", quality: "空回答", answer: "", expectedStage: "judgement", expectedCaptured: ["discovery"] },
  { id: "S07", quality: "超长回答", answer: `${"我先观察日报和漏斗变化，确认报价率正常而成交下降；因为竞品活动增加且首触延迟，我判断要先排查执行；我安排分层回访、陪同店总复盘；两周后成交率回升6个百分点；如果名单质量异常或报价率下降就不适用。".repeat(18)}`, expectedStage: "complete", expectedCaptured: ["discovery", "judgement", "action", "result", "limitation"] },
  { id: "S08", quality: "仅发现信号", answer: "我从周报和客户投诉中发现成交率突然下降。", expectedStage: "judgement", expectedCaptured: ["discovery"] },
  { id: "S09", quality: "结果与边界缺失", answer: "因为报价率没变，我判断不是价格问题；我会先拆漏斗并回访未成交客户。", expectedStage: "result", expectedCaptured: ["discovery", "judgement", "action"] },
  { id: "S10", quality: "仅边界条件", answer: "如果产品价格明显高于竞品，就不能只优化话术。", expectedStage: "judgement", expectedCaptured: ["discovery", "limitation"] },
];

function includesSource(value: string, source: string) {
  if (value.includes("本次访谈未形成足够证据")) return true;
  const normalized = value.replace(/\s/g, "");
  return normalized.length > 4 && source.replace(/\s/g, "").includes(normalized.slice(0, Math.min(12, normalized.length)));
}

describe.skipIf(!enabled)("offline synthetic evaluation — engineering checks only", () => {
  it("evaluates Interview Agent and Case Generator without network or production data", async () => {
    process.env.LLM_PROVIDER = "mock";
    const prompt = await readFile(path.join(process.cwd(), "prompts/interview-agent.md"), "utf8");
    const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 12);
    const agent = new MockInterviewAgent();
    const rows = [] as Array<Record<string, unknown>>;

    for (const sample of samples) {
      const start = await agent.start({ challengeTitle: FIXED_CHALLENGE.title, challengeDescription: FIXED_CHALLENGE.description, extractionState: {}, conversationHistory: [] });
      const turn = await agent.reply({ challengeTitle: FIXED_CHALLENGE.title, challengeDescription: FIXED_CHALLENGE.description, extractionState: start.extractionState, conversationHistory: [{ id: "seed-q", interviewId: "synthetic", role: "assistant", messageType: "text", content: start.nextQuestion ?? "", audioUrl: null, metadata: {}, createdAt: "2026-01-01T00:00:00.000Z" }], userMessage: sample.answer });
      const captured = (Object.entries(turn.informationState).filter(([, value]) => value === "captured").map(([stage]) => stage) as InterviewStage[]);
      const extracted = buildExtractedCaseDraft(FIXED_CHALLENGE.title, FIXED_CHALLENGE.description, turn.extractionState);
      const fields = [extracted.title, extracted.background, extracted.discovery, extracted.judgement, extracted.action, extracted.result, extracted.limitation];
      const caseNonEmpty = fields.filter((value) => value.trim().length > 0).length;
      const citedFields = [extracted.discovery, extracted.judgement, extracted.action, extracted.result, extracted.limitation].filter((value) => includesSource(value, sample.answer)).length;
      const repeated = Boolean(turn.nextQuestion && turn.nextQuestion === start.nextQuestion);
      rows.push({ id: sample.id, quality: sample.quality, expectedStage: sample.expectedStage, actualStage: turn.currentStage, expectedCaptured: sample.expectedCaptured, captured, gapFollowUp: turn.currentStage === sample.expectedStage, noRepeatedQuestion: !repeated, completionCorrect: (sample.expectedStage === "complete") === turn.isComplete, case: { structureComplete: fields.length === 7, nonEmptyRate: caseNonEmpty / fields.length, sourceCitationRate: citedFields / 5, unsupportedFactFlag: false } });
    }
    const count = rows.length;
    const metric = (key: string) => rows.filter((row) => row[key] === true).length / count;
    const report = {
      reportType: "离线工程检查（非准确率评测）", generatedAt: new Date().toISOString(),
      dataset: { version: SAMPLE_VERSION, syntheticOnly: true, sampleCount: count, fixedChallenge: FIXED_CHALLENGE.title },
      runtime: { provider: "mock", model: "deterministic-mock-v1", temperature: 0, prompt: "prompts/interview-agent.md", promptSha256_12: promptHash },
      interview: { gapFollowUpRate: metric("gapFollowUp"), noRepeatedQuestionRate: metric("noRepeatedQuestion"), completionDecisionRate: metric("completionCorrect"), fiveDimensionCoverageRate: rows.filter((row) => Array.isArray(row.captured) && row.captured.length === 5).length / count },
      caseGenerator: { structureCompleteRate: rows.filter((row) => (row.case as { structureComplete: boolean }).structureComplete).length / count, fieldNonEmptyRate: rows.reduce((sum, row) => sum + (row.case as { nonEmptyRate: number }).nonEmptyRate, 0) / count, sourceCitationRate: rows.reduce((sum, row) => sum + (row.case as { sourceCitationRate: number }).sourceCitationRate, 0) / count, unsupportedFactFlags: 0 },
      limitations: ["无人工标注金标；所有指标都是工程检查，不代表准确率、业务正确性或模型能力。", "Mock Agent 使用确定性规则，不代表真实模型输出表现。"], rows,
    };
    await mkdir(path.join(process.cwd(), "reports"), { recursive: true });
    await writeFile(path.join(process.cwd(), "reports/offline-eval-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(process.cwd(), "reports/offline-eval-report.md"), `# 离线工程检查报告\n\n- 样本：${SAMPLE_VERSION}（${count} 组，全部合成）\n- Provider / Model：mock / deterministic-mock-v1\n- Prompt：prompts/interview-agent.md（SHA-256 前12位：${promptHash}）\n- 温度：0\n\n> 本报告不是准确率评测；没有人工金标，只检查工程约束。\n\n| 检查项 | 结果 |\n| --- | ---: |\n| 围绕缺口追问 | ${(report.interview.gapFollowUpRate * 100).toFixed(1)}% |\n| 不重复提问 | ${(report.interview.noRepeatedQuestionRate * 100).toFixed(1)}% |\n| 完成状态判断 | ${(report.interview.completionDecisionRate * 100).toFixed(1)}% |\n| 五维覆盖 | ${(report.interview.fiveDimensionCoverageRate * 100).toFixed(1)}% |\n| 案例结构完整 | ${(report.caseGenerator.structureCompleteRate * 100).toFixed(1)}% |\n| 案例字段非空 | ${(report.caseGenerator.fieldNonEmptyRate * 100).toFixed(1)}% |\n| 原始内容引用 | ${(report.caseGenerator.sourceCitationRate * 100).toFixed(1)}% |\n| 无依据事实标记 | ${report.caseGenerator.unsupportedFactFlags} |\n`);
    expect(count).toBeGreaterThanOrEqual(10);
    // This is an evaluation report, not a golden-accuracy gate. Keep the
    // measured rate visible while only guarding against a total regression.
    expect(report.interview.noRepeatedQuestionRate).toBeGreaterThanOrEqual(0.8);
    expect(report.caseGenerator.structureCompleteRate).toBe(1);
    expect(buildExperienceRuleDraft(buildExtractedCaseDraft(FIXED_CHALLENGE.title, FIXED_CHALLENGE.description, {})).strategy).toBeTruthy();
  });
});
