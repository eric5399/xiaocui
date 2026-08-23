import { describe, expect, it } from "vitest";
import { LlmGateway, MockLlmProvider } from "../lib/llm/llm-gateway";
import { IflytekRealtimeLlmProvider, MockSpeechProvider, SpeechAdapter } from "../lib/speech/speech-adapter";

class FakeIflytekSocket {
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  constructor(_url: string) {
    setTimeout(() => this.emit("message", { data: JSON.stringify({ msg_type: "action", data: { action: "started", sessionId: "test-session" } }) }), 0);
  }
  addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  send(data: string | Uint8Array) {
    if (typeof data === "string" && data.includes('"end":true')) {
      setTimeout(() => {
        this.emit("message", { data: JSON.stringify({ msg_type: "result", data: { text: "测试成功" } }) });
        this.emit("close", { code: 1000 });
      }, 0);
    }
  }
  close() {}
  protected emit(type: string, event: unknown) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
}

class FakeSegmentedIflytekSocket extends FakeIflytekSocket {
  send(data: string | Uint8Array) {
    if (typeof data === "string" && data.includes('"end":true')) {
      const packet = (text: string, type: number, segmentId: number) => ({
        msg_type: "result",
        data: { seg_id: segmentId, cn: { st: { type, rt: [{ ws: [{ cw: [{ w: text }] }] }] } } },
      });
      setTimeout(() => {
        this.emit("message", { data: JSON.stringify(packet("测试", 1, 0)) });
        this.emit("message", { data: JSON.stringify(packet("测试", 0, 0)) });
        this.emit("message", { data: JSON.stringify(packet("测试录音", 0, 1)) });
        this.emit("message", { data: JSON.stringify(packet("测试录音效果", 0, 2)) });
        this.emit("close", { code: 1000 });
      }, 0);
    }
  }
}

describe("mock provider adapters", () => {
  it("keeps the LLM gateway deterministic and offline", async () => {
    const gateway = new LlmGateway(new MockLlmProvider());
    const request = { messages: [{ role: "user" as const, content: "测试输入" }] };

    await expect(gateway.complete(request)).resolves.toEqual(await gateway.complete(request));
    expect(gateway.providerName).toBe("mock");
  });

  it("uses caller-provided mock transcript", async () => {
    const adapter = new SpeechAdapter(new MockSpeechProvider());
    const result = await adapter.transcribe({ mockText: "这是一段模拟语音回答。" });

    expect(result.text).toBe("这是一段模拟语音回答。");
    expect(result.isMock).toBe(true);
    expect(result.provider).toBe("mock");
  });

  it("rejects unsupported or oversized audio before any provider call", () => {
    const adapter = new SpeechAdapter(new MockSpeechProvider());
    expect(() => adapter.validateAudio({ audio: new ArrayBuffer(8), mimeType: "text/plain" })).toThrow("不支持");
    expect(() => adapter.validateAudio({ audio: new ArrayBuffer(0), mimeType: "audio/pcm" })).toThrow("为空");
  });

  it("accepts a normal Iflytek close after transcript fragments", async () => {
    const originalSocket = globalThis.WebSocket;
    const originalEnv = { appId: process.env.SPEECH_APP_ID, apiKey: process.env.SPEECH_API_KEY, secret: process.env.SPEECH_API_SECRET };
    Object.assign(process.env, { SPEECH_APP_ID: "test-app", SPEECH_API_KEY: "test-key", SPEECH_API_SECRET: "test-secret" });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeIflytekSocket });
    try {
      const result = await new IflytekRealtimeLlmProvider().transcribe({ audio: new ArrayBuffer(8), mimeType: "audio/pcm" });
      expect(result.text).toBe("测试成功");
      expect(result.isMock).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalSocket });
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key === "appId" ? "SPEECH_APP_ID" : key === "apiKey" ? "SPEECH_API_KEY" : "SPEECH_API_SECRET"];
        else process.env[key === "appId" ? "SPEECH_APP_ID" : key === "apiKey" ? "SPEECH_API_KEY" : "SPEECH_API_SECRET"] = value;
      }
    }
  });

  it("keeps only the stable text for repeated Iflytek segment hypotheses", async () => {
    const originalSocket = globalThis.WebSocket;
    const originalEnv = { appId: process.env.SPEECH_APP_ID, apiKey: process.env.SPEECH_API_KEY, secret: process.env.SPEECH_API_SECRET };
    Object.assign(process.env, { SPEECH_APP_ID: "test-app", SPEECH_API_KEY: "test-key", SPEECH_API_SECRET: "test-secret" });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeSegmentedIflytekSocket });
    try {
      const result = await new IflytekRealtimeLlmProvider().transcribe({ audio: new ArrayBuffer(8), mimeType: "audio/pcm" });
      expect(result.text).toBe("测试录音效果");
    } finally {
      Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalSocket });
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key === "appId" ? "SPEECH_APP_ID" : key === "apiKey" ? "SPEECH_API_KEY" : "SPEECH_API_SECRET"];
        else process.env[key === "appId" ? "SPEECH_APP_ID" : key === "apiKey" ? "SPEECH_API_KEY" : "SPEECH_API_SECRET"] = value;
      }
    }
  });
});
