import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.DEPLOYMENT_BASE_URL?.replace(/\/$/, "") || "https://xiaocui-staging.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const organizationId = process.env.ADMIN_ORGANIZATION_ID?.trim();
const audioPath = process.env.E2E_AUDIO_PATH?.trim();

if (!supabaseUrl || !anonKey || !serviceRoleKey || !organizationId) {
  throw new Error("缺少 Staging Supabase 测试配置；未执行任何写入。");
}

const maintenance = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const marker = crypto.randomUUID();
let scenarioId;
let participantUserId;
let storagePath;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function insertOne(table, values) {
  const { data, error } = await maintenance.from(table).insert(values).select("*").single();
  if (error) throw new Error(`${table} 测试数据创建失败：${error.message}`);
  return data;
}

async function request(path, { token, method = "GET", json, body, timeoutMs = 90_000 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: json === undefined ? body : JSON.stringify(json),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json();
  if (!response.ok || !("data" in payload)) {
    throw new Error(`${method} ${path} 失败：${payload.error?.code ?? response.status} ${payload.error?.message ?? "unknown"}`);
  }
  return payload.data;
}

try {
  const scenario = await insertOne("scenarios", {
    organization_id: organizationId,
    institution_code: "000000",
    name: `Staging E2E ${marker}`,
    topic: "续保异常经验萃取",
    background: "只用于部署后自动化回归，完成后自动删除。",
    objective: "验证真实 AI 访谈、语音转写、案例与规则生成。",
    agent_prompt: "围绕判断依据、关键动作、结果与边界追问。",
    keywords: ["续保率", "报价成交率"],
    case_template: { instruction: "生成续保异常经验案例", metrics: ["判断依据", "关键动作", "结果", "边界"] },
    output_schema: {},
    status: "published",
  });
  scenarioId = scenario.id;
  await insertOne("custom_fields", {
    scenario_id: scenarioId,
    field_name: "姓名",
    field_type: "text",
    options: [],
    required: true,
    sort_order: 0,
  });
  const inviteCode = `E${Date.now().toString(36).toUpperCase()}X`;
  const task = await insertOne("tasks", {
    scenario_id: scenarioId,
    invite_code: inviteCode,
    target_user: "E2E",
    expected_duration_minutes: 15,
    status: "active",
  });
  await insertOne("challenge_cases", {
    task_id: task.id,
    title: "续保报价后转化下降",
    description: "报价率稳定，但报价成交率明显下降，同期竞品增加驻店活动。",
    case_data: {},
    source: "manual",
  });
  const rawToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await insertOne("participant_access_links", {
    organization_id: organizationId,
    task_id: task.id,
    token_hash: createHash("sha256").update(rawToken).digest("hex"),
    status: "active",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const participant = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await participant.auth.signInAnonymously();
  if (authError || !authData.session || !authData.user) throw new Error(`匿名参与者创建失败：${authError?.message ?? "unknown"}`);
  participantUserId = authData.user.id;
  const token = authData.session.access_token;

  const claimed = await request("/api/participant-access/claim", { method: "POST", token, json: { token: rawToken } });
  ensure(claimed.invite_code === inviteCode, "受控链接没有返回预期邀请码。");
  const publicTask = await request(`/api/tasks/by-invite/${inviteCode}`, { token });
  ensure(publicTask.scenario.institutionCode === "000000", "全国机构归集丢失。");

  const started = await request("/api/interviews/start", {
    method: "POST",
    token,
    json: { taskId: task.id, profile: { 姓名: "部署回归用户" }, privacyConsent: true, privacyConsentVersion: "staging-e2e-v1" },
    timeoutMs: 120_000,
  });
  ensure(started.interview?.id && started.assistantMessage?.content, "真实访谈未正常启动。");
  ensure(started.agent?.diagnostics?.provider === "deepseek", "访谈首问没有使用 DeepSeek。");
  const interviewId = started.interview.id;

  const textTurn = await request("/api/interviews/message", {
    method: "POST",
    token,
    json: {
      interviewId,
      clientMessageId: `text-${marker}`,
      content: "我先对比了近四周的报价率和报价成交率。报价率稳定而成交率下降，同期只有竞品驻店宣传发生变化，因此先怀疑客户价值感知被竞品截走。我让销售顾问记录客户拒绝理由，再与店总共同调整权益讲解和回访节点。两周后成交率回升八个百分点。这个方法不适用于报价率本身就下降的情况，新人最容易误用的是未核对拒绝理由就直接降价。",
    },
    timeoutMs: 120_000,
  });
  ensure(textTurn.userMessage?.messageType === "text", "文字消息结构异常。");
  ensure(textTurn.agent?.diagnostics?.provider === "deepseek", "文字追问没有使用 DeepSeek。");

  let speechResult = "skipped";
  if (audioPath) {
    const audio = await readFile(audioPath);
    const form = new FormData();
    form.set("interviewId", interviewId);
    form.set("audio", new File([audio], "staging-e2e.pcm", { type: "audio/pcm" }));
    form.set("durationMs", String(Math.floor(audio.byteLength / 32)));
    form.set("consented", "true");
    form.set("language", "zh-CN");
    const uploaded = await request("/api/speech/upload", { method: "POST", token, body: form, timeoutMs: 120_000 });
    const { data: transcriptRow } = await maintenance.from("speech_transcripts").select("storage_path").eq("id", uploaded.transcriptId).single();
    storagePath = transcriptRow?.storage_path;
    const transcribed = await request("/api/speech/transcribe", {
      method: "POST",
      token,
      json: { transcriptId: uploaded.transcriptId },
      timeoutMs: 160_000,
    });
    ensure(transcribed.provider === "iflytek" && !transcribed.isMock, "语音转写未使用真实讯飞。");
    ensure(typeof transcribed.text === "string" && transcribed.text.trim().length > 0, "讯飞未返回有效文本。");
    const speechTurn = await request("/api/interviews/message", {
      method: "POST",
      token,
      json: { interviewId, content: transcribed.text, clientMessageId: `speech-${marker}` },
      timeoutMs: 120_000,
    });
    ensure(speechTurn.userMessage?.messageType === "text", "语音转写没有汇入统一文本 message 链路。");
    speechResult = "passed";
  }

  const completed = await request(`/api/interviews/${interviewId}/complete`, { method: "POST", token, json: {}, timeoutMs: 120_000 });
  ensure(completed.extractedCase?.summary?.trim(), "真实 Case 没有生成摘要。");
  ensure(completed.experienceRule?.strategy?.trim(), "真实 Insight/Rule 没有生成策略。");

  console.log(JSON.stringify({
    deployment: "healthy",
    institutionDimension: "passed",
    controlledQrAccess: "passed",
    deepseekInterview: "passed",
    speechIflytek: speechResult,
    unifiedMessageCreation: audioPath ? "passed" : "text-only",
    caseAndInsightGeneration: "passed",
  }));
} finally {
  if (storagePath) await maintenance.storage.from("interview-audio").remove([storagePath]);
  if (scenarioId) await maintenance.from("scenarios").delete().eq("id", scenarioId);
  if (participantUserId) await maintenance.auth.admin.deleteUser(participantUserId);
}
