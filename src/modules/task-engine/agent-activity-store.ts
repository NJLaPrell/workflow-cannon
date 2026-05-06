import type Database from "better-sqlite3";
import type {
  DashboardAgentStatusKind,
  DashboardAgentStatusSummary
} from "../../contracts/dashboard-summary-run.js";

const TABLE = "kit_agent_activity_leases";

export const DASHBOARD_AGENT_STATUS_KINDS: readonly DashboardAgentStatusKind[] = [
  "unavailable",
  "planning",
  "blocked",
  "working_task",
  "delegating_task",
  "ready_task",
  "awaiting_instruction",
  "reviewing_item",
  "reviewing_pr",
  "validating",
  "releasing",
  "awaiting_policy_approval",
  "awaiting_human_gate"
] as const;

const KIND_SET = new Set<string>(DASHBOARD_AGENT_STATUS_KINDS);

export type AgentActivityLease = {
  schemaVersion: 1;
  activityId: string;
  agentId: string;
  sessionId: string;
  kind: DashboardAgentStatusKind;
  label: string;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  taskId: string | null;
  command: string | null;
  phaseKey: string | null;
  prNumber: number | null;
  version: string | null;
  details: Record<string, unknown> | null;
};

export type SetAgentActivityInput = {
  activityId: string;
  agentId: string;
  sessionId?: string | null;
  kind: DashboardAgentStatusKind;
  label: string;
  now: string;
  expiresAt: string;
  taskId?: string | null;
  command?: string | null;
  phaseKey?: string | null;
  prNumber?: number | null;
  version?: string | null;
  details?: Record<string, unknown> | null;
};

function tableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(TABLE) as { ok: number } | undefined;
  return Boolean(row);
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function validIsoMillis(value: string): number | null {
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAgentActivityKind(raw: unknown): DashboardAgentStatusKind | null {
  const value = cleanText(raw);
  return KIND_SET.has(value) ? (value as DashboardAgentStatusKind) : null;
}

function rowToLease(row: Record<string, unknown>): AgentActivityLease | null {
  const kind = normalizeAgentActivityKind(row.kind);
  if (!kind) {
    return null;
  }
  const activityId = cleanText(row.activity_id);
  const agentId = cleanText(row.agent_id);
  const sessionId = cleanText(row.session_id);
  const label = cleanText(row.label);
  const startedAt = cleanText(row.started_at);
  const updatedAt = cleanText(row.updated_at);
  const expiresAt = cleanText(row.expires_at);
  if (!activityId || !agentId || !label || !startedAt || !updatedAt || !expiresAt) {
    return null;
  }
  return {
    schemaVersion: 1,
    activityId,
    agentId,
    sessionId,
    kind,
    label,
    startedAt,
    updatedAt,
    expiresAt,
    taskId: cleanText(row.task_id) || null,
    command: cleanText(row.command) || null,
    phaseKey: cleanText(row.phase_key) || null,
    prNumber: finiteNumber(row.pr_number),
    version: cleanText(row.version) || null,
    details: parseJsonObject(row.details_json)
  };
}

export function setAgentActivityLease(
  db: Database.Database,
  input: SetAgentActivityInput
): AgentActivityLease {
  const activityId = cleanText(input.activityId);
  const agentId = cleanText(input.agentId);
  const sessionId = cleanText(input.sessionId ?? "default", "default");
  const label = cleanText(input.label);
  if (!tableExists(db)) {
    throw new Error(`${TABLE} table is not available; open the DB with current workspace-kit migrations`);
  }
  if (!activityId || !agentId || !label) {
    throw new Error("activityId, agentId, and label are required");
  }
  if (!normalizeAgentActivityKind(input.kind)) {
    throw new Error(`Unsupported agent activity kind '${String(input.kind)}'`);
  }
  if (validIsoMillis(input.now) === null || validIsoMillis(input.expiresAt) === null) {
    throw new Error("now and expiresAt must be valid ISO timestamps");
  }
  const existing = db
    .prepare(`SELECT started_at FROM ${TABLE} WHERE activity_id = ?`)
    .get(activityId) as { started_at?: string } | undefined;
  const startedAt = cleanText(existing?.started_at, input.now);
  db.prepare(
    `INSERT INTO ${TABLE} (
      activity_id, agent_id, session_id, kind, label, task_id, command, phase_key, pr_number,
      version, details_json, started_at, updated_at, expires_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(activity_id) DO UPDATE SET
      agent_id = excluded.agent_id,
      session_id = excluded.session_id,
      kind = excluded.kind,
      label = excluded.label,
      task_id = excluded.task_id,
      command = excluded.command,
      phase_key = excluded.phase_key,
      pr_number = excluded.pr_number,
      version = excluded.version,
      details_json = excluded.details_json,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at`
  ).run(
    activityId,
    agentId,
    sessionId,
    input.kind,
    label,
    input.taskId ?? null,
    input.command ?? null,
    input.phaseKey ?? null,
    input.prNumber ?? null,
    input.version ?? null,
    input.details ? JSON.stringify(input.details) : null,
    startedAt,
    input.now,
    input.expiresAt
  );
  const row = db.prepare(`SELECT * FROM ${TABLE} WHERE activity_id = ?`).get(activityId) as
    | Record<string, unknown>
    | undefined;
  const lease = row ? rowToLease(row) : null;
  if (!lease) {
    throw new Error(`Unable to read persisted agent activity lease '${activityId}'`);
  }
  return lease;
}

export function heartbeatAgentActivityLease(
  db: Database.Database,
  args: { activityId: string; now: string; expiresAt: string }
): AgentActivityLease | null {
  if (!tableExists(db)) {
    return null;
  }
  if (validIsoMillis(args.now) === null || validIsoMillis(args.expiresAt) === null) {
    throw new Error("now and expiresAt must be valid ISO timestamps");
  }
  const activityId = cleanText(args.activityId);
  if (!activityId) {
    throw new Error("activityId is required");
  }
  db.prepare(`UPDATE ${TABLE} SET updated_at = ?, expires_at = ? WHERE activity_id = ?`).run(
    args.now,
    args.expiresAt,
    activityId
  );
  const row = db.prepare(`SELECT * FROM ${TABLE} WHERE activity_id = ?`).get(activityId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToLease(row) : null;
}

export function clearAgentActivityLeases(
  db: Database.Database,
  filters: { activityId?: string; agentId?: string; sessionId?: string }
): number {
  if (!tableExists(db)) {
    return 0;
  }
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (cleanText(filters.activityId)) {
    clauses.push("activity_id = ?");
    params.push(cleanText(filters.activityId));
  }
  if (cleanText(filters.agentId)) {
    clauses.push("agent_id = ?");
    params.push(cleanText(filters.agentId));
  }
  if (cleanText(filters.sessionId)) {
    clauses.push("session_id = ?");
    params.push(cleanText(filters.sessionId));
  }
  if (clauses.length === 0) {
    throw new Error("clearAgentActivityLeases requires at least one filter");
  }
  const r = db.prepare(`DELETE FROM ${TABLE} WHERE ${clauses.join(" AND ")}`).run(...params);
  return r.changes;
}

export function listCurrentAgentActivityLeases(
  db: Database.Database | undefined,
  now: string
): AgentActivityLease[] {
  if (!db || !tableExists(db)) {
    return [];
  }
  const nowMs = validIsoMillis(now);
  if (nowMs === null) {
    return [];
  }
  const rows = db
    .prepare(`SELECT * FROM ${TABLE} ORDER BY updated_at DESC, started_at DESC, activity_id ASC`)
    .all() as Record<string, unknown>[];
  return rows
    .map(rowToLease)
    .filter((row): row is AgentActivityLease => {
      if (!row) return false;
      const expiresMs = validIsoMillis(row.expiresAt);
      return expiresMs !== null && expiresMs > nowMs;
    });
}

export function readCurrentAgentActivityLease(
  db: Database.Database | undefined,
  now: string
): AgentActivityLease | null {
  return listCurrentAgentActivityLeases(db, now)[0] ?? null;
}

export function agentActivityLeaseToDashboardStatus(
  lease: AgentActivityLease
): DashboardAgentStatusSummary {
  return {
    schemaVersion: 1,
    source: "live_activity",
    kind: lease.kind,
    label: lease.label,
    confidence: "high",
    updatedAt: lease.updatedAt,
    taskId: lease.taskId,
    phaseKey: lease.phaseKey,
    command: lease.command,
    prNumber: lease.prNumber,
    version: lease.version,
    detail: lease.details?.detail != null ? String(lease.details.detail) : null
  };
}