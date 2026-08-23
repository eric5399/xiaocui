import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822000000_security_baseline.sql"),
  "utf8",
);
const initialSchema = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260820000000_initial_schema.sql"),
  "utf8",
);

describe("Supabase security baseline migration", () => {
  it("defines organisation scope, three identities and RLS policies", () => {
    expect(migration).toContain("create table public.organizations");
    expect(migration).toContain("create table public.organization_members");
    expect(migration).toContain("create table public.task_participants");
    expect(migration).toContain("role public.organization_member_role");
    for (const table of [
      "scenarios", "tasks", "custom_fields", "user_profiles", "challenge_cases",
      "interviews", "messages", "extracted_cases", "experience_rules", "fusion_jobs", "reference_files",
    ]) {
      expect(initialSchema).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} alter column organization_id set not null`);
    }
    expect(migration).toContain("tasks_member_select");
    expect(migration).toContain("messages_member_or_self");
  });

  it("makes cross-organisation reads impossible at policy level", () => {
    // This is a static guard for CI without a Supabase project. The only
    // applicable reads delegate to is_org_member/is_interview_participant;
    // there is deliberately no policy containing `using (true)`.
    expect(migration).toContain("public.is_org_member(organization_id)");
    expect(migration).toContain("public.is_interview_participant(interview_id)");
    expect(migration).not.toMatch(/create policy[^;]+using\s*\(true\)/i);
  });
});
