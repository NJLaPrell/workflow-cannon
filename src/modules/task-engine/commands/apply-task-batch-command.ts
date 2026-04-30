import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import { TaskStore } from "../persistence/store.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import {
  allocateNextTaskId,
  digestPayload,
  mutationEvidence,
  nowIso,
  planningConcurrencySaveOpts,
  TASK_ID_RE
} from "../mutation-utils.js";
import type { TaskEntity, TaskPriority, TaskStatus } from "../types.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings,
  planningStrictValidationEnabled
} from "../planning-config.js";
import { validateKnownTaskTypeRequirements } from "../task-type-validation.js";
import { collectUnknownFeatureSlugWarnings } from "../feature-slug-validation.js";
import { findUnknownFeatureIds, taskTypeFailsClosedOnUnknownFeatures } from "../task-feature-mutation-validation.js";
import { resolveKnownFeatureSlugSet } from "../persistence/feature-registry-queries.js";
import { validateTaskSkillAttachments } from "../../skills/task-skill-validation.js";
import { validateTaskSetForStrictMode } from "../strict-task-validation.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "../transcript-churn.js";

const PHASE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const MUTABLE_TASK_FIELDS = new Set([
  "title",
  "status",
  "priority",
  "dependsOn",
  "unblocks",
  "phase",
  "phaseKey",
  "metadata",
  "ownership",
  "approach",
  "summary",
  "description",
  "risk",
  "technicalScope",
  "acceptanceCriteria",
  "features"
]);

type StagedCreate = {
  kind: "create";
  task: TaskEntity;
  digest: string;
  allocateId: boolean;
};

type StagedUpdate = {
  kind: "update";
  task: TaskEntity;
  digest: string;
  updatedFields: string[];
};

function planningGate(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): { block: ModuleCommandResult | null; warnings?: string[] } {
  const policy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const gate = enforcePlanningGenerationPolicy(policy, args);
  if (!gate.ok) {
    const block: ModuleCommandResult = {
      ok: false,
      code: gate.code,
      message: gate.message,
      remediation: {
        instructionPath: CLI_REMEDIATION_INSTRUCTIONS.applyTaskBatch,
        docPath: "docs/maintainers/adrs/ADR-planning-generation-optimistic-concurrency.md"
      }
    };
    return { block };
  }
  return { block: null, warnings: gate.warnings };
}

function attachPolicyMeta(
  data: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planningGen: number,
  warnings?: string[]
): void {
  data.planningGeneration = planningGen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}

