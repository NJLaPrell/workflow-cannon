import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { BUILTIN_RUN_COMMAND_MANIFEST } from "../contracts/builtin-run-command-manifest.js";

export const POLICY_TRACE_SCHEMA_VERSION = 1 as const;

/** Maintainer doc (repo-relative) linked from policy denial output for `workspace-kit run`. */
export const POLICY_APPROVAL_HUMAN_DOC = "docs/maintainers/POLICY-APPROVAL.md";

/** Maintainer doc: tier table + copy-paste patterns for agents (Tier A/B `run` vs CLI env approval). */
export const AGENT_CLI_MAP_HUMAN_DOC = "docs/maintainers/AGENT-CLI-MAP.md";

/** Table: env vs JSON approval lanes (POLICY-APPROVAL). */
export const POLICY_APPROVAL_TWO_LANES_DOC = `${POLICY_APPROVAL_HUMAN_DOC}#two-approval-surfaces-do-not-mix-them-up`;

/** Canonical “what counts as approval” for `workspace-kit run` (chat/env lane mismatch). */
export const POLICY_APPROVAL_RUN_CANONICAL_DOC = `${POLICY_APPROVAL_HUMAN_DOC}#canonical-what-counts-as-approval-for-workspace-kit-run`;

/** When operators set WORKSPACE_KIT_POLICY_APPROVAL but invoke a sensitive `workspace-kit run` without JSON policyApproval. */
export const POLICY_RUN_ENV_LANE_MISMATCH_DETAIL =
  "WORKSPACE_KIT_POLICY_APPROVAL is not read for workspace-kit run; pass policyApproval inside the third JSON argument (or use a session grant / interactive approval per POLICY-APPROVAL).";

export type PolicyOperationId =
  | "cli.upgrade"
  | "cli.init"
  | "cli.config-mutate"
  | "policy.dynamic-sensitive"
  | "doc.document-project"
  | "doc.generate-document"
  | "tasks.run-transition"
  | "approvals.review-item"
  | "improvement.generate-recommendations"
  | "improvement.ingest-transcripts"
  | "task-engine.backfill-task-feature-links"
  | "task-engine.export-feature-taxonomy-json"
  | "skills.apply-skill"
  | "plugins.persist"
  | "subagents.persist"
  | "team-execution.persist"
  | "checkpoints.persist"
  | "checkpoints.rewind";

function buildBuiltinCommandToOperation(): Record<string, PolicyOperationId | undefined> {
  const out: Record<string, PolicyOperationId | undefined> = {};
  for (const row of BUILTIN_RUN_COMMAND_MANIFEST) {
    if (row.policyOperationId) {
      out[row.name] = row.policyOperationId as PolicyOperationId;
    }
  }
  return out;
}

const COMMAND_TO_OPERATION: Record<string, PolicyOperationId | undefined> = buildBuiltinCommandToOperation();

/** Shipped `workspace-kit run` sensitivity: single manifest-derived map (see `builtin-run-command-manifest.json`). */
const COMMAND_POLICY_SENSITIVITY = new Map(
  BUILTIN_RUN_COMMAND_MANIFEST.map((r) => [r.name, r.policySensitivity] as const)
);

export function getPolicySensitivityForBuiltinCommand(
  commandName: string
): "non-sensitive" | "sensitive" | "sensitive-with-dryrun" | undefined {
  return COMMAND_POLICY_SENSITIVITY.get(commandName);
}

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
 * Sensitive per shipped manifest `policySensitivity`.
 * `sensitive-with-dryrun` (documentation generators) is waived when `options.dryRun === true`.
 */
export function isSensitiveModuleCommand(
  commandName: string,
  args: Record<string, unknown>
): boolean {
  const sens = COMMAND_POLICY_SENSITIVITY.get(commandName);
  if (!sens || sens === "non-sensitive") {
    return false;
  }
  if (sens === "sensitive-with-dryrun") {
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

export type PolicyApprovalScope = "once" | "session";

export type PolicyApprovalPayload = {
  confirmed: boolean;
  rationale: string;
  /** When `session`, persist approval for this operation until session id changes or grants file is cleared. */
  scope?: PolicyApprovalScope;
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
  const scopeRaw = o.scope;
  const scope: PolicyApprovalScope | undefined =
    scopeRaw === "session" || scopeRaw === "once" ? scopeRaw : undefined;
  return { confirmed, rationale, ...(scope ? { scope } : {}) };
}

export function resolveActor(
  _workspacePath: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): string {
  if (typeof args.actor === "string" && args.actor.trim().length > 0) {
    return args.actor.trim();
  }
  const fromEnv = env.WORKSPACE_KIT_ACTOR?.trim();
  if (fromEnv) return fromEnv;
  return "unknown";
}

function runGitConfigValue(
  workspacePath: string,
  key: "user.email" | "user.name",
  timeoutMs: number
): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["config", key],
      {
        cwd: workspacePath,
        encoding: "utf8",
        timeout: timeoutMs,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const trimmed = stdout.trim();
        resolve(trimmed.length > 0 ? trimmed : undefined);
      }
    );
  });
}

/**
 * Actor precedence:
 * 1) command args.actor
 * 2) WORKSPACE_KIT_ACTOR
 * 3) bounded git user.email/user.name lookup (unless WORKSPACE_KIT_ACTOR_GIT_LOOKUP=off)
 * 4) "unknown"
 */
export async function resolveActorWithFallback(
  workspacePath: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): Promise<string> {
  const explicit = resolveActor(workspacePath, args, env);
  if (explicit !== "unknown") {
    return explicit;
  }
  if (env.WORKSPACE_KIT_ACTOR_GIT_LOOKUP?.trim().toLowerCase() === "off") {
    return "unknown";
  }
  const timeoutMs = 300;
  const email = await runGitConfigValue(workspacePath, "user.email", timeoutMs);
  if (email) return email;
  const name = await runGitConfigValue(workspacePath, "user.name", timeoutMs);
  if (name) return name;
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
