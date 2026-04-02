import type { WorkflowModule } from "../../contracts/module-contract.js";
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
import { buildDashboardDependencyOverview } from "./dashboard-dependency-overview.js";
import {
  buildDashboardPhaseBucketsForBlocking,
  buildDashboardPhaseBucketsForTasks
} from "./dashboard-phase-buckets.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import { buildQueueHealthReport, buildQueueHintsForTasks } from "./queue-health.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../core/planning/build-plan-session-file.js";
import { openPlanningStores } from "./planning-open.js";
import { runMigrateWishlistIntake } from "./migrate-wishlist-intake-runtime.js";
import { runBackupPlanningSqlite } from "./backup-planning-sqlite-runtime.js";
import { runMigrateTaskPersistence } from "./migrate-task-persistence-runtime.js";
import { runGetKitPersistenceMap } from "./kit-persistence-map-runtime.js";
import { planningSqliteDatabaseRelativePath, planningStrictValidationEnabled } from "./planning-config.js";
import { validateTaskSetForStrictMode } from "./strict-task-validation.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import type { WishlistItem } from "./wishlist-types.js";
import {
  buildWishlistItemFromIntake,
  validateWishlistContentFields,
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  WISHLIST_ID_RE
} from "./wishlist-validation.js";
import {
  allocateNextTaskNumericId,
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask,
  LEGACY_WISHLIST_ID_METADATA_KEY,
  listWishlistIntakeTasksAsItems,
  taskEntityFromNewIntake,
  taskEntityFromWishlistItem,
  wishlistIntakeTaskToItem,
  WISHLIST_INTAKE_TASK_TYPE
} from "./wishlist-intake.js";
import {
  buildTaskFromConversionPayload,
  digestPayload,
  findIdempotentMutation,
  isRecordLike,
  mutationEvidence,
  nowIso,
  parseConversionDecomposition,
  readIdempotencyValue,
  readMetadataPath,
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

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.6.0",
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

      try {
        const service = new TransitionService(store);
        const result = await service.runTransition({ taskId, action, actor });
        if (result.evidence.toState === "completed") {
          maybeSpawnTranscriptHookAfterCompletion(
            ctx.workspacePath,
            (ctx.effectiveConfig ?? {}) as Record<string, unknown>
          );
        }
        return {
          ok: true,
          code: "transition-applied",
          message: `${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`,
          data: {
            evidence: result.evidence,
            autoUnblocked: result.autoUnblocked
          } as Record<string, unknown>
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
          return {
            ok: true,
            code: "task-create-idempotent-replay",
            message: `Idempotent create replay for task '${id}'`,
            data: { task: store.getTask(id), replayed: true } as Record<string, unknown>
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
      await store.save();
      return {
        ok: true,
        code: "task-created",
        message: `Created task '${id}'`,
        data: { task } as Record<string, unknown>
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
          return {
            ok: true,
            code: "task-update-idempotent-replay",
            message: `Idempotent update replay for task '${taskId}'`,
            data: { task, replayed: true } as Record<string, unknown>
          };
        }
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
      await store.save();
      return { ok: true, code: "task-updated", message: `Updated task '${taskId}'`, data: { task: updatedTask } as Record<string, unknown> };
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
      const archivedAt = nowIso();
      const updatedTask = { ...task, archived: true, archivedAt, updatedAt: archivedAt };
      store.updateTask(updatedTask);
      store.addMutationEvidence(mutationEvidence("archive-task", taskId, actor));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save();
      return { ok: true, code: "task-archived", message: `Archived task '${taskId}'`, data: { task: updatedTask } as Record<string, unknown> };
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

      return {
        ok: true,
        code: "task-retrieved",
        data: { task, recentTransitions, allowedActions } as Record<string, unknown>
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
      const updatedTask = { ...task, dependsOn: [...deps], updatedAt: nowIso() };
      store.updateTask(updatedTask);
      const mutationType = command.name === "add-dependency" ? "add-dependency" : "remove-dependency";
      store.addMutationEvidence(mutationEvidence(mutationType, taskId, actor, { dependencyTaskId }));
      const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
      if (strictIssue) {
        return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
      }
      await store.save();
      return {
        ok: true,
        code: command.name === "add-dependency" ? "dependency-added" : "dependency-removed",
        message: `${command.name} applied for '${taskId}'`,
        data: { task: updatedTask } as Record<string, unknown>
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
      const tasks = store.getActiveTasks();
      const suggestion = getNextActions(tasks);
      const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
      const readyQueue = suggestion.readyQueue;
      const readyImprovementCount = readyQueue.filter(isImprovementLikeTask).length;
      const readyImprovements = readyQueue.filter(isImprovementLikeTask);
      const readyExecution = readyQueue.filter((t) => !isImprovementLikeTask(t));
      const toReadyRow = (t: (typeof readyQueue)[0]) => ({
        id: t.id,
        title: t.title,
        priority: t.priority ?? null,
        phase: t.phase ?? null
      });
      const readyTop = readyQueue.slice(0, 15).map(toReadyRow);
      const readyImprovementsTop = readyImprovements.slice(0, 15).map(toReadyRow);
      const readyExecutionTop = readyExecution.slice(0, 15).map(toReadyRow);
      const blockedTop = suggestion.blockingAnalysis.slice(0, 15);

      const wishlistItems = listWishlistIntakeTasksAsItems(store.getAllTasks());
      const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
      const wishlistOpenCount = wishlistOpenItems.length;
      const wishlistOpenTop = wishlistOpenItems.slice(0, 15).map((i) => ({
        id: i.id,
        title: i.title
      }));

      const proposedImprovements = tasks
        .filter((t) => t.status === "proposed" && isImprovementLikeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id));
      const proposedImprovementsTop = proposedImprovements.slice(0, 15).map((t) => ({
        id: t.id,
        title: t.title,
        phase: t.phase ?? null
      }));

      const proposedExecution = tasks
        .filter(
          (t) =>
            t.status === "proposed" && !isImprovementLikeTask(t) && !isWishlistIntakeTask(t)
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const proposedExecutionTop = proposedExecution.slice(0, 15).map((t) => ({
        id: t.id,
        title: t.title,
        phase: t.phase ?? null
      }));

      const planningSession = toDashboardPlanningSession(await readBuildPlanSession(ctx.workspacePath));

      const dashboardPhaseTop = 15;
      const toProposedRow = (t: (typeof tasks)[0]) => ({
        id: t.id,
        title: t.title,
        phase: t.phase ?? null
      });
      const readyImprovementsPhaseBuckets = buildDashboardPhaseBucketsForTasks(
        readyImprovements,
        workspaceStatus,
        toReadyRow,
        dashboardPhaseTop
      );
      const readyExecutionPhaseBuckets = buildDashboardPhaseBucketsForTasks(
        readyExecution,
        workspaceStatus,
        toReadyRow,
        dashboardPhaseTop
      );
      const proposedImprovementsPhaseBuckets = buildDashboardPhaseBucketsForTasks(
        proposedImprovements,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop
      );
      const proposedExecutionPhaseBuckets = buildDashboardPhaseBucketsForTasks(
        proposedExecution,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop
      );
      const blockedPhaseBuckets = buildDashboardPhaseBucketsForBlocking(
        suggestion.blockingAnalysis,
        (id) => tasks.find((x) => x.id === id),
        workspaceStatus,
        dashboardPhaseTop
      );

      const completedTasks = tasks
        .filter((t) => t.status === "completed")
        .sort((a, b) => a.id.localeCompare(b.id));
      const cancelledTasks = tasks
        .filter((t) => t.status === "cancelled")
        .sort((a, b) => a.id.localeCompare(b.id));
      const completedTop = completedTasks.slice(0, 15).map(toProposedRow);
      const cancelledTop = cancelledTasks.slice(0, 15).map(toProposedRow);
      const completedPhaseBuckets = buildDashboardPhaseBucketsForTasks(
        completedTasks,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop
      );
      const cancelledPhaseBuckets = buildDashboardPhaseBucketsForTasks(
        cancelledTasks,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop
      );

      const dependencyOverview = buildDashboardDependencyOverview(tasks);

      const data = {
        schemaVersion: 1 as const,
        taskStoreLastUpdated: store.getLastUpdated(),
        workspaceStatus,
        planningSession,
        stateSummary: suggestion.stateSummary,
        proposedImprovementsSummary: {
          schemaVersion: 1 as const,
          count: proposedImprovements.length,
          top: proposedImprovementsTop,
          phaseBuckets: proposedImprovementsPhaseBuckets
        },
        proposedExecutionSummary: {
          schemaVersion: 1 as const,
          count: proposedExecution.length,
          top: proposedExecutionTop,
          phaseBuckets: proposedExecutionPhaseBuckets
        },
        readyImprovementsSummary: {
          schemaVersion: 1 as const,
          count: readyImprovements.length,
          top: readyImprovementsTop,
          phaseBuckets: readyImprovementsPhaseBuckets
        },
        readyExecutionSummary: {
          schemaVersion: 1 as const,
          count: readyExecution.length,
          top: readyExecutionTop,
          phaseBuckets: readyExecutionPhaseBuckets
        },
        readyQueueTop: readyTop,
        readyQueueCount: readyQueue.length,
        readyQueueBreakdown: {
          schemaVersion: 1 as const,
          improvement: readyImprovementCount,
          other: readyQueue.length - readyImprovementCount
        },
        executionPlanningScope: "tasks-only" as const,
        wishlist: {
          schemaVersion: 1 as const,
          openCount: wishlistOpenCount,
          totalCount: wishlistItems.length,
          openTop: wishlistOpenTop
        },
        blockedSummary: {
          count: suggestion.blockingAnalysis.length,
          top: blockedTop,
          phaseBuckets: blockedPhaseBuckets
        },
        completedSummary: {
          schemaVersion: 1 as const,
          count: completedTasks.length,
          top: completedTop,
          phaseBuckets: completedPhaseBuckets
        },
        cancelledSummary: {
          schemaVersion: 1 as const,
          count: cancelledTasks.length,
          top: cancelledTop,
          phaseBuckets: cancelledPhaseBuckets
        },
        suggestedNext: suggestion.suggestedNext
          ? {
              id: suggestion.suggestedNext.id,
              title: suggestion.suggestedNext.title,
              status: suggestion.suggestedNext.status,
              priority: suggestion.suggestedNext.priority ?? null,
              phase: suggestion.suggestedNext.phase ?? null
            }
          : null,
        dependencyOverview,
        blockingAnalysis: suggestion.blockingAnalysis
      } satisfies Record<string, unknown>;

      return {
        ok: true,
        code: "dashboard-summary",
        message: "Dashboard summary built from task store and maintainer status snapshot",
        data
      };
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

      const data: Record<string, unknown> = { tasks, count: tasks.length, scope: "tasks-only" };
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

      return {
        ok: true,
        code: "ready-queue-retrieved",
        message: `${ready.length} tasks in ready queue`,
        data: {
          tasks: ready,
          count: ready.length,
          scope: "tasks-only",
          queueNamespace: ns ?? null
        } as Record<string, unknown>
      };
    }

    if (command.name === "get-next-actions") {
      const tasks = store.getActiveTasks();
      const ns = readQueueNamespaceArg(args);
      const suggestion = getNextActions(tasks, ns ? { queueNamespace: ns } : undefined);

      return {
        ok: true,
        code: "next-actions-retrieved",
        message: suggestion.suggestedNext
          ? `Suggested next: ${suggestion.suggestedNext.id} — ${suggestion.suggestedNext.title}`
          : "No tasks in ready queue",
        data: {
          ...suggestion,
          scope: "tasks-only",
          queueNamespace: ns ?? null
        } as unknown as Record<string, unknown>
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

    if (command.name === "create-wishlist") {
      const raw = args as Record<string, unknown>;
      const ts = nowIso();
      const hasLegacyId = typeof raw.id === "string" && raw.id.trim().length > 0;
      let task: TaskEntity;
      if (hasLegacyId) {
        const v = validateWishlistIntakePayload(raw);
        if (!v.ok) {
          return { ok: false, code: "invalid-task-schema", message: v.errors.join(" ") };
        }
        const wid = (raw.id as string).trim();
        const dup = store
          .getAllTasks()
          .some(
            (t) =>
              isWishlistIntakeTask(t) && t.metadata?.[LEGACY_WISHLIST_ID_METADATA_KEY] === wid
          );
        if (dup) {
          return {
            ok: false,
            code: "duplicate-task-id",
            message: `Wishlist legacy id '${wid}' is already represented as a task`
          };
        }
        const item: WishlistItem = buildWishlistItemFromIntake(raw, ts);
        const newTid = allocateNextTaskNumericId(store.getAllTasks());
        task = taskEntityFromWishlistItem(item, newTid, ts);
      } else {
        const v = validateWishlistContentFields(raw);
        if (!v.ok) {
          return { ok: false, code: "invalid-task-schema", message: v.errors.join(" ") };
        }
        const newTid = allocateNextTaskNumericId(store.getAllTasks());
        task = taskEntityFromNewIntake(raw, newTid, ts);
      }
      const typeErr = validateKnownTaskTypeRequirements(task);
      if (typeErr) {
        return { ok: false, code: typeErr.code, message: typeErr.message };
      }
      if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
        const strictIssue = validateTaskSetForStrictMode([...store.getAllTasks(), task]);
        if (strictIssue) {
          return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
        }
      }
      try {
        planning.sqliteDual.withTransaction(() => {
          store.addTask(task);
        });
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const itemOut = wishlistIntakeTaskToItem(task);
      return {
        ok: true,
        code: "wishlist-created",
        message: `Created wishlist intake task '${task.id}'`,
        data: {
          wishlist: itemOut,
          item: itemOut,
          taskId: task.id,
          task
        } as Record<string, unknown>
      };
    }

    if (command.name === "list-wishlist") {
      const statusFilter = typeof args.status === "string" ? args.status : undefined;
      let items = listWishlistIntakeTasksAsItems(store.getAllTasks());
      if (statusFilter && ["open", "converted", "cancelled"].includes(statusFilter)) {
        items = items.filter((i) => i.status === statusFilter);
      }
      return {
        ok: true,
        code: "wishlist-listed",
        message: `Found ${items.length} wishlist items`,
        data: { items, count: items.length, scope: "wishlist-only" } as Record<string, unknown>
      };
    }

    if (command.name === "get-wishlist") {
      const wishlistId =
        typeof args.wishlistId === "string" && args.wishlistId.trim().length > 0
          ? args.wishlistId.trim()
          : typeof args.id === "string" && args.id.trim().length > 0
            ? args.id.trim()
            : "";
      if (!wishlistId) {
        return { ok: false, code: "invalid-task-schema", message: "get-wishlist requires 'wishlistId' or 'id'" };
      }
      const t = findWishlistIntakeTaskByLegacyOrTaskId(store.getAllTasks(), wishlistId);
      if (!t) {
        return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
      }
      const item = wishlistIntakeTaskToItem(t);
      return {
        ok: true,
        code: "wishlist-retrieved",
        data: { item, taskId: t.id } as Record<string, unknown>
      };
    }

    if (command.name === "update-wishlist") {
      const wishlistId = typeof args.wishlistId === "string" ? args.wishlistId.trim() : "";
      const updates = typeof args.updates === "object" && args.updates !== null ? (args.updates as Record<string, unknown>) : undefined;
      if (!wishlistId || !updates) {
        return { ok: false, code: "invalid-task-schema", message: "update-wishlist requires wishlistId and updates" };
      }
      const existingTask = findWishlistIntakeTaskByLegacyOrTaskId(store.getAllTasks(), wishlistId);
      if (!existingTask) {
        return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
      }
      if (existingTask.status !== "proposed") {
        return { ok: false, code: "invalid-transition", message: "Only open wishlist items can be updated" };
      }
      const uv = validateWishlistUpdatePayload(updates);
      if (!uv.ok) {
        return { ok: false, code: "invalid-task-schema", message: uv.errors.join(" ") };
      }
      const meta = { ...(existingTask.metadata ?? {}) };
      const mutable = [
        "title",
        "problemStatement",
        "expectedOutcome",
        "impact",
        "constraints",
        "successSignals",
        "requestor",
        "evidenceRef"
      ] as const;
      let title = existingTask.title;
      for (const key of mutable) {
        if (key in updates && typeof updates[key] === "string") {
          if (key === "title") {
            title = (updates[key] as string).trim();
          } else {
            meta[key] = (updates[key] as string).trim();
          }
        }
      }
      const merged: TaskEntity = {
        ...existingTask,
        title,
        metadata: meta,
        updatedAt: nowIso()
      };
      const typeErr = validateKnownTaskTypeRequirements(merged);
      if (typeErr) {
        return { ok: false, code: typeErr.code, message: typeErr.message };
      }
      if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
        const others = store.getAllTasks().filter((x) => x.id !== merged.id);
        const strictIssue = validateTaskSetForStrictMode([...others, merged]);
        if (strictIssue) {
          return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
        }
      }
      planning.sqliteDual.withTransaction(() => {
        store.updateTask(merged);
      });
      const itemOut = wishlistIntakeTaskToItem(merged);
      return {
        ok: true,
        code: "wishlist-updated",
        message: `Updated wishlist '${wishlistId}'`,
        data: { item: itemOut, taskId: merged.id } as Record<string, unknown>
      };
    }

    if (command.name === "convert-wishlist") {
      const wishlistTaskId =
        typeof args.wishlistTaskId === "string" && args.wishlistTaskId.trim().length > 0
          ? args.wishlistTaskId.trim()
          : "";
      const wishlistIdLegacy = typeof args.wishlistId === "string" ? args.wishlistId.trim() : "";
      const lookupKey = wishlistTaskId || wishlistIdLegacy;
      if (!lookupKey) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "convert-wishlist requires wishlistTaskId (T<number>) or wishlistId (W<number>)"
        };
      }
      if (wishlistTaskId && !TASK_ID_RE.test(wishlistTaskId)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "wishlistTaskId must match T<number>"
        };
      }
      if (wishlistIdLegacy && !wishlistTaskId && !WISHLIST_ID_RE.test(wishlistIdLegacy)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "wishlistId must match W<number> when wishlistTaskId is omitted"
        };
      }
      const dec = parseConversionDecomposition(args.decomposition);
      if (!dec.ok) {
        return { ok: false, code: "invalid-task-schema", message: dec.message };
      }
      const tasksRaw = args.tasks;
      if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "convert-wishlist requires non-empty tasks array"
        };
      }
      const source = findWishlistIntakeTaskByLegacyOrTaskId(store.getAllTasks(), lookupKey);
      if (!source) {
        return { ok: false, code: "task-not-found", message: `Wishlist intake '${lookupKey}' not found` };
      }
      if (source.status !== "proposed") {
        return {
          ok: false,
          code: "invalid-transition",
          message: "Only open wishlist intake tasks can be converted"
        };
      }
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const timestamp = nowIso();
      const built: TaskEntity[] = [];
      for (const row of tasksRaw) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          return { ok: false, code: "invalid-task-schema", message: "Each task must be an object" };
        }
        const bt = buildTaskFromConversionPayload(row as Record<string, unknown>, timestamp);
        if (!bt.ok) {
          return { ok: false, code: "invalid-task-schema", message: bt.message };
        }
        if (store.getTask(bt.task.id)) {
          return {
            ok: false,
            code: "duplicate-task-id",
            message: `Task '${bt.task.id}' already exists`
          };
        }
        built.push(bt.task);
      }
      const convertedIds = built.map((t) => t.id);
      const updatedSource: TaskEntity = {
        ...source,
        status: "completed",
        updatedAt: timestamp,
        metadata: {
          ...(source.metadata ?? {}),
          wishlistConvertedToTaskIds: convertedIds,
          wishlistConversionDecomposition: dec.value,
          wishlistConvertedAt: timestamp
        }
      };
      const applyConvertMutations = (): void => {
        for (const t of built) {
          store.addTask(t);
          store.addMutationEvidence(
            mutationEvidence("create-task", t.id, actor, {
              initialStatus: t.status,
              source: "convert-wishlist",
              wishlistTaskId: source.id,
              wishlistLegacyId: source.metadata?.[LEGACY_WISHLIST_ID_METADATA_KEY] ?? null
            })
          );
        }
        store.updateTask(updatedSource);
        store.addMutationEvidence(
          mutationEvidence("update-task", source.id, actor, {
            source: "convert-wishlist",
            convertedToTaskIds: convertedIds
          })
        );
      };
      if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
        const strictIssue = validateTaskSetForStrictMode([
          ...store.getAllTasks().filter((x) => x.id !== source.id),
          ...built,
          updatedSource
        ]);
        if (strictIssue) {
          return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
        }
      }
      planning.sqliteDual.withTransaction(applyConvertMutations);
      const wishlistShape = wishlistIntakeTaskToItem(updatedSource);
      return {
        ok: true,
        code: "wishlist-converted",
        message: `Converted wishlist intake '${source.id}' to tasks: ${convertedIds.join(", ")}`,
        data: { wishlist: wishlistShape, createdTasks: built, sourceTaskId: source.id } as Record<string, unknown>
      };
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Task Engine does not support command '${command.name}'`
    };
  }
};
