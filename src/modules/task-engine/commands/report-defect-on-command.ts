import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import type { TaskPriority } from "../types.js";
import { readIdempotencyValue, readOptionalExpectedPlanningGeneration } from "../mutation-utils.js";
import { readPlanString } from "./task-intent-commands.js";
import { runTaskRowMutationCommands } from "./task-row-mutation-commands.js";

const DEFAULT_TECHNICAL_SCOPE = ["Investigate symptom", "Reproduce", "Propose fix"] as const;
const DEFAULT_ACCEPTANCE_CRITERIA = [
  "Root cause documented",
  "Fix landed or follow-up tasks filed"
] as const;

function mapSeverityToPriority(severity: string | undefined): TaskPriority | undefined {
  if (!severity) {
    return undefined;
  }
  const normalized = severity.trim().toUpperCase();
  if (normalized === "P1" || normalized === "HIGH" || normalized === "CRITICAL") {
    return "P1";
  }
  if (normalized === "P2" || normalized === "MEDIUM") {
    return "P2";
  }
  if (normalized === "P3" || normalized === "LOW") {
    return "P3";
  }
  return undefined;
}

/**
 * Convenience wrapper over `create-task` for in-loop agent defect filing (improvement / proposed).
 */
export async function runReportDefectCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const title = readPlanString(args, "title");
  const summary = readPlanString(args, "summary");
  const evidence = readPlanString(args, "evidence");
  if (!title || !summary || !evidence) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "report-defect requires non-empty title, summary, and evidence.",
      remediation: { instructionPath: "src/modules/task-engine/instructions/report-defect.md" }
    };
  }

  const metadata: Record<string, unknown> = {
    issue: summary,
    supportingReasoning: evidence
  };
  const relatedTaskId = readPlanString(args, "relatedTaskId");
  if (relatedTaskId) {
    metadata.relatedTaskId = relatedTaskId;
  }

  const createArgs: Record<string, unknown> = {
    allocateId: true,
    title,
    type: "improvement",
    status: "proposed",
    summary,
    technicalScope: [...DEFAULT_TECHNICAL_SCOPE],
    acceptanceCriteria: [...DEFAULT_ACCEPTANCE_CRITERIA],
    metadata,
    clientMutationId: readIdempotencyValue(args),
    expectedPlanningGeneration: readOptionalExpectedPlanningGeneration(args),
    actor: readPlanString(args, "actor")
  };

  const priority = mapSeverityToPriority(readPlanString(args, "severity"));
  if (priority) {
    createArgs.priority = priority;
  }
  if (Array.isArray(args.features)) {
    createArgs.features = args.features.filter((x) => typeof x === "string");
  }
  const phaseKey = readPlanString(args, "phaseKey");
  if (phaseKey) {
    createArgs.phaseKey = phaseKey;
  }
  const phase = readPlanString(args, "phase");
  if (phase) {
    createArgs.phase = phase;
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
      message: "report-defect could not delegate to create-task."
    };
  }
  if (!created.ok) {
    return created;
  }

  const task = (created.data as { task?: { id?: string } } | undefined)?.task;
  const taskId = typeof task?.id === "string" ? task.id : "unknown";
  const data: Record<string, unknown> = {
    ...(typeof created.data === "object" && created.data !== null ? (created.data as Record<string, unknown>) : {}),
    intent: "report-defect",
    wrappedCommand: "create-task"
  };

  return {
    ok: true,
    code: created.code === "task-create-idempotent-replay" ? "report-defect-idempotent-replay" : "report-defect-created",
    message: `report-defect: created improvement task '${taskId}'`,
    data
  };
}
