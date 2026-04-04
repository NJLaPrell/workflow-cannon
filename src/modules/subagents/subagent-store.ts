import type Database from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import path from "node:path";

export const SUBAGENT_KIT_MIN_USER_VERSION = 6;

const SUBAGENT_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/i;

export type SubagentDefinitionRow = {
  id: string;
  displayName: string;
  description: string;
  allowedCommands: string[];
  retired: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SubagentSessionRow = {
  id: string;
  definitionId: string;
  executionTaskId: string | null;
  status: string;
  hostHint: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SubagentMessageRow = {
  id: number;
  sessionId: string;
  direction: string;
  body: string;
  createdAt: string;
};

export function assertSubagentKitSchema(dbPathAbs: string): { ok: true } | { ok: false; message: string } {
  const uv = readKitSqliteUserVersion(dbPathAbs);
  if (uv < SUBAGENT_KIT_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `subagent commands require kit SQLite user_version >= ${SUBAGENT_KIT_MIN_USER_VERSION} (current ${uv}); open the workspace DB once with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

export function validateSubagentId(raw: string): string | null {
  const t = raw.trim();
  if (!t || !SUBAGENT_ID_RE.test(t)) {
    return null;
  }
  return t;
}

export function normalizeAllowedCommands(raw: unknown): { ok: true; commands: string[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "allowedCommands must be a non-empty string array" };
  }
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") {
      return { ok: false, message: "allowedCommands entries must be strings" };
    }
    const c = x.trim();
    if (!c) {
      return { ok: false, message: "allowedCommands entries must be non-empty" };
    }
    if (c === "*" || c.includes("*")) {
      return { ok: false, message: "wildcard allowedCommands are rejected; list explicit workspace-kit command names" };
    }
    out.push(c);
  }
  if (out.length > 64) {
    return { ok: false, message: "allowedCommands max length is 64" };
  }
  return { ok: true, commands: out };
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

export function rowToDefinition(
  r: Record<string, unknown>
): SubagentDefinitionRow {
  let allowed: string[] = [];
  try {
    const p = JSON.parse(String(r.allowed_commands_json ?? "[]"));
    if (Array.isArray(p)) {
      allowed = p.filter((x): x is string => typeof x === "string");
    }
  } catch {
    allowed = [];
  }
  return {
    id: String(r.id),
    displayName: String(r.display_name ?? ""),
    description: String(r.description ?? ""),
    allowedCommands: allowed,
    retired: Number(r.retired) === 1,
    metadata: parseJsonObject(typeof r.metadata_json === "string" ? r.metadata_json : null),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? "")
  };
}

export function insertDefinition(
  db: Database.Database,
  row: {
    id: string;
    displayName: string;
    description: string;
    allowedCommands: string[];
    metadata: Record<string, unknown> | null;
    now: string;
  }
): void {
  db.prepare(
    `INSERT INTO kit_subagent_definitions (
      id, display_name, description, allowed_commands_json, retired, metadata_json, created_at, updated_at
    ) VALUES (?,?,?,?,0,?,?,?)`
  ).run(
    row.id,
    row.displayName,
    row.description,
    JSON.stringify(row.allowedCommands),
    row.metadata ? JSON.stringify(row.metadata) : null,
    row.now,
    row.now
  );
}

export function updateDefinition(
  db: Database.Database,
  row: {
    id: string;
    displayName: string;
    description: string;
    allowedCommands: string[];
    metadata: Record<string, unknown> | null;
    now: string;
  }
): void {
  db.prepare(
    `UPDATE kit_subagent_definitions SET
      display_name = ?, description = ?, allowed_commands_json = ?, metadata_json = ?, updated_at = ?
    WHERE id = ?`
  ).run(
    row.displayName,
    row.description,
    JSON.stringify(row.allowedCommands),
    row.metadata ? JSON.stringify(row.metadata) : null,
    row.now,
    row.id
  );
}

export function getDefinitionById(db: Database.Database, id: string): SubagentDefinitionRow | null {
  const r = db.prepare("SELECT * FROM kit_subagent_definitions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToDefinition(r) : null;
}

export function listDefinitions(
  db: Database.Database,
  includeRetired: boolean
): SubagentDefinitionRow[] {
  const sql = includeRetired
    ? "SELECT * FROM kit_subagent_definitions ORDER BY id"
    : "SELECT * FROM kit_subagent_definitions WHERE retired = 0 ORDER BY id";
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  return rows.map(rowToDefinition);
}

export function setDefinitionRetired(db: Database.Database, id: string, now: string): boolean {
  const r = db.prepare("UPDATE kit_subagent_definitions SET retired = 1, updated_at = ? WHERE id = ?").run(now, id);
  return r.changes > 0;
}

export function insertSession(
  db: Database.Database,
  row: {
    id: string;
    definitionId: string;
    executionTaskId: string | null;
    status: string;
    hostHint: string | null;
    metadata: Record<string, unknown> | null;
    now: string;
  }
): void {
  db.prepare(
    `INSERT INTO kit_subagent_sessions (
      id, definition_id, execution_task_id, status, host_hint, metadata_json, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    row.id,
    row.definitionId,
    row.executionTaskId,
    row.status,
    row.hostHint,
    row.metadata ? JSON.stringify(row.metadata) : null,
    row.now,
    row.now
  );
}

export function getSession(db: Database.Database, sessionId: string): SubagentSessionRow | null {
  const r = db.prepare("SELECT * FROM kit_subagent_sessions WHERE id = ?").get(sessionId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    definitionId: String(r.definition_id),
    executionTaskId: r.execution_task_id != null ? String(r.execution_task_id) : null,
    status: String(r.status),
    hostHint: r.host_hint != null ? String(r.host_hint) : null,
    metadata: parseJsonObject(typeof r.metadata_json === "string" ? r.metadata_json : null),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? "")
  };
}

export function listSessions(
  db: Database.Database,
  filters: { definitionId?: string; executionTaskId?: string }
): SubagentSessionRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.definitionId) {
    clauses.push("definition_id = ?");
    params.push(filters.definitionId);
  }
  if (filters.executionTaskId) {
    clauses.push("execution_task_id = ?");
    params.push(filters.executionTaskId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM kit_subagent_sessions ${where} ORDER BY created_at DESC`).all(
    ...params
  ) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    definitionId: String(r.definition_id),
    executionTaskId: r.execution_task_id != null ? String(r.execution_task_id) : null,
    status: String(r.status),
    hostHint: r.host_hint != null ? String(r.host_hint) : null,
    metadata: parseJsonObject(typeof r.metadata_json === "string" ? r.metadata_json : null),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? "")
  }));
}

export function updateSessionStatus(db: Database.Database, sessionId: string, status: string, now: string): boolean {
  const r = db.prepare("UPDATE kit_subagent_sessions SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    now,
    sessionId
  );
  return r.changes > 0;
}

export function insertMessage(
  db: Database.Database,
  row: { sessionId: string; direction: string; body: string; now: string }
): number {
  const info = db
    .prepare(
      "INSERT INTO kit_subagent_messages (session_id, direction, body, created_at) VALUES (?,?,?,?)"
    )
    .run(row.sessionId, row.direction, row.body, row.now);
  return Number(info.lastInsertRowid);
}

export function listMessagesForSession(db: Database.Database, sessionId: string): SubagentMessageRow[] {
  const rows = db
    .prepare(
      "SELECT id, session_id, direction, body, created_at FROM kit_subagent_messages WHERE session_id = ? ORDER BY id ASC"
    )
    .all(sessionId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    sessionId: String(r.session_id),
    direction: String(r.direction),
    body: String(r.body),
    createdAt: String(r.created_at ?? "")
  }));
}

export function resolveDbPathAbs(workspacePath: string, dbRel: string): string {
  return path.resolve(workspacePath, dbRel);
}
