import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TaskStateAuthorityPosture } from "../task-state-authority.js";
import { gatherCheckoutFingerprint, resolveGitCommonDir } from "./workspace-edit-lease.js";

export const TASK_MUTATION_INTENT_SCHEMA_VERSION = 1;
const INTENT_FILE_SUFFIX = ".json";
const INTENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

export type TaskMutationIntentStatus = "pending" | "applied" | "rejected";

export type TaskMutationIntentV1 = {
  schemaVersion: 1;
  intentId: string;
  kind: "task-mutation";
  taskId: string | null;
  requestedAction: string;
  payload: Record<string, unknown>;
  evidence: Record<string, unknown>;
  createdBy: string | null;
  branch: string | null;
  headSha: string | null;
  worktreePath: string | null;
  createdAt: string;
  planningGeneration: number | null;
  status: TaskMutationIntentStatus;
  resolvedAt?: string;
  resolvedBy?: string | null;
  resolutionReason?: string | null;
  appliedCommand?: string;
  applyResultCode?: string;
};

export type TaskMutationIntentListEntry = {
  intentId: string;
  taskId: string | null;
  requestedAction: string;
  status: TaskMutationIntentStatus;
  createdAt: string;
  createdBy: string | null;
  branch: string | null;
  planningGeneration: number | null;
};

export type TaskMutationIntentParseFailure = {
  ok: false;
  code: "intent-file-invalid";
  message: string;
  filePath: string;
  intentId: string | null;
};

export function intentDirFromCommonDir(gitCommonDir: string): string {
  return path.join(gitCommonDir, "workflow-cannon", "intents");
}

export function resolveIntentDir(workspacePath: string): string | null {
  const commonDir = resolveGitCommonDir(workspacePath);
  if (!commonDir) {
    return null;
  }
  return intentDirFromCommonDir(commonDir);
}

export function normalizeIntentId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!INTENT_ID_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function allocateIntentId(): string {
  return `intent-${randomUUID()}`;
}

export function intentFilePath(intentDir: string, intentId: string): string {
  return path.join(intentDir, `${intentId}${INTENT_FILE_SUFFIX}`);
}

function parseIso(iso: unknown): string | null {
  if (typeof iso !== "string") {
    return null;
  }
  const stamp = Date.parse(iso);
  if (Number.isNaN(stamp)) {
    return null;
  }
  return new Date(stamp).toISOString();
}

function parseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseStatus(raw: unknown): TaskMutationIntentStatus | null {
  return raw === "pending" || raw === "applied" || raw === "rejected" ? raw : null;
}

function parseIntentLike(
  raw: unknown,
  filePath: string
): { ok: true; intent: TaskMutationIntentV1 } | TaskMutationIntentParseFailure {
  const obj = parseObject(raw);
  if (!obj) {
    return { ok: false, code: "intent-file-invalid", message: "Intent file must be a JSON object", filePath, intentId: null };
  }
  if (obj.schemaVersion !== TASK_MUTATION_INTENT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "intent-file-invalid",
      message: `Unsupported schemaVersion: ${String(obj.schemaVersion)}`,
      filePath,
      intentId: typeof obj.intentId === "string" ? obj.intentId : null
    };
  }
  const intentId = normalizeIntentId(obj.intentId);
  if (!intentId) {
    return { ok: false, code: "intent-file-invalid", message: "intentId is missing or invalid", filePath, intentId: null };
  }
  if (obj.kind !== "task-mutation") {
    return { ok: false, code: "intent-file-invalid", message: "kind must be 'task-mutation'", filePath, intentId };
  }
  const requestedAction =
    typeof obj.requestedAction === "string" && obj.requestedAction.trim().length > 0 ? obj.requestedAction.trim() : null;
  if (!requestedAction) {
    return { ok: false, code: "intent-file-invalid", message: "requestedAction is required", filePath, intentId };
  }
  const payload = parseObject(obj.payload);
  if (!payload) {
    return { ok: false, code: "intent-file-invalid", message: "payload must be an object", filePath, intentId };
  }
  const evidence = parseObject(obj.evidence);
  if (!evidence) {
    return { ok: false, code: "intent-file-invalid", message: "evidence must be an object", filePath, intentId };
  }
  const createdAt = parseIso(obj.createdAt);
  if (!createdAt) {
    return { ok: false, code: "intent-file-invalid", message: "createdAt must be an ISO timestamp", filePath, intentId };
  }
  const status = parseStatus(obj.status);
  if (!status) {
    return { ok: false, code: "intent-file-invalid", message: "status must be pending, applied, or rejected", filePath, intentId };
  }
  const planningGeneration =
    typeof obj.planningGeneration === "number" && Number.isInteger(obj.planningGeneration) && obj.planningGeneration >= 0
      ? obj.planningGeneration
      : null;
  const taskId = typeof obj.taskId === "string" && obj.taskId.trim().length > 0 ? obj.taskId.trim() : null;
  const parsed: TaskMutationIntentV1 = {
    schemaVersion: 1,
    intentId,
    kind: "task-mutation",
    taskId,
    requestedAction,
    payload,
    evidence,
    createdBy: typeof obj.createdBy === "string" && obj.createdBy.trim().length > 0 ? obj.createdBy.trim() : null,
    branch: typeof obj.branch === "string" && obj.branch.trim().length > 0 ? obj.branch.trim() : null,
    headSha: typeof obj.headSha === "string" && obj.headSha.trim().length > 0 ? obj.headSha.trim() : null,
    worktreePath: typeof obj.worktreePath === "string" && obj.worktreePath.trim().length > 0 ? obj.worktreePath.trim() : null,
    createdAt,
    planningGeneration,
    status
  };
  const resolvedAtRaw = obj.resolvedAt;
  if (resolvedAtRaw !== undefined) {
    const resolvedAt = typeof resolvedAtRaw === "string" ? parseIso(resolvedAtRaw) : null;
    if (!resolvedAt) {
      return {
        ok: false,
        code: "intent-file-invalid",
        message: "resolvedAt must be an ISO timestamp when present",
        filePath,
        intentId
      };
    }
    parsed.resolvedAt = resolvedAt;
  }
  if (typeof obj.resolvedBy === "string") {
    parsed.resolvedBy = obj.resolvedBy.trim().length > 0 ? obj.resolvedBy.trim() : null;
  }
  if (typeof obj.resolutionReason === "string") {
    parsed.resolutionReason = obj.resolutionReason.trim().length > 0 ? obj.resolutionReason.trim() : null;
  }
  if (typeof obj.appliedCommand === "string" && obj.appliedCommand.trim().length > 0) {
    parsed.appliedCommand = obj.appliedCommand.trim();
  }
  if (typeof obj.applyResultCode === "string" && obj.applyResultCode.trim().length > 0) {
    parsed.applyResultCode = obj.applyResultCode.trim();
  }
  return { ok: true, intent: parsed };
}

