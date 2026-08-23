import { ApiError } from "@/lib/api/errors";
import { route } from "@/lib/api/response";
import { getRequestSpeechService } from "@/lib/security/request-service";

export async function POST(request: Request) {
  return route(async () => {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) throw new ApiError(422, "INVALID_AUDIO", "audio 字段必须是音频文件");
    const interviewId = form.get("interviewId")?.toString();
    if (!interviewId) throw new ApiError(422, "INTERVIEW_REQUIRED", "必须提供 interviewId");
    return (await getRequestSpeechService(request)).upload({ interviewId, audio: await audio.arrayBuffer(), mimeType: audio.type || "audio/pcm", durationMs: Number(form.get("durationMs")) || null, language: form.get("language")?.toString() || "zh-CN", consented: form.get("consented") === "true", mockText: form.get("mockText")?.toString() });
  }, 201);
}
