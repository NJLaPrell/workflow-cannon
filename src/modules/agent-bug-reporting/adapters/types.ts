/**
 * Platform-agnostic spawn interface for the bug-reporter child.
 * Kit `spawn-subagent` only records provenance; hosts (or CLI) execute.
 */

export const BUG_REPORT_HANDOFF_SCHEMA_VERSION = 1 as const;

export type BugReportHandoffV1 = {
  schemaVersion: typeof BUG_REPORT_HANDOFF_SCHEMA_VERSION;
  skillId: "wc-bug-report";
  symptom: string;
  command?: string;
  code?: string;
  remediationHint?: string;
  relatedTaskId?: string;
  evidenceCrumbs?: string[];
  clientMutationId?: string;
};

/** Hosts with a spawn adapter (implemented or stub). */
export type BugReporterHostId = "cursor" | "cli" | "antigravity" | "vscode-copilot";

export type HostSpawnRequest = {
  handoff: BugReportHandoffV1;
  /** Defaults to wc-bug-reporter. */
  subagentId?: string;
  /** Prefer module seed pin when omitted. */
  model?: string;
  /** When true, include a kit spawn-subagent provenance argv hint. */
  recordProvenance?: boolean;
  promptSummary?: string;
};

export type CursorTaskSpawnShape = {
  tool: "Task";
  run_in_background: true;
  subagent_type: "generalPurpose";
  model: string;
  prompt: string;
  description: string;
};

export type CliFilingCommandShape = {
  commandName: "file-bug-report";
  args: Record<string, unknown>;
  /** Copy-paste CLI line (policy/planning fields filled by caller when required). */
  argvExample: string;
};

export type HostSpawnContractStub = {
  /** Same fire-and-forget shape every host must honor. */
  backgroundPreferred: true;
  handoffSchemaVersion: typeof BUG_REPORT_HANDOFF_SCHEMA_VERSION;
  defaultSkillId: "wc-bug-report";
  /** When the host cannot background-spawn, use CLI adapter. */
  fallbackHost: "cli";
  notes: string;
};

export type HostSpawnPlan =
  | {
      host: "cursor";
      maturity: "implemented";
      awaitChild: false;
      taskTool: CursorTaskSpawnShape;
      provenance?: { commandName: "spawn-subagent"; argsHint: Record<string, unknown> };
    }
  | {
      host: "cli";
      maturity: "implemented";
      awaitChild: false;
      filing: CliFilingCommandShape;
      provenance?: { commandName: "spawn-subagent"; argsHint: Record<string, unknown> };
    }
  | {
      host: "antigravity";
      maturity: "stub";
      awaitChild: false;
      contract: HostSpawnContractStub;
      /** Stub never launches; always point at CLI for v1 filing. */
      fallback: Extract<HostSpawnPlan, { host: "cli" }>;
    }
  | {
      host: "vscode-copilot";
      maturity: "stub";
      awaitChild: false;
      contract: HostSpawnContractStub;
      fallback: Extract<HostSpawnPlan, { host: "cli" }>;
    };

export interface HostSpawnAdapter {
  readonly hostId: BugReporterHostId;
  readonly maturity: "implemented" | "stub";
  buildPlan(request: HostSpawnRequest): HostSpawnPlan;
}

export function assertBugReportHandoff(raw: unknown): { ok: true; handoff: BugReportHandoffV1 } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "handoff must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const symptom = typeof o.symptom === "string" ? o.symptom.trim() : "";
  if (!symptom) {
    return { ok: false, message: "handoff.symptom is required" };
  }
  const schemaVersion = o.schemaVersion === undefined ? 1 : o.schemaVersion;
  if (schemaVersion !== 1) {
    return { ok: false, message: "handoff.schemaVersion must be 1" };
  }
  const skillId = o.skillId === undefined ? "wc-bug-report" : o.skillId;
  if (skillId !== "wc-bug-report") {
    return { ok: false, message: "handoff.skillId must be wc-bug-report" };
  }
  const handoff: BugReportHandoffV1 = {
    schemaVersion: 1,
    skillId: "wc-bug-report",
    symptom
  };
  if (typeof o.command === "string" && o.command.trim()) handoff.command = o.command.trim();
  if (typeof o.code === "string" && o.code.trim()) handoff.code = o.code.trim();
  if (typeof o.remediationHint === "string" && o.remediationHint.trim()) {
    handoff.remediationHint = o.remediationHint.trim();
  }
  if (typeof o.relatedTaskId === "string" && o.relatedTaskId.trim()) {
    handoff.relatedTaskId = o.relatedTaskId.trim();
  }
  if (Array.isArray(o.evidenceCrumbs)) {
    const crumbs = o.evidenceCrumbs
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim())
      .slice(0, 5);
    if (crumbs.length) handoff.evidenceCrumbs = crumbs;
  }
  if (typeof o.clientMutationId === "string" && o.clientMutationId.trim()) {
    handoff.clientMutationId = o.clientMutationId.trim();
  }
  return { ok: true, handoff };
}
