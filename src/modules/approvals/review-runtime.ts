import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { createKitLifecycleHookBus } from "../../core/kit-lifecycle-hooks.js";
import { appendLineageEvent } from "../../core/lineage-store.js";
import { openPlanningStores, TransitionService, type TaskEntity } from "../../core/planning/index.js";
import {
  appendDecisionRecord,
  computeDecisionFingerprint,
  readDecisionFingerprints
} from "./decisions-store.js";

function getEvidenceKey(task: Pick<TaskEntity, "id" | "metadata">): string {
  const m = task.metadata;
  const k = m && typeof m.evidenceKey === "string" ? m.evidenceKey : "";
  return k || task.id;
}

export type ReviewItemArgs = {
  taskId: string;
  decision: "accept" | "decline" | "accept_edited";
  editedSummary?: string;
  policyTraceRef?: { operationId: string; timestamp: string };
  configMutationRef?: { timestamp: string; key: string };
};

export async function runReviewItem(
  ctx: ModuleLifecycleContext,
  args: ReviewItemArgs,
  actor: string
): Promise<{ ok: true; idempotent?: boolean; code: string; message: string } | { ok: false; code: string; message: string }> {
  const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
  const decision = args.decision;
  if (!taskId || !decision) {
    return { ok: false, code: "invalid-args", message: "taskId and decision are required" };
  }
  if (decision === "accept_edited" && !(typeof args.editedSummary === "string" && args.editedSummary.trim())) {
    return { ok: false, code: "invalid-args", message: "accept_edited requires non-empty editedSummary" };
  }

  const planning = await openPlanningStores(ctx);
  const store = planning.taskStore;
  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }
  if (task.type !== "improvement") {
    return { ok: false, code: "invalid-task-type", message: `Task '${taskId}' is not type 'improvement'` };
  }

  const evidenceKey = getEvidenceKey(task);
  const fingerprint = computeDecisionFingerprint(taskId, decision, evidenceKey, args.editedSummary);

  const existing = await readDecisionFingerprints(ctx.workspacePath);
  if (existing.has(fingerprint)) {
    return {
      ok: true,
      idempotent: true,
      code: "decision-idempotent",
      message: "Decision already recorded (idempotent)"
    };
  }

  const hookBus = createKitLifecycleHookBus(
    ctx.workspacePath,
    (ctx.effectiveConfig ?? {}) as Record<string, unknown>
  );
  const service = new TransitionService(store, [], hookBus.isEnabled() ? hookBus : undefined);

  const run = async (action: string) => {
    await service.runTransition({ taskId, action, actor });
  };

  try {
    if (decision === "decline") {
      if (task.status === "ready") {
        await run("cancel");
      } else if (task.status === "in_progress") {
        await run("decline");
      } else {
        return {
          ok: false,
          code: "invalid-task-state",
          message: `Cannot decline from status '${task.status}'`
        };
      }
    } else {
      if (task.status === "ready") {
        await run("start");
        await run("complete");
      } else if (task.status === "in_progress") {
        await run("complete");
      } else {
        return {
          ok: false,
          code: "invalid-task-state",
          message: `Cannot accept from status '${task.status}'`
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "transition-failed", message: msg };
  }

  const finalTask = store.getTask(taskId);
  const finalStatus = finalTask?.status ?? "unknown";

  await appendDecisionRecord(ctx.workspacePath, {
    fingerprint,
    taskId,
    evidenceKey,
    decisionVerb: decision,
    actor,
    editedSummary: args.editedSummary?.trim() || undefined,
    policyTraceRef: args.policyTraceRef
  });

  await appendLineageEvent(ctx.workspacePath, {
    eventType: "dec",
    recommendationTaskId: taskId,
    evidenceKey,
    payload: {
      recommendationTaskId: taskId,
      evidenceKey,
      decisionVerb: decision,
      actor,
      decisionFingerprint: fingerprint,
      policyTraceRef: args.policyTraceRef,
      configMutationRef: args.configMutationRef
    }
  });

  if (decision !== "decline" && finalStatus === "completed") {
    await appendLineageEvent(ctx.workspacePath, {
      eventType: "app",
      recommendationTaskId: taskId,
      evidenceKey,
      payload: {
        recommendationTaskId: taskId,
        evidenceKey,
        decisionFingerprint: fingerprint,
        finalTaskStatus: "completed"
      }
    });
  }

  if (args.policyTraceRef || args.configMutationRef) {
    await appendLineageEvent(ctx.workspacePath, {
      eventType: "corr",
      recommendationTaskId: taskId,
      evidenceKey,
      payload: {
        recommendationTaskId: taskId,
        evidenceKey,
        policyOperationId: args.policyTraceRef?.operationId,
        policyTimestamp: args.policyTraceRef?.timestamp,
        mutationRecordTimestamp: args.configMutationRef?.timestamp,
        mutationKey: args.configMutationRef?.key
      }
    });
  }

  return {
    ok: true,
    code: "decision-recorded",
    message: `Recorded ${decision} for ${taskId} (${finalStatus})`
  };
}
