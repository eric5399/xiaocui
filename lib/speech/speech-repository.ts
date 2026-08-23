import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpeechTranscript, SpeechTranscriptStatus } from "@/lib/domain";
import { RepositoryError } from "@/lib/repository/supabase-repository";

export type CreateSpeechTranscriptInput = Pick<SpeechTranscript, "userId" | "interviewId" | "storagePath" | "provider" | "model" | "language" | "durationMs" | "consentedAt">;
export type UpdateSpeechTranscriptInput = Partial<Pick<SpeechTranscript, "status" | "text" | "confidence" | "durationMs" | "errorCode">>;

export interface SpeechRepository {
  createTranscript(input: CreateSpeechTranscriptInput): Promise<SpeechTranscript>;
  getTranscript(id: string): Promise<SpeechTranscript | undefined>;
  updateTranscript(id: string, input: UpdateSpeechTranscriptInput): Promise<SpeechTranscript | undefined>;
  upload(path: string, data: ArrayBuffer, contentType: string): Promise<void>;
  download(path: string): Promise<ArrayBuffer>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
}

type Row = Record<string, unknown>;
function string(row: Row, name: string, nullable = false): string | null {
  const value = row[name];
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string") throw new RepositoryError(`speech_transcripts.${name} 数据类型无效`);
  return value;
}
function number(row: Row, name: string, nullable = false): number | null {
  const value = row[name];
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "number") throw new RepositoryError(`speech_transcripts.${name} 数据类型无效`);
  return value;
}
function transcript(value: unknown): SpeechTranscript {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RepositoryError("speech transcript 数据无效");
  const row = value as Row;
  return {
    id: string(row, "id")!, organizationId: string(row, "organization_id", true), userId: string(row, "user_id", true),
    interviewId: string(row, "interview_id", true), storagePath: string(row, "storage_path")!, provider: string(row, "provider")!,
    model: string(row, "model", true), status: string(row, "status")! as SpeechTranscriptStatus,
    text: string(row, "transcript", true), confidence: number(row, "confidence", true), language: string(row, "language")!,
    durationMs: number(row, "duration_ms", true), consentedAt: string(row, "consented_at", true), expiresAt: string(row, "expires_at")!,
    errorCode: string(row, "error_code", true), createdAt: string(row, "created_at")!, updatedAt: string(row, "updated_at")!,
  };
}

export class SupabaseSpeechRepository implements SpeechRepository {
  constructor(private readonly client: SupabaseClient) {}
  async createTranscript(input: CreateSpeechTranscriptInput) {
    const { data, error } = await this.client.from("speech_transcripts").insert({
      user_id: input.userId, interview_id: input.interviewId, storage_path: input.storagePath, provider: input.provider,
      model: input.model, language: input.language, duration_ms: input.durationMs, consented_at: input.consentedAt,
    }).select("*").single();
    if (error) throw new RepositoryError(error.message, error.code);
    return transcript(data);
  }
  async getTranscript(id: string) {
    const { data, error } = await this.client.from("speech_transcripts").select("*").eq("id", id).maybeSingle();
    if (error) throw new RepositoryError(error.message, error.code);
    return data ? transcript(data) : undefined;
  }
  async updateTranscript(id: string, input: UpdateSpeechTranscriptInput) {
    const { data, error } = await this.client.from("speech_transcripts").update({
      ...(input.status === undefined ? {} : { status: input.status }), ...(input.text === undefined ? {} : { transcript: input.text }),
      ...(input.confidence === undefined ? {} : { confidence: input.confidence }), ...(input.durationMs === undefined ? {} : { duration_ms: input.durationMs }),
      ...(input.errorCode === undefined ? {} : { error_code: input.errorCode }),
    }).eq("id", id).select("*").maybeSingle();
    if (error) throw new RepositoryError(error.message, error.code);
    return data ? transcript(data) : undefined;
  }
  async upload(path: string, data: ArrayBuffer, contentType: string) {
    const { error } = await this.client.storage.from("interview-audio").upload(path, data, { contentType, upsert: false });
    if (error) throw new RepositoryError(error.message);
  }
  async download(path: string) {
    const { data, error } = await this.client.storage.from("interview-audio").download(path);
    if (error || !data) throw new RepositoryError(error?.message ?? "未找到音频对象");
    return data.arrayBuffer();
  }
  async createSignedUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.client.storage.from("interview-audio").createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) throw new RepositoryError(error?.message ?? "无法生成短时效音频地址");
    return data.signedUrl;
  }
  async remove(path: string) {
    const { error } = await this.client.storage.from("interview-audio").remove([path]);
    if (error) throw new RepositoryError(error.message);
  }
}

const memory = new Map<string, SpeechTranscript>();
const audio = new Map<string, ArrayBuffer>();
export class MockSpeechRepository implements SpeechRepository {
  async createTranscript(input: CreateSpeechTranscriptInput) {
    const now = new Date().toISOString();
    const row: SpeechTranscript = { id: crypto.randomUUID(), organizationId: null, userId: input.userId, interviewId: input.interviewId, storagePath: input.storagePath, provider: input.provider, model: input.model, status: "uploaded", text: null, confidence: null, language: input.language, durationMs: input.durationMs, consentedAt: input.consentedAt, expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(), errorCode: null, createdAt: now, updatedAt: now };
    memory.set(row.id, row); return { ...row };
  }
  async getTranscript(id: string) { const row = memory.get(id); return row ? { ...row } : undefined; }
  async updateTranscript(id: string, input: UpdateSpeechTranscriptInput) { const row = memory.get(id); if (!row) return undefined; Object.assign(row, input, { updatedAt: new Date().toISOString() }); return { ...row }; }
  async upload(path: string, data: ArrayBuffer) { audio.set(path, data.slice(0)); }
  async download(path: string) { const data = audio.get(path); if (!data) throw new RepositoryError("未找到模拟音频"); return data.slice(0); }
  async createSignedUrl(path: string) { if (!audio.has(path)) throw new RepositoryError("未找到模拟音频"); return `mock://interview-audio/${path}`; }
  async remove(path: string) { audio.delete(path); }
}
