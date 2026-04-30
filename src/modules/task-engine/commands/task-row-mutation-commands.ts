import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import { validateTaskSkillAttachments } from "../../skills/task-skill-validation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { collectUnknownFeatureSlugWarnings } from "../feature-slug-validation.js";
import {
  allocateNextTaskId,
  buildTaskFromConversionPayload,
  digestPayload,
  findIdempotentAllocatedCreate,
  findIdempotentMutation,
  isRecordLike,
  mutationEvidence,
  nowIso,
  planningConcurrencySaveOpts,
  readIdempotencyValue,
  TASK_ID_RE
} from "../mutation-utils.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { planningStrictValidationEnabled } from "../planning-config.js";
import { resolveKnownFeatureSlugSet } from "../persistence/feature-registry-queries.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { strictValidationError } from "./strict-store-validation.js";
import { validateTaskSetForStrictMode } from "../strict-task-validation.js";
import { findUnknownFeatureIds, taskTypeFailsClosedOnUnknownFeatures } from "../task-feature-mutation-validation.js";
import { validateKnownTaskTypeRequirements } from "../task-type-validation.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "../transcript-churn.js";
import type { TaskEntity, TaskPriority, TaskStatus } from "../types.js";

const MUTABLE_TASK_FIELDS = new Set([
  "title",
  "type",
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

const PHASE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function normalizePlanningExecutionDraftTasks(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>,
  timestamp: string,
  commandLabel: string
): { ok: true; tasks: TaskEntity[] } | { ok: false; result: ModuleCommandResult } {
  const tasksRaw = args.tasks;
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-task-schema",
        message: `${commandLabel} requires non-empty tasks array`,
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
      }
    };
  }
  const planRef =
    typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
  const planningTypeMeta =
    typeof args.planningType === "string" && args.planningType.trim().length > 0 ? args.planningType.trim() : undefined;
  const targetPhaseKey =
    typeof args.targetPhaseKey === "string" && args.targetPhaseKey.trim().length > 0
      ? args.targetPhaseKey.trim()
      : undefined;
  if (targetPhaseKey && !PHASE_KEY_RE.test(targetPhaseKey)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-task-schema",
        message: "targetPhaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
      }
    };
  }
  const targetPhase =
    typeof args.targetPhase === "string" && args.targetPhase.trim().length > 0 ? args.targetPhase.trim() : undefined;
  const desiredStatus =
    args.desiredStatus === "ready" || args.desiredStatus === "proposed"
      ? (args.desiredStatus as "ready" | "proposed")
      : undefined;
  if (args.desiredStatus !== undefined && desiredStatus === undefined) {
    return {
      ok: false,
      result: { ok: false, code: "invalid-task-schema", message: "desiredStatus must be 'proposed' or 'ready'" }
    };
  }

  const built: TaskEntity[] = [];
  for (const row of tasksRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: "Each tasks[] row must be an object",
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        }
      };
    }
    const rowObj = row as Record<string, unknown>;
    const rowPhaseKey =
      typeof rowObj.phaseKey === "string" && rowObj.phaseKey.trim().length > 0 ? rowObj.phaseKey.trim() : undefined;
    const rowStatus = rowObj.status === "ready" || rowObj.status === "proposed" ? rowObj.status : undefined;
    if (rowPhaseKey && !PHASE_KEY_RE.test(rowPhaseKey)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: "Task phaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
        }
      };
    }
    const normalizedRow = { ...rowObj };
    if (targetPhaseKey) {
      normalizedRow.phase = targetPhase ?? `Phase ${targetPhaseKey}`;
    }
    const bt = buildTaskFromConversionPayload(normalizedRow, timestamp);
    if (!bt.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: bt.message,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        }
      };
    }
    let task = bt.task;
    task = {
      ...task,
      status: (desiredStatus ?? rowStatus ?? task.status) as TaskStatus,
      phaseKey: targetPhaseKey ?? rowPhaseKey ?? task.phaseKey,
      phase: targetPhaseKey ? (targetPhase ?? `Phase ${targetPhaseKey}`) : task.phase
    };
    const nextMeta: Record<string, unknown> = { ...(task.metadata ?? {}) };
    if (planRef) {
      nextMeta.planRef = planRef;
    }
    if (planningTypeMeta) {
      const prevProv = isRecordLike(nextMeta.planningProvenance)
        ? { ...(nextMeta.planningProvenance as Record<string, unknown>) }
        : {};
      prevProv.planningType = planningTypeMeta;
      prevProv.source = "persist-planning-execution-drafts";
      nextMeta.planningProvenance = prevProv;
    }
    if (Object.keys(nextMeta).length > 0) {
      task = { ...task, metadata: nextMeta };
    }
    const typeErr = validateKnownTaskTypeRequirements(task);
    if (typeErr) {
      return { ok: false, result: { ok: false, code: typeErr.code, message: typeErr.message } };
    }
    const skillAttach = validateTaskSkillAttachments(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined,
      task.metadata
    );
    if (!skillAttach.ok) {
      return { ok: false, result: { ok: false, code: skillAttach.code, message: skillAttach.message } };
    }
    built.push(task);
  }

  const seen = new Set<string>();
  for (const t of built) {
    if (seen.has(t.id)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-task-schema",
          message: `Duplicate task id in tasks[]: ${t.id}`,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        }
      };
    }
    seen.add(t.id);
  }

  return { ok: true, tasks: built };
}

