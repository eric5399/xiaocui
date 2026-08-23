import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SupabaseExperienceRepository } from "../lib/repository/supabase-repository";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.EXPERIENCE_DATA_PROVIDER === "supabase" && Boolean(url && serviceRoleKey);

describe.skipIf(!enabled)("Supabase repository integration", () => {
  function createRepository() {
    const client = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client, repository: new SupabaseExperienceRepository(client, {
      organizationId: "00000000-0000-4000-8000-000000000001",
    }) };
  }

  it("performs typed scenario-to-case CRUD and preserves foreign keys", async () => {
    const { client, repository } = createRepository();
    const marker = `repo-test-${crypto.randomUUID()}`;
    let scenarioId: string | null = null;
    try {
      const scenario = await repository.createScenario({
        name: marker,
        topic: "repository integration",
        background: "integration test only",
        objective: "verify CRUD",
        agentPrompt: "",
        keywords: ["test"],
        caseTemplate: { instruction: "test case", metrics: ["metric"] },
        customFields: [{ fieldName: "姓名", fieldType: "text", required: true, sortOrder: 1 }],
      });
      scenarioId = scenario.id;
      const task = await repository.createTask({
        scenarioId: scenario.id,
        inviteCode: `T${Date.now().toString(36).toUpperCase()}X`,
        targetUser: "test",
        expectedDurationMinutes: 15,
        status: "active",
      });
      const profile = await repository.createUserProfile(task.id, { 姓名: "集成测试" });
      const challenge = await repository.createChallenge(task.id, {
        title: "test challenge",
        description: "test description",
        caseData: {},
        source: "manual",
      });
      const interview = await repository.createInterview(task.id, profile.id, challenge.id, {});
      await repository.addMessage(interview.id, {
        role: "user",
        messageType: "text",
        content: "test answer",
        audioUrl: null,
        metadata: { clientMessageId: marker },
      });
      const saved = await repository.saveExtraction(
        interview.id,
        {
          title: "test case", summary: "summary", background: "background", discovery: "discovery",
          judgement: "judgement", action: "action", result: "result", limitation: "limitation",
        },
        { condition: "condition", judgement: "judgement", strategy: "strategy", limitation: "limitation" },
      );

      expect(saved?.extractedCase.interviewId).toBe(interview.id);
      expect(saved?.experienceRule.extractedCaseId).toBe(saved?.extractedCase.id);
      expect((await repository.getPublicTaskByInviteCode(task.inviteCode))?.scenario.id).toBe(scenario.id);
    } finally {
      if (scenarioId) await client.from("scenarios").delete().eq("id", scenarioId);
    }
  });

  it("reads migrated seed records through typed Repository mappings", async () => {
    const { repository } = createRepository();
    const scenarios = await repository.listScenarios();
    const task = await repository.getPublicTaskByInviteCode("XC2026");
    const reference = await repository.getLatestReference();

    expect(scenarios.length).toBeGreaterThan(0);
    expect(task?.inviteCode).toBe("XC2026");
    expect(reference?.markdownContent).toContain("## 经验来源");
  });
});
