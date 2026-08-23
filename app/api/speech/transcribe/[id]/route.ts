import { route } from "@/lib/api/response";
import { getRequestSpeechService } from "@/lib/security/request-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => (await getRequestSpeechService(request)).get((await params).id, new URL(request.url).searchParams.get("includeAudio") === "true"));
}