function reviewPlanningExecutionDraftGaps(tasks: TaskEntity[]): Array<Record<string, unknown>> {
  const findings: Array<Record<string, unknown>> = [];
  const textFor = (task: TaskEntity): string =>
    [task.title, task.approach, ...(task.technicalScope ?? []), ...(task.acceptanceCriteria ?? [])]
      .join("\n")
      .toLowerCase();
  const allText = tasks.map(textFor).join("\n");
  const has = (re: RegExp): boolean => re.test(allText);

  for (const task of tasks) {
    const scopeCount = task.technicalScope?.length ?? 0;
    const acceptanceCount = task.acceptanceCriteria?.length ?? 0;
    if (scopeCount > 5 || acceptanceCount > 5 || scopeCount + acceptanceCount > 10) {
      findings.push({
        code: "oversized-task",
        severity: "warning",
        taskId: task.id,
        message: "Task may be too broad; split UX/CAE work into smaller implementation, verification, and rollout slices."
      });
    }
    const vagueCriteria = (task.acceptanceCriteria ?? []).filter(
      (c) => c.trim().length < 15 || /^(works|done|complete)$/i.test(c.trim())
    );
    if (vagueCriteria.length > 0) {
      findings.push({
        code: "unclear-acceptance-criteria",
        severity: "warning",
        taskId: task.id,
        message: "Acceptance criteria should describe observable behavior, verification, or evidence."
      });
    }
  }

  if (!has(/\b(test|tests|verify|verification|validation|check|coverage|e2e|unit)\b/)) {
    findings.push({
      code: "missing-verification-coverage",
      severity: "error",
      message: "Batch is missing an explicit verification or test coverage slice."
    });
  }
  if (!has(/\b(rollback|revert|activation|activate|toggle|flag|disable|fallback)\b/)) {
    findings.push({
      code: "missing-rollback-activation-slice",
      severity: "error",
      message: "Batch is missing rollback, activation, feature-flag, or fallback coverage."
    });
  }
  if (!has(/\b(empty|first-run|first run|initial|blank|no data|fresh workspace)\b/)) {
    findings.push({
      code: "missing-empty-first-run-behavior",
      severity: "error",
      message: "Batch is missing empty, first-run, or no-data behavior coverage."
    });
  }
  return findings;
}

/**
 * Single-row create/update plus planning execution draft review/persist.
 * Returns **`null`** when the command name is not handled here.
 */