export async function runApplyTaskBatchCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const actor =
    typeof args.actor === "string"
      ? args.actor
      : ctx.resolvedActor !== undefined
        ? ctx.resolvedActor
        : undefined;
  const dryRun = args.dryRun === true;
  const opsRaw = args.ops;
  if (!Array.isArray(opsRaw) || opsRaw.length === 0) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "apply-task-batch requires non-empty ops array",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.applyTaskBatch }
    };
  }

  const gate = planningGate(ctx, args as Record<string, unknown>);
  if (gate.block) {
    const policy = getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    });
    if (gate.block.code === "planning-generation-required" && policy === "require") {
      gate.block.data = {
        currentPlanningGeneration: planning.sqliteDual.getPlanningGeneration(),
        retryAfterRead: true,
        readCommandSuggestion: { command: "list-tasks", args: {} }
      };
    }
    return gate.block;
  }

  const knownSlugs = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
  const staged: Array<StagedCreate | StagedUpdate> = [];
  let virtual: TaskEntity[] = store.getAllTasks().map((t) => ({ ...t }));

  for (let i = 0; i < opsRaw.length; i++) {
    const row = opsRaw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: `apply-task-batch ops[${i}] must be an object`,
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.applyTaskBatch }
      };
    }
    const op = row as Record<string, unknown>;
    const kind = op.kind;
    if (kind === "create-task") {
      const p = op.payload;
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `apply-task-batch ops[${i}].payload must be a create-task args object`,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.applyTaskBatch }
        };
      }
      const payload = p as Record<string, unknown>;
      if (payload.features !== undefined && !Array.isArray(payload.features)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `apply-task-batch ops[${i}]: features must be an array of strings when provided`
        };
      }
      const allocateId = payload.allocateId !== false;
      const idArgRaw = typeof payload.id === "string" ? payload.id.trim() : "";
      const idArg = idArgRaw.length > 0 ? idArgRaw : undefined;
      const title =
        typeof payload.title === "string" && payload.title.trim().length > 0 ? payload.title.trim() : undefined;
      const type =
        typeof payload.type === "string" && payload.type.trim().length > 0
          ? payload.type.trim()
          : "workspace-kit";
      const status = typeof payload.status === "string" ? payload.status : "proposed";
      const priority =
        typeof payload.priority === "string" && ["P1", "P2", "P3"].includes(payload.priority)
          ? (payload.priority as TaskPriority)
          : undefined;
      const allowedInitial: TaskStatus[] = ["proposed", "ready"];
      if (type === TRANSCRIPT_CHURN_TASK_TYPE) {
        allowedInitial.push("research");
      }
      if (!title || !allowedInitial.includes(status as TaskStatus)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `apply-task-batch ops[${i}]: create-task requires title and valid initial status`
        };
      }
      if (allocateId && idArg !== undefined && TASK_ID_RE.test(idArg)) {
        return {
          ok: false,
          code: "invalid-run-args",
          message: `apply-task-batch ops[${i}]: allocateId:true cannot combine with explicit T### id`
        };
      }
      let resolvedId: string;
      if (allocateId) {
        resolvedId = allocateNextTaskId(virtual);
      } else {
        if (!idArg || !TASK_ID_RE.test(idArg)) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: `apply-task-batch ops[${i}]: create-task requires id or allocateId:true`
          };
        }
        resolvedId = idArg;
      }
      const phaseKeyRaw =
        typeof payload.phaseKey === "string" && payload.phaseKey.trim().length > 0
          ? payload.phaseKey.trim()
          : undefined;
      if (phaseKeyRaw && !PHASE_KEY_RE.test(phaseKeyRaw)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `apply-task-batch ops[${i}]: phaseKey format invalid`
        };
      }
      const timestamp = nowIso();
      let task: TaskEntity = {
        id: resolvedId,
        title,
        type,
        status: status as TaskStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
        priority,
        dependsOn: Array.isArray(payload.dependsOn)
          ? payload.dependsOn.filter((x) => typeof x === "string")
          : undefined,
        unblocks: Array.isArray(payload.unblocks)
          ? payload.unblocks.filter((x) => typeof x === "string")
          : undefined,
        phase: typeof payload.phase === "string" ? payload.phase : undefined,
        phaseKey: phaseKeyRaw,
        metadata:
          typeof payload.metadata === "object" && payload.metadata !== null
            ? (payload.metadata as Record<string, unknown>)
            : undefined,
        ownership: typeof payload.ownership === "string" ? payload.ownership : undefined,
        approach: typeof payload.approach === "string" ? payload.approach : undefined,
        summary: typeof payload.summary === "string" ? payload.summary : undefined,
        description: typeof payload.description === "string" ? payload.description : undefined,
        risk: typeof payload.risk === "string" ? payload.risk : undefined,
        technicalScope: Array.isArray(payload.technicalScope)
          ? payload.technicalScope.filter((x) => typeof x === "string")
          : undefined,
        acceptanceCriteria: Array.isArray(payload.acceptanceCriteria)
          ? payload.acceptanceCriteria.filter((x) => typeof x === "string")
          : undefined,
        features: Array.isArray(payload.features)
          ? payload.features.filter((x) => typeof x === "string")
          : undefined
      };
      const planRef =
        typeof payload.planRef === "string" && payload.planRef.trim().length > 0
          ? payload.planRef.trim()
          : undefined;
      if (planRef) {
        task = { ...task, metadata: { ...(task.metadata ?? {}), planRef } };
      }
      if (virtual.some((t) => t.id === resolvedId)) {
        return {
          ok: false,
          code: "duplicate-task-id",
          message: `apply-task-batch ops[${i}]: task '${resolvedId}' already exists`
        };
      }
      const knownTypeValidationError = validateKnownTaskTypeRequirements(task);
      if (knownTypeValidationError) {
        return {
          ok: false,
          code: knownTypeValidationError.code,
          message: knownTypeValidationError.message
        };
      }
      const badFeat = findUnknownFeatureIds(task.features, knownSlugs);
      if (badFeat.length > 0 && taskTypeFailsClosedOnUnknownFeatures(task.type)) {
        return {
          ok: false,
          code: "unknown-feature-id",
          message: `Unknown feature id(s): ${badFeat.join(", ")}`
        };
      }
      const skillAttach = validateTaskSkillAttachments(
        ctx.workspacePath,
        ctx.effectiveConfig as Record<string, unknown> | undefined,
        task.metadata
      );
      if (!skillAttach.ok) {
        return { ok: false, code: skillAttach.code, message: skillAttach.message };
      }
      const digest = digestPayload({
        id: task.id,
        title: task.title,
        type: task.type,
        status: task.status,
        priority: task.priority,
        dependsOn: task.dependsOn ?? [],
        unblocks: task.unblocks ?? [],
        phase: task.phase ?? null,
        phaseKey: task.phaseKey ?? null,
        metadata: task.metadata ?? null,
        ownership: task.ownership ?? null,
        approach: task.approach ?? null,
        summary: task.summary ?? null,
        description: task.description ?? null,
        risk: task.risk ?? null,
        technicalScope: task.technicalScope ?? [],
        acceptanceCriteria: task.acceptanceCriteria ?? [],
        features: task.features ?? []
      });
      staged.push({ kind: "create", task, digest, allocateId });
      virtual = [...virtual, { ...task }];
    } else if (kind === "update-task") {
      const p = op.payload;
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `apply-task-batch ops[${i}].payload must be an update-task args object`
        };
      }
      const payload = p as Record<string, unknown>;
      const taskId = typeof payload.taskId === "string" ? payload.taskId : undefined;
      const updates =
        typeof payload.updates === "object" && payload.updates !== null
          ? (payload.updates as Record<string, unknown>)
          : undefined;
      if (!taskId || !updates) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `apply-task-batch ops[${i}]: update-task requires taskId and updates`
        };
      }
      const base = virtual.find((t) => t.id === taskId);
      if (!base) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const invalidKeys = Object.keys(updates).filter((key) => !MUTABLE_TASK_FIELDS.has(key));
      if (invalidKeys.length > 0) {
        return {
          ok: false,
          code: "invalid-task-update",
          message: `apply-task-batch ops[${i}]: cannot mutate immutable fields: ${invalidKeys.join(", ")}`
        };
      }
      if (updates.features !== undefined) {
        if (
          !Array.isArray(updates.features) ||
          !(updates.features as unknown[]).every((x) => typeof x === "string")
        ) {
          return {
            ok: false,
            code: "invalid-task-update",
            message: `apply-task-batch ops[${i}]: features must be an array of strings`
          };
        }
      }
      const updatedTask = { ...base, ...updates, updatedAt: nowIso() } as TaskEntity;
      const badUpd = findUnknownFeatureIds(updatedTask.features, knownSlugs);
      if (badUpd.length > 0 && taskTypeFailsClosedOnUnknownFeatures(updatedTask.type)) {
        return {
          ok: false,
          code: "unknown-feature-id",
          message: `Unknown feature id(s): ${badUpd.join(", ")}`
        };
      }
      const skillAttachUpd = validateTaskSkillAttachments(
        ctx.workspacePath,
        ctx.effectiveConfig as Record<string, unknown> | undefined,
        updatedTask.metadata
      );
      if (!skillAttachUpd.ok) {
        return { ok: false, code: skillAttachUpd.code, message: skillAttachUpd.message };
      }
      const knownUpdErr = validateKnownTaskTypeRequirements(updatedTask);
      if (knownUpdErr) {
        return { ok: false, code: knownUpdErr.code, message: knownUpdErr.message };
      }
      const digest = digestPayload({ taskId, updates });
      staged.push({
        kind: "update",
        task: updatedTask,
        digest,
        updatedFields: Object.keys(updates)
      });
      virtual = virtual.map((t) => (t.id === taskId ? { ...updatedTask } : t));
    } else {
      return {
        ok: false,
        code: "invalid-run-args",
        message: `apply-task-batch ops[${i}].kind must be create-task or update-task`
      };
    }
  }

  if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> })) {
    const nextTaskList = [...store.getAllTasks()];
    for (const s of staged) {
      if (s.kind === "create") {
        nextTaskList.push(s.task);
      } else {
        const ix = nextTaskList.findIndex((t) => t.id === s.task.id);
        if (ix !== -1) {
          nextTaskList[ix] = s.task;
        }
      }
    }
    const strictIssue = validateTaskSetForStrictMode(nextTaskList);
    if (strictIssue) {
      return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
    }
  }

  const featureSlugWarnings: string[] = [];
  for (const t of virtual) {
    featureSlugWarnings.push(...collectUnknownFeatureSlugWarnings(t.features, knownSlugs));
  }

  if (dryRun) {
    const data: Record<string, unknown> = {
      dryRun: true,
      stagedCount: staged.length,
      staged: staged.map((s) =>
        s.kind === "create" ? { kind: s.kind, task: s.task } : { kind: s.kind, task: s.task }
      )
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), gate.warnings);
    return {
      ok: true,
      code: "apply-task-batch-dry-run",
      message: `Dry run: ${staged.length} operation(s) validated`,
      data
    };
  }

  const applyWork = (): void => {
    for (const s of staged) {
      if (s.kind === "create") {
        store.addTask(s.task);
        store.addMutationEvidence(
          mutationEvidence("create-task", s.task.id, actor, {
            initialStatus: s.task.status,
            source: "apply-task-batch",
            payloadDigest: s.digest,
            allocateId: s.allocateId
          })
        );
      } else {
        store.updateTask(s.task);
        store.addMutationEvidence(
          mutationEvidence("update-task", s.task.id, actor, {
            updatedFields: s.updatedFields,
            payloadDigest: s.digest,
            source: "apply-task-batch"
          })
        );
      }
    }
  };

  planning.sqliteDual.withTransaction(
    applyWork,
    planningConcurrencySaveOpts(args as Record<string, unknown>)
  );

  const strictAfter = planningStrictValidationEnabled({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown>
  })
    ? validateTaskSetForStrictMode(store.getAllTasks())
    : null;
  if (strictAfter) {
    return { ok: false, code: "strict-task-validation-failed", message: strictAfter };
  }

  const data: Record<string, unknown> = {
    applied: staged.length,
    results: staged.map((s) =>
      s.kind === "create"
        ? { kind: s.kind, task: s.task }
        : { kind: s.kind, taskId: s.task.id, task: s.task }
    )
  };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), [
    ...(gate.warnings ?? []),
    ...featureSlugWarnings
  ]);
  return {
    ok: true,
    code: "apply-task-batch-applied",
    message: `Applied ${staged.length} task operation(s)`,
    data
  };
}
