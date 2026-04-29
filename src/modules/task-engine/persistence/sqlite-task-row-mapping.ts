import type { TaskEntity, TaskStoreDocument } from "../types.js";
import { TaskEngineError } from "../transitions.js";
import { attachAgentRoutingProjection } from "../agent-task-routing-projection.js";

export type TaskEngineTaskRow = {
  id: string;
  status: string;
  type: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived: number;
  archived_at: string | null;
  priority: string | null;
  phase: string | null;
  phase_key: string | null;
  ownership: string | null;
  approach: string | null;
  depends_on_json: string;
  unblocks_json: string;
  technical_scope_json: string | null;
  acceptance_criteria_json: string | null;
  summary: string | null;
  description: string | null;
  risk: string | null;
  queue_namespace: string | null;
  evidence_key: string | null;
  evidence_kind: string | null;
  metadata_json: string | null;
  /** Kit SQLite user_version 17+: promoted list-task filter fields (mirror of metadata keys). */
  routing_category?: string | null;
  routing_confidence_tier?: string | null;
  routing_blocked_reason_category?: string | null;
  routing_tags_json?: string | null;
  /** Present from kit SQLite user_version 4+ relational rows; absent on pre-migration reads. */
  features_json?: string | null;
};

function parseJsonArray(s: string, field: string): string[] {
  try {
    const v = JSON.parse(s) as unknown;
    if (!Array.isArray(v)) {
      throw new TaskEngineError("storage-read-error", `${field} must be a JSON array`);
    }
    return v.filter((x) => typeof x === "string") as string[];
  } catch (e) {
    if (e instanceof TaskEngineError) {
      throw e;
    }
    throw new TaskEngineError("storage-read-error", `Invalid ${field} JSON: ${(e as Error).message}`);
  }
}

function parseOptionalStringArray(json: string | null, field: string): string[] | undefined {
  if (json === null || json === undefined) {
    return undefined;
  }
  const arr = parseJsonArray(json, field);
  return arr.length ? arr : undefined;
}

/** Serialize promoted routing columns from task metadata. */
function routingColumnsFromMetadata(md: Record<string, unknown> | undefined): Pick<
  TaskEngineTaskRow,
  "routing_category" | "routing_confidence_tier" | "routing_blocked_reason_category" | "routing_tags_json"
> {
  const category = typeof md?.category === "string" && md.category.length > 0 ? md.category : null;
  const confidenceTier =
    typeof md?.confidenceTier === "string" && md.confidenceTier.length > 0 ? md.confidenceTier : null;
  const blockedReasonCategory =
    typeof md?.blockedReasonCategory === "string" && md.blockedReasonCategory.length > 0
      ? md.blockedReasonCategory
      : null;
  let routing_tags_json: string | null = null;
  if (Array.isArray(md?.tags)) {
    const tags = (md.tags as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0);
    if (tags.length > 0) {
      routing_tags_json = JSON.stringify(tags);
    }
  }
  return {
    routing_category: category,
    routing_confidence_tier: confidenceTier,
    routing_blocked_reason_category: blockedReasonCategory,
    routing_tags_json
  };
}

