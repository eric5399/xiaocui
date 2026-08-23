import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const component = (name: string) => readFileSync(resolve(process.cwd(), "components/admin", name), "utf8");

describe("admin real-data migration", () => {
  it("routes core management screens through the authenticated API client", () => {
    for (const name of ["Dashboard.tsx", "ScenarioList.tsx", "ScenarioDetail.tsx", "FusionWorkbench.tsx", "ReferencePreview.tsx", "InterviewDetail.tsx"]) {
      const source = component(name);
      expect(source).toContain("admin-data-client");
      expect(source).not.toContain("./seed");
      expect(source).not.toContain("localStorage");
    }
  });

  it("does not use local browser storage when creating a task", () => {
    const source = component("ScenarioWizard.tsx");
    expect(source).toContain("createAdminScenario");
    expect(source).toContain("createAdminTask");
    expect(source).not.toContain("localStorage");
  });
});
