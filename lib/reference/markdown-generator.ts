import type { FusionResult } from "@/lib/domain";

function safeInline(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function bullets(values: string[], emptyText = "- 暂无足够证据，需人工补充。") {
  const lines = values.map(safeInline).filter(Boolean).map((value) => `- ${value}`);
  return lines.length > 0 ? lines.join("\n") : emptyText;
}

function numbered(values: string[]) {
  const lines = values.map(safeInline).filter(Boolean).map((value, index) => `${index + 1}. ${value}`);
  return lines.length > 0 ? lines.join("\n") : "1. 暂无足够证据，需人工补充。";
}

export function anonymizeInterviewId(id: string): string {
  const cleaned = safeInline(id);
  if (cleaned.length <= 12) return cleaned;
  return `${cleaned.slice(0, 8)}…${cleaned.slice(-4)}`;
}

export function generateReferenceMarkdown(result: FusionResult): string {
  const sourceLabels = result.sourceInterviewIds.map((id) => `匿名访谈 ${anonymizeInterviewId(id)}`);

  return [
    `# ${safeInline(result.strategyName) || "未命名机构经验策略"}`,
    "",
    "## 适用场景",
    "",
    bullets(result.applicableScenarios),
    "",
    "## 触发条件",
    "",
    bullets(result.triggerConditions),
    "",
    "## 判断逻辑",
    "",
    bullets(result.judgements),
    "",
    "## 推荐动作",
    "",
    numbered(result.recommendedActions),
    "",
    "### 执行步骤",
    "",
    numbered(result.executionSteps),
    "",
    "## 注意事项",
    "",
    bullets(result.cautions),
    "",
    "## 不适用条件",
    "",
    bullets(result.inapplicableConditions),
    "",
    "## 经验来源",
    "",
    bullets(sourceLabels),
    "",
    "> 本 Reference 由有限访谈样本的 Mock 融合链路生成，正式应用前需由业务负责人复核。",
    "",
  ].join("\n");
}

export function generateReferenceFilename(strategyName: string): string {
  const base = safeInline(strategyName)
    .replace(/[\\/:*?"<>|#]/g, "-")
    .replace(/\.+$/g, "")
    .slice(0, 80);
  return `${base || "机构经验策略"}.md`;
}
