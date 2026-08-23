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
});
