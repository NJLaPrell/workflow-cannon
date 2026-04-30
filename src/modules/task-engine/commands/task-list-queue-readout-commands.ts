import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { summarizeTeamAssignmentsForNextActions } from "../../team-execution/assignment-store.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { buildMaintainerDeliveryHints } from "../maintainer-delivery-hints.js";
import {
  decodeListTasksCursor,
  encodeListTasksCursor,
  listTaskIsAfterCursor,
  listTasksComparator,
  LIST_TASKS_DEFAULT_LIMIT,
  LIST_TASKS_MAX_LIMIT
} from "../list-tasks-pagination.js";
import { isRecordLike, readMetadataPath, SAFE_METADATA_PATH_RE, TASK_ID_RE } from "../mutation-utils.js";
import { inferTaskPhaseKey, resolveCanonicalPhase } from "../phase-resolution.js";
import {
  featureRegistryActiveOnConnection,
  listFeatureIdsForComponent
} from "../persistence/feature-registry-queries.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import { readQueueNamespaceArg } from "../queue-namespace-args.js";
import { buildQueueHintsForTasks } from "../queue/queue-health.js";
import { filterTasksByQueueNamespace, getNextActions } from "../suggestions.js";
import type { TaskEntity, TaskStatus } from "../types.js";
import { isWishlistIntakeTask } from "../wishlist/wishlist-intake.js";

/**
 * Task listing + queue readouts that do not mutate task rows.
 * Returns **`null`** when the command name is not handled here.
 */
export function resolveTaskListQueueReadoutCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): ModuleCommandResult | null {
  const args = command.args ?? {};

  if (command.name === "list-tasks") {
    const statusFilter = typeof args.status === "string" ? (args.status as TaskStatus) : undefined;
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
    const featuresFilterRaw = args.features;
    const featuresFilter =
      typeof featuresFilterRaw === "string"
        ? [featuresFilterRaw.trim()].filter((s) => s.length > 0)
        : Array.isArray(featuresFilterRaw)
          ? featuresFilterRaw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          : [];

    const listIdSingle =
      typeof args.id === "string" && args.id.trim().length > 0 ? args.id.trim() : undefined;
    const listIdsRaw = args.ids;
    const hasListIdsKey = Object.prototype.hasOwnProperty.call(args, "ids");
    const listIdsArr: string[] = Array.isArray(listIdsRaw)
      ? listIdsRaw
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((s) => s.trim())
      : typeof listIdsRaw === "string" && listIdsRaw.trim().length > 0
        ? [listIdsRaw.trim()]
        : [];
    if (listIdSingle !== undefined && hasListIdsKey) {
      return {
        ok: false,
        code: "invalid-run-args",
        message: "list-tasks accepts only one of id or ids",
        remediation: { instructionPath: "src/modules/task-engine/instructions/list-tasks.md" }
      };
    }
    const idPrefixFilter =
      typeof args.idPrefix === "string" && args.idPrefix.trim().length > 0 ? args.idPrefix.trim() : undefined;
    if (idPrefixFilter && !/^T\d*$/.test(idPrefixFilter)) {
      return {
        ok: false,
        code: "invalid-run-args",
        message: "list-tasks idPrefix must match /^T\\d*$/ (T-prefix with optional digits only)",
        remediation: { instructionPath: "src/modules/task-engine/instructions/list-tasks.md" }
      };
    }
    const cursorRaw =
      typeof args.cursor === "string" && args.cursor.trim().length > 0 ? args.cursor.trim() : undefined;
    const limitRaw = args.limit;
    let limitFilter: number | undefined;
    if (limitRaw !== undefined) {
      const n =
        typeof limitRaw === "number" && Number.isFinite(limitRaw)
          ? Math.floor(limitRaw)
          : typeof limitRaw === "string" && /^\d+$/.test(limitRaw.trim())
            ? Number(limitRaw.trim())
            : NaN;
      if (!Number.isInteger(n) || n <= 0 || n > LIST_TASKS_MAX_LIMIT) {
        return {
          ok: false,
          code: "invalid-run-args",
          message: `list-tasks limit must be a positive integer <= ${LIST_TASKS_MAX_LIMIT}`,
          remediation: { instructionPath: "src/modules/task-engine/instructions/list-tasks.md" }
        };
      }
      limitFilter = n;
    }
    if (cursorRaw !== undefined && limitFilter === undefined) {
      limitFilter = LIST_TASKS_DEFAULT_LIMIT;
    }
    const cursorDecoded = cursorRaw !== undefined ? decodeListTasksCursor(cursorRaw) : null;
    if (cursorRaw !== undefined && cursorDecoded === null) {
      return {
        ok: false,
        code: "invalid-run-args",
        message: "list-tasks cursor is invalid",
        remediation: { instructionPath: "src/modules/task-engine/instructions/list-tasks.md" }
      };
    }

    let explicitIds: string[] | undefined;
    if (listIdSingle !== undefined) {
      if (!TASK_ID_RE.test(listIdSingle)) {
        return {
          ok: false,
          code: "invalid-run-args",
          message: "list-tasks id must match ^T\\d+$",
          remediation: { instructionPath: "src/modules/task-engine/instructions/list-tasks.md" }
        };
      }
      explicitIds = [listIdSingle];
    } else if (hasListIdsKey) {
      const bad = listIdsArr.filter((x) => !TASK_ID_RE.test(x));
      if (bad.length > 0) {
        return {
          ok: false,
          code: "invalid-run-args",
          message: `list-tasks ids entries must match ^T\\d+$ (got ${bad[0] ?? "invalid"})`,
          remediation: { instructionPath: "src/modules/task-engine/instructions/list-tasks.md" }
        };
      }
      explicitIds = [...new Set(listIdsArr)];
    }

    let tasks: TaskEntity[];
    if (explicitIds !== undefined) {
      tasks = explicitIds.map((tid) => store.getTask(tid)).filter((t): t is TaskEntity => Boolean(t));
    } else {
      tasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
    }
    if (!includeArchived) {
      tasks = tasks.filter((t) => !t.archived);
    }
    if (idPrefixFilter) {
      tasks = tasks.filter((t) => t.id.startsWith(idPrefixFilter));
    }
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
      tasks = tasks.filter((t) => readMetadataPath(t.metadata, "confidenceTier") === confidenceTierFilter);
    }
    if (blockedReasonCategoryFilter) {
      tasks = tasks.filter(
        (t) => readMetadataPath(t.metadata, "blockedReasonCategory") === blockedReasonCategoryFilter
      );
    }
    if (featuresFilter.length > 0) {
      tasks = tasks.filter((t) => {
        const tf = t.features ?? [];
        return featuresFilter.some((slug) => tf.includes(slug));
      });
    }
    const featureIdSingle =
      typeof args.featureId === "string" && args.featureId.trim().length > 0 ? args.featureId.trim() : undefined;
    const componentIdFilter =
      typeof args.componentId === "string" && args.componentId.trim().length > 0
        ? args.componentId.trim()
        : undefined;
    if (featureIdSingle) {
      tasks = tasks.filter((t) => (t.features ?? []).includes(featureIdSingle));
    }
    if (componentIdFilter) {
      const ldb = planning.sqliteDual.getDatabase();
      if (!featureRegistryActiveOnConnection(ldb)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "list-tasks componentId filter requires kit SQLite user_version >= 5 (feature registry)"
        };
      }
      const compFeatIds = new Set(listFeatureIdsForComponent(ldb, componentIdFilter));
      tasks = tasks.filter((t) => (t.features ?? []).some((f) => compFeatIds.has(f)));
    }

    tasks.sort(listTasksComparator);
    let pageCandidates = tasks;
    if (cursorDecoded) {
      pageCandidates = tasks.filter((t) => listTaskIsAfterCursor(t, cursorDecoded));
    }
    const page = limitFilter !== undefined ? pageCandidates.slice(0, limitFilter) : pageCandidates;
    const nextCursor =
      limitFilter !== undefined && pageCandidates.length > limitFilter
        ? encodeListTasksCursor(page[page.length - 1]!)
        : undefined;

    const data: Record<string, unknown> = {
      tasks: page,
      count: page.length,
      scope: "tasks-only",
      listTasksSort: "updatedAt_desc_id_numeric_asc",
      listTasksCursorSemantics:
        "Keyset pagination: opaque cursor from prior nextCursor; under concurrent updates rows may move across pages (re-run without cursor for a fresh ordering snapshot).",
      ...(nextCursor !== undefined ? { nextCursor } : {})
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    if (includeQueueHints) {
      const hintBaseTasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
      const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
      data.queueHintRows = buildQueueHintsForTasks({
        tasks: hintBaseTasks,
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        workspaceStatus,
        taskRows: page
      });
    }

    return {
      ok: true,
      code: "tasks-listed",
      message: `Found ${page.length} tasks`,
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
    const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
    const teamExecutionContext = summarizeTeamAssignmentsForNextActions(
      planning.sqliteDual.getDatabase(),
      (id) => taskTitleById.get(id) ?? null
    );
    const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
    const phaseRes = resolveCanonicalPhase({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      workspaceStatus
    });
    const maintainerDelivery = buildMaintainerDeliveryHints({
      tasks,
      canonicalPhaseKey: phaseRes.canonicalPhaseKey,
      suggestedNext: suggestion.suggestedNext ? { id: suggestion.suggestedNext.id } : null
    });

    const naData: Record<string, unknown> = {
      ...suggestion,
      teamExecutionContext,
      scope: "tasks-only",
      queueNamespace: ns ?? null,
      maintainerDelivery
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

  return null;
}
