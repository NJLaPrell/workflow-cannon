import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores, type TaskEntity } from "../../core/planning/index.js";
import { runTaskRowMutationCommands } from "../task-engine/commands/task-row-mutation-commands.js";
import {
  readIdempotencyValue,
  readOptionalExpectedPlanningGeneration
} from "../task-engine/mutation-utils.js";
import { getPlanningGenerationPolicy } from "../task-engine/planning-config.js";

const INSTRUCTION_PATH = "src/modules/agent-bug-reporting/instructions/file-bug-report.md";

const DEFAULT_TECHNICAL_SCOPE = [
  "Investigate symptom",
  "Reproduce failure",
  "Propose remediation"
] as const;

const DEFAULT_ACCEPTANCE_CRITERIA = [
  "Root cause documented",
  "Fix landed or follow-up tasks filed"
] as const;

const ALLOWED_ISSUE_KINDS = new Set([
  "bug-fix",
  "agent-ergonomics",
  "docs-gap",
  "policy-friction",
  "other"
]);

function readNonEmptyString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function evidenceKeyFor(task: TaskEntity): string | null {
  const meta = task.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const key = (meta as Record<string, unknown>).evidenceKey;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

function findTaskByEvidenceKey(tasks: TaskEntity[], evidenceKey: string): TaskEntity | undefined {
  return tasks.find((task) => evidenceKeyFor(task) === evidenceKey);
}

function buildSupportingReasoning(parts: {
  symptom: string;
  command?: string;
  code?: string;
  remediation?: string;
  freeformEvidence?: string;
}): string {
  const lines: string[] = [`Symptom: ${parts.symptom}`];
  if (parts.command) {
    lines.push(`Command: ${parts.command}`);
  }
  if (parts.code) {
    lines.push(`Code/exit: ${parts.code}`);
  }
  if (parts.remediation) {
    lines.push(`Remediation: ${parts.remediation}`);
  }
  if (parts.freeformEvidence) {
    lines.push(`Evidence: ${parts.freeformEvidence}`);
  }
  return lines.join("\n");
}

/**
 * Tier C proposed-only bug filing facade over create-task.
 * Hard-codes type=improvement + status=proposed; auto-fills expectedPlanningGeneration
 * when tasks.planningGenerationPolicy is require (intentionally not on CLI prelude).
 */
export async function runFileBugReportCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const title = readNonEmptyString(args, "title");
  const symptom =
    readNonEmptyString(args, "symptom") ??
    readNonEmptyString(args, "summary") ??
    readNonEmptyString(args, "issue");
  if (!title || !symptom) {
    return {
      ok: false,
      code: "invalid-run-args",
      message:
        "file-bug-report requires non-empty title and symptom (or summary/issue alias).",
      remediation: { instructionPath: INSTRUCTION_PATH }
    };
  }

  // Fail closed: callers must not smuggle ready / non-improvement creates through this path.
  if (args.type !== undefined) {
    const type = typeof args.type === "string" ? args.type.trim() : "";
    if (type !== "improvement") {
      return {
        ok: false,
        code: "file-bug-report-type-rejected",
        message:
          "file-bug-report only creates type=improvement; omit type or pass type:\"improvement\".",
        remediation: { instructionPath: INSTRUCTION_PATH }
      };
    }
  }
  if (args.status !== undefined) {
    const status = typeof args.status === "string" ? args.status.trim() : "";
    if (status !== "proposed") {
      return {
        ok: false,
        code: "file-bug-report-status-rejected",
        message:
          "file-bug-report only creates status=proposed; omit status or pass status:\"proposed\". Ready/accept remains a separate gated transition.",
        remediation: { instructionPath: INSTRUCTION_PATH }
      };
    }
  }

  const command = readNonEmptyString(args, "command");
  const code = readNonEmptyString(args, "code");
  const remediation = readNonEmptyString(args, "remediation");
  const freeformEvidence = readNonEmptyString(args, "evidence");
  const relatedTaskId = readNonEmptyString(args, "relatedTaskId");
  const issueKindRaw = readNonEmptyString(args, "issueKind");
  const evidenceKey = readNonEmptyString(args, "evidenceKey");
  const clientMutationId =
    readIdempotencyValue(args) ?? (evidenceKey ? evidenceKey : undefined);

  if (issueKindRaw && !ALLOWED_ISSUE_KINDS.has(issueKindRaw)) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: `file-bug-report issueKind must be one of: ${[...ALLOWED_ISSUE_KINDS].join(", ")}.`,
      remediation: { instructionPath: INSTRUCTION_PATH }
    };
  }

  const supportingReasoning = buildSupportingReasoning({
    symptom,
    command,
    code,
    remediation,
    freeformEvidence
  });

  const metadata: Record<string, unknown> = {
    issue: symptom,
    supportingReasoning,
    filedVia: "file-bug-report"
  };
  if (evidenceKey) {
    metadata.evidenceKey = evidenceKey;
  }
  if (relatedTaskId) {
    metadata.relatedTaskId = relatedTaskId;
  }
  if (issueKindRaw) {
    metadata.issueKind = issueKindRaw;
  }
  if (command) {
    metadata.command = command;
  }
  if (code) {
    metadata.code = code;
  }
  if (remediation) {
    metadata.remediation = remediation;
  }

  let planning;
  try {
    planning = await openPlanningStores(ctx);
  } catch (error) {
    return {
      ok: false,
      code: "planning-store-open-failed",
      message: error instanceof Error ? error.message : String(error),
      remediation: { instructionPath: INSTRUCTION_PATH }
    };
  }

  const store = planning.taskStore;

  if (evidenceKey) {
    const existing = findTaskByEvidenceKey(store.getAllTasks(), evidenceKey);
    if (existing) {
      return {
        ok: true,
        code: "file-bug-report-idempotent-replay",
        message: `file-bug-report: idempotent replay for evidenceKey → '${existing.id}'`,
        data: {
          task: existing,
          taskId: existing.id,
          replayed: true,
          dedupe: { by: "evidenceKey", evidenceKey },
          intent: "file-bug-report",
          wrappedCommand: "create-task",
          planningGeneration: planning.sqliteDual.getPlanningGeneration(),
          planningGenerationPolicy: getPlanningGenerationPolicy({
            effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
          })
        }
      };
    }
  }

  // One-shot PG: under require, inject current generation when caller omitted it.
  const policy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  let expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(args);
  if (expectedPlanningGeneration === undefined && policy === "require") {
    expectedPlanningGeneration = planning.sqliteDual.getPlanningGeneration();
  }

  const createArgs: Record<string, unknown> = {
    allocateId: true,
    title,
    type: "improvement",
    status: "proposed",
    summary: symptom,
    technicalScope: [...DEFAULT_TECHNICAL_SCOPE],
    acceptanceCriteria: [...DEFAULT_ACCEPTANCE_CRITERIA],
    metadata,
    clientMutationId,
    expectedPlanningGeneration,
    actor: readNonEmptyString(args, "actor")
  };

  if (Array.isArray(args.features)) {
    createArgs.features = args.features.filter((x) => typeof x === "string");
  }
  const phaseKey = readNonEmptyString(args, "phaseKey");
  if (phaseKey) {
    createArgs.phaseKey = phaseKey;
  }
  const phase = readNonEmptyString(args, "phase");
  if (phase) {
    createArgs.phase = phase;
  }
  const priority = readNonEmptyString(args, "priority");
  if (priority === "P1" || priority === "P2" || priority === "P3") {
    createArgs.priority = priority;
  }

  const created = await runTaskRowMutationCommands(
    { name: "create-task", args: createArgs },
    ctx,
    planning,
    store
  );
  if (!created) {
    return {
      ok: false,
      code: "internal-error",
      message: "file-bug-report could not delegate to create-task."
    };
  }
  if (!created.ok) {
    return created;
  }

  const task = (created.data as { task?: TaskEntity } | undefined)?.task;
  const taskId = typeof task?.id === "string" ? task.id : "unknown";
  const replayed = created.code === "task-create-idempotent-replay";
  const data: Record<string, unknown> = {
    ...(typeof created.data === "object" && created.data !== null
      ? (created.data as Record<string, unknown>)
      : {}),
    taskId,
    intent: "file-bug-report",
    wrappedCommand: "create-task",
    autoFilledExpectedPlanningGeneration:
      policy === "require" && readOptionalExpectedPlanningGeneration(args) === undefined
  };

  return {
    ok: true,
    code: replayed ? "file-bug-report-idempotent-replay" : "file-bug-report-created",
    message: replayed
      ? `file-bug-report: idempotent replay → '${taskId}'`
      : `file-bug-report: created improvement task '${taskId}'`,
    data
  };
}
