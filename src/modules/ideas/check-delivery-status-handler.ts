import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import type { TaskEntity } from "../task-engine/types.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import {
  readIdeaPlanArtifact,
  writeNextIdeaPlanArtifactVersion
} from "./idea-plan-artifact-storage.js";
import { enforceIdeaPlanStatusTransition, IdeaPlanStatusTransitionError } from "./idea-plan-status-machine.js";
import { loadIdeaPlanStateSchema } from "./idea-plan-state-schema-loader.js";
import { guardIdeaPlanStateSchemaLoad } from "./idea-plan-state-schema-guard.js";
import type { IdeaPlanDocument } from "./idea-plan-types.js";

export type DeliveryStatusSummaryV1 = {
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
  missing: number;
};

export type CheckDeliveryStatusResultV1 = {
  responseSchemaVersion: 1;
  planRef: string;
  planId: string;
  version: number;
  status: IdeaPlanDocument["status"];
  ideaId: string;
  transitioned: boolean;
  deliveryStatus: DeliveryStatusSummaryV1;
  taskStatuses?: Array<{ taskId: string; status: string | null }>;
};

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function readTaskRefs(document: IdeaPlanDocument): string[] {
  const raw = document.delivery?.taskRefs;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is string => typeof value === "string" && /^T[0-9]+$/.test(value.trim())).map((v) => v.trim());
}

function summarizeDeliveryTasks(
  taskRefs: string[],
  resolveTask: (taskId: string) => TaskEntity | null | undefined
): {
  summary: DeliveryStatusSummaryV1;
  taskStatuses: Array<{ taskId: string; status: string | null }>;
  allTerminal: boolean;
  hasCompleted: boolean;
} {
  let completed = 0;
  let cancelled = 0;
  let pending = 0;
  let missing = 0;
  const taskStatuses: Array<{ taskId: string; status: string | null }> = [];

  for (const taskId of taskRefs) {
    const task = resolveTask(taskId);
    const status = task?.status ?? null;
    taskStatuses.push({ taskId, status });
    if (!status) {
      missing += 1;
      pending += 1;
      continue;
    }
    if (status === "completed") {
      completed += 1;
    } else if (status === "cancelled") {
      cancelled += 1;
    } else {
      pending += 1;
    }
  }

  const total = taskRefs.length;
  const allTerminal = total > 0 && pending === 0 && missing === 0;
  const hasCompleted = completed >= 1;

  return {
    summary: { total, completed, cancelled, pending, missing },
    taskStatuses,
    allTerminal,
    hasCompleted
  };
}

function successResult(
  code: "delivery-status-checked" | "idea-plan-delivered",
  message: string,
  result: CheckDeliveryStatusResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

export async function runCheckDeliveryStatus(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planRef = cleanString(args.planRef);
  if (!planRef) {
    return {
      ok: false,
      code: "invalid-args",
      message: "check-delivery-status requires planRef shaped like plan-artifact:<planId>"
    };
  }

  let planning;
  try {
    planning = await openPlanningStores(ctx);
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to open planning stores: ${(err as Error).message}`
    };
  }

  const workspacePath = ctx.workspacePath ?? process.cwd();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }

  const existing = readIdeaPlanArtifact(workspacePath, planRef);
  if (!existing) {
    return {
      ok: false,
      code: "idea-plan-not-found",
      message: `No IdeaPlan artifact found for ${planRef}.`,
      data: { responseSchemaVersion: 1, planRef }
    };
  }

  if (existing.status !== "accepted") {
    return {
      ok: false,
      code: "idea-plan-status-invalid",
      message: `check-delivery-status requires IdeaPlan status accepted; document is ${existing.status}.`,
      data: { responseSchemaVersion: 1, planRef, status: existing.status }
    };
  }

  const ideaId = cleanString(args.ideaId);
  if (ideaId && ideaId !== existing.ideaId) {
    return {
      ok: false,
      code: "idea-plan-mismatch",
      message: `ideaId '${ideaId}' does not match IdeaPlan document ideaId '${existing.ideaId}'.`,
      data: { responseSchemaVersion: 1, planRef, ideaId, documentIdeaId: existing.ideaId }
    };
  }

  const taskRefs = readTaskRefs(existing);
  const { summary, taskStatuses, allTerminal, hasCompleted } = summarizeDeliveryTasks(
    taskRefs,
    (taskId) => planning.taskStore.getTask(taskId)
  );

  if (!allTerminal || !hasCompleted) {
    const result: CheckDeliveryStatusResultV1 = {
      responseSchemaVersion: 1,
      planRef: existing.planRef,
      planId: existing.planId,
      version: existing.version,
      status: existing.status,
      ideaId: existing.ideaId,
      transitioned: false,
      deliveryStatus: summary,
      taskStatuses
    };
    return successResult(
      "delivery-status-checked",
      `Delivery status for ${planRef}: ${summary.completed}/${summary.total} completed, ${summary.pending} pending`,
      result,
      ctx,
      planningGeneration,
      pg.warnings
    );
  }

  const nowIso = new Date().toISOString();
  try {
    enforceIdeaPlanStatusTransition(existing.status, "delivered");
  } catch (err) {
    if (err instanceof IdeaPlanStatusTransitionError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        data: { responseSchemaVersion: 1, planRef, fromStatus: existing.status, toStatus: "delivered" }
      };
    }
    throw err;
  }

  const schemaLoad = loadIdeaPlanStateSchema("delivered", workspacePath);
  const schemaGuard = guardIdeaPlanStateSchemaLoad(schemaLoad);
  if (!schemaGuard.ok) {
    return {
      ok: false,
      code: schemaGuard.code,
      message: schemaGuard.message,
      data: { responseSchemaVersion: 1, planRef, ...schemaGuard.data }
    };
  }
  const deliveredDirective = schemaGuard.agentDirective;
  const phaseKey = cleanString(existing.delivery?.phaseKey) ?? "";
  const updated: IdeaPlanDocument = {
    ...existing,
    status: "delivered",
    updatedAt: nowIso,
    agentDirective: deliveredDirective,
    delivery: {
      ...existing.delivery,
      deliveredAt: nowIso,
      taskCount: taskRefs.length,
      ...(phaseKey ? { phaseKey } : {})
    }
  };

  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, updated, {
    sqliteDb: planning.sqliteDual.getDatabase()
  });

  const result: CheckDeliveryStatusResultV1 = {
    responseSchemaVersion: 1,
    planRef: persisted.planRef,
    planId: persisted.planId,
    version: persisted.version,
    status: persisted.status,
    ideaId: persisted.ideaId,
    transitioned: true,
    deliveryStatus: summary,
    taskStatuses
  };

  return successResult(
    "idea-plan-delivered",
    `IdeaPlan ${planRef} transitioned accepted → delivered (${summary.completed} completed, ${summary.cancelled} cancelled)`,
    result,
    ctx,
    planningGeneration,
    pg.warnings
  );
}