export async function runTaskRowMutationCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};

  if (command.name === "create-task" || command.name === "create-task-from-plan") {
    const actor =
      typeof args.actor === "string"
        ? args.actor
        : ctx.resolvedActor !== undefined
          ? ctx.resolvedActor
          : undefined;
    if (args.features !== undefined && !Array.isArray(args.features)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "create-task field 'features' must be an array of strings when provided"
      };
    }
    const allocateId = args.allocateId === true;
    const dryRunCreate = args.dryRun === true;
    const idArgRaw = typeof args.id === "string" ? args.id.trim() : "";
    const idArg = idArgRaw.length > 0 ? idArgRaw : undefined;
    const title = typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : undefined;
    const type = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : "workspace-kit";
    const status = typeof args.status === "string" ? args.status : "proposed";
    const priority =
      typeof args.priority === "string" && ["P1", "P2", "P3"].includes(args.priority)
        ? (args.priority as TaskPriority)
        : undefined;
    const clientMutationId = readIdempotencyValue(args);
    const allowedInitial: TaskStatus[] = ["proposed", "ready"];
    if (type === TRANSCRIPT_CHURN_TASK_TYPE) {
      allowedInitial.push("research");
    }
    if (!title || !allowedInitial.includes(status as TaskStatus)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message:
          "create-task requires title and status proposed, ready, or research (research only with type transcript_churn)"
      };
    }
    if (allocateId && idArg !== undefined && TASK_ID_RE.test(idArg)) {
      return {
        ok: false,
        code: "invalid-run-args",
        message:
          "create-task with allocateId:true cannot include an explicit T### id; omit id, use id:\"auto\", or pass allocateId:false",
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.createTask }
      };
    }
    const evidenceType = command.name === "create-task-from-plan" ? "create-task-from-plan" : "create-task";
    if (allocateId && clientMutationId) {
      const priorAlloc = findIdempotentAllocatedCreate(store, evidenceType, clientMutationId);
      if (priorAlloc) {
        const existing = store.getTask(priorAlloc.taskId);
        if (!existing) {
          return {
            ok: false,
            code: "task-not-found",
            message: `Idempotent allocate replay expected task '${priorAlloc.taskId}' to exist`
          };
        }
        const replayDigest = digestPayload({
          id: existing.id,
          title: existing.title,
          type: existing.type,
          status: existing.status,
          priority: existing.priority,
          dependsOn: existing.dependsOn ?? [],
          unblocks: existing.unblocks ?? [],
          phase: existing.phase ?? null,
          phaseKey: existing.phaseKey ?? null,
          metadata: existing.metadata ?? null,
          ownership: existing.ownership ?? null,
          approach: existing.approach ?? null,
          summary: existing.summary ?? null,
          description: existing.description ?? null,
          risk: existing.risk ?? null,
          technicalScope: existing.technicalScope ?? [],
          acceptanceCriteria: existing.acceptanceCriteria ?? [],
          features: existing.features ?? []
        });
        if (priorAlloc.payloadDigest !== replayDigest) {
          return {
            ok: false,
            code: "idempotency-key-conflict",
            message: `clientMutationId '${clientMutationId}' was already used for a different ${evidenceType} payload on ${existing.id}`
          };
        }
        const replayCreate: Record<string, unknown> = {
          task: existing,
          replayed: true
        };
        attachPolicyMeta(replayCreate, ctx, planning.sqliteDual.getPlanningGeneration());
        return {
          ok: true,
          code: "task-create-idempotent-replay",
          message: `Idempotent create replay for task '${existing.id}'`,
          data: replayCreate
        };
      }
    }
    let resolvedId: string;
    if (allocateId) {
      resolvedId = allocateNextTaskId(store.getAllTasks());
    } else {
      if (!idArg || !TASK_ID_RE.test(idArg)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message:
            "create-task requires id/title, id format T<number>, and status proposed, ready, or research (research only with type transcript_churn); or pass allocateId:true for server-side id allocation"
        };
      }
      resolvedId = idArg;
    }
    const timestamp = nowIso();
    const task: TaskEntity = {
      id: resolvedId,
      title,
      type,
      status: status as TaskStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
      priority,
      dependsOn: Array.isArray(args.dependsOn) ? args.dependsOn.filter((x) => typeof x === "string") : undefined,
      unblocks: Array.isArray(args.unblocks) ? args.unblocks.filter((x) => typeof x === "string") : undefined,
      phase: typeof args.phase === "string" ? args.phase : undefined,
      phaseKey: typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : undefined,
      metadata: typeof args.metadata === "object" && args.metadata !== null ? (args.metadata as Record<string, unknown>) : undefined,
      ownership: typeof args.ownership === "string" ? args.ownership : undefined,
      approach: typeof args.approach === "string" ? args.approach : undefined,
      summary: typeof args.summary === "string" ? args.summary : undefined,
      description: typeof args.description === "string" ? args.description : undefined,
      risk: typeof args.risk === "string" ? args.risk : undefined,
      technicalScope: Array.isArray(args.technicalScope) ? args.technicalScope.filter((x) => typeof x === "string") : undefined,
      acceptanceCriteria: Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria.filter((x) => typeof x === "string") : undefined,
      features: Array.isArray(args.features) ? args.features.filter((x) => typeof x === "string") : undefined
    };
    if (command.name === "create-task-from-plan") {
      const planRef = typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
      if (!planRef) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "create-task-from-plan requires 'planRef'"
        };
      }
      task.metadata = { ...(task.metadata ?? {}), planRef };
    }
    const createPayloadForDigest = {
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
    };
    const payloadDigest = digestPayload(createPayloadForDigest);
    if (!allocateId && clientMutationId) {
      const prior = findIdempotentMutation(store, evidenceType, resolvedId, clientMutationId);
      if (prior) {
        if (prior.payloadDigest !== payloadDigest) {
          return {
            ok: false,
            code: "idempotency-key-conflict",
            message: `clientMutationId '${clientMutationId}' was already used for a different ${evidenceType} payload on ${resolvedId}`
          };
        }
        const replayCreate: Record<string, unknown> = {
          task: store.getTask(resolvedId),
          replayed: true
        };
        attachPolicyMeta(replayCreate, ctx, planning.sqliteDual.getPlanningGeneration());
        return {
          ok: true,
          code: "task-create-idempotent-replay",
          message: `Idempotent create replay for task '${resolvedId}'`,
          data: replayCreate
        };
      }
    }
    if (store.getTask(resolvedId)) {
      return { ok: false, code: "duplicate-task-id", message: `Task '${resolvedId}' already exists` };
    }
    const knownTypeValidationError = validateKnownTaskTypeRequirements(task);
    if (knownTypeValidationError) {
      return {
        ok: false,
        code: knownTypeValidationError.code,
        message: knownTypeValidationError.message
      };
    }
    const pgCreate = planningGenPolicyGate(
      ctx,
      args as Record<string, unknown>,
      CLI_REMEDIATION_INSTRUCTIONS.createTask,
      planning.sqliteDual.getPlanningGeneration()
    );
    if (pgCreate.block) {
      return pgCreate.block;
    }
    const knownSlugs = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
    const badFeat = findUnknownFeatureIds(task.features, knownSlugs);
    if (badFeat.length > 0 && taskTypeFailsClosedOnUnknownFeatures(task.type)) {
      return {
        ok: false,
        code: "unknown-feature-id",
        message: `Unknown feature id(s): ${badFeat.join(", ")}`
      };
    }
    const featureSlugWarnings = collectUnknownFeatureSlugWarnings(task.features, knownSlugs);
    const skillAttach = validateTaskSkillAttachments(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined,
      task.metadata
    );
    if (!skillAttach.ok) {
      return { ok: false, code: skillAttach.code, message: skillAttach.message };
    }
    if (dryRunCreate) {
      const dryData: Record<string, unknown> = {
        task,
        dryRun: true,
        allocateId: allocateId === true
      };
      attachPolicyMeta(dryData, ctx, planning.sqliteDual.getPlanningGeneration(), [
        ...(pgCreate.warnings ?? []),
        ...featureSlugWarnings
      ]);
      return {
        ok: true,
        code: "task-create-dry-run",
        message: `Dry run: validated create for '${resolvedId}' (no persistence)`,
        data: dryData
      };
    }
    store.addTask(task);
    store.addMutationEvidence(
      mutationEvidence(evidenceType, resolvedId, actor, {
        initialStatus: task.status,
        source: command.name,
        clientMutationId,
        payloadDigest,
        allocateId: allocateId === true
      })
    );
    const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
    if (strictIssue) {
      return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
    }
    await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
    const createdData: Record<string, unknown> = { task };
    attachPolicyMeta(createdData, ctx, planning.sqliteDual.getPlanningGeneration(), [
      ...(pgCreate.warnings ?? []),
      ...featureSlugWarnings
    ]);
    return {
      ok: true,
      code: "task-created",
      message: `Created task '${resolvedId}'`,
      data: createdData
    };
  }

  if (command.name === "review-planning-execution-drafts") {
    const normalized = normalizePlanningExecutionDraftTasks(
      ctx,
      args as Record<string, unknown>,
      nowIso(),
      "review-planning-execution-drafts"
    );
    if (!normalized.ok) {
      return normalized.result;
    }
    const findings = reviewPlanningExecutionDraftGaps(normalized.tasks);
    const errorCount = findings.filter((f) => f.severity === "error").length;
    const warningCount = findings.filter((f) => f.severity === "warning").length;
    return {
      ok: true,
      code: errorCount > 0 ? "planning-execution-drafts-review-findings" : "planning-execution-drafts-review-passed",
      message:
        findings.length > 0
          ? `Reviewed ${normalized.tasks.length} draft task(s): ${errorCount} error(s), ${warningCount} warning(s)`
          : `Reviewed ${normalized.tasks.length} draft task(s): no UX/CAE batch gaps found`,
      data: {
        schemaVersion: 1,
        persisted: false,
        reviewProfile: "ux-cae-pre-persist-v1",
        taskCount: normalized.tasks.length,
        status: errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
        errorCount,
        warningCount,
        findings,
        normalizedTaskSummaries: normalized.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          phase: t.phase,
          phaseKey: t.phaseKey ?? null
        }))
      } as Record<string, unknown>
    };
  }

  if (command.name === "persist-planning-execution-drafts") {
    const actor =
      typeof args.actor === "string"
        ? args.actor
        : ctx.resolvedActor !== undefined
          ? ctx.resolvedActor
          : undefined;
    const tasksRaw = args.tasks;
    if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "persist-planning-execution-drafts requires non-empty tasks array",
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
      };
    }
    const planRef =
      typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
    const planningTypeMeta =
      typeof args.planningType === "string" && args.planningType.trim().length > 0 ? args.planningType.trim() : undefined;
    const targetPhaseKey =
      typeof args.targetPhaseKey === "string" && args.targetPhaseKey.trim().length > 0
        ? args.targetPhaseKey.trim()
        : undefined;
    if (targetPhaseKey && !PHASE_KEY_RE.test(targetPhaseKey)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "targetPhaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
      };
    }
    const targetPhase =
      typeof args.targetPhase === "string" && args.targetPhase.trim().length > 0 ? args.targetPhase.trim() : undefined;
    const desiredStatus =
      args.desiredStatus === "ready" || args.desiredStatus === "proposed"
        ? (args.desiredStatus as "ready" | "proposed")
        : undefined;
    if (args.desiredStatus !== undefined && desiredStatus === undefined) {
      return { ok: false, code: "invalid-task-schema", message: "desiredStatus must be 'proposed' or 'ready'" };
    }
    const bulkClientMutationId = readIdempotencyValue(args);
    const timestamp = nowIso();
    const pgBulk = planningGenPolicyGate(
      ctx,
      args as Record<string, unknown>,
      CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts,
      planning.sqliteDual.getPlanningGeneration()
    );
    if (pgBulk.block) {
      return pgBulk.block;
    }

    const taskPersistDigestForIdempotency = (t: TaskEntity): string =>
      digestPayload({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
        phase: t.phase,
        phaseKey: t.phaseKey ?? null,
        approach: t.approach,
        technicalScope: t.technicalScope ?? [],
        acceptanceCriteria: t.acceptanceCriteria ?? [],
        dependsOn: t.dependsOn ?? [],
        unblocks: t.unblocks ?? [],
        priority: t.priority ?? null,
        metadata: t.metadata ?? null
      });

    const built: TaskEntity[] = [];
    for (const row of tasksRaw) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "Each tasks[] row must be an object",
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        };
      }
      const rowObj = row as Record<string, unknown>;
      const rowPhaseKey =
        typeof rowObj.phaseKey === "string" && rowObj.phaseKey.trim().length > 0 ? rowObj.phaseKey.trim() : undefined;
      const rowStatus = rowObj.status === "ready" || rowObj.status === "proposed" ? rowObj.status : undefined;
      if (rowPhaseKey && !PHASE_KEY_RE.test(rowPhaseKey)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "Task phaseKey must be non-empty; letters, digits, dot, underscore, hyphen; max 64 chars"
        };
      }
      const normalizedRow = { ...rowObj };
      if (targetPhaseKey) {
        normalizedRow.phase = targetPhase ?? `Phase ${targetPhaseKey}`;
      }
      const bt = buildTaskFromConversionPayload(normalizedRow, timestamp);
      if (!bt.ok) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: bt.message,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        };
      }
      let task = bt.task;
      task = {
        ...task,
        status: (desiredStatus ?? rowStatus ?? task.status) as TaskStatus,
        phaseKey: targetPhaseKey ?? rowPhaseKey ?? task.phaseKey,
        phase: targetPhaseKey ? (targetPhase ?? `Phase ${targetPhaseKey}`) : task.phase
      };
      const nextMeta: Record<string, unknown> = { ...(task.metadata ?? {}) };
      if (planRef) {
        nextMeta.planRef = planRef;
      }
      if (planningTypeMeta) {
        const prevProv = isRecordLike(nextMeta.planningProvenance)
          ? { ...(nextMeta.planningProvenance as Record<string, unknown>) }
          : {};
        prevProv.planningType = planningTypeMeta;
        prevProv.source = "persist-planning-execution-drafts";
        nextMeta.planningProvenance = prevProv;
      }
      if (Object.keys(nextMeta).length > 0) {
        task = { ...task, metadata: nextMeta };
      }
      const typeErr = validateKnownTaskTypeRequirements(task);
      if (typeErr) {
        return { ok: false, code: typeErr.code, message: typeErr.message };
      }
      const skillAttach = validateTaskSkillAttachments(
        ctx.workspacePath,
        ctx.effectiveConfig as Record<string, unknown> | undefined,
        task.metadata
      );
      if (!skillAttach.ok) {
        return { ok: false, code: skillAttach.code, message: skillAttach.message };
      }
      built.push(task);
    }

    const seen = new Set<string>();
    for (const t of built) {
      if (seen.has(t.id)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `Duplicate task id in tasks[]: ${t.id}`,
          remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.persistPlanningExecutionDrafts }
        };
      }
      seen.add(t.id);
    }

    if (bulkClientMutationId) {
      let priorHits = 0;
      for (const t of built) {
        const composed = `${bulkClientMutationId}::${t.id}`;
        const prior = findIdempotentMutation(store, "create-task", t.id, composed);
        const d = taskPersistDigestForIdempotency(t);
        if (prior) {
          if (prior.payloadDigest !== d) {
            return {
              ok: false,
              code: "idempotency-key-conflict",
              message: `clientMutationId '${bulkClientMutationId}' was already used for a different create-task payload on ${t.id}`
            };
          }
          priorHits += 1;
          if (!store.getTask(t.id)) {
            return {
              ok: false,
              code: "task-not-found",
              message: `Idempotent replay expected task '${t.id}' to exist`
            };
          }
        } else if (store.getTask(t.id)) {
          return {
            ok: false,
            code: "duplicate-task-id",
            message: `Task '${t.id}' already exists`
          };
        }
      }
      if (priorHits > 0 && priorHits < built.length) {
        return {
          ok: false,
          code: "planning-execution-drafts-partial-idempotency",
          message:
            "Mixed idempotency state: some task ids already recorded for this clientMutationId and others are new; retry with a fresh clientMutationId or reconcile task store"
        };
      }
      if (priorHits === built.length) {
        const createdTasks = built.map((t) => store.getTask(t.id)).filter((x): x is TaskEntity => Boolean(x));
        const replayData: Record<string, unknown> = {
          createdTasks,
          count: createdTasks.length,
          replayed: true
        };
        attachPolicyMeta(replayData, ctx, planning.sqliteDual.getPlanningGeneration(), pgBulk.warnings);
        return {
          ok: true,
          code: "planning-execution-drafts-idempotent-replay",
          message: `Idempotent replay for ${createdTasks.length} planning execution draft task(s)`,
          data: replayData
        };
      }
    } else {
      for (const t of built) {
        if (store.getTask(t.id)) {
          return {
            ok: false,
            code: "duplicate-task-id",
            message: `Task '${t.id}' already exists`
          };
        }
      }
    }

    const knownSlugs = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
    for (const t of built) {
      const badFeat = findUnknownFeatureIds(t.features, knownSlugs);
      if (badFeat.length > 0 && taskTypeFailsClosedOnUnknownFeatures(t.type)) {
        return {
          ok: false,
          code: "unknown-feature-id",
          message: `Unknown feature id(s): ${badFeat.join(", ")}`
        };
      }
    }

    if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
      const strictIssue = validateTaskSetForStrictMode([...store.getAllTasks(), ...built]);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
    }

    const featureSlugWarnings: string[] = [];
    for (const t of built) {
      featureSlugWarnings.push(...collectUnknownFeatureSlugWarnings(t.features, knownSlugs));
    }

    const applyBulk = (): void => {
      for (const t of built) {
        store.addTask(t);
        const composedIdem = bulkClientMutationId ? `${bulkClientMutationId}::${t.id}` : undefined;
        const payloadDigest = taskPersistDigestForIdempotency(t);
        store.addMutationEvidence(
          mutationEvidence("create-task", t.id, actor, {
            initialStatus: t.status,
            source: "persist-planning-execution-drafts",
            clientMutationId: composedIdem,
            payloadDigest
          })
        );
      }
    };

    planning.sqliteDual.withTransaction(applyBulk, planningConcurrencySaveOpts(args as Record<string, unknown>));

    const strictAfter = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
    if (strictAfter) {
      return { ok: false, code: "strict-task-validation-failed", message: strictAfter };
    }

    const outData: Record<string, unknown> = { createdTasks: built, count: built.length };
    attachPolicyMeta(outData, ctx, planning.sqliteDual.getPlanningGeneration(), [
      ...(pgBulk.warnings ?? []),
      ...featureSlugWarnings
    ]);
    return {
      ok: true,
      code: "planning-execution-drafts-persisted",
      message: `Persisted ${built.length} planning execution draft task(s)`,
      data: outData
    };
  }

  if (command.name === "update-task") {
    const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
    const updates =
      typeof args.updates === "object" && args.updates !== null ? (args.updates as Record<string, unknown>) : undefined;
    const actor =
      typeof args.actor === "string"
        ? args.actor
        : ctx.resolvedActor !== undefined
          ? ctx.resolvedActor
          : undefined;
    if (!taskId || !updates) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "update-task requires taskId and updates object",
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.updateTask }
      };
    }
    const clientMutationId = readIdempotencyValue(args);
    const task = store.getTask(taskId);
    if (!task) {
      return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
    }
    const invalidKeys = Object.keys(updates).filter((key) => !MUTABLE_TASK_FIELDS.has(key));
    if (invalidKeys.length > 0) {
      return {
        ok: false,
        code: "invalid-task-update",
        message: `update-task cannot mutate immutable fields: ${invalidKeys.join(", ")}`
      };
    }
    if (updates.features !== undefined) {
      if (!Array.isArray(updates.features) || !(updates.features as unknown[]).every((x) => typeof x === "string")) {
        return {
          ok: false,
          code: "invalid-task-update",
          message: "update-task field 'features' must be an array of strings when provided"
        };
      }
    }
    const updatedTask = { ...task, ...updates, updatedAt: nowIso() } as TaskEntity;
    const knownUpd = resolveKnownFeatureSlugSet(planning.sqliteDual.getDatabase());
    const badUpd = findUnknownFeatureIds(updatedTask.features, knownUpd);
    if (badUpd.length > 0 && taskTypeFailsClosedOnUnknownFeatures(updatedTask.type)) {
      return {
        ok: false,
        code: "unknown-feature-id",
        message: `Unknown feature id(s): ${badUpd.join(", ")}`
      };
    }
    const featureSlugWarningsUpd = collectUnknownFeatureSlugWarnings(updatedTask.features, knownUpd);
    const skillAttachUpd = validateTaskSkillAttachments(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined,
      updatedTask.metadata
    );
    if (!skillAttachUpd.ok) {
      return { ok: false, code: skillAttachUpd.code, message: skillAttachUpd.message };
    }
    const payloadDigest = digestPayload({ taskId, updates });
    if (clientMutationId) {
      const prior = findIdempotentMutation(store, "update-task", taskId, clientMutationId);
      if (prior) {
        if (prior.payloadDigest !== payloadDigest) {
          return {
            ok: false,
            code: "idempotency-key-conflict",
            message: `clientMutationId '${clientMutationId}' was already used for a different update-task payload on ${taskId}`
          };
        }
        const replayUpd: Record<string, unknown> = { task, replayed: true };
        attachPolicyMeta(replayUpd, ctx, planning.sqliteDual.getPlanningGeneration());
        return {
          ok: true,
          code: "task-update-idempotent-replay",
          message: `Idempotent update replay for task '${taskId}'`,
          data: replayUpd
        };
      }
    }
    const pgUpd = planningGenPolicyGate(
      ctx,
      args as Record<string, unknown>,
      CLI_REMEDIATION_INSTRUCTIONS.updateTask,
      planning.sqliteDual.getPlanningGeneration()
    );
    if (pgUpd.block) {
      return pgUpd.block;
    }
    const knownTypeValidationError = validateKnownTaskTypeRequirements(updatedTask);
    if (knownTypeValidationError) {
      return {
        ok: false,
        code: knownTypeValidationError.code,
        message: knownTypeValidationError.message
      };
    }
    if (args.dryRun === true) {
      const dryUpd: Record<string, unknown> = {
        task: updatedTask,
        taskId,
        dryRun: true
      };
      attachPolicyMeta(dryUpd, ctx, planning.sqliteDual.getPlanningGeneration(), [
        ...(pgUpd.warnings ?? []),
        ...featureSlugWarningsUpd
      ]);
      return {
        ok: true,
        code: "task-update-dry-run",
        message: `Dry run: validated update for '${taskId}' (no persistence)`,
        data: dryUpd
      };
    }
    store.updateTask(updatedTask);
    store.addMutationEvidence(
      mutationEvidence("update-task", taskId, actor, {
        updatedFields: Object.keys(updates),
        clientMutationId,
        payloadDigest
      })
    );
    const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
    if (strictIssue) {
      return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
    }
    await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
    const updData: Record<string, unknown> = { task: updatedTask };
    attachPolicyMeta(updData, ctx, planning.sqliteDual.getPlanningGeneration(), [
      ...(pgUpd.warnings ?? []),
      ...featureSlugWarningsUpd
    ]);
    return {
      ok: true,
      code: "task-updated",
      message: `Updated task '${taskId}'`,
      data: updData
    };
  }

  return null;
}
