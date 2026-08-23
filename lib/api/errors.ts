import { ZodError } from "zod";
import type { JsonValue } from "@/lib/domain";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: JsonValue,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(422, "VALIDATION_ERROR", "请求数据校验失败", error.issues as unknown as JsonValue);
  }
  if (error instanceof SyntaxError) {
    return new ApiError(400, "INVALID_JSON", "请求体不是有效的 JSON");
  }
  // Repository adapters deliberately retain provider codes internally. Convert
  // authorization and ownership denials into a safe, readable API error rather
  // than exposing a raw Postgres/RLS message to participants.
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "42501" || code === "PGRST301") {
      return new ApiError(403, "DATA_ACCESS_DENIED", "你没有访问这条任务或访谈的权限");
    }
  }
  const message = error instanceof Error ? error.message : "未知错误";
  return new ApiError(500, "INTERNAL_ERROR", message);
}
