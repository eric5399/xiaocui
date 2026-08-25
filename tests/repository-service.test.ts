import { describe, expect, it, vi } from "vitest";
import { ExperienceService } from "../lib/services/experience-service";
import { MockExperienceStore } from "../lib/repository/mock-store";
import { getDataProviderStatus } from "../lib/repository/provider";

const BASE_SCENARIO_INPUT = {
  name: "跨场景融合校验",
  topic: "续保诊断",
  background: "用于验证持久化边界。",
  objective: "提炼经验。",
  agentPrompt: "动态追问。",
  keywords: ["续保率"],
  caseTemplate: { instruction: "生成案例", metrics: ["续保率"] },
  customFields: [],
};

async function createCompletedInterview(service: ExperienceService, taskId: string) {
  const started = await service.startInterview({ taskId, profile: { 姓名: "测试用户", 机构: "测试机构" } });
  await service.sendMessage({
    interviewId: started.interview.id,
    content: "我从数据和漏斗变化发现异常，并先核对原因后执行动作。",
    clientMessageId: `message-${started.interview.id}`,
  });
  return service.completeInterview(started.interview.id);
}

describe("data provider and repository contract", () => {
  it("defaults to explicit Mock mode without Supabase configuration", () => {
    vi.stubEnv("EXPERIENCE_DATA_PROVIDER", "mock");
    expect(getDataProviderStatus()).toEqual({
      provider: "mock",
      isPersistent: false,
      configured: true,
      label: "Mock 模式",
    });
    vi.unstubAllEnvs();
  });

  it("keeps the Mock repository usable for invalid invite, idempotent messages, extraction and Reference persistence", async () => {
    const store = new MockExperienceStore();
    const service = new ExperienceService(store);
    await expect(service.getPublicTaskByInviteCode("INVALID")).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });

    const task = (await service.listTasks())[0];
    const started = await service.startInterview({
      taskId: task.id,
      profile: { 姓名: "测试用户", 机构: "测试机构" },
    });
    const request = {
      interviewId: started.interview.id,
      content: "我会先拆解报价到成交的漏斗，再与店总沟通并复盘结果。",
      clientMessageId: "retry-safe-message-1",
    };
    const [first, second] = await Promise.all([service.sendMessage(request), service.sendMessage(request)]);
    expect(first.userMessage.id).toBe(second.userMessage.id);
    expect((await store.listMessages(started.interview.id)).filter(({ role }) => role === "user")).toHaveLength(1);

    const completed = await service.completeInterview(started.interview.id);
    const detail = await service.getInterviewDetail(started.interview.id);
    expect(completed.extractedCase.interviewId).toBe(started.interview.id);
    expect(completed.experienceRule.extractedCaseId).toBe(completed.extractedCase.id);
    expect(detail.experienceRules[0].extractedCaseId).toBe(detail.extractedCase?.id);

    const existing = (await service.listInterviews({ status: "completed" })).slice(0, 2).map(({ id }) => id);
    const fusion = await service.createFusion({ scenarioId: task.scenarioId, interviewIds: existing });
    expect((await service.getReference(fusion.fusionJob.id)).id).toBe(fusion.referenceFile.id);
    expect(fusion.referenceFile.markdownContent).toContain("## 经验来源");
  });

  it("rejects interview task mismatches and cross-scenario fusion", async () => {
    const store = new MockExperienceStore();
    const service = new ExperienceService(store);
    const firstTask = (await service.listTasks())[0];
    const secondScenario = await service.createScenario(BASE_SCENARIO_INPUT);
    const secondTask = await service.createTask({ scenarioId: secondScenario.id, status: "active" });
    const firstChallenge = (await store.listChallengesForTask(firstTask.id))[0];
    await expect(
      service.startInterview({
        taskId: secondTask.id,
        profile: { 姓名: "测试用户", 机构: "测试机构" },
        challengeCaseId: firstChallenge.id,
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_TASK_MISMATCH" });

    const secondComplete = await createCompletedInterview(service, secondTask.id);
    const firstComplete = (await service.listInterviews({ scenarioId: firstTask.scenarioId, status: "completed" }))[0];
    await expect(
      service.createFusion({
        scenarioId: firstTask.scenarioId,
        interviewIds: [firstComplete.id, secondComplete.interview.id],
      }),
    ).rejects.toMatchObject({ code: "FUSION_SCENARIO_MISMATCH" });
  });

  it("允许中途直接整理，但不降低 Schema 或伪造缺失经验", async () => {
    const store = new MockExperienceStore();
    const service = new ExperienceService(store);
    const task = (await service.listTasks())[0];
    const started = await service.startInterview({
      taskId: task.id,
      profile: { 姓名: "中途退出用户", 机构: "测试机构" },
    });
    const turn = await service.sendMessage({
      interviewId: started.interview.id,
      content: "我先从报价到成交的漏斗数据里发现了异常。",
      clientMessageId: `partial-${started.interview.id}`,
    });
    expect(turn.agent.isComplete).toBe(false);

    const completed = await service.completeInterview(started.interview.id);
    expect(completed.interview.status).toBe("completed");
    expect(completed.extractedCase.discovery).toContain("漏斗数据");
    expect(completed.extractedCase.judgement).toContain("本次访谈未形成足够证据");
    expect(completed.extractedCase.action).toContain("本次访谈未形成足够证据");
    expect(completed.extractedCase.result).toContain("本次访谈未形成足够证据");
    expect(completed.extractedCase.limitation).toContain("本次访谈未形成足够证据");
    expect(completed.experienceRule.limitation).toBe(completed.extractedCase.limitation);
  });

  it("用户可用自然语言修正 Case，同步 Rule 且不覆盖原始访谈", async () => {
    const store = new MockExperienceStore();
    const service = new ExperienceService(store);
    const task = (await service.listTasks())[0];
    const started = await service.startInterview({
      taskId: task.id,
      profile: { 姓名: "案例确认用户", 机构: "测试机构" },
    });
    await service.sendMessage({
      interviewId: started.interview.id,
      content: "我从漏斗数据发现异常，因为报价率没变判断是竞品影响，先回访客户并沟通，最终成交率回升；如果报价率也下降则不适用。",
      clientMessageId: `full-${started.interview.id}`,
    });
    const beforeMessages = await store.listMessages(started.interview.id);
    const completed = await service.completeInterview(started.interview.id);
    const originalCase = { ...completed.extractedCase };
    const correction = "不是因为竞争对手降价，是因为销售顾问不愿意推。";

    const corrected = await service.reviewExtractedCase(started.interview.id, {
      action: "correct",
      correction,
      clientMessageId: "case-correction-trace-1",
    });
    expect(corrected.reviewStatus).toBe("user_corrected");
    expect(corrected.extractedCase.judgement).toBe(correction);
    expect(corrected.extractedCase.summary).toContain(correction.replace(/。$/, ""));
    expect(corrected.experienceRule.judgement).toBe(correction);
    expect(corrected.extractedCase.action).toBe(originalCase.action);
    expect(corrected.extractedCase.result).toBe(originalCase.result);
    expect(corrected.extractedCase.limitation).toBe(originalCase.limitation);
    expect(Object.keys(corrected.extractedCase)).toEqual(expect.arrayContaining([
      "title", "summary", "background", "discovery", "judgement", "action", "result", "limitation",
    ]));

    const detail = await service.getInterviewDetail(started.interview.id);
    expect(detail.messages.slice(0, beforeMessages.length)).toEqual(beforeMessages);
    expect(detail.messages).toHaveLength(beforeMessages.length + 1);
    expect(detail.messages.at(-1)).toMatchObject({
      role: "user",
      content: correction,
      metadata: { source: "case_correction", clientMessageId: "case-correction-trace-1" },
    });
    expect(detail.extractionState.caseReview?.originalCase.judgement).toBe(originalCase.judgement);
    expect(detail.extractionState.caseReview?.revisions?.[0]).toMatchObject({
      sourceMessageId: "case-correction-trace-1",
      correction,
    });

    await service.reviewExtractedCase(started.interview.id, {
      action: "correct",
      correction,
      clientMessageId: "case-correction-trace-1",
    });
    expect(await store.listMessages(started.interview.id)).toHaveLength(beforeMessages.length + 1);

    const confirmed = await service.reviewExtractedCase(started.interview.id, { action: "confirm" });
    expect(confirmed.reviewStatus).toBe("user_corrected");
    expect(confirmed.interview.extractionState.caseReview?.confirmedAt).toBeTruthy();
  });

  it("回归 PC 配置 → H5 访谈 → Case/Rule → 用户确认 → 融合/Reference 完整链路", async () => {
    const store = new MockExperienceStore();
    const service = new ExperienceService(store);
    const scenario = await service.createScenario({
      ...BASE_SCENARIO_INPUT,
      name: "第五轮端到端回归",
      outputSchema: { sections: ["background", "discovery", "judgement", "action", "result", "limitation"] },
      customFields: [
        { fieldName: "姓名", fieldType: "text", options: [], required: true, sortOrder: 0 },
        { fieldName: "补充信息", fieldType: "text", options: [], required: false, sortOrder: 1 },
      ],
    });
    const task = await service.createTask({ scenarioId: scenario.id, status: "active" });
    const completedIds: string[] = [];
    for (const suffix of ["甲", "乙"]) {
      const started = await service.startInterview({ taskId: task.id, profile: { 姓名: `业务员${suffix}`, 补充信息: "保留动态字段" } });
      await service.sendMessage({
        interviewId: started.interview.id,
        content: `我从续保漏斗数据发现${suffix}类异常，因为报价率没变判断是推荐意愿下降；我先回访客户并跟进顾问，结果成交率回升；如果报价率同步下降则不适用。`,
        clientMessageId: `e2e-${suffix}-${started.interview.id}`,
      });
      const completed = await service.completeInterview(started.interview.id);
      expect(Object.values(completed.extractedCase).filter((value) => typeof value === "string").every(Boolean)).toBe(true);
      expect(Object.values(completed.experienceRule).filter((value) => typeof value === "string").every(Boolean)).toBe(true);
      await service.reviewExtractedCase(started.interview.id, { action: "confirm" });
      completedIds.push(started.interview.id);
    }

    const configured = await store.getScenario(scenario.id);
    expect(configured?.customFields.map((field) => field.fieldName)).toEqual(["姓名", "补充信息"]);
    const pcDetail = await service.getInterviewDetail(completedIds[0]);
    expect(pcDetail.messages.length).toBeGreaterThanOrEqual(3);
    expect(pcDetail.extractedCase).not.toBeNull();
    expect(pcDetail.experienceRules).toHaveLength(1);
    expect(pcDetail.extractionState.caseReview?.status).toBe("user_confirmed");

    const fusion = await service.createFusion({ scenarioId: scenario.id, interviewIds: completedIds });
    const reference = await service.getReference(fusion.fusionJob.id);
    expect(fusion.fusionJob.status).toBe("completed");
    expect(reference.markdownContent).toContain("## 经验来源");
  });
});
