import fs from "node:fs/promises";
import path from "node:path";

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

export async function readWorkspaceStatusSnapshot(
  workspacePath: string
): Promise<WorkspaceStatusSnapshot | null> {
  const filePath = path.join(workspacePath, "docs/maintainers/data/workspace-kit-status.yaml");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseWorkspaceKitStatusYaml(raw);
  } catch {
    return null;
  }
}
