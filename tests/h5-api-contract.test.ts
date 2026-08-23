import { describe, expect, it } from "vitest";
import {
  mapApiStage,
  mergeApiCoverage,
} from "../components/h5/api-contract";
import { sendInterviewMessageSchema } from "../lib/domain/schemas";

describe("H5 Mock API contract mapping", () => {
  it("maps the API limitation stage to the H5 boundary dimension", () => {
    expect(mapApiStage("limitation")).toBe("boundary");
    expect(mapApiStage("complete")).toBeUndefined();
  });

  it("marks API-confirmed information complete without erasing local partial state", () => {
    const coverage = mergeApiCoverage(
      {
        discovery: 1,
        judgement: 0,
        action: 1,
        result: 0,
        boundary: 1,
      },
      {
        discovery: "captured",
        judgement: "captured",
        action: "missing",
        result: "missing",
        limitation: "captured",
      },
    );

    expect(coverage).toEqual({
      discovery: 2,
      judgement: 2,
      action: 1,
      result: 0,
      boundary: 2,
    });
  });

  it("accepts a stable client message id for idempotent retries", () => {
    const payload = sendInterviewMessageSchema.parse({
      interviewId: "c45c9e92-0941-46b7-83bc-2b810810e2ef",
      content: "测试回答",
      clientMessageId: "user-1720000000000",
    });

    expect(payload.clientMessageId).toBe("user-1720000000000");
  });
});
