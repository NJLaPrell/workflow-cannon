import type { TaskEntity, TaskStatus } from "./types.js";
import type { WishlistItem, WishlistStatus } from "./wishlist-types.js";
import { WISHLIST_ID_RE } from "./wishlist-validation.js";

const TASK_ID_RE = /^T\d+$/;

/** Task type for ideation items formerly stored as wishlist `W###` rows (Phase 24). */
export const WISHLIST_INTAKE_TASK_TYPE = "wishlist_intake";

/** Provenance when migrated from legacy wishlist id (`W1`, …). Omitted for net-new intake tasks. */
export const LEGACY_WISHLIST_ID_METADATA_KEY = "legacyWishlistId";

const INTAKE_META_KEYS = [
  "problemStatement",
  "expectedOutcome",
  "impact",
  "constraints",
  "successSignals",
  "requestor",
  "evidenceRef"
] as const;

export function isWishlistIntakeTask(task: TaskEntity): boolean {
  return task.type === WISHLIST_INTAKE_TASK_TYPE;
}

export function allocateNextTaskNumericId(tasks: TaskEntity[]): string {
  let max = 0;
  for (const task of tasks) {
    const m = /^T(\d+)$/.exec(task.id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) {
        max = Math.max(max, n);
      }
    }
  }
  return `T${max + 1}`;
}

function wishlistStatusToTaskStatus(status: WishlistStatus): TaskStatus {
  if (status === "open") {
    return "proposed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "completed";
}

/**
 * Build a `wishlist_intake` task from a legacy `WishlistItem`. Caller supplies the new `T###` id.
 */
export function taskEntityFromWishlistItem(item: WishlistItem, newTaskId: string, now: string): TaskEntity {
  const metadata: Record<string, unknown> = {
    [LEGACY_WISHLIST_ID_METADATA_KEY]: item.id,
    problemStatement: item.problemStatement,
    expectedOutcome: item.expectedOutcome,
    impact: item.impact,
    constraints: item.constraints,
    successSignals: item.successSignals,
    requestor: item.requestor,
    evidenceRef: item.evidenceRef
  };
  if (item.convertedToTaskIds?.length) {
    metadata.wishlistConvertedToTaskIds = [...item.convertedToTaskIds];
  }
  if (item.conversionDecomposition) {
    metadata.wishlistConversionDecomposition = item.conversionDecomposition;
  }
  if (item.convertedAt) {
    metadata.wishlistConvertedAt = item.convertedAt;
  }
  const task: TaskEntity = {
    id: newTaskId,
    title: item.title,
    type: WISHLIST_INTAKE_TASK_TYPE,
    status: wishlistStatusToTaskStatus(item.status),
    createdAt: item.createdAt,
    updatedAt: now,
    metadata
  };
  return task;
}

/**
 * Create a new open wishlist-intake task (no legacy wishlist id). `intake` must pass `validateWishlistIntakePayload` shape except `id` may be omitted.
 */
export function taskEntityFromNewIntake(
  intake: Record<string, unknown>,
  newTaskId: string,
  now: string,
  extraMetadata?: Record<string, unknown>
): TaskEntity {
  const metadata: Record<string, unknown> = {
    problemStatement: String(intake.problemStatement ?? "").trim(),
    expectedOutcome: String(intake.expectedOutcome ?? "").trim(),
    impact: String(intake.impact ?? "").trim(),
    constraints: String(intake.constraints ?? "").trim(),
    successSignals: String(intake.successSignals ?? "").trim(),
    requestor: String(intake.requestor ?? "").trim(),
    evidenceRef: String(intake.evidenceRef ?? "").trim(),
    ...(extraMetadata ?? {})
  };
  return {
    id: newTaskId,
    title: String(intake.title ?? "").trim(),
    type: WISHLIST_INTAKE_TASK_TYPE,
    status: "proposed",
    createdAt: now,
    updatedAt: now,
    metadata
  };
}

/** Map a `wishlist_intake` task to the wire shape consumers expect from list/get-wishlist. */
export function wishlistIntakeTaskToItem(task: TaskEntity): WishlistItem | null {
  if (!isWishlistIntakeTask(task) || !task.metadata) {
    return null;
  }
  const m = task.metadata;
  const legacy = m[LEGACY_WISHLIST_ID_METADATA_KEY];
  const id =
    typeof legacy === "string" && WISHLIST_ID_RE.test(legacy)
      ? legacy
      : task.id;
  let status: WishlistStatus = "open";
  if (task.status === "cancelled") {
    status = "cancelled";
  } else if (task.status === "completed") {
    status = "converted";
  }
  const str = (k: string): string => (typeof m[k] === "string" ? m[k] : String(m[k] ?? ""));
  const item: WishlistItem = {
    id,
    status,
    title: task.title,
    problemStatement: str("problemStatement"),
    expectedOutcome: str("expectedOutcome"),
    impact: str("impact"),
    constraints: str("constraints"),
    successSignals: str("successSignals"),
    requestor: str("requestor"),
    evidenceRef: str("evidenceRef"),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
  const convIds = m.wishlistConvertedToTaskIds;
  if (Array.isArray(convIds) && convIds.every((x) => typeof x === "string")) {
    item.convertedToTaskIds = convIds as string[];
  }
  const dec = m.wishlistConversionDecomposition;
  if (dec && typeof dec === "object" && !Array.isArray(dec)) {
    const o = dec as Record<string, unknown>;
    if (
      typeof o.rationale === "string" &&
      typeof o.boundaries === "string" &&
      typeof o.dependencyIntent === "string"
    ) {
      item.conversionDecomposition = {
        rationale: o.rationale,
        boundaries: o.boundaries,
        dependencyIntent: o.dependencyIntent
      };
    }
  }
  const cat = m.wishlistConvertedAt;
  if (typeof cat === "string") {
    item.convertedAt = cat;
  }
  return item;
}

export function listWishlistIntakeTasksAsItems(tasks: TaskEntity[]): WishlistItem[] {
  const out: WishlistItem[] = [];
  for (const t of tasks) {
    const row = wishlistIntakeTaskToItem(t);
    if (row) {
      out.push(row);
    }
  }
  return out;
}

export function findWishlistIntakeTaskByLegacyOrTaskId(
  tasks: TaskEntity[],
  wishlistIdOrTaskId: string
): TaskEntity | undefined {
  const q = wishlistIdOrTaskId.trim();
  if (!q) {
    return undefined;
  }
  if (TASK_ID_RE.test(q)) {
    const t = tasks.find((x) => x.id === q);
    return t && isWishlistIntakeTask(t) ? t : undefined;
  }
  if (WISHLIST_ID_RE.test(q)) {
    return tasks.find(
      (t) =>
        isWishlistIntakeTask(t) &&
        t.metadata &&
        t.metadata[LEGACY_WISHLIST_ID_METADATA_KEY] === q
    );
  }
  return undefined;
}

export { INTAKE_META_KEYS };
