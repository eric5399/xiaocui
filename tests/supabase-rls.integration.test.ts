import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const orgAToken = process.env.SUPABASE_TEST_ORG_A_ACCESS_TOKEN;
const orgBScenarioId = process.env.SUPABASE_TEST_ORG_B_SCENARIO_ID;
const enabled = Boolean(url && anonKey && orgAToken && orgBScenarioId);

describe.skipIf(!enabled)("Supabase RLS cross-organisation integration", () => {
  it("does not expose another institution's scenario to an institution A JWT", async () => {
    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgAToken}` } },
    });
    const { data, error } = await client.from("scenarios").select("id").eq("id", orgBScenarioId!);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
