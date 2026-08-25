import { z } from "zod";
import { INSTITUTION_CODES } from "./institutions";

const trimmedText = (label: string, max: number) =>
  z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 个字符`);

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const customFieldInputSchema = z
  .object({
    fieldName: trimmedText("字段名称", 60),
    fieldType: z.enum(["text", "number", "select"]),
    options: z.array(trimmedText("下拉选项", 80)).max(50).optional().default([]),
    required: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .superRefine((field, context) => {
    if (field.fieldType === "select" && field.options.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "下拉字段至少需要一个选项",
      });
    }
  });

export const createScenarioSchema = z.object({
  institutionCode: z.enum(INSTITUTION_CODES, { error: "请选择任务归属机构" }),
  name: trimmedText("任务名称", 120),
  topic: trimmedText("调研主题", 200),
  background: trimmedText("业务背景", 5000),
  objective: trimmedText("调研目标", 3000),
  agentPrompt: z.string().trim().max(12000).default(""),
  keywords: z.array(trimmedText("专业热词", 80)).max(100).default([]),
  outputSchema: jsonObjectSchema.optional().default({}),
  caseTemplate: z.object({
    instruction: trimmedText("案例生成规则", 5000),
    metrics: z.array(trimmedText("案例指标", 100)).min(1).max(50),
    constraints: z.array(trimmedText("案例限制", 300)).max(50).optional(),
  }),
  customFields: z.array(customFieldInputSchema).max(50).optional().default([]),
});

export const createTaskSchema = z.object({
  scenarioId: z.uuid(),
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,24}$/, "邀请码必须为 6-24 位大写字母或数字")
    .optional(),
  targetUser: z.string().trim().max(200).optional().default(""),
  expectedDurationMinutes: z.number().int().min(1).max(180).optional().default(15),
  status: z.enum(["draft", "active", "closed", "archived"]).optional().default("active"),
});

export const startInterviewSchema = z.object({
  taskId: z.uuid(),
  profile: jsonObjectSchema,
  challengeCaseId: z.uuid().optional(),
  privacyConsent: z.boolean().optional().default(false),
  privacyConsentVersion: z.string().trim().min(1).max(80).optional(),
});

export const sendInterviewMessageSchema = z
  .object({
    interviewId: z.uuid(),
    content: z.string().trim().max(10000).default(""),
    type: z.enum(["text", "audio", "audio_transcript"]).optional().default("text"),
    // Stored value is an opaque private storage URI, not a public URL.
    audioUrl: z.string().trim().max(1024).optional(),
    clientMessageId: z.string().trim().min(1).max(120).optional(),
  })
  .refine((message) => message.content.length > 0 || Boolean(message.audioUrl), {
    message: "消息内容与音频地址不能同时为空",
  });

export const reviewExtractedCaseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({
    action: z.literal("correct"),
    correction: trimmedText("修正说明", 5000),
    clientMessageId: z.string().trim().min(1).max(120).optional(),
  }),
]);

export const generateChallengeSchema = z.object({
  taskId: z.uuid(),
});

export const createFusionSchema = z.object({
  scenarioId: z.uuid(),
  interviewIds: z.array(z.uuid()).min(2, "至少选择两条访谈").max(100),
});

export const transcribeSpeechSchema = z.object({
  mockText: z.string().trim().max(10000).optional(),
  audioUrl: z.url().optional(),
  fileName: z.string().trim().max(255).optional(),
  language: z.string().trim().max(40).optional().default("zh-CN"),
});

export type CreateScenarioPayload = z.infer<typeof createScenarioSchema>;
export type CreateTaskPayload = z.infer<typeof createTaskSchema>;
export type StartInterviewPayload = z.infer<typeof startInterviewSchema>;
export type SendInterviewMessagePayload = z.infer<typeof sendInterviewMessageSchema>;
export type ReviewExtractedCasePayload = z.infer<typeof reviewExtractedCaseSchema>;
export type CreateFusionPayload = z.infer<typeof createFusionSchema>;
