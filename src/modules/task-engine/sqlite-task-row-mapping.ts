import type { TaskEntity, TaskStoreDocument } from "./types.js";
import { TaskEngineError } from "./transitions.js";

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

/** Serialize TaskEntity → DB row (transaction caller supplies table name). */
export function taskEntityToRow(t: TaskEntity): TaskEngineTaskRow {
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
    metadata_json: md ? JSON.stringify(md) : null
  };
}

export function rowToTaskEntity(row: TaskEngineTaskRow): TaskEntity {
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
    metadata
  };
  if (task.dependsOn?.length === 0) {
    delete task.dependsOn;
  }
  if (task.unblocks?.length === 0) {
    delete task.unblocks;
  }
  return task;
}

/** Mirror envelope logs into task_store_json for tooling that only reads the blob (relational mode). */
export function relationalBlobMirror(doc: TaskStoreDocument): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: [],
    transitionLog: doc.transitionLog,
    mutationLog: doc.mutationLog ?? [],
    lastUpdated: doc.lastUpdated
  };
}
