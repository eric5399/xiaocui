import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";

export type SpeechProviderName = "mock" | "aliyun" | "tencent" | "iflytek";
export interface SpeechTranscriptionInput { audio?: ArrayBuffer; mimeType?: string; language?: string; durationMs?: number | null; mockText?: string; }
export interface SpeechTranscriptionResult { text: string; language: string; durationMs: number | null; confidence: number | null; provider: string; model: string | null; isMock: boolean; }
export interface AudioValidation { mimeType: string; byteLength: number; durationMs: number | null; }
export interface SpeechProvider { readonly name: SpeechProviderName; transcribe(input: SpeechTranscriptionInput): Promise<SpeechTranscriptionResult>; healthCheck(): Promise<{ ok: boolean; provider: string; detail?: string }>; validateAudio(input: SpeechTranscriptionInput): AudioValidation; getSupportedMimeTypes(): readonly string[]; }

const PCM = ["audio/pcm", "audio/l16", "audio/wav", "audio/x-wav"] as const;
function envNumber(name: string, fallback: number) { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback; }
function currentProvider(): SpeechProviderName { const value = process.env.SPEECH_PROVIDER?.trim().toLowerCase() || "mock"; if (["mock", "aliyun", "tencent", "iflytek"].includes(value)) return value as SpeechProviderName; throw new ApiError(500, "SPEECH_PROVIDER_INVALID", "SPEECH_PROVIDER 只能是 mock、aliyun、tencent 或 iflytek"); }
function validate(input: SpeechTranscriptionInput, supported: readonly string[]) {
  if (!input.audio) throw new ApiError(422, "AUDIO_EMPTY", "音频内容为空");
  const mimeType = (input.mimeType ?? "audio/pcm").split(";")[0].trim().toLowerCase();
  if (!supported.includes(mimeType)) throw new ApiError(415, "AUDIO_MIME_UNSUPPORTED", `不支持 ${mimeType || "未知"} 音频格式`);
  const maxBytes = envNumber("SPEECH_MAX_FILE_SIZE_MB", 25) * 1024 * 1024;
  if (!input.audio.byteLength) throw new ApiError(422, "AUDIO_EMPTY", "音频内容为空");
  if (input.audio.byteLength > maxBytes) throw new ApiError(413, "AUDIO_TOO_LARGE", `音频不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  const durationMs = input.durationMs ?? (mimeType === "audio/pcm" ? Math.floor(input.audio.byteLength / 32) : null);
  const maxSeconds = envNumber("SPEECH_MAX_SECONDS", 180);
  if (durationMs !== null && durationMs > maxSeconds * 1000) throw new ApiError(413, "AUDIO_TOO_LONG", `录音不能超过 ${maxSeconds} 秒`);
  return { mimeType, byteLength: input.audio.byteLength, durationMs };
}

export class MockSpeechProvider implements SpeechProvider {
  readonly name = "mock" as const;
  getSupportedMimeTypes() { return PCM; }
  validateAudio(input: SpeechTranscriptionInput) { return validate(input, this.getSupportedMimeTypes()); }
  async healthCheck() { return { ok: true, provider: this.name, detail: "deterministic mock; no network request" }; }
  async transcribe(input: SpeechTranscriptionInput): Promise<SpeechTranscriptionResult> { const checked = input.audio ? this.validateAudio(input) : { durationMs: null }; return { text: input.mockText?.trim() || "我会先拆解报价到成交的漏斗，再结合客户反馈判断问题出现在哪个环节。", language: input.language ?? "zh-CN", durationMs: checked.durationMs, confidence: 1, provider: this.name, model: "deterministic-mock-v1", isMock: true }; }
}

function chinaTime() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()); const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"; return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+0800`; }
function extractText(value: unknown): string { if (typeof value === "string") { try { return extractText(JSON.parse(value)); } catch { return value; } } if (!value || typeof value !== "object") return ""; const row = value as Record<string, unknown>; for (const key of ["text", "transcript", "sentence", "result"]) if (typeof row[key] === "string" && row[key].trim()) return extractText(row[key]); for (const item of Object.values(row)) { const found = extractText(item); if (found.trim()) return found; } return ""; }
type IflytekSegment = { id: number; text: string; isFinal: boolean };
function asObject(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function parseIflytekData(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try { return asObject(JSON.parse(value)); } catch { return null; }
  }
  return asObject(value);
}
/**
 * RTASR LLM sends several hypotheses for one `seg_id`. `type=1` is an
 * interim hypothesis and `type=0` is the stable result. Appending every
 * message produces duplicated text such as “测试测试测试”, so callers must
 * replace a segment rather than concatenate every websocket packet.
 */
function parseIflytekSegment(value: unknown): IflytekSegment | null {
  const data = parseIflytekData(value);
  if (!data) return null;
  const segmentId = Number(data.seg_id);
  const cn = asObject(data.cn), st = asObject(cn?.st), results = Array.isArray(st?.rt) ? st.rt : [];
  const words: string[] = [];
  for (const result of results) {
    const row = asObject(result);
    const blocks = Array.isArray(row?.ws) ? row.ws : [];
    for (const block of blocks) {
      const candidateValue = asObject(block)?.cw;
      const candidates = Array.isArray(candidateValue) ? candidateValue : [];
      const candidate = asObject(candidates[0]);
      const word = typeof candidate?.w === "string" ? candidate.w : "";
      if (word) words.push(word);
    }
  }
  const text = words.join("");
  if (!text || !Number.isFinite(segmentId)) return null;
  return { id: segmentId, text, isFinal: Number(st?.type) === 0 };
}
function joinOverlappingSegments(segments: string[]): string {
  return segments.reduce((combined, next) => {
    if (!combined || !next) return combined || next;
    const maxOverlap = Math.min(combined.length, next.length);
    for (let length = maxOverlap; length > 0; length -= 1) {
      if (combined.endsWith(next.slice(0, length))) return combined + next.slice(length);
    }
    return combined + next;
  }, "");
}
function iflytekEnvelope(payload: Record<string, unknown>) {
  const data = payload.data;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") return { ...payload, ...(parsed as Record<string, unknown>) };
    } catch {
      // Text-bearing result payloads are handled by extractText below.
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) return { ...payload, ...(data as Record<string, unknown>) };
  return payload;
}

