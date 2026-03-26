import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

export const POLICY_TRACE_SCHEMA_VERSION = 1 as const;

export type PolicyOperationId =
  | "cli.upgrade"
  | "cli.init"
  | "cli.config-mutate"
  | "policy.dynamic-sensitive"
  | "doc.document-project"
  | "doc.generate-document"
  | "tasks.import-tasks"
  | "tasks.generate-tasks-md"
  | "tasks.run-transition"
  | "approvals.review-item"
  | "improvement.generate-recommendations";

const COMMAND_TO_OPERATION: Record<string, PolicyOperationId | undefined> = {
  "document-project": "doc.document-project",
  "generate-document": "doc.generate-document",
  "import-tasks": "tasks.import-tasks",
  "generate-tasks-md": "tasks.generate-tasks-md",
  "run-transition": "tasks.run-transition",
  "review-item": "approvals.review-item",
  "generate-recommendations": "improvement.generate-recommendations"
};

export function getOperationIdForCommand(commandName: string): PolicyOperationId | undefined {
  return COMMAND_TO_OPERATION[commandName];
}

export function getExtraSensitiveModuleCommandsFromEffective(
  effective: Record<string, unknown>
): string[] {
  const policy = effective.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return [];
  }
  const raw = (policy as Record<string, unknown>).extraSensitiveModuleCommands;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/** Resolve operation id for tracing, including config-declared sensitive module commands. */
export function resolvePolicyOperationIdForCommand(
  commandName: string,
  effective: Record<string, unknown>
): PolicyOperationId | undefined {
  const builtin = getOperationIdForCommand(commandName);
  if (builtin) return builtin;
  if (getExtraSensitiveModuleCommandsFromEffective(effective).includes(commandName)) {
    return "policy.dynamic-sensitive";
  }
  return undefined;
}

/**
 * Sensitive when mutation / write is possible. Documentation commands are exempt when dryRun is true.
 */
export function isSensitiveModuleCommand(
  commandName: string,
  args: Record<string, unknown>
): boolean {
  const op = COMMAND_TO_OPERATION[commandName];
  if (!op) return false;

  if (op === "doc.document-project" || op === "doc.generate-document") {
    const options =
      typeof args.options === "object" && args.options !== null
        ? (args.options as Record<string, unknown>)
        : {};
    if (options.dryRun === true) {
      return false;
    }
  }

  return true;
}

export type PolicyApprovalPayload = {
  confirmed: boolean;
  rationale: string;
};

export function parsePolicyApprovalFromEnv(env: NodeJS.ProcessEnv): PolicyApprovalPayload | undefined {
  const raw = env.WORKSPACE_KIT_POLICY_APPROVAL?.trim();
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.confirmed !== true) return undefined;
    const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
    if (!rationale) return undefined;
    return { confirmed: true, rationale };
  } catch {
    return undefined;
  }
}

export function parsePolicyApproval(args: Record<string, unknown>): PolicyApprovalPayload | undefined {
  const raw = args.policyApproval;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const confirmed = o.confirmed === true;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  if (!confirmed || rationale.length === 0) {
    return undefined;
  }
  return { confirmed, rationale };
}

export function resolveActor(
  workspacePath: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): string {
  if (typeof args.actor === "string" && args.actor.trim().length > 0) {
    return args.actor.trim();
  }
  const fromEnv = env.WORKSPACE_KIT_ACTOR?.trim();
  if (fromEnv) return fromEnv;

  try {
    const email = execSync("git config user.email", {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (email) return email;
  } catch {
    /* ignore */
  }
  try {
    const name = execSync("git config user.name", {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (name) return name;
  } catch {
    /* ignore */
  }
  return "unknown";
}

export type PolicyTraceRecord = {
  schemaVersion: number;
  timestamp: string;
  operationId: PolicyOperationId;
  command: string;
  actor: string;
  allowed: boolean;
  rationale?: string;
  commandOk?: boolean;
  message?: string;
};

/** Policy sensitivity from built-in map plus `policy.extraSensitiveModuleCommands` on effective config. */
export function isSensitiveModuleCommandForEffective(
  commandName: string,
  args: Record<string, unknown>,
  effective: Record<string, unknown>
): boolean {
  if (isSensitiveModuleCommand(commandName, args)) {
    return true;
  }
  return getExtraSensitiveModuleCommandsFromEffective(effective).includes(commandName);
}

const POLICY_DIR = ".workspace-kit/policy";
const TRACE_FILE = "traces.jsonl";

export type PolicyTraceRecordInput = Omit<PolicyTraceRecord, "schemaVersion"> & {
  schemaVersion?: number;
};

export async function appendPolicyTrace(
  workspacePath: string,
  record: PolicyTraceRecordInput
): Promise<void> {
  const dir = path.join(workspacePath, POLICY_DIR);
  const fp = path.join(workspacePath, POLICY_DIR, TRACE_FILE);
  const full: PolicyTraceRecord = {
    ...record,
    schemaVersion: record.schemaVersion ?? POLICY_TRACE_SCHEMA_VERSION
  };
  const line = `${JSON.stringify(full)}\n`;
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(fp, line, "utf8");
}
