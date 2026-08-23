import { z } from "zod";
import { route } from "@/lib/api/response";
import { getRequestSpeechService } from "@/lib/security/request-service";

const schema = z.object({ transcriptId: z.uuid(), mockText: z.string().trim().max(10000).optional() });

export async function POST(request: Request) {
  return route(async () => {
    const payload = schema.parse(await request.json());
    return (await getRequestSpeechService(request)).transcribe(payload.transcriptId, payload.mockText);
  });
}