/** 科大讯飞实时语音转写大模型。只在服务端发起 WebSocket 调用。 */
export class IflytekRealtimeLlmProvider implements SpeechProvider {
  readonly name = "iflytek" as const;
  getSupportedMimeTypes() { return ["audio/pcm"] as const; }
  validateAudio(input: SpeechTranscriptionInput) { return validate(input, this.getSupportedMimeTypes()); }
  private config() { const appId = process.env.SPEECH_APP_ID?.trim(); const key = process.env.SPEECH_API_KEY?.trim(); const secret = process.env.SPEECH_API_SECRET?.trim(); if (!appId || !key || !secret) throw new ApiError(503, "SPEECH_UNCONFIGURED", "讯飞实时语音转写大模型未完整配置 SPEECH_APP_ID、SPEECH_API_KEY、SPEECH_API_SECRET"); return { appId, key, secret, endpoint: process.env.SPEECH_BASE_URL?.trim() || "wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1" }; }
  private signedUrl() {
    const { appId, key, secret, endpoint } = this.config();
    // RTASR LLM's handshake requires `lang` and `samplerate`; `language` is
    // not a recognized query parameter. Every signed parameter is included in
    // the canonical string before the signature itself is appended.
    const params: Record<string, string> = {
      accessKeyId: key,
      appId,
      audio_encode: "pcm_s16le",
      lang: "autodialect",
      samplerate: "16000",
      utc: chinaTime(),
      uuid: randomUUID(),
    };
    const canonical = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const signature = createHmac("sha1", secret).update(canonical).digest("base64");
    return `${endpoint}?${canonical}&signature=${encodeURIComponent(signature)}`;
  }
  async healthCheck() { try { this.config(); return { ok: true, provider: this.name, detail: "credentials present; health check does not create a billable ASR session" }; } catch (error) { return { ok: false, provider: this.name, detail: error instanceof Error ? error.message : "configuration invalid" }; } }
  async transcribe(input: SpeechTranscriptionInput): Promise<SpeechTranscriptionResult> {
    const checked = this.validateAudio(input); const timeoutMs = envNumber("SPEECH_TIMEOUT_MS", 30000);
    const text = await new Promise<string>((resolve, reject) => {
      let settled = false;
      let fallbackOutput = "";
      const finalSegments = new Map<number, string>();
      const interimSegments = new Map<number, string>();
      const output = () => joinOverlappingSegments([...new Set([...finalSegments.keys(), ...interimSegments.keys()])]
        .sort((left, right) => left - right)
        .map((id) => finalSegments.get(id) ?? interimSegments.get(id) ?? "")
      ) || fallbackOutput;
      const socket = new WebSocket(this.signedUrl());
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timeout); try { socket.close(); } catch {} if (error) reject(error); else resolve(output()); };
      const timeout = setTimeout(() => finish(new ApiError(504, "SPEECH_TIMEOUT", "讯飞转写超时")), timeoutMs);
      const sendAudio = (sessionId: string) => {
        const bytes = new Uint8Array(input.audio!);
        let offset = 0;
        // iFlytek expects 40ms (1280-byte) PCM frames in real time. Sending a
        // complete recording synchronously can make the engine reject the
        // session even though the handshake and credentials are valid.
        const sendNext = () => {
          if (settled) return;
          if (offset >= bytes.byteLength) {
            socket.send(JSON.stringify({ end: true, sessionId }));
            return;
          }
          socket.send(bytes.slice(offset, Math.min(offset + 1280, bytes.byteLength)));
          offset += 1280;
          setTimeout(sendNext, 40);
        };
        sendNext();
      };
      socket.addEventListener("error", () => finish(new ApiError(502, "SPEECH_UPSTREAM", "讯飞转写连接失败")));
      socket.addEventListener("close", (event) => {
        // RTASR LLM closes the socket normally after the final result on some
        // successful sessions instead of emitting an explicit `end` action.
        // Treat that protocol-compliant close as completion only when at least
        // one transcript fragment has been received; a normal close with no
        // content still remains a useful upstream failure.
        if (event.code === 1000 && output().trim()) return finish();
        if (!settled) finish(new ApiError(502, "SPEECH_UPSTREAM", "讯飞转写连接意外结束"));
      });
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(typeof event.data === "string" ? event.data : "{}") as Record<string, unknown>;
          // The RTASR LLM WebSocket envelopes lifecycle events in `data`, e.g.
          // { msg_type: "event", data: { action: "started", sessionId: "…" } }.
          // Result events may instead contain a JSON string in `data`, so both
          // forms are normalized before checking lifecycle fields.
          const message = iflytekEnvelope(payload);
          if (message.action === "error") return finish(new ApiError(502, "SPEECH_UPSTREAM", "讯飞转写服务返回错误"));
          const code = message.code ?? message.status;
          if (code !== undefined && String(code) !== "0" && String(code) !== "200") return finish(new ApiError(502, "SPEECH_UPSTREAM", "讯飞转写服务返回错误"));
          if (message.action === "started") {
            const sessionId = typeof message.sessionId === "string" ? message.sessionId : typeof message.sid === "string" ? message.sid : "";
            if (!sessionId) return finish(new ApiError(502, "SPEECH_UPSTREAM", "讯飞未返回有效会话标识"));
            sendAudio(sessionId);
            return;
          }
          const segment = parseIflytekSegment(payload.data);
          if (segment) {
            if (segment.isFinal) {
              finalSegments.set(segment.id, segment.text);
              interimSegments.delete(segment.id);
            } else if (!finalSegments.has(segment.id)) {
              interimSegments.set(segment.id, segment.text);
            }
          } else {
            const fragment = extractText(message.data ?? message.result ?? message);
            if (fragment) fallbackOutput += fragment;
          }
          if (message.end === true || message.status === 2 || message.action === "end") finish();
        } catch { finish(new ApiError(502, "SPEECH_UPSTREAM", "讯飞转写响应格式无效")); }
      });
    });
    if (!text.trim()) throw new ApiError(502, "SPEECH_EMPTY_RESPONSE", "讯飞未返回可用转写文本");
    return { text: text.trim(), language: input.language ?? "zh-CN", durationMs: checked.durationMs, confidence: null, provider: this.name, model: "rtasr-llm", isMock: false };
  }
}
class UnsupportedSpeechProvider implements SpeechProvider { constructor(readonly name: "aliyun" | "tencent") {} getSupportedMimeTypes() { return [] as const; } validateAudio(_input: SpeechTranscriptionInput): AudioValidation { void _input; throw new ApiError(503, "SPEECH_PROVIDER_UNAVAILABLE", `${this.name} 适配器尚未实现；请设 SPEECH_PROVIDER=mock 或 iflytek`); } async healthCheck() { return { ok: false, provider: this.name, detail: "adapter not implemented" }; } async transcribe(_input: SpeechTranscriptionInput): Promise<SpeechTranscriptionResult> { void _input; throw new ApiError(503, "SPEECH_PROVIDER_UNAVAILABLE", `${this.name} 适配器尚未实现`); } }
export class SpeechAdapter { constructor(private readonly provider: SpeechProvider) {} transcribe(input: SpeechTranscriptionInput) { return this.provider.transcribe(input); } getProviderName() { return this.provider.name; } healthCheck() { return this.provider.healthCheck(); } validateAudio(input: SpeechTranscriptionInput) { return this.provider.validateAudio(input); } getSupportedMimeTypes() { return this.provider.getSupportedMimeTypes(); } }
export function createConfiguredSpeechAdapter() { const provider = currentProvider(); if (provider === "mock") return new SpeechAdapter(new MockSpeechProvider()); if (provider === "iflytek") return new SpeechAdapter(new IflytekRealtimeLlmProvider()); return new SpeechAdapter(new UnsupportedSpeechProvider(provider)); }
export const speechAdapter = createConfiguredSpeechAdapter();
