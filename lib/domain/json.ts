import type { JsonObject } from "./types";

/** Converts Zod-validated record input to the domain's JSON object type. */
export function asJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}
