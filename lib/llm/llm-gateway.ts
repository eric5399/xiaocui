import "server-only";

import { z, type ZodType } from "zod";

export type LlmRole = "system" | "user" | "assistant";
export type LlmProviderName = "mock" | "openai" | "deepseek" | "qwen";
export interface LlmMessage { role: LlmRole; content: string; }
export interface LlmRequest { messages: LlmMessage[]; temperature?: number; maxTokens?: number; responseFormat?: "text" | "json"; mockResponse?: string; }
export interface LlmResponse { text: string; provider: string; model: string; finishReason: "stop" | "length" | "error"; usage: { inputTokens: number; outputTokens: number }; latencyMs: number; }
export interface LlmHealth { ok: boolean; provider: string; model: string; reason?: string; }
export interface LlmProvider { readonly name: LlmProviderName; complete(request: LlmRequest): Promise<LlmResponse>; healthCheck(): Promise<LlmHealth>; }

export class LlmGatewayError extends Error {
  constructor(readonly code: "CONFIG" | "TIMEOUT" | "RATE_LIMIT" | "EMPTY_RESPONSE" | "INVALID_RESPONSE" | "UPSTREAM", message: string, readonly retryable = false) { super(message); this.name = "LlmGatewayError"; }
}
const approximateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 3));
const numberEnv = (key: string, fallback: number, min: number, max: number) => { const value = Number(process.env[key] ?? fallback); return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; };
function configuredProvider(): LlmProviderName {
  const value = (process.env.LLM_PROVIDER ?? "mock").trim().toLowerCase();
  if (["mock", "openai", "deepseek", "qwen"].includes(value)) return value as LlmProviderName;
  throw new LlmGatewayError("CONFIG", "LLM_PROVIDER 只能是 mock、openai、deepseek 或 qwen");
}
function defaults(provider: Exclude<LlmProviderName, "mock">) {
  if (provider === "openai") return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
  if (provider === "deepseek") return { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" };
  return { baseUrl: "", model: "qwen3.7-plus" };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock" as const;
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const last = [...request.messages].reverse().find((item) => item.role === "user")?.content ?? "";
    const text = request.mockResponse ?? (request.responseFormat === "json" ? JSON.stringify({ mock: true, summary: last.slice(0, 120) }) : `【Mock LLM】已收到：${last.slice(0, 160)}`);
    return { text, provider: this.name, model: "deterministic-mock-v1", finishReason: "stop", latencyMs: 0, usage: { inputTokens: approximateTokens(request.messages.map((item) => item.content).join("\n")), outputTokens: approximateTokens(text) } };
  }
  async healthCheck(): Promise<LlmHealth> { return { ok: true, provider: this.name, model: "deterministic-mock-v1" }; }
}

type ChatCompletion = { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>; model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(readonly name: Exclude<LlmProviderName, "mock">, private readonly config: { apiKey: string; baseUrl: string; model: string; timeoutMs: number }) {}
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs); const started = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ model: this.config.model, messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens, ...(this.name === "deepseek" && request.responseFormat === "json" ? { thinking: { type: "disabled" } } : {}), ...(request.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}) }) });
      if (response.status === 429) throw new LlmGatewayError("RATE_LIMIT", "模型服务限流，请稍后重试", true);
      if (!response.ok) throw new LlmGatewayError("UPSTREAM", `模型服务请求失败（HTTP ${response.status}）`, response.status >= 500);
      const payload = await response.json() as ChatCompletion; const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) throw new LlmGatewayError("EMPTY_RESPONSE", "模型返回为空", true);
      return { text, provider: this.name, model: payload.model ?? this.config.model, finishReason: payload.choices?.[0]?.finish_reason === "length" ? "length" : "stop", latencyMs: Date.now() - started, usage: { inputTokens: payload.usage?.prompt_tokens ?? approximateTokens(request.messages.map((item) => item.content).join("\n")), outputTokens: payload.usage?.completion_tokens ?? approximateTokens(text) } };
    } catch (error) {
      if (error instanceof LlmGatewayError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new LlmGatewayError("TIMEOUT", `模型请求超过 ${this.config.timeoutMs}ms`, true);
      throw new LlmGatewayError("UPSTREAM", "模型网络请求失败", true);
    } finally { clearTimeout(timeout); }
  }
  async healthCheck(): Promise<LlmHealth> { return { ok: Boolean(this.config.apiKey && this.config.baseUrl), provider: this.name, model: this.config.model, ...(this.config.apiKey && this.config.baseUrl ? {} : { reason: "缺少 API Key 或 Base URL" }) }; }
}

