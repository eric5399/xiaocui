import { ok } from "@/lib/api/response";
import { getDataProviderStatus } from "@/lib/repository/provider";

/**
 * Deployment health endpoint. It deliberately reveals neither identifiers,
 * credentials nor tenant data, and it never probes LLM/ASR providers (a
 * health check must not create an unrequested vendor call or cost).
 */
export async function GET() {
  const data = getDataProviderStatus();
  return ok({
    status: data.configured ? "ok" : "degraded",
    dataProvider: data.provider,
    persistent: data.isPersistent,
    configured: data.configured,
    timestamp: new Date().toISOString(),
  }, data.configured ? 200 : 503);
}
