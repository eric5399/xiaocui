import { z } from "zod";
import { route } from "@/lib/api/response";
import { getRequestSpeechService } from "@/lib/security/request-service";

const schema = z.object({ interviewId: z.uuid(), content: z.string().trim().min(1).max(10000), clientMessageId: z.string().trim().min(1).max(120).optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => (await getRequestSpeechService(request)).confirm({ transcriptId: (await params).id, ...schema.parse(await request.json()) }));
}
