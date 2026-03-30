/** Build markdown for the task detail editor from `get-task` JSON. */

function fmt(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  return String(v);
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function pushSection(lines: string[], title: string, bodyLines: string[]): void {
  if (bodyLines.length === 0) {
    return;
  }
  lines.push(`## ${title}`, "", ...bodyLines, "");
}

export function buildTaskDetailMarkdown(input: {
  task: Record<string, unknown>;
  allowedActions: Record<string, unknown>[];
  recentTransitions: Record<string, unknown>[];
}): string {
  const { task, allowedActions, recentTransitions } = input;
  const lines: string[] = [];

  lines.push(`# ${fmt(task.id)} — ${fmt(task.title)}`, "");

  lines.push("## Summary", "");
  lines.push(`- **Status:** ${fmt(task.status)}`);
  lines.push(`- **Type:** ${fmt(task.type)}`);
  if (task.priority !== undefined && fmt(task.priority)) {
    lines.push(`- **Priority:** ${fmt(task.priority)}`);
  }
  if (task.phase !== undefined && fmt(task.phase)) {
    lines.push(`- **Phase:** ${fmt(task.phase)}`);
  }
  if (task.ownership !== undefined && fmt(task.ownership)) {
    lines.push(`- **Ownership:** ${fmt(task.ownership)}`);
  }
  if (task.archived === true) {
    lines.push(`- **Archived:** yes${task.archivedAt ? ` (${fmt(task.archivedAt)})` : ""}`);
  }
  lines.push(`- **Created:** ${fmt(task.createdAt)}`);
  lines.push(`- **Updated:** ${fmt(task.updatedAt)}`);
  lines.push("");

  const deps = stringArray(task.dependsOn);
  if (deps.length > 0) {
    pushSection(lines, "Depends on", deps.map((d) => `- \`${d}\``));
  }

  const unblocks = stringArray(task.unblocks);
  if (unblocks.length > 0) {
    pushSection(lines, "Unblocks", unblocks.map((u) => `- \`${u}\``));
  }

  const approach = fmt(task.approach).trim();
  if (approach) {
    pushSection(lines, "Approach", [approach]);
  }

  const scope = stringArray(task.technicalScope);
  if (scope.length > 0) {
    pushSection(lines, "Technical scope", scope.map((s) => `- ${s}`));
  }

  const criteria = stringArray(task.acceptanceCriteria);
  if (criteria.length > 0) {
    pushSection(lines, "Acceptance criteria", criteria.map((c) => `- ${c}`));
  }

  const meta = task.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta) && Object.keys(meta as object).length > 0) {
    const json = JSON.stringify(meta, null, 2);
    pushSection(lines, "Metadata", ["```json", json, "```"]);
  }

  lines.push("## Allowed actions", "");
  if (allowedActions.length === 0) {
    lines.push("—", "");
  } else {
    for (const a of allowedActions) {
      lines.push(`- **${fmt(a.action)}** → ${fmt(a.targetStatus)}`);
    }
    lines.push("");
  }

  lines.push("## Recent transitions", "");
  if (recentTransitions.length === 0) {
    lines.push("—", "");
  } else {
    for (const x of recentTransitions) {
      lines.push(
        `- ${fmt(x.timestamp)}: **${fmt(x.action)}** (${fmt(x.fromState)} → ${fmt(x.toState)})`
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
