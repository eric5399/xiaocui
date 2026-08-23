import { describe, expect, it } from "vitest";
import { generateInviteCode } from "../lib/domain/invite-code";

describe("generateInviteCode", () => {
  it("is stable, readable and six characters long", () => {
    const first = generateInviteCode("scenario-1");
    const second = generateInviteCode("scenario-1");

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("uses a deterministic next candidate on collision", () => {
    const first = generateInviteCode("scenario-1");
    const next = generateInviteCode("scenario-1", [first]);

    expect(next).not.toBe(first);
    expect(next).toBe(generateInviteCode("scenario-1", [first]));
  });
});
