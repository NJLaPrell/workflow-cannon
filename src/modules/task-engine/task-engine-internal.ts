import type { ModuleCommandResult, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import type { TaskEntity, TaskMutationType, TaskPriority, TaskStatus } from "./types.js";
import { maybeSpawnTranscriptHookAfterCompletion } from "../../core/transcript-completion-hook.js";
import { TaskStore } from "./store.js";
import { TransitionService } from "./service.js";
import { TaskEngineError, getAllowedTransitionsFrom } from "./transitions.js";
import {
  filterTasksByQueueNamespace,
  getNextActions,
  isImprovementLikeTask
} from "./suggestions.js";
import { buildQueueGitAlignmentReport, probeGitHead } from "./queue-git-alignment.js";
import {
  loadTasksFromSnapshotFile,
  parseTasksFromSnapshotPayload,
  replayQueueFromTasks
} from "./replay-queue-snapshot.js";
import { readWorkspaceStatusSnapshot } from "./dashboard-status.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import { buildQueueHealthReport, buildQueueHintsForTasks } from "./queue-health.js";
import { openPlanningStores } from "./planning-open.js";
import { runMigrateWishlistIntake } from "./migrate-wishlist-intake-runtime.js";
import { runBackupPlanningSqlite } from "./backup-planning-sqlite-runtime.js";
import { runMigrateTaskPersistence } from "./migrate-task-persistence-runtime.js";
import { runGetKitPersistenceMap } from "./kit-persistence-map-runtime.js";
import { runUpdateWorkspacePhaseSnapshot } from "./update-workspace-phase-snapshot-runtime.js";
import { runAssignTaskPhase, runClearTaskPhase } from "./task-engine-phase-mutations.js";
import { runWishlistStoreCommand } from "./task-engine-wishlist-on-command.js";
import { runDashboardSummaryCommand } from "./task-engine-dashboard-on-command.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings,
  planningSqliteDatabaseRelativePath,
  planningStrictValidationEnabled
} from "./planning-config.js";
import { validateTaskSetForStrictMode } from "./strict-task-validation.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { isWishlistIntakeTask, WISHLIST_INTAKE_TASK_TYPE } from "./wishlist-intake.js";
import {
  digestPayload,
  findIdempotentMutation,
  isRecordLike,
  mutationEvidence,
  nowIso,
  readIdempotencyValue,
  readMetadataPath,
  planningConcurrencySaveOpts,
  readOptionalExpectedPlanningGeneration,
  SAFE_METADATA_PATH_RE,
  TASK_ID_RE
} from "./mutation-utils.js";

function readQueueNamespaceArg(args: Record<string, unknown>): string | undefined {
  const q = args.queueNamespace;
  return typeof q === "string" && q.trim().length > 0 ? q.trim() : undefined;
}

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
  "acceptanceCriteria"
]);

function strictValidationError(
  store: TaskStore,
  effectiveConfig: Record<string, unknown> | undefined
): string | null {
  if (!planningStrictValidationEnabled({ effectiveConfig })) {
    return null;
  }
  return validateTaskSetForStrictMode(store.getAllTasks());
}

function planningGenPolicyGate(
  ctx: { effectiveConfig?: Record<string, unknown> },
  args: Record<string, unknown>
): { block: ModuleCommandResult | null; warnings?: string[] } {
  const policy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const gate = enforcePlanningGenerationPolicy(policy, args);
  if (!gate.ok) {
    return { block: { ok: false, code: gate.code, message: gate.message } };
  }
  return { block: null, warnings: gate.warnings };
}

function attachPolicyMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  planningGen: number,
  warnings?: string[]
): void {
  data.planningGeneration = planningGen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.11.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["task-engine"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/task-engine/config.md",
      format: "md",
      description: "Task Engine configuration contract."
    },
    instructions: {
      directory: "src/modules/task-engine/instructions",
      entries: builtinInstructionEntriesForModule("task-engine")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    if (command.name === "migrate-task-persistence") {
      return runMigrateTaskPersistence(ctx, args as Record<string, unknown>);
    }
    if (command.name === "backup-planning-sqlite") {
      return runBackupPlanningSqlite(ctx, args as Record<string, unknown>);
    }
    if (command.name === "migrate-wishlist-intake") {
      return runMigrateWishlistIntake(ctx, args as Record<string, unknown>);
    }
    if (command.name === "get-kit-persistence-map") {
      return runGetKitPersistenceMap(ctx);
    }
    if (command.name === "update-workspace-phase-snapshot") {
      return runUpdateWorkspacePhaseSnapshot(ctx, args as Record<string, unknown>);
    }
    if (command.name === "list-module-states" || command.name === "get-module-state") {
      const unified = new UnifiedStateDb(ctx.workspacePath, planningSqliteDatabaseRelativePath(ctx));
      const dbAbs = unified.dbPath;
      let kitSqliteUserVersion: number | null = null;
      try {
        const fs = await import("node:fs");
        if (fs.existsSync(dbAbs)) {
          kitSqliteUserVersion = readKitSqliteUserVersion(dbAbs);
        }
      } catch {
        kitSqliteUserVersion = null;
      }
      if (command.name === "list-module-states") {
        return {
          ok: true,
          code: "module-states-listed",
          message: "Listed module state rows",
          data: { rows: unified.listModuleStates(), kitSqliteUserVersion }
        };
      }
      const moduleId = typeof args.moduleId === "string" ? args.moduleId.trim() : "";
      if (!moduleId) {
        return { ok: false, code: "invalid-task-schema", message: "get-module-state requires moduleId" };
      }
      const row = unified.getModuleState(moduleId);
      return row
        ? {
            ok: true,
            code: "module-state-read",
            message: `Read module state for ${moduleId}`,
            data: { row }
          }
        : {
            ok: false,
            code: "task-not-found",
            message: `No module state found for '${moduleId}'`
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
        message: `Failed to open task planning stores: ${(err as Error).message}`
      };
    }
    const store = planning.taskStore;

    if (command.name === "run-transition") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const action = typeof args.action === "string" ? args.action : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;

      if (!taskId || !action) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "run-transition requires 'taskId' and 'action' arguments"
        };
      }

      const pgTransition = planningGenPolicyGate(ctx, args as Record<string, unknown>);
      if (pgTransition.block) {
        return pgTransition.block;
      }

      try {
        const service = new TransitionService(store);
        const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(
          args as Record<string, unknown>
        );
        const result = await service.runTransition({
          taskId,
          action,
          actor,
          expectedPlanningGeneration
        });
        if (result.evidence.toState === "completed") {
          maybeSpawnTranscriptHookAfterCompletion(
            ctx.workspacePath,
            (ctx.effectiveConfig ?? {}) as Record<string, unknown>
          );
        }
        const data: Record<string, unknown> = {
          evidence: result.evidence,
          autoUnblocked: result.autoUnblocked
        };
        attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
        return {
          ok: true,
          code: "transition-applied",
          message: `${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`,
          data
        };
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "invalid-transition",
          message: (err as Error).message
        };
      }
    }

    if (command.name === "create-task" || command.name === "create-task-from-plan") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const id = typeof args.id === "string" && args.id.trim().length > 0 ? args.id.trim() : undefined;
      const title = typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : undefined;
      const type = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : "workspace-kit";
      const status = typeof args.status === "string" ? args.status : "proposed";
      const priority =
        typeof args.priority === "string" && ["P1", "P2", "P3"].includes(args.priority)
          ? args.priority as TaskPriority
          : undefined;
      const clientMutationId = readIdempotencyValue(args);
      if (!id || !title || !TASK_ID_RE.test(id) || !["proposed", "ready"].includes(status)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message:
            "create-task requires id/title, id format T<number>, and status of proposed or ready"
        };
      }
      const evidenceType = command.name === "create-task-from-plan" ? "create-task-from-plan" : "create-task";
      const timestamp = nowIso();
      const task: TaskEntity = {
        id,
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
        metadata: typeof args.metadata === "object" && args.metadata !== null ? args.metadata as Record<string, unknown> : undefined,
        ownership: typeof args.ownership === "string" ? args.ownership : undefined,
        approach: typeof args.approach === "string" ? args.approach : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        risk: typeof args.risk === "string" ? args.risk : undefined,
        technicalScope: Array.isArray(args.technicalScope) ? args.technicalScope.filter((x) => typeof x === "string") : undefined,
        acceptanceCriteria: Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria.filter((x) => typeof x === "string") : undefined
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
        acceptanceCriteria: task.acceptanceCriteria ?? []
      };
      const payloadDigest = digestPayload(createPayloadForDigest);
      if (clientMutationId) {
        const prior = findIdempotentMutation(store, evidenceType, id, clientMutationId);
        if (prior) {
          if (prior.payloadDigest !== payloadDigest) {
            return {
              ok: false,
              code: "idempotency-key-conflict",
              message: `clientMutationId '${clientMutationId}' was already used for a different ${evidenceType} payload on ${id}`
            };
          }
          const replayCreate: Record<string, unknown> = {
            task: store.getTask(id),
            replayed: true
          };
          attachPolicyMeta(replayCreate, ctx, planning.sqliteDual.getPlanningGeneration());
          return {
            ok: true,
            code: "task-create-idempotent-replay",
            message: `Idempotent create replay for task '${id}'`,
            data: replayCreate
          };
        }
      }
      if (store.getTask(id)) {
        return { ok: false, code: "duplicate-task-id", message: `Task '${id}' already exists` };
      }
      const knownTypeValidationError = validateKnownTaskTypeRequirements(task);
      if (knownTypeValidationError) {
        return {
          ok: false,
          code: knownTypeValidationError.code,
          message: knownTypeValidationError.message
        };
      }
      const pgCreate = planningGenPolicyGate(ctx, args as Record<string, unknown>);
      if (pgCreate.block) {
        return pgCreate.block;
      }
      store.addTask(task);
      store.addMutationEvidence(mutationEvidence(evidenceType, id, actor, {
        initialStatus: task.status,
        source: command.name,
        clientMutationId,
        payloadDigest
      }));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const createdData: Record<string, unknown> = { task };
      attachPolicyMeta(createdData, ctx, planning.sqliteDual.getPlanningGeneration(), pgCreate.warnings);
      return {
        ok: true,
        code: "task-created",
        message: `Created task '${id}'`,
        data: createdData
      };
    }

    if (command.name === "update-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const updates = typeof args.updates === "object" && args.updates !== null ? args.updates as Record<string, unknown> : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId || !updates) {
        return { ok: false, code: "invalid-task-schema", message: "update-task requires taskId and updates object" };
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
      const updatedTask = { ...task, ...updates, updatedAt: nowIso() };
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
      const pgUpd = planningGenPolicyGate(ctx, args as Record<string, unknown>);
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
      attachPolicyMeta(updData, ctx, planning.sqliteDual.getPlanningGeneration(), pgUpd.warnings);
      return {
        ok: true,
        code: "task-updated",
        message: `Updated task '${taskId}'`,
        data: updData
      };
    }

    if (command.name === "assign-task-phase") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const r = await runAssignTaskPhase({
        store,
        ctx,
        strictValidationError,
        actor,
        rawArgs: args as Record<string, unknown>
      });
      if (r.ok && r.data && typeof r.data === "object") {
        attachPolicyMeta(r.data as Record<string, unknown>, ctx, planning.sqliteDual.getPlanningGeneration());
      }
      return r;
    }

    if (command.name === "clear-task-phase") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const r = await runClearTaskPhase({
        store,
        ctx,
        strictValidationError,
        actor,
        rawArgs: args as Record<string, unknown>
      });
      if (r.ok && r.data && typeof r.data === "object") {
        attachPolicyMeta(r.data as Record<string, unknown>, ctx, planning.sqliteDual.getPlanningGeneration());
      }
      return r;
    }

    if (command.name === "archive-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId) {
        return { ok: false, code: "invalid-task-schema", message: "archive-task requires taskId" };
      }
      const task = store.getTask(taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const pgArchive = planningGenPolicyGate(ctx, args as Record<string, unknown>);
      if (pgArchive.block) {
        return pgArchive.block;
      }
      const archivedAt = nowIso();
      const updatedTask = { ...task, archived: true, archivedAt, updatedAt: archivedAt };
      store.updateTask(updatedTask);
      store.addMutationEvidence(mutationEvidence("archive-task", taskId, actor));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const archData: Record<string, unknown> = { task: updatedTask };
      attachPolicyMeta(archData, ctx, planning.sqliteDual.getPlanningGeneration(), pgArchive.warnings);
      return {
        ok: true,
        code: "task-archived",
        message: `Archived task '${taskId}'`,
        data: archData
      };
    }

    if (command.name === "get-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      if (!taskId) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "get-task requires 'taskId' argument"
        };
      }

      const task = store.getTask(taskId);
      if (!task) {
        return {
          ok: false,
          code: "task-not-found",
          message: `Task '${taskId}' not found`
        };
      }

      const historyLimitRaw = args.historyLimit;
      const historyLimit =
        typeof historyLimitRaw === "number" && Number.isFinite(historyLimitRaw) && historyLimitRaw > 0
          ? Math.min(Math.floor(historyLimitRaw), 200)
          : 50;
      const log = store.getTransitionLog();
      const recentTransitions = log
        .filter((e) => e.taskId === taskId)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, historyLimit);

      const allowedActions = getAllowedTransitionsFrom(task.status as TaskStatus).map(({ to, action }) => ({
        action,
        targetStatus: to
      }));

      const gtData: Record<string, unknown> = {
        task,
        recentTransitions,
        allowedActions
      };
      attachPolicyMeta(gtData, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "task-retrieved",
        data: gtData
      };
    }

    if (command.name === "add-dependency" || command.name === "remove-dependency") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const dependencyTaskId = typeof args.dependencyTaskId === "string" ? args.dependencyTaskId : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId || !dependencyTaskId) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `${command.name} requires taskId and dependencyTaskId`
        };
      }
      if (taskId === dependencyTaskId) {
        return { ok: false, code: "dependency-cycle", message: "Task cannot depend on itself" };
      }
      const task = store.getTask(taskId);
      const dep = store.getTask(dependencyTaskId);
      if (!task || !dep) {
        return { ok: false, code: "task-not-found", message: "taskId or dependencyTaskId not found" };
      }
      const deps = new Set(task.dependsOn ?? []);
      if (command.name === "add-dependency") {
        if (deps.has(dependencyTaskId)) {
          return { ok: false, code: "duplicate-dependency", message: "Dependency already exists" };
        }
        deps.add(dependencyTaskId);
      } else {
        deps.delete(dependencyTaskId);
      }
      const pgDep = planningGenPolicyGate(ctx, args as Record<string, unknown>);
      if (pgDep.block) {
        return pgDep.block;
      }
      const updatedTask = { ...task, dependsOn: [...deps], updatedAt: nowIso() };
      store.updateTask(updatedTask);
      const mutationType = command.name === "add-dependency" ? "add-dependency" : "remove-dependency";
      store.addMutationEvidence(mutationEvidence(mutationType, taskId, actor, { dependencyTaskId }));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
      const depData: Record<string, unknown> = { task: updatedTask };
      attachPolicyMeta(depData, ctx, planning.sqliteDual.getPlanningGeneration(), pgDep.warnings);
      return {
        ok: true,
        code: command.name === "add-dependency" ? "dependency-added" : "dependency-removed",
        message: `${command.name} applied for '${taskId}'`,
        data: depData
      };
    }

    if (command.name === "get-dependency-graph") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const tasks = store.getActiveTasks();
      const nodes = tasks.map((task) => ({ id: task.id, status: task.status }));
      const edges = tasks.flatMap((task) => (task.dependsOn ?? []).map((depId) => ({ from: task.id, to: depId })));
      if (!taskId) {
        return { ok: true, code: "dependency-graph", data: { nodes, edges } as Record<string, unknown> };
      }
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      return {
        ok: true,
        code: "dependency-graph",
        data: {
          taskId,
          dependsOn: task.dependsOn ?? [],
          directDependents: tasks.filter((candidate) => (candidate.dependsOn ?? []).includes(taskId)).map((x) => x.id),
          nodes,
          edges
        } as Record<string, unknown>
      };
    }

    if (command.name === "get-task-history" || command.name === "get-recent-task-activity") {
      const limitRaw = args.limit;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 50;
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const transitions = store.getTransitionLog().map((entry) => ({ kind: "transition", ...entry }));
      const mutations = store.getMutationLog().map((entry) => ({ kind: "mutation", ...entry }));
      const merged = [...transitions, ...mutations]
        .filter((entry) => (taskId ? entry.taskId === taskId : true))
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, limit);
      return {
        ok: true,
        code: command.name === "get-task-history" ? "task-history" : "recent-task-activity",
        data: { taskId: taskId ?? null, items: merged, count: merged.length } as Record<string, unknown>
      };
    }

    if (command.name === "dashboard-summary") {
      return runDashboardSummaryCommand(ctx, store, planning.sqliteDual.getPlanningGeneration());
    }

    if (command.name === "queue-health") {
      const tasks = store.getActiveTasks();
      const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
      const report = buildQueueHealthReport({
        tasks,
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        workspaceStatus
      });
      return {
        ok: true,
        code: "queue-health",
        message: `Queue health: ${report.summary.readyCount} ready; ${report.summary.misalignedPhaseCount} phase mismatches; ${report.summary.blockedByDependenciesCount} ready with unmet dependencies`,
        data: report as unknown as Record<string, unknown>
      };
    }

    if (command.name === "queue-git-alignment") {
      const staleRaw = args.staleInProgressDays;
      const staleInProgressDays =
        typeof staleRaw === "number" && Number.isFinite(staleRaw) && staleRaw > 0
          ? Math.min(Math.floor(staleRaw), 3650)
          : undefined;
      const report = buildQueueGitAlignmentReport({
        workspacePath: ctx.workspacePath,
        tasks: store.getActiveTasks(),
        transitionLog: store.getTransitionLog(),
        storeLastUpdated: store.getLastUpdated(),
        git: probeGitHead(ctx.workspacePath),
        staleInProgressDays
      });
      return {
        ok: true,
        code: "queue-git-alignment",
        message: report.summary,
        data: report as unknown as Record<string, unknown>
      };
    }

    if (command.name === "replay-queue-snapshot") {
      const ns = readQueueNamespaceArg(args);
      let taskList: TaskEntity[];
      try {
        const snapPath =
          typeof args.snapshotRelativePath === "string" ? args.snapshotRelativePath.trim() : "";
        if (snapPath) {
          taskList = await loadTasksFromSnapshotFile(ctx.workspacePath, snapPath);
        } else if (Array.isArray(args.tasks)) {
          taskList = parseTasksFromSnapshotPayload({ tasks: args.tasks });
        } else {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "replay-queue-snapshot requires snapshotRelativePath (repo-relative) or tasks[] array"
          };
        }
      } catch (e) {
        return {
          ok: false,
          code: "import-parse-error",
          message: (e as Error).message
        };
      }
      const data = replayQueueFromTasks(taskList, ns ? { queueNamespace: ns } : undefined);
      return {
        ok: true,
        code: "queue-replay",
        message: `Replayed ${data.taskCount} tasks (read-only)`,
        data: data as unknown as Record<string, unknown>
      };
    }

    if (command.name === "list-tasks") {
      const statusFilter = typeof args.status === "string" ? args.status as TaskStatus : undefined;
      const phaseFilter = typeof args.phase === "string" ? args.phase : undefined;
      const phaseKeyFilter =
        typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : undefined;
      const typeFilter = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : undefined;
      const categoryFilter =
        typeof args.category === "string" && args.category.trim().length > 0 ? args.category.trim() : undefined;
      const tagsFilterRaw = args.tags;
      const tagsFilter =
        typeof tagsFilterRaw === "string"
          ? [tagsFilterRaw]
          : Array.isArray(tagsFilterRaw)
            ? tagsFilterRaw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
            : [];
      const metadataFilters = isRecordLike(args.metadataFilters)
        ? Object.entries(args.metadataFilters).filter(([path]) => SAFE_METADATA_PATH_RE.test(path))
        : [];
      const includeArchived = args.includeArchived === true;
      const includeQueueHints = args.includeQueueHints === true;
      const confidenceTierFilter =
        typeof args.confidenceTier === "string" && args.confidenceTier.trim().length > 0
          ? args.confidenceTier.trim()
          : undefined;
      const blockedReasonCategoryFilter =
        typeof args.blockedReasonCategory === "string" && args.blockedReasonCategory.trim().length > 0
          ? args.blockedReasonCategory.trim()
          : undefined;

      let tasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
      if (statusFilter) {
        tasks = tasks.filter((t) => t.status === statusFilter);
      }
      if (phaseFilter) {
        tasks = tasks.filter((t) => t.phase === phaseFilter);
      }
      if (phaseKeyFilter) {
        tasks = tasks.filter((t) => inferTaskPhaseKey(t) === phaseKeyFilter);
      }
      if (typeFilter) {
        tasks = tasks.filter((t) => t.type === typeFilter);
      }
      if (categoryFilter) {
        tasks = tasks.filter((t) => readMetadataPath(t.metadata, "category") === categoryFilter);
      }
      if (tagsFilter.length > 0) {
        tasks = tasks.filter((t) => {
          const tags = readMetadataPath(t.metadata, "tags");
          if (!Array.isArray(tags)) {
            return false;
          }
          const normalized = tags.filter((entry): entry is string => typeof entry === "string");
          return tagsFilter.every((tag) => normalized.includes(tag));
        });
      }
      if (metadataFilters.length > 0) {
        tasks = tasks.filter((t) =>
          metadataFilters.every(([path, expected]) => readMetadataPath(t.metadata, path) === expected)
        );
      }
      if (confidenceTierFilter) {
        tasks = tasks.filter(
          (t) => readMetadataPath(t.metadata, "confidenceTier") === confidenceTierFilter
        );
      }
      if (blockedReasonCategoryFilter) {
        tasks = tasks.filter(
          (t) => readMetadataPath(t.metadata, "blockedReasonCategory") === blockedReasonCategoryFilter
        );
      }

      const data: Record<string, unknown> = {
        tasks,
        count: tasks.length,
        scope: "tasks-only"
      };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      if (includeQueueHints) {
        const hintBaseTasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
        const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
        data.queueHintRows = buildQueueHintsForTasks({
          tasks: hintBaseTasks,
          effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
          workspaceStatus,
          taskRows: tasks
        });
      }

      return {
        ok: true,
        code: "tasks-listed",
        message: `Found ${tasks.length} tasks`,
        data
      };
    }

    if (command.name === "get-ready-queue") {
      const ns = readQueueNamespaceArg(args);
      let tasks = store.getActiveTasks();
      if (ns) {
        tasks = filterTasksByQueueNamespace(tasks, ns);
      }
      const ready = tasks
        .filter((t) => t.status === "ready" && !isWishlistIntakeTask(t))
        .sort((a, b) => {
          const pa = a.priority ?? "P9";
          const pb = b.priority ?? "P9";
          return pa.localeCompare(pb);
        });

      const rqData: Record<string, unknown> = {
        tasks: ready,
        count: ready.length,
        scope: "tasks-only",
        queueNamespace: ns ?? null
      };
      attachPolicyMeta(rqData, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "ready-queue-retrieved",
        message: `${ready.length} tasks in ready queue`,
        data: rqData
      };
    }

    if (command.name === "get-next-actions") {
      const tasks = store.getActiveTasks();
      const ns = readQueueNamespaceArg(args);
      const suggestion = getNextActions(tasks, ns ? { queueNamespace: ns } : undefined);

      const naData: Record<string, unknown> = {
        ...suggestion,
        scope: "tasks-only",
        queueNamespace: ns ?? null
      };
      attachPolicyMeta(naData, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "next-actions-retrieved",
        message: suggestion.suggestedNext
          ? `Suggested next: ${suggestion.suggestedNext.id} — ${suggestion.suggestedNext.title}`
          : "No tasks in ready queue",
        data: naData
      };
    }

    if (command.name === "explain-task-engine-model") {
      const allStatuses: TaskStatus[] = ["proposed", "ready", "in_progress", "blocked", "completed", "cancelled"];
      const lifecycle = allStatuses.map((status) => ({
        status,
        allowedActions: getAllowedTransitionsFrom(status).map((entry) => ({
          action: entry.action,
          targetStatus: entry.to
        }))
      }));
      return {
        ok: true,
        code: "task-engine-model-explained",
        message: "Task Engine model variants, planning boundary, and lifecycle transitions.",
        data: {
          modelVersion: 1 as const,
          variants: [
            {
              variant: "execution-task",
              idPattern: "^T[0-9]+$",
              appearsInExecutionPlanning: true,
              requiredFields: ["id", "title", "type", "status", "createdAt", "updatedAt"],
              optionalFields: [
                "priority",
                "dependsOn",
                "unblocks",
                "phase",
                "phaseKey",
                "metadata",
                "metadata.queueNamespace",
                "metadata.implementationEstimatePack",
                "ownership",
                "approach",
                "technicalScope",
                "acceptanceCriteria"
              ]
            },
            {
              variant: "wishlist-intake-task",
              idPattern: "^T[0-9]+$",
              taskType: WISHLIST_INTAKE_TASK_TYPE,
              appearsInExecutionPlanning: false,
              requiredFields: [
                "id",
                "title",
                "type",
                "status",
                "createdAt",
                "updatedAt",
                "metadata.problemStatement",
                "metadata.expectedOutcome",
                "metadata.impact",
                "metadata.constraints",
                "metadata.successSignals",
                "metadata.requestor",
                "metadata.evidenceRef"
              ],
              optionalFields: [
                "metadata.legacyWishlistId",
                "metadata",
                "priority",
                "dependsOn",
                "unblocks"
              ],
              notes:
                "Ideation backlog uses type wishlist_intake (T ids); optional metadata.legacyWishlistId preserves W### provenance after migration. Excluded from ready-queue suggestions."
            }
          ],
          planningBoundary: {
            executionQueues: "tasks-only",
            wishlistScope: "task-backed-wishlist-intake"
          },
          executionTaskLifecycle: lifecycle
        } as unknown as Record<string, unknown>
      };
    }

    if (command.name === "get-task-summary") {
      const tasks = store.getActiveTasks();
      const suggestion = getNextActions(tasks);
      return {
        ok: true,
        code: "task-summary",
        data: {
          scope: "tasks-only",
          stateSummary: suggestion.stateSummary,
          readyQueueCount: suggestion.readyQueue.length,
          suggestedNext: suggestion.suggestedNext
            ? {
                id: suggestion.suggestedNext.id,
                title: suggestion.suggestedNext.title,
                priority: suggestion.suggestedNext.priority ?? null
              }
            : null
        } as Record<string, unknown>
      };
    }

    if (command.name === "get-blocked-summary") {
      const tasks = store.getActiveTasks();
      const suggestion = getNextActions(tasks);
      return {
        ok: true,
        code: "blocked-summary",
        data: {
          blockedCount: suggestion.blockingAnalysis.length,
          blockedItems: suggestion.blockingAnalysis,
          scope: "tasks-only"
        } as Record<string, unknown>
      };
    }

    const wishlistResult = runWishlistStoreCommand(
      command.name,
      args as Record<string, unknown>,
      ctx,
      store,
      planning
    );
    if (wishlistResult !== undefined) {
      if (wishlistResult.ok && wishlistResult.data && typeof wishlistResult.data === "object") {
        attachPolicyMeta(
          wishlistResult.data as Record<string, unknown>,
          ctx,
          planning.sqliteDual.getPlanningGeneration()
        );
      }
      return wishlistResult;
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Task Engine does not support command '${command.name}'`
    };
  }
};
