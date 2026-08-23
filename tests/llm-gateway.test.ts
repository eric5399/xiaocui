import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createConfiguredLlmGateway, LlmGateway, LlmGatewayError, type LlmProvider } from "../lib/llm/llm-gateway";
import { loadPrompt } from "../lib/llm/prompt-loader";

function provider(responses: string[]): LlmProvider {
  let index = 0;
  return {
    name: "mock",
    complete: async () => ({ text: responses[Math.min(index++, responses.length - 1)], provider: "fake", model: "fake-v1", finishReason: "stop" as const, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }),
    healthCheck: async () => ({ ok: true, provider: "fake", model: "fake-v1" }),
  };
}

describe("LLM Gateway", () => {
  it("keeps Mock mode offline and exposes the provider name", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const gateway = createConfiguredLlmGateway();
    expect(gateway.getProviderName()).toBe("mock");
    await expect(gateway.healthCheck()).resolves.toMatchObject({ ok: true, provider: "mock" });
    vi.unstubAllEnvs();
  });

  it("fails clearly when a real provider has no key", () => {
    vi.stubEnv("LLM_PROVIDER", "deepseek"); vi.stubEnv("LLM_API_KEY", "");
    expect(() => createConfiguredLlmGateway()).toThrow(/LLM_API_KEY/);
    vi.unstubAllEnvs();
  });

  it("retries invalid JSON schema output before accepting a valid response", async () => {
    const gateway = new LlmGateway(provider(["not-json", JSON.stringify({ answer: "ok" })]), 1);
    await expect(gateway.generateStructured(z.object({ answer: z.string() }), { messages: [{ role: "user", content: "test" }] })).resolves.toMatchObject({ data: { answer: "ok" } });
  });

  it("preserves JSON mode for structured calls and accepts fenced JSON", async () => {
    const formats: string[] = [];
    const gateway = new LlmGateway({
      name: "mock",
      complete: async (request) => {
        formats.push(request.responseFormat ?? "missing");
        return { text: "```json\n{\"answer\":\"ok\"}\n```", provider: "fake", model: "fake-v1", finishReason: "stop", latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } };
      }, healthCheck: async () => ({ ok: true, provider: "fake", model: "fake-v1" }),
    }, 0);
    await expect(gateway.generateStructured(z.object({ answer: z.string() }), { messages: [{ role: "user", content: "test" }] })).resolves.toMatchObject({ data: { answer: "ok" } });
    expect(formats).toEqual(["json"]);
  });

  it("retries a retryable timeout without exposing request content", async () => {
    let calls = 0;
    const gateway = new LlmGateway({
      name: "mock",
      complete: async () => {
        calls += 1;
        if (calls === 1) throw new LlmGatewayError("TIMEOUT", "timed out", true);
        return { text: "ok", provider: "fake", model: "fake-v1", finishReason: "stop", latencyMs: 2, usage: { inputTokens: 1, outputTokens: 1 } };
      }, healthCheck: async () => ({ ok: true, provider: "fake", model: "fake-v1" }),
    }, 1);
    await expect(gateway.generateText({ messages: [{ role: "user", content: "sensitive content" }] })).resolves.toMatchObject({ text: "ok" });
    expect(calls).toBe(2);
  });

  it("rejects a structured response with missing required fields", async () => {
    const gateway = new LlmGateway(provider([JSON.stringify({ title: "only title" })]), 0);
    await expect(gateway.generateStructured(z.object({ title: z.string(), action: z.string() }), { messages: [{ role: "user", content: "test" }] })).rejects.toBeInstanceOf(LlmGatewayError);
  });

  it("loads the independently managed interview prompt", async () => {
    await expect(loadPrompt("interview-agent")).resolves.toContain("结构化输出 JSON");
  });
});
