import crypto from "node:crypto";
import type { TaskEntity, TaskMutationEvidence, TaskMutationType, TaskPriority } from "./types.js";
import type { TaskStore } from "./store.js";
import type { WishlistConversionDecomposition } from "./wishlist-types.js";

/** Task id pattern `T` + digits (create-task, convert-wishlist validation). */
export const TASK_ID_RE = /^T\d+$/;
export const SAFE_METADATA_PATH_RE = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/;

export function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readMetadataPath(metadata: Record<string, unknown> | undefined, path: string): unknown {
  if (!metadata || !SAFE_METADATA_PATH_RE.test(path)) {
    return undefined;
  }
  const parts = path.split(".");
  let current: unknown = metadata;
  for (const part of parts) {
    if (!isRecordLike(current)) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestPayload(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function readIdempotencyValue(args: Record<string, unknown>): string | undefined {
  const raw = args.clientMutationId;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function findIdempotentMutation(
  store: TaskStore,
  mutationType: TaskMutationType,
  taskId: string,
  clientMutationId: string
): { payloadDigest?: string } | null {
  const log = store.getMutationLog();
  for (let idx = log.length - 1; idx >= 0; idx -= 1) {
    const entry = log[idx];
    if (entry.mutationType !== mutationType || entry.taskId !== taskId) {
      continue;
    }
    if (!entry.details || entry.details.clientMutationId !== clientMutationId) {
      continue;
    }
    return {
      payloadDigest: typeof entry.details.payloadDigest === "string" ? entry.details.payloadDigest : undefined
    };
  }
  return null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function mutationEvidence(
  mutationType: TaskMutationType,
  taskId: string,
  actor?: string,
  details?: Record<string, unknown>
): TaskMutationEvidence {
  return {
    mutationId: `${mutationType}-${taskId}-${nowIso()}-${crypto.randomUUID().slice(0, 8)}`,
    mutationType,
    taskId,
    timestamp: nowIso(),
    actor,
    details
  };
}

export function parseConversionDecomposition(
  raw: unknown
): { ok: true; value: WishlistConversionDecomposition } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "convert-wishlist requires 'decomposition' object" };
  }
  const o = raw as Record<string, unknown>;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  const boundaries = typeof o.boundaries === "string" ? o.boundaries.trim() : "";
  const dependencyIntent = typeof o.dependencyIntent === "string" ? o.dependencyIntent.trim() : "";
  if (!rationale || !boundaries || !dependencyIntent) {
    return {
      ok: false,
      message: "decomposition requires non-empty rationale, boundaries, and dependencyIntent"
    };
  }
  return { ok: true, value: { rationale, boundaries, dependencyIntent } };
}

export function buildTaskFromConversionPayload(
  row: Record<string, unknown>,
  timestamp: string
): { ok: true; task: TaskEntity } | { ok: false; message: string } {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!TASK_ID_RE.test(id)) {
    return { ok: false, message: "Each converted task requires 'id' matching T<number>" };
  }
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) {
    return { ok: false, message: `Task '${id}' requires non-empty title` };
  }
  const phase = typeof row.phase === "string" ? row.phase.trim() : "";
  if (!phase) {
    return { ok: false, message: `Task '${id}' requires 'phase' for workable tasks` };
  }
  const type = typeof row.type === "string" && row.type.trim() ? row.type.trim() : "workspace-kit";
  const priority =
    typeof row.priority === "string" && ["P1", "P2", "P3"].includes(row.priority)
      ? (row.priority as TaskPriority)
      : undefined;
  const approach = typeof row.approach === "string" ? row.approach.trim() : "";
  if (!approach) {
    return { ok: false, message: `Task '${id}' requires 'approach'` };
  }
  const technicalScope = Array.isArray(row.technicalScope)
    ? row.technicalScope.filter((x) => typeof x === "string")
    : [];
  const acceptanceCriteria = Array.isArray(row.acceptanceCriteria)
    ? row.acceptanceCriteria.filter((x) => typeof x === "string")
    : [];
  if (technicalScope.length === 0) {
    return { ok: false, message: `Task '${id}' requires non-empty technicalScope array` };
  }
  if (acceptanceCriteria.length === 0) {
    return { ok: false, message: `Task '${id}' requires non-empty acceptanceCriteria array` };
  }
  const task: TaskEntity = {
    id,
    title,
    type,
    status: "proposed",
    createdAt: timestamp,
    updatedAt: timestamp,
    priority,
    dependsOn: Array.isArray(row.dependsOn) ? row.dependsOn.filter((x) => typeof x === "string") : undefined,
    unblocks: Array.isArray(row.unblocks) ? row.unblocks.filter((x) => typeof x === "string") : undefined,
    phase,
    approach,
    technicalScope,
    acceptanceCriteria
  };
  return { ok: true, task };
}

/** Optional optimistic concurrency token from mutating command JSON (`expectedPlanningGeneration`). */
export function readOptionalExpectedPlanningGeneration(args: Record<string, unknown>): number | undefined {
  const v = args.expectedPlanningGeneration;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
    return v;
  }
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    return Number(v.trim());
  }
  return undefined;
}

export function planningConcurrencySaveOpts(
  args: Record<string, unknown>
): { expectedPlanningGeneration: number } | undefined {
  const g = readOptionalExpectedPlanningGeneration(args);
  return g !== undefined ? { expectedPlanningGeneration: g } : undefined;
}
