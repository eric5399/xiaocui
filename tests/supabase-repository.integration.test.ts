import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseExperienceRepository } from "../lib/repository/supabase-repository";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const organizationId = process.env.ADMIN_ORGANIZATION_ID;
const enabled = process.env.EXPERIENCE_DATA_PROVIDER === "supabase"
  && Boolean(url && anonKey && serviceRoleKey && organizationId);

function repository(client: SupabaseClient, withOrganization = false) {
  return new SupabaseExperienceRepository(client, withOrganization ? { organizationId } : {});
}

describe.skipIf(!enabled)("Supabase authenticated end-to-end integration", () => {
  it("keeps one admin workspace while scoping a QR participant to one institution task", async () => {
    const service = createClient(url!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const marker = crypto.randomUUID();
    const adminEmail = `admin-${marker}@example.com`;
    const adminPassword = `Admin-${crypto.randomUUID()}-9a!`;
    let adminUserId: string | undefined;
    let participantUserId: string | undefined;
    let scenarioAId: string | undefined;
    let scenarioBId: string | undefined;

    try {
      const { data: createdAdmin, error: createAdminError } = await service.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
      expect(createAdminError).toBeNull();
      adminUserId = createdAdmin.user?.id;
      expect(adminUserId).toBeTruthy();

      const { error: memberError } = await service.from("organization_members").insert({
        organization_id: organizationId,
        user_id: adminUserId,
        role: "admin",
      });
      expect(memberError).toBeNull();

      const adminClient = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error: signInError } = await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
      expect(signInError).toBeNull();
      const admin = repository(adminClient, true);

      const createScenario = (name: string, institutionCode: "440000" | "310000") => admin.createScenario({
        institutionCode,
        name: `${name}-${marker}`,
        topic: "repository integration",
        background: "integration test only",
        objective: "verify authenticated CRUD and RLS",
        agentPrompt: "",
        keywords: ["test"],
        caseTemplate: { instruction: "test case", metrics: ["metric"] },
        customFields: [{ fieldName: "姓名", fieldType: "text", required: true, sortOrder: 1 }],
      });
      const scenarioA = await createScenario("assigned", "440000");
      const scenarioB = await createScenario("not-assigned", "310000");
      scenarioAId = scenarioA.id;
      scenarioBId = scenarioB.id;
      expect(scenarioA.institutionCode).toBe("440000");

      const taskA = await admin.createTask({
        scenarioId: scenarioA.id,
        inviteCode: `A${Date.now().toString(36).toUpperCase()}X`,
        targetUser: "test",
        expectedDurationMinutes: 15,
        status: "active",
      });
      await admin.createTask({
        scenarioId: scenarioB.id,
        inviteCode: `B${Date.now().toString(36).toUpperCase()}X`,
        targetUser: "test",
        expectedDurationMinutes: 15,
        status: "active",
      });
      const challenge = await admin.createChallenge(taskA.id, {
        title: "test challenge",
        description: "test description",
        caseData: {},
        source: "manual",
      });
      const rawToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      await admin.createParticipantAccessLink(taskA.id, tokenHash, new Date(Date.now() + 3_600_000).toISOString());

      const participantClient = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: anonymousSession, error: anonymousError } = await participantClient.auth.signInAnonymously();
      expect(anonymousError).toBeNull();
      participantUserId = anonymousSession.user?.id;
      expect(participantUserId).toBeTruthy();
      const { data: claim, error: claimError } = await participantClient
        .rpc("claim_participant_access_link", { raw_token: rawToken })
        .single();
      expect(claimError).toBeNull();
      expect((claim as { task_id?: string } | null)?.task_id).toBe(taskA.id);

      const participant = repository(participantClient);
      const visibleScenarios = await participant.listScenarios();
      expect(visibleScenarios.map(({ id }) => id)).toContain(scenarioA.id);
      expect(visibleScenarios.map(({ id }) => id)).not.toContain(scenarioB.id);

      const unauthenticated = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: anonymousRows, error: anonymousRowsError } = await unauthenticated
        .from("scenarios")
        .select("id")
        .in("id", [scenarioA.id, scenarioB.id]);
      expect(anonymousRowsError).toBeNull();
      expect(anonymousRows).toEqual([]);

      const profile = await participant.createUserProfile(taskA.id, { 姓名: "集成测试" });
      const interview = await participant.createInterview(taskA.id, profile.id, challenge.id, {});
      await participant.addMessage(interview.id, {
        role: "user",
        messageType: "text",
        content: "test answer",
        audioUrl: null,
        metadata: { clientMessageId: marker },
      });
      const saved = await participant.saveExtraction(
        interview.id,
        {
          title: "test case", summary: "summary", background: "background", discovery: "discovery",
          judgement: "judgement", action: "action", result: "result", limitation: "limitation",
        },
        { condition: "condition", judgement: "judgement", strategy: "strategy", limitation: "limitation" },
      );
      expect(saved?.extractedCase.interviewId).toBe(interview.id);
      expect(saved?.experienceRule.extractedCaseId).toBe(saved?.extractedCase.id);

      const adminDetail = await admin.getInterviewDetail(interview.id);
      expect(adminDetail?.messages[0].content).toBe("test answer");
      expect(adminDetail?.extractedCase?.title).toBe("test case");
    } finally {
      if (scenarioAId) await service.from("scenarios").delete().eq("id", scenarioAId);
      if (scenarioBId) await service.from("scenarios").delete().eq("id", scenarioBId);
      if (participantUserId) await service.auth.admin.deleteUser(participantUserId);
      if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
    }
  }, 30_000);
});
