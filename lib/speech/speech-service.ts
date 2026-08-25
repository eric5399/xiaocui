import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { ExperienceService } from "@/lib/services/experience-service";
import { speechAdapter, type SpeechAdapter } from "./speech-adapter";
import type { SpeechRepository } from "./speech-repository";

export class SpeechService {
  constructor(private readonly repository: SpeechRepository, private readonly experience: ExperienceService, private readonly userId: string, private readonly adapter: SpeechAdapter = speechAdapter) {}

  async upload(input: { interviewId: string; audio: ArrayBuffer; mimeType: string; durationMs?: number | null; language?: string; consented: boolean; mockText?: string }) {
    if (!input.consented) throw new ApiError(422, "SPEECH_CONSENT_REQUIRED", "请先确认录音与转写授权");
    const interview = await this.experience.getInterviewDetail(input.interviewId);
    if (!interview) throw new ApiError(404, "INTERVIEW_NOT_FOUND", "未找到对应访谈");
    if (interview.status !== "in_progress") throw new ApiError(409, "INTERVIEW_CLOSED", "访谈已结束，不能上传录音");
    const checked = this.adapter.validateAudio({ audio: input.audio, mimeType: input.mimeType, durationMs: input.durationMs, language: input.language, mockText: input.mockText });
    const storagePath = `${this.userId}/${crypto.randomUUID()}.${checked.mimeType === "audio/pcm" ? "pcm" : "audio"}`;
    const job = await this.repository.createTranscript({ userId: this.userId, interviewId: input.interviewId, storagePath, provider: this.adapter.getProviderName(), model: this.adapter.getProviderName() === "iflytek" ? "rtasr-llm" : "deterministic-mock-v1", language: input.language ?? "zh-CN", durationMs: checked.durationMs, consentedAt: new Date().toISOString() });
    try { await this.repository.upload(storagePath, input.audio, checked.mimeType); } catch (error) { await this.repository.updateTranscript(job.id, { status: "failed", errorCode: "UPLOAD_FAILED" }); throw error; }
    return { transcriptId: job.id, status: job.status, provider: job.provider, model: job.model, durationMs: job.durationMs };
  }
  async transcribe(transcriptId: string, mockText?: string) {
    const job = await this.repository.getTranscript(transcriptId);
    if (!job) throw new ApiError(404, "TRANSCRIPT_NOT_FOUND", "未找到对应转写任务");
    if (job.status === "completed") return this.response(job);
    if (job.status === "transcribing") {
      const elapsedMs = Date.now() - new Date(job.updatedAt).getTime();
      if (Number.isFinite(elapsedMs) && elapsedMs < 150_000) return this.response(job);
      await this.repository.updateTranscript(job.id, { status: "failed", errorCode: "SPEECH_STALLED" });
    }
    if (job.status === "expired") throw new ApiError(410, "TRANSCRIPT_EXPIRED", "录音已过期并不可再转写");
    const current = await this.repository.updateTranscript(job.id, { status: "transcribing", errorCode: null });
    if (!current) throw new ApiError(404, "TRANSCRIPT_NOT_FOUND", "未找到对应转写任务");
    try { const audio = await this.repository.download(current.storagePath); const result = await this.adapter.transcribe({ audio, mimeType: "audio/pcm", language: current.language, durationMs: current.durationMs, mockText }); const completed = await this.repository.updateTranscript(current.id, { status: "completed", text: result.text, confidence: result.confidence, durationMs: result.durationMs, errorCode: null }); return this.response(completed!); } catch (error) { await this.repository.updateTranscript(current.id, { status: "failed", errorCode: error instanceof ApiError ? error.code : "SPEECH_RUNTIME_FAILURE" }); throw error; }
  }
  async get(transcriptId: string, signedUrl = false) { const job = await this.repository.getTranscript(transcriptId); if (!job) throw new ApiError(404, "TRANSCRIPT_NOT_FOUND", "未找到对应转写任务"); return { ...this.response(job), ...(signedUrl && job.status !== "expired" ? { audioUrl: await this.repository.createSignedUrl(job.storagePath, 300) } : {}) }; }
  async confirm(input: { transcriptId: string; interviewId: string; content: string; clientMessageId?: string }) { const job = await this.repository.getTranscript(input.transcriptId); if (!job) throw new ApiError(404, "TRANSCRIPT_NOT_FOUND", "未找到对应转写任务"); if (job.status !== "completed" || !job.text) throw new ApiError(409, "TRANSCRIPT_NOT_READY", "转写完成并经用户确认后才能写入访谈"); if (job.interviewId !== input.interviewId) throw new ApiError(422, "TRANSCRIPT_INTERVIEW_MISMATCH", "转写任务不属于当前访谈"); const content = input.content.trim(); if (!content) throw new ApiError(422, "TRANSCRIPT_EMPTY", "确认后的转写内容不能为空"); return this.experience.sendMessage({ interviewId: input.interviewId, content, type: "audio_transcript", audioUrl: `storage://interview-audio/${job.storagePath}`, clientMessageId: input.clientMessageId }); }
  private response(job: NonNullable<Awaited<ReturnType<SpeechRepository["getTranscript"]>>>) { return { transcriptId: job.id, status: job.status, text: job.text, confidence: job.confidence, language: job.language, durationMs: job.durationMs, provider: job.provider, model: job.model, isMock: job.provider === "mock", errorCode: job.errorCode }; }
}
