import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { existsSync } from "node:fs";
import {
  buildTaskMutationIntent,
  compactIntent,
  intentFilePath,
  listIntentFiles,
  normalizeIntentId,
  readIntentFile,
  resolveIntentDir,
  writeIntentAtomic,
  type TaskMutationIntentV1
} from "../coordination/task-mutation-intents.js";
import { resolveTaskStateAuthorityPosture } from "../task-state-authority.js";

const INTENT_QUEUE_COMMANDS = new Set([
  "create-task-mutation-intent",
  "list-task-mutation-intents",
  "apply-task-mutation-intent",
  "reject-task-mutation-intent"
]);

function readStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumberArg(args: Record<string, unknown>, key: string): number | null {
  const raw = args[key];
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.floor(value);
}

type LoadedIntentRows = {
  pending: TaskMutationIntentV1[];
  all: TaskMutationIntentV1[];
  malformed: Array<{ filePath: string; intentId: string | null; message: string }>;
};

type LoadedIntent = ModuleCommandResult | { ok: true; intent: TaskMutationIntentV1 };

function loadIntents(intentDir: string): LoadedIntentRows {
  const rows: TaskMutationIntentV1[] = [];
  const malformed: Array<{ filePath: string; intentId: string | null; message: string }> = [];
  for (const filePath of listIntentFiles(intentDir)) {
    const parsed = readIntentFile(filePath);
    if (!parsed.ok) {
      malformed.push({ filePath, intentId: parsed.intentId, message: parsed.message });
      continue;
    }
    rows.push(parsed.intent);
  }
  rows.sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return a.intentId.localeCompare(b.intentId);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
  return {
    pending: rows.filter((row) => row.status === "pending"),
    all: rows,
    malformed
  };
}

function loadSingleIntent(intentDir: string, intentId: string): LoadedIntent {
  const filePath = intentFilePath(intentDir, intentId);
  if (!existsSync(filePath)) {
    return { ok: false, code: "task-mutation-intent-not-found", message: `Intent '${intentId}' not found` };
  }
  const parsed = readIntentFile(filePath);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "malformed-intent-file",
      message: `Intent '${intentId}' is malformed: ${parsed.message}`,
      data: { schemaVersion: 1, filePath }
    };
  }
  return { ok: true, intent: parsed.intent };
}

export function createTaskMutationIntentFromAuthorityGate(
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  commandName: string,
  args: Record<string, unknown>
): ModuleCommandResult {
  const posture = resolveTaskStateAuthorityPosture(ctx);
  const intentDir = resolveIntentDir(ctx.workspacePath);
  if (!intentDir) {
    return {
      ok: false,
      code: "task-mutation-intent-no-git",
      message: "Cannot capture mutation intent outside a git repository",
      data: { schemaVersion: 1, command: commandName, args, planningGeneration, posture }
    };
  }
  const intent = buildTaskMutationIntent(ctx.workspacePath, commandName, args, posture, planningGeneration);
  writeIntentAtomic(intentDir, intent);
  return {
    ok: true,
    code: "task-state-mutation-intent-created",
    message: `Captured mutation intent for '${commandName}' on worker branch`,
    data: {
      schemaVersion: 1,
      command: commandName,
      intent: compactIntent(intent),
      posture
    }
  };
}

export function runCreateTaskMutationIntentCommand(
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  args: Record<string, unknown>
): ModuleCommandResult {
  const requestedAction = readStringArg(args, "requestedAction");
  if (!requestedAction) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "create-task-mutation-intent requires requestedAction",
      remediation: { instructionPath: "src/modules/task-engine/instructions/create-task-mutation-intent.md" }
    };
  }
  const payloadRaw = args.payload;
  if (!payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "create-task-mutation-intent requires payload object",
      remediation: { instructionPath: "src/modules/task-engine/instructions/create-task-mutation-intent.md" }
    };
  }
  const intentDir = resolveIntentDir(ctx.workspacePath);
  if (!intentDir) {
    return { ok: false, code: "task-mutation-intent-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const posture = resolveTaskStateAuthorityPosture(ctx);
  const intentIdArg = normalizeIntentId(args.intentId);
  if (args.intentId !== undefined && !intentIdArg) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "intentId must match ^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$ when provided"
    };
  }
  const next = buildTaskMutationIntent(
    ctx.workspacePath,
    requestedAction,
    payloadRaw as Record<string, unknown>,
    posture,
    planningGeneration
  );
  next.intentId = intentIdArg ?? next.intentId;
  if (existsSync(intentFilePath(intentDir, next.intentId))) {
    return { ok: false, code: "duplicate-intent-id", message: `Intent '${next.intentId}' already exists` };
  }
  const taskIdArg = readStringArg(args, "taskId");
  if (taskIdArg) {
    next.taskId = taskIdArg;
  }
  const createdByArg = readStringArg(args, "createdBy");
  if (createdByArg) {
    next.createdBy = createdByArg;
  }
  writeIntentAtomic(intentDir, next);
  return {
    ok: true,
    code: "task-mutation-intent-created",
    message: `Created task mutation intent '${next.intentId}'`,
    data: { schemaVersion: 1, intent: compactIntent(next), planningGeneration }
  };
}

export function runListTaskMutationIntentsCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const intentDir = resolveIntentDir(ctx.workspacePath);
  if (!intentDir) {
    return { ok: false, code: "task-mutation-intent-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const includeResolved = args.includeResolved === true;
  const limit = Math.min(Math.max(readNumberArg(args, "limit") ?? 50, 1), 200);
  const loaded = loadIntents(intentDir);
  const source = includeResolved ? loaded.all : loaded.pending;
  const entries = source.slice(0, limit).map(compactIntent);
  return {
    ok: true,
    code: "task-mutation-intents-listed",
    message: `Listed ${entries.length} task mutation intent(s)`,
    data: {
      schemaVersion: 1,
      intents: entries,
      count: entries.length,
      includeResolved,
      limit,
      pendingCount: loaded.pending.length,
      totalCount: loaded.all.length,
      malformedCount: loaded.malformed.length,
      malformed: loaded.malformed.slice(0, 20)
    }
  };
}

export async function runApplyTaskMutationIntentCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>,
  applyIntentCommand: (commandName: string, commandArgs: Record<string, unknown>) => Promise<ModuleCommandResult>
): Promise<ModuleCommandResult> {
  const intentId = normalizeIntentId(args.intentId);
  if (!intentId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "apply-task-mutation-intent requires intentId",
      remediation: { instructionPath: "src/modules/task-engine/instructions/apply-task-mutation-intent.md" }
    };
  }
  const posture = resolveTaskStateAuthorityPosture(ctx);
  if (posture.classification !== "authority" && posture.classification !== "disabled") {
    return {
      ok: false,
      code: "task-state-authority-denied",
      message: "apply-task-mutation-intent requires authority branch posture",
      data: { schemaVersion: 1, posture }
    };
  }
  const intentDir = resolveIntentDir(ctx.workspacePath);
  if (!intentDir) {
    return { ok: false, code: "task-mutation-intent-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const loaded = loadSingleIntent(intentDir, intentId);
  if (!loaded.ok || !("intent" in loaded)) {
    return loaded as ModuleCommandResult;
  }
  const intent = loaded.intent;
  if (INTENT_QUEUE_COMMANDS.has(intent.requestedAction)) {
    return {
      ok: false,
      code: "task-mutation-intent-invalid-action",
      message: `Intent '${intent.intentId}' references unsupported action '${intent.requestedAction}'`
    };
  }
  if (intent.status !== "pending") {
    return {
      ok: false,
      code: "task-mutation-intent-not-pending",
      message: `Intent '${intent.intentId}' is already ${intent.status}`,
      data: { schemaVersion: 1, intent: compactIntent(intent) }
    };
  }
  const applyArgs: Record<string, unknown> = {
    ...intent.payload,
    ...(readStringArg(args, "actor") ? { actor: readStringArg(args, "actor") } : {})
  };
  if (args.policyApproval && typeof args.policyApproval === "object" && !Array.isArray(args.policyApproval)) {
    applyArgs.policyApproval = args.policyApproval;
  }
  if (args.expectedPlanningGeneration !== undefined) {
    applyArgs.expectedPlanningGeneration = args.expectedPlanningGeneration;
  }
  let result: ModuleCommandResult;
  try {
    result = await applyIntentCommand(intent.requestedAction, applyArgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "task-mutation-intent-apply-threw";
    return {
      ok: false,
      code: "task-mutation-intent-apply-failed",
      message: `Intent '${intent.intentId}' failed: ${code}`,
      data: {
        schemaVersion: 1,
        intent: compactIntent(intent),
        applyResult: { ok: false, code, message }
      }
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      code: "task-mutation-intent-apply-failed",
      message: `Intent '${intent.intentId}' failed: ${result.code}`,
      data: { schemaVersion: 1, intent: compactIntent(intent), applyResult: result }
    };
  }
  const updated: TaskMutationIntentV1 = {
    ...intent,
    status: "applied",
    resolvedAt: new Date().toISOString(),
    resolvedBy: readStringArg(args, "actor"),
    appliedCommand: intent.requestedAction,
    applyResultCode: result.code
  };
  writeIntentAtomic(intentDir, updated);
  return {
    ok: true,
    code: "task-mutation-intent-applied",
    message: `Applied intent '${intent.intentId}' via ${intent.requestedAction}`,
    data: { schemaVersion: 1, intent: compactIntent(updated), applyResult: result }
  };
}

export function runRejectTaskMutationIntentCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const intentId = normalizeIntentId(args.intentId);
  if (!intentId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "reject-task-mutation-intent requires intentId",
      remediation: { instructionPath: "src/modules/task-engine/instructions/reject-task-mutation-intent.md" }
    };
  }
  const reason = readStringArg(args, "reason");
  if (!reason) {
    return { ok: false, code: "invalid-run-args", message: "reject-task-mutation-intent requires reason" };
  }
  const intentDir = resolveIntentDir(ctx.workspacePath);
  if (!intentDir) {
    return { ok: false, code: "task-mutation-intent-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const loaded = loadSingleIntent(intentDir, intentId);
  if (!loaded.ok || !("intent" in loaded)) {
    return loaded as ModuleCommandResult;
  }
  if (loaded.intent.status !== "pending") {
    return {
      ok: false,
      code: "task-mutation-intent-not-pending",
      message: `Intent '${loaded.intent.intentId}' is already ${loaded.intent.status}`,
      data: { schemaVersion: 1, intent: compactIntent(loaded.intent) }
    };
  }
  const updated: TaskMutationIntentV1 = {
    ...loaded.intent,
    status: "rejected",
    resolvedAt: new Date().toISOString(),
    resolvedBy: readStringArg(args, "actor"),
    resolutionReason: reason
  };
  writeIntentAtomic(intentDir, updated);
  return {
    ok: true,
    code: "task-mutation-intent-rejected",
    message: `Rejected intent '${loaded.intent.intentId}'`,
    data: { schemaVersion: 1, intent: compactIntent(updated), reason }
  };
}
