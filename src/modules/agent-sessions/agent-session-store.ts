import type Database from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";

export const AGENT_SESSIONS_KIT_MIN_USER_VERSION = 33;

export type AgentSessionRow = {
  id: string;
  agentId: string;
  hostHint: string | null;
  modelTier: string | null;
  currentAssignmentId: string | null;
  currentActivityId: string | null;
  currentTaskId: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export function assertAgentSessionsKitSchema(dbPathAbs: string): { ok: true } | { ok: false; message: string } {
  const uv = readKitSqliteUserVersion(dbPathAbs);
  if (uv < AGENT_SESSIONS_KIT_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `agent-session commands require kit SQLite user_version >= ${AGENT_SESSIONS_KIT_MIN_USER_VERSION} (current ${uv}); open the workspace DB once with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function insertSession(
  db: Database.Database,
  row: {
    id: string;
    agentId: string;
    hostHint: string | null;
    modelTier: string | null;
    currentAssignmentId: string | null;
    currentActivityId: string | null;
    currentTaskId: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
    now: string;
  }
): void {
  db.prepare(
    `INSERT INTO kit_agent_sessions (
      id, agent_id, host_hint, model_tier, current_assignment_id, current_activity_id, current_task_id, status, metadata_json, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    row.id,
    row.agentId,
    row.hostHint,
    row.modelTier,
    row.currentAssignmentId,
    row.currentActivityId,
    row.currentTaskId,
    row.status,
    row.metadata ? JSON.stringify(row.metadata) : null,
    row.now,
    row.now
  );
}

export function getSession(db: Database.Database, sessionId: string): AgentSessionRow | null {
  const r = db.prepare("SELECT * FROM kit_agent_sessions WHERE id = ?").get(sessionId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    hostHint: r.host_hint != null ? String(r.host_hint) : null,
    modelTier: r.model_tier != null ? String(r.model_tier) : null,
    currentAssignmentId: r.current_assignment_id != null ? String(r.current_assignment_id) : null,
    currentActivityId: r.current_activity_id != null ? String(r.current_activity_id) : null,
    currentTaskId: r.current_task_id != null ? String(r.current_task_id) : null,
    status: String(r.status),
    metadata: parseJsonObject(typeof r.metadata_json === "string" ? r.metadata_json : null),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? "")
  };
}

export function listSessions(
  db: Database.Database,
  filters: { agentId?: string; status?: string }
): AgentSessionRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.agentId) {
    clauses.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM kit_agent_sessions ${where} ORDER BY updated_at DESC`).all(...params) as
    Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    agentId: String(r.agent_id),
    hostHint: r.host_hint != null ? String(r.host_hint) : null,
    modelTier: r.model_tier != null ? String(r.model_tier) : null,
    currentAssignmentId: r.current_assignment_id != null ? String(r.current_assignment_id) : null,
    currentActivityId: r.current_activity_id != null ? String(r.current_activity_id) : null,
    currentTaskId: r.current_task_id != null ? String(r.current_task_id) : null,
    status: String(r.status),
    metadata: parseJsonObject(typeof r.metadata_json === "string" ? r.metadata_json : null),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? "")
  }));
}

export function updateSessionPointers(
  db: Database.Database,
  row: {
    id: string;
    hostHint?: string | null;
    modelTier?: string | null;
    currentAssignmentId?: string | null;
    currentActivityId?: string | null;
    currentTaskId?: string | null;
    metadata?: Record<string, unknown> | null;
    now: string;
  }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_agent_sessions SET host_hint = ?, model_tier = ?, current_assignment_id = ?, current_activity_id = ?, current_task_id = ?, metadata_json = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      row.hostHint ?? null,
      row.modelTier ?? null,
      row.currentAssignmentId ?? null,
      row.currentActivityId ?? null,
      row.currentTaskId ?? null,
      row.metadata ? JSON.stringify(row.metadata) : null,
      row.now,
      row.id
    );
  return r.changes > 0;
}

export function updateSessionStatus(db: Database.Database, sessionId: string, status: string, now: string): boolean {
  const r = db
    .prepare("UPDATE kit_agent_sessions SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, now, sessionId);
  return r.changes > 0;
}
