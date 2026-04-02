import fs from "node:fs/promises";
import path from "node:path";

/** Relative path from workspace root to maintainer phase snapshot (dashboard + doctor). */
export const WORKSPACE_KIT_STATUS_YAML_RELATIVE = "docs/maintainers/data/workspace-kit-status.yaml";

/** Best-effort parse of maintainer status YAML for dashboard UIs (no full YAML dependency). */
export type WorkspaceStatusSnapshot = {
  currentKitPhase: string | null;
  /** Maintainer-maintained `next_kit_phase` in workspace-kit-status.yaml; null when unset. */
  nextKitPhase: string | null;
  /** Maintainer narrative; still returned for tooling — dashboard UI prefers `nextAgentActions` + phases. */
  activeFocus: string | null;
  lastUpdated: string | null;
  blockers: string[];
  pendingDecisions: string[];
  nextAgentActions: string[];
};

function unescapeYamlDoubleQuotedInner(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseIndentedStringList(lines: string[], startIndex: number): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let i = startIndex;
  const dq = /^\s*-\s*"(.*)"\s*$/;
  const sq = /^\s*-\s*'(.*)'\s*$/;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    if (/^[A-Za-z0-9_]+:\s*/.test(line) && !/^\s/.test(line)) {
      break;
    }
    const md = line.match(dq);
    if (md) {
      items.push(unescapeYamlDoubleQuotedInner(md[1] ?? ""));
      i++;
      continue;
    }
    const ms = line.match(sq);
    if (ms) {
      items.push((ms[1] ?? "").replace(/''/g, "'"));
      i++;
      continue;
    }
    break;
  }
  return { items, nextIndex: i };
}

function parseKeyStringList(lines: string[], key: string): string[] {
  const lineRe = new RegExp(`^\\s*${key}:\\s*(.*)$`);
  const idx = lines.findIndex((l) => lineRe.test(l));
  if (idx < 0) {
    return [];
  }
  const m = lines[idx].match(lineRe);
  const rest = (m?.[1] ?? "").trim();
  if (rest === "[]") {
    return [];
  }
  if (rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2) {
    return [unescapeYamlDoubleQuotedInner(rest.slice(1, -1))];
  }
  const { items } = parseIndentedStringList(lines, idx + 1);
  return items;
}

/**
 * Parse `docs/maintainers/data/workspace-kit-status.yaml` contents (tests + internal).
 * Tolerant: list keys use the repo’s usual `- "..."` list items; unknown shapes yield empty arrays.
 */
export function parseWorkspaceKitStatusYaml(raw: string): WorkspaceStatusSnapshot {
  const lines = raw.split(/\r?\n/);
  const phaseMatch = raw.match(/^\s*current_kit_phase:\s*["']?([^"'\n#]+?)["']?\s*$/m);
  const nextPhaseMatch = raw.match(/^\s*next_kit_phase:\s*["']?([^"'\n#]+?)["']?\s*$/m);
  const focusMatch = raw.match(/^\s*active_focus:\s*"([^"]*)"\s*$/m);
  const updatedMatch = raw.match(/^\s*last_updated:\s*["']?([^"'\n#]+?)["']?\s*$/m);
  return {
    currentKitPhase: phaseMatch?.[1]?.trim() ?? null,
    nextKitPhase: nextPhaseMatch?.[1]?.trim() ?? null,
    activeFocus: focusMatch?.[1] ?? null,
    lastUpdated: updatedMatch?.[1]?.trim() ?? null,
    blockers: parseKeyStringList(lines, "blockers"),
    pendingDecisions: parseKeyStringList(lines, "pending_decisions"),
    nextAgentActions: parseKeyStringList(lines, "next_agent_actions")
  };
}

/** Escape inner string for a double-quoted YAML scalar on one line. */
export function escapeWorkspaceKitStatusYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * True when `value` is safe for `current_kit_phase` / `next_kit_phase` single-line scalars.
 * Rejects empty, control characters, and newlines.
 */
export function isValidWorkspacePhaseSnapshotValue(value: string): boolean {
  const t = value.trim();
  if (t.length === 0 || t.length > 120) {
    return false;
  }
  if (/[\x00-\x1f\x7f]/.test(t)) {
    return false;
  }
  return !t.includes("\n") && !t.includes("\r");
}

export type WorkspacePhaseSnapshotYamlUpdates = {
  currentKitPhase?: string;
  /** When present and `null`, removes the `next_kit_phase` line entirely. */
  nextKitPhase?: string | null;
};

export type ApplyWorkspacePhaseSnapshotYamlResult =
  | { ok: true; yaml: string }
  | { ok: false; message: string };

/**
 * Replace only `current_kit_phase` and/or `next_kit_phase` top-level lines; all other bytes unchanged.
 * Does not parse full YAML — assumes repo-style single-line scalars for these keys.
 */
export function applyWorkspacePhaseSnapshotToYaml(
  raw: string,
  updates: WorkspacePhaseSnapshotYamlUpdates
): ApplyWorkspacePhaseSnapshotYamlResult {
  const touchCurrent = updates.currentKitPhase !== undefined;
  const touchNext = updates.nextKitPhase !== undefined;
  if (!touchCurrent && !touchNext) {
    return { ok: false, message: "Provide at least one of currentKitPhase or nextKitPhase" };
  }
  let out = raw;
  if (touchCurrent) {
    const v = updates.currentKitPhase!.trim();
    if (!isValidWorkspacePhaseSnapshotValue(v)) {
      return { ok: false, message: "Invalid currentKitPhase (non-empty printable single-line string required)" };
    }
    const line = `current_kit_phase: "${escapeWorkspaceKitStatusYamlDoubleQuoted(v)}"`;
    if (!/^\s*current_kit_phase:\s/m.test(out)) {
      return { ok: false, message: "workspace-kit-status.yaml missing current_kit_phase line" };
    }
    out = out.replace(/^\s*current_kit_phase:\s*[^\n]*$/m, line);
  }
  if (touchNext) {
    const nextVal = updates.nextKitPhase;
    if (nextVal === null) {
      out = out.replace(/^\s*next_kit_phase:\s*[^\n]*\n?/m, "");
    } else if (typeof nextVal === "string") {
      const v = nextVal.trim();
      if (!isValidWorkspacePhaseSnapshotValue(v)) {
        return { ok: false, message: "Invalid nextKitPhase (non-empty printable single-line string required)" };
      }
      const line = `next_kit_phase: "${escapeWorkspaceKitStatusYamlDoubleQuoted(v)}"`;
      if (!/^\s*next_kit_phase:\s/m.test(out)) {
        return { ok: false, message: "workspace-kit-status.yaml missing next_kit_phase line" };
      }
      out = out.replace(/^\s*next_kit_phase:\s*[^\n]*$/m, line);
    } else {
      return { ok: false, message: "nextKitPhase must be a string or null" };
    }
  }
  return { ok: true, yaml: out };
}

export async function readWorkspaceStatusSnapshot(
  workspacePath: string
): Promise<WorkspaceStatusSnapshot | null> {
  const filePath = path.join(workspacePath, WORKSPACE_KIT_STATUS_YAML_RELATIVE);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseWorkspaceKitStatusYaml(raw);
  } catch {
    return null;
  }
}