/** Merge legacy-only column values into metadata when JSON omitted keys (post-promotion backfill). */
function mergePromotedRoutingIntoMetadata(
  metadata: Record<string, unknown> | undefined,
  row: TaskEngineTaskRow
): Record<string, unknown> | undefined {
  let md = metadata;
  const ensure = (): Record<string, unknown> => {
    if (!md) {
      md = {};
    }
    return md;
  };
  if (row.routing_category && (!md || md.category === undefined)) {
    ensure().category = row.routing_category;
  }
  if (row.routing_confidence_tier && (!md || md.confidenceTier === undefined)) {
    ensure().confidenceTier = row.routing_confidence_tier;
  }
  if (row.routing_blocked_reason_category && (!md || md.blockedReasonCategory === undefined)) {
    ensure().blockedReasonCategory = row.routing_blocked_reason_category;
  }
  const rtj = row.routing_tags_json;
  if (rtj && (!md || md.tags === undefined)) {
    try {
      const parsed = JSON.parse(rtj) as unknown;
      if (Array.isArray(parsed)) {
        const tags = parsed.filter((x): x is string => typeof x === "string");
        if (tags.length > 0) {
          ensure().tags = tags;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return md;
}

export type TaskEntityToRowOptions = {
  /** When true, persist `features_json` as `[]` (junction holds links; kit user_version 5+). */
  omitFeaturesJson?: boolean;
};

/** Serialize TaskEntity → DB row (transaction caller supplies table name). */
export function taskEntityToRow(t: TaskEntity, options?: TaskEntityToRowOptions): TaskEngineTaskRow {
  const md = t.metadata && typeof t.metadata === "object" ? (t.metadata as Record<string, unknown>) : undefined;
  const queueNamespace = typeof md?.queueNamespace === "string" ? md.queueNamespace : undefined;
  const evidenceKey = typeof md?.evidenceKey === "string" ? md.evidenceKey : undefined;
  const evidenceKind = typeof md?.evidenceKind === "string" ? md.evidenceKind : undefined;
  return {
    id: t.id,
    status: t.status,
    type: t.type,
    title: t.title,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    archived: t.archived ? 1 : 0,
    archived_at: t.archivedAt ?? null,
    priority: t.priority ?? null,
    phase: t.phase ?? null,
    phase_key: t.phaseKey ?? null,
    ownership: t.ownership ?? null,
    approach: t.approach ?? null,
    depends_on_json: JSON.stringify(t.dependsOn ?? []),
    unblocks_json: JSON.stringify(t.unblocks ?? []),
    technical_scope_json: t.technicalScope?.length ? JSON.stringify(t.technicalScope) : null,
    acceptance_criteria_json: t.acceptanceCriteria?.length ? JSON.stringify(t.acceptanceCriteria) : null,
    summary: t.summary ?? null,
    description: t.description ?? null,
    risk: t.risk ?? null,
    queue_namespace: queueNamespace ?? null,
    evidence_key: evidenceKey ?? null,
    evidence_kind: evidenceKind ?? null,
    metadata_json: md ? JSON.stringify(md) : null,
    ...routingColumnsFromMetadata(md),
    features_json:
      options?.omitFeaturesJson === true ? "[]" : t.features?.length ? JSON.stringify(t.features) : "[]"
  };
}

export type RowToTaskEntityOptions = {
  /**
   * When set (non-null), feature slugs are resolved **only** from the junction map (registry-active DBs).
   * Legacy `features_json` is ignored — backfill `task_engine_task_features` before relying on links.
   */
  taskFeatureLinkMap?: Map<string, string[]> | null;
};

export function rowToTaskEntity(row: TaskEngineTaskRow, options?: RowToTaskEntityOptions): TaskEntity {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata_json) {
    try {
      const parsed = JSON.parse(row.metadata_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch (e) {
      throw new TaskEngineError(
        "storage-read-error",
        `Invalid metadata_json for task ${row.id}: ${(e as Error).message}`
      );
    }
  }
  metadata = mergePromotedRoutingIntoMetadata(metadata, row);
  let features: string[] | undefined;
  const parseFeaturesJsonColumn = (): string[] => {
    const fj = row.features_json;
    if (fj === null || fj === undefined || fj === "" || fj === "[]") {
      return [];
    }
    try {
      const parsed = JSON.parse(fj) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((x): x is string => typeof x === "string");
    } catch (e) {
      throw new TaskEngineError(
        "storage-read-error",
        `Invalid features_json for task ${row.id}: ${(e as Error).message}`
      );
    }
  };

  const map = options?.taskFeatureLinkMap;
  if (map !== null && map !== undefined) {
    const linked = map.get(row.id);
    const fromJunction = linked && linked.length > 0 ? [...linked].sort() : [];
    features = fromJunction.length > 0 ? fromJunction : undefined;
  } else {
    const legacy = parseFeaturesJsonColumn();
    features = legacy.length > 0 ? legacy : undefined;
  }

  const task: TaskEntity = {
    id: row.id,
    status: row.status as TaskEntity["status"],
    type: row.type,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1,
    archivedAt: row.archived_at ?? undefined,
    priority: (row.priority as TaskEntity["priority"]) ?? undefined,
    phase: row.phase ?? undefined,
    phaseKey: row.phase_key ?? undefined,
    ownership: row.ownership ?? undefined,
    approach: row.approach ?? undefined,
    dependsOn: parseJsonArray(row.depends_on_json, "depends_on_json"),
    unblocks: parseJsonArray(row.unblocks_json, "unblocks_json"),
    technicalScope: parseOptionalStringArray(row.technical_scope_json, "technical_scope_json"),
    acceptanceCriteria: parseOptionalStringArray(row.acceptance_criteria_json, "acceptance_criteria_json"),
    summary: row.summary ?? undefined,
    description: row.description ?? undefined,
    risk: row.risk ?? undefined,
    metadata,
    features
  };
  if (task.dependsOn?.length === 0) {
    delete task.dependsOn;
  }
  if (task.unblocks?.length === 0) {
    delete task.unblocks;
  }
  return attachAgentRoutingProjection(task);
}

/**
 * Compatibility `task_store_json` payload when `relational_tasks=1`.
 * Task bodies and evidence are canonical in `task_engine_*` tables; this blob stays parseable for doctor/export only.
 */
export function relationalCompatibilityTaskBlob(lastUpdated: string): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated
  };
}