export class LlmGateway {
  constructor(private readonly provider: LlmProvider, private readonly retries = 1) {}
  async generateText(request: LlmRequest) { return this.withRetries(() => this.provider.complete({ ...request, responseFormat: "text" })); }
  async generateStructured<T>(schema: ZodType<T>, request: Omit<LlmRequest, "responseFormat">): Promise<{ data: T; response: LlmResponse }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        // Do not call generateText here: it deliberately forces text mode.
        // Structured generation must preserve the provider's JSON response mode.
        const response = await this.withRetries(() => this.provider.complete({
          ...request,
          responseFormat: "json",
          ...(attempt === 0 ? {} : {
            messages: [
              ...request.messages,
              { role: "system", content: "上一版输出无法通过 JSON Schema。请只返回一个完整 JSON object，字段名、字段类型和必填字段必须完全符合要求。" },
            ],
          }),
        }));
        const parsed = schema.safeParse(parseJsonObject(response.text));
        if (parsed.success) return { data: parsed.data, response };
        lastError = new LlmGatewayError("INVALID_RESPONSE", "模型输出不符合结构化 Schema", true);
      } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new LlmGatewayError("INVALID_RESPONSE", "模型结构化输出无效");
  }
  async *streamText(request: LlmRequest): AsyncGenerator<string> { yield (await this.generateText(request)).text; }
  getProviderName() { return this.provider.name; }
  get providerName() { return this.getProviderName(); }
  healthCheck() { return this.provider.healthCheck(); }
  complete(request: LlmRequest) { return this.generateText(request); }
  async generateJson<T>(request: Omit<LlmRequest, "responseFormat">): Promise<T> { return (await this.generateStructured(z.unknown() as ZodType<T>, request)).data; }
  private async withRetries<T>(operation: () => Promise<T>): Promise<T> { let lastError: unknown; for (let attempt = 0; attempt <= this.retries; attempt += 1) { try { return await operation(); } catch (error) { lastError = error; if (!(error instanceof LlmGatewayError) || !error.retryable || attempt === this.retries) break; } } throw lastError; }
}

/** Tolerates provider Markdown fences but never attempts to invent missing data. */
function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new LlmGatewayError("INVALID_RESPONSE", "模型未返回有效 JSON object", true);
  }
}

export function createConfiguredLlmGateway(): LlmGateway {
  const provider = configuredProvider(); if (provider === "mock") return new LlmGateway(new MockLlmProvider(), 0);
  const preset = defaults(provider); const apiKey = process.env.LLM_API_KEY?.trim(); const baseUrl = process.env.LLM_BASE_URL?.trim() || preset.baseUrl;
  if (!apiKey) throw new LlmGatewayError("CONFIG", `LLM_PROVIDER=${provider} 需要配置服务端 LLM_API_KEY`);
  if (!baseUrl) throw new LlmGatewayError("CONFIG", `LLM_PROVIDER=${provider} 需要配置 LLM_BASE_URL`);
  return new LlmGateway(new OpenAiCompatibleProvider(provider, { apiKey, baseUrl, model: process.env.LLM_MODEL?.trim() || preset.model, timeoutMs: numberEnv("LLM_TIMEOUT_MS", 30000, 1000, 120000) }), numberEnv("LLM_MAX_RETRIES", 1, 0, 3));
}
export const llmGateway = new LlmGateway(new MockLlmProvider());