export function readIntentFile(filePath: string): { ok: true; intent: TaskMutationIntentV1 } | TaskMutationIntentParseFailure {
  let body = "";
  try {
    body = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return {
      ok: false,
      code: "intent-file-invalid",
      message: `Unable to read intent file: ${(error as Error).message}`,
      filePath,
      intentId: null
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: "intent-file-invalid", message: "Intent file is not valid JSON", filePath, intentId: null };
  }
  return parseIntentLike(raw, filePath);
}

export function listIntentFiles(intentDir: string): string[] {
  if (!fs.existsSync(intentDir)) {
    return [];
  }
  return fs
    .readdirSync(intentDir)
    .filter((entry) => entry.endsWith(INTENT_FILE_SUFFIX))
    .map((entry) => path.join(intentDir, entry))
    .sort();
}

export function writeIntentAtomic(intentDir: string, intent: TaskMutationIntentV1): void {
  fs.mkdirSync(intentDir, { recursive: true });
  const finalPath = intentFilePath(intentDir, intent.intentId);
  const tmpPath = path.join(intentDir, `.${intent.intentId}.${randomUUID()}.tmp`);
  const payload = `${JSON.stringify(intent, null, 2)}\n`;
  fs.writeFileSync(tmpPath, payload, "utf8");
  fs.renameSync(tmpPath, finalPath);
}

export function compactIntent(intent: TaskMutationIntentV1): TaskMutationIntentListEntry {
  return {
    intentId: intent.intentId,
    taskId: intent.taskId,
    requestedAction: intent.requestedAction,
    status: intent.status,
    createdAt: intent.createdAt,
    createdBy: intent.createdBy,
    branch: intent.branch,
    planningGeneration: intent.planningGeneration
  };
}

export function readOptionalPlanningGeneration(args: Record<string, unknown>): number | null {
  const raw = args.expectedPlanningGeneration;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  return null;
}

export function buildTaskMutationIntent(
  workspacePath: string,
  commandName: string,
  args: Record<string, unknown>,
  posture: TaskStateAuthorityPosture,
  planningGeneration: number
): TaskMutationIntentV1 {
  const fingerprint = gatherCheckoutFingerprint(workspacePath);
  const taskId = typeof args.taskId === "string" && args.taskId.trim().length > 0 ? args.taskId.trim() : null;
  const createdBy = typeof args.actor === "string" && args.actor.trim().length > 0 ? args.actor.trim() : null;
  return {
    schemaVersion: 1,
    intentId: allocateIntentId(),
    kind: "task-mutation",
    taskId,
    requestedAction: commandName,
    payload: { ...args },
    evidence: {
      authorityPosture: posture,
      source: "task-state-authority-gate",
      message: `Captured worker-branch mutation intent for '${commandName}'`
    },
    createdBy,
    branch: fingerprint.branch,
    headSha: fingerprint.headSha,
    worktreePath: fingerprint.worktreePath,
    createdAt: new Date().toISOString(),
    planningGeneration: readOptionalPlanningGeneration(args) ?? planningGeneration,
    status: "pending"
  };
}

export function summarizePendingTaskMutationIntents(
  workspacePath: string,
  limit = 15
): { schemaVersion: 1; count: number; top: TaskMutationIntentListEntry[] } {
  const intentDir = resolveIntentDir(workspacePath);
  if (!intentDir) {
    return { schemaVersion: 1, count: 0, top: [] };
  }
  const pending: TaskMutationIntentV1[] = [];
  for (const filePath of listIntentFiles(intentDir)) {
    const parsed = readIntentFile(filePath);
    if (parsed.ok && parsed.intent.status === "pending") {
      pending.push(parsed.intent);
    }
  }
  pending.sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return a.intentId.localeCompare(b.intentId);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
  return {
    schemaVersion: 1,
    count: pending.length,
    top: pending.slice(0, limit).map(compactIntent)
  };
}
