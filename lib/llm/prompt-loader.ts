import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const promptRoot = path.join(process.cwd(), "prompts");

/** Prompt content is loaded exclusively from prompts/*.md, never Route Handlers. */
export async function loadPrompt(name: "interview-agent" | "case-generator" | "fusion-agent" | "reference-generator") {
  return readFile(path.join(promptRoot, `${name}.md`), "utf8");
}
