import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { TaskEngineError } from "./transitions.js";
import type { TaskEntity } from "./types.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import type { TaskStore } from "./store.js";
import {
  allocateNextTaskNumericId,
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask,
  LEGACY_WISHLIST_ID_METADATA_KEY,
  listWishlistIntakeTasksAsItems,
  taskEntityFromNewIntake,
  taskEntityFromWishlistItem,
  wishlistIntakeTaskToItem
} from "./wishlist-intake.js";
import type { WishlistItem } from "./wishlist-types.js";
import {
  buildTaskFromConversionPayload,
  mutationEvidence,
  nowIso,
  parseConversionDecomposition,
  planningConcurrencySaveOpts,
  TASK_ID_RE
} from "./mutation-utils.js";
import {
  buildWishlistItemFromIntake,
  validateWishlistContentFields,
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  WISHLIST_ID_RE
} from "./wishlist-validation.js";
import { planningStrictValidationEnabled } from "./planning-config.js";
import { validateTaskSetForStrictMode } from "./strict-task-validation.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";

const WISHLIST_COMMANDS = new Set([
  "create-wishlist",
  "list-wishlist",
  "get-wishlist",
  "update-wishlist",
  "convert-wishlist"
]);

/** Wishlist / intake commands that mutate via `planning.sqliteDual.withTransaction`. */
export function runWishlistStoreCommand(
  commandName: string,
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planning: OpenedPlanningStores
): ModuleCommandResult | undefined {
  if (!WISHLIST_COMMANDS.has(commandName)) {
    return undefined;
  }

  if (commandName === "create-wishlist") {
    const raw = args;
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
          (t) => isWishlistIntakeTask(t) && t.metadata?.[LEGACY_WISHLIST_ID_METADATA_KEY] === wid
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
      planning.sqliteDual.withTransaction(
        () => {
          store.addTask(task);
        },
        planningConcurrencySaveOpts(args)
      );
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

  if (commandName === "list-wishlist") {
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

  if (commandName === "get-wishlist") {
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

  if (commandName === "update-wishlist") {
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
    planning.sqliteDual.withTransaction(
      () => {
        store.updateTask(merged);
      },
      planningConcurrencySaveOpts(args)
    );
    const itemOut = wishlistIntakeTaskToItem(merged);
    return {
      ok: true,
      code: "wishlist-updated",
      message: `Updated wishlist '${wishlistId}'`,
      data: { item: itemOut, taskId: merged.id } as Record<string, unknown>
    };
  }

  if (commandName === "convert-wishlist") {
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
    planning.sqliteDual.withTransaction(applyConvertMutations, planningConcurrencySaveOpts(args));
    const wishlistShape = wishlistIntakeTaskToItem(updatedSource);
    return {
      ok: true,
      code: "wishlist-converted",
      message: `Converted wishlist intake '${source.id}' to tasks: ${convertedIds.join(", ")}`,
      data: { wishlist: wishlistShape, createdTasks: built, sourceTaskId: source.id } as Record<string, unknown>
    };
  }

  return undefined;
}
