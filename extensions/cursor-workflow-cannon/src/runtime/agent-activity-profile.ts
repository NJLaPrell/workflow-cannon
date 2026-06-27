/** Map Cursor Task `subagent_type` to kit agent-definition ids for dashboard type labels. */
export function mapCursorSubagentTypeToDefinitionId(subagentType: string): string {
  const value = subagentType.trim().toLowerCase();
  switch (value) {
    case "explore":
      return "explorer";
    case "shell":
      return "shell-worker";
    case "bugbot":
      return "reviewer";
    case "generalpurpose":
      return "task-worker";
    case "ci-investigator":
      return "validator";
    case "security-review":
      return "reviewer";
    default:
      return value.length > 0 ? value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") : "subagent";
  }
}

export function titleCaseToken(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Derive a dashboard thinking label from a Cursor model slug when explicit thinking is absent. */
export function thinkingLevelFromModelSlug(modelSlug: string | null | undefined): string | null {
  const model = typeof modelSlug === "string" ? modelSlug.trim() : "";
  if (!model) {
    return null;
  }
  const thinkingMatch = model.match(/-thinking(?:-([a-z0-9-]+))?$/i);
  if (thinkingMatch) {
    const suffix = thinkingMatch[1]?.trim();
    return suffix ? titleCaseToken(suffix) : "Thinking";
  }
  const levelMatch = model.match(/-(high|medium|low|max)$/i);
  if (levelMatch) {
    return titleCaseToken(levelMatch[1]!);
  }
  if (/fast$/i.test(model)) {
    return "Fast";
  }
  return null;
}

export function extractTaskIdFromText(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  const match = text.match(/\bT\d{3,}\b/);
  return match ? match[0] : null;
}
