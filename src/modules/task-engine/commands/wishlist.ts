import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";
import type { TaskEntity } from "../types.js";
import type { WishlistItem } from "../wishlist-types.js";
import { TaskEngineError } from "../transitions.js";
import { planningStrictValidationEnabled } from "../planning-config.js";
import { validateTaskSetForStrictMode } from "../strict-task-validation.js";
import {
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  buildWishlistItemFromIntake,
  WISHLIST_ID_RE
} from "../wishlist-validation.js";
import {
  resolveActor,
  nowIso,
  mutationEvidence,
  TASK_ID_RE,
  buildTaskFromConversionPayload,
  parseConversionDecomposition
} from "./shared.js";

export async function handleCreateWishlist(
  args: Record<string, unknown>,
  _ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  _store: TaskStore
): Promise<ModuleCommandResult> {
  const wishlistStore = await planning.openWishlist();
  const raw = args as Record<string, unknown>;
  const v = validateWishlistIntakePayload(raw);
  if (!v.ok) {
    return { ok: false, code: "invalid-task-schema", message: v.errors.join(" ") };
  }
  const ts = nowIso();
  const item: WishlistItem = buildWishlistItemFromIntake(raw, ts) as WishlistItem;
  try {
    wishlistStore.addItem(item);
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
  await wishlistStore.save();
  return {
    ok: true,
    code: "wishlist-created",
    message: `Created wishlist '${item.id}'`,
    data: { item } as Record<string, unknown>
  };
}

export async function handleListWishlist(
  args: Record<string, unknown>,
  _ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  _store: TaskStore
): Promise<ModuleCommandResult> {
  const wishlistStore = await planning.openWishlist();
  const statusFilter = typeof args.status === "string" ? args.status : undefined;
  let items = wishlistStore.getAllItems();
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

export async function handleGetWishlist(
  args: Record<string, unknown>,
  _ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  _store: TaskStore
): Promise<ModuleCommandResult> {
  const wishlistId =
    typeof args.wishlistId === "string" && args.wishlistId.trim().length > 0
      ? args.wishlistId.trim()
      : typeof args.id === "string" && args.id.trim().length > 0
        ? args.id.trim()
        : "";
  if (!wishlistId) {
    return { ok: false, code: "invalid-task-schema", message: "get-wishlist requires 'wishlistId' or 'id'" };
  }
  const wishlistStore = await planning.openWishlist();
  const item = wishlistStore.getItem(wishlistId);
  if (!item) {
    return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
  }
  return {
    ok: true,
    code: "wishlist-retrieved",
    data: { item } as Record<string, unknown>
  };
}

export async function handleUpdateWishlist(
  args: Record<string, unknown>,
  _ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  _store: TaskStore
): Promise<ModuleCommandResult> {
  const wishlistId = typeof args.wishlistId === "string" ? args.wishlistId.trim() : "";
  const updates = typeof args.updates === "object" && args.updates !== null ? (args.updates as Record<string, unknown>) : undefined;
  if (!wishlistId || !updates) {
    return { ok: false, code: "invalid-task-schema", message: "update-wishlist requires wishlistId and updates" };
  }
  const wishlistStore = await planning.openWishlist();
  const existing = wishlistStore.getItem(wishlistId);
  if (!existing) {
    return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
  }
  if (existing.status !== "open") {
    return { ok: false, code: "invalid-transition", message: "Only open wishlist items can be updated" };
  }
  const uv = validateWishlistUpdatePayload(updates);
  if (!uv.ok) {
    return { ok: false, code: "invalid-task-schema", message: uv.errors.join(" ") };
  }
  const merged: WishlistItem = { ...existing, updatedAt: nowIso() };
  const mutable: (keyof WishlistItem)[] = [
    "title",
    "problemStatement",
    "expectedOutcome",
    "impact",
    "constraints",
    "successSignals",
    "requestor",
    "evidenceRef"
  ];
  for (const key of mutable) {
    if (key in updates && typeof updates[key as string] === "string") {
      (merged as Record<string, unknown>)[key] = (updates[key as string] as string).trim();
    }
  }
  wishlistStore.updateItem(merged);
  await wishlistStore.save();
  return {
    ok: true,
    code: "wishlist-updated",
    message: `Updated wishlist '${wishlistId}'`,
    data: { item: merged } as Record<string, unknown>
  };
}

export async function handleConvertWishlist(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const wishlistId = typeof args.wishlistId === "string" ? args.wishlistId.trim() : "";
  if (!wishlistId || !WISHLIST_ID_RE.test(wishlistId)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "convert-wishlist requires wishlistId matching W<number>"
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
  const wishlistStore = await planning.openWishlist();
  const wlItem = wishlistStore.getItem(wishlistId);
  if (!wlItem) {
    return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
  }
  if (wlItem.status !== "open") {
    return {
      ok: false,
      code: "invalid-transition",
      message: "Only open wishlist items can be converted"
    };
  }
  const actor = resolveActor(args, ctx);
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
  const updatedWishlist: WishlistItem = {
    ...wlItem,
    status: "converted",
    updatedAt: timestamp,
    convertedAt: timestamp,
    convertedToTaskIds: convertedIds,
    conversionDecomposition: dec.value
  };
  const applyConvertMutations = (): void => {
    for (const t of built) {
      store.addTask(t);
      store.addMutationEvidence(
        mutationEvidence("create-task", t.id, actor, {
          initialStatus: t.status,
          source: "convert-wishlist",
          wishlistId
        })
      );
    }
    wishlistStore.updateItem(updatedWishlist);
  };
  if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
    const strictIssue = validateTaskSetForStrictMode([...store.getAllTasks(), ...built]);
    if (strictIssue) {
      return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
    }
  }
  if (planning.kind === "sqlite") {
    planning.sqliteDual.withTransaction(applyConvertMutations);
  } else {
    applyConvertMutations();
    await store.save();
    await wishlistStore.save();
  }
  return {
    ok: true,
    code: "wishlist-converted",
    message: `Converted wishlist '${wishlistId}' to tasks: ${convertedIds.join(", ")}`,
    data: { wishlist: updatedWishlist, createdTasks: built } as Record<string, unknown>
  };
}
