import crypto from "node:crypto";
import type Sqlite from "better-sqlite3";

const MODULE_ID_PREFIX = "planning-chat-session:";
const STATE_SCHEMA_VERSION = 1;

export const PLANNING_CHAT_SESSION_STATUSES = [
  "active",
  "draft_ready",
  "needs_revision",
  "approval_ready",
  "completed",
  "abandoned",
  "superseded"
] as const;

export type PlanningChatSessionStatus = (typeof PLANNING_CHAT_SESSION_STATUSES)[number];

export function isPlanningChatSessionStatus(value: string): value is PlanningChatSessionStatus {
  return (PLANNING_CHAT_SESSION_STATUSES as readonly string[]).includes(value);
}

export type PlanningChatSessionRecord = {
  schemaVersion: 1;
  sessionId: string;
  ideaId: string;
  title: string;
  note?: string;
  status: PlanningChatSessionStatus;
  resumePrompt?: string;
  summary?: string;
  currentPlanRef?: string;
  currentPlanVersion?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanningChatSessionResponse = {
  sessionId: string;
  status: PlanningChatSessionStatus;
  startedAt: string;
  updatedAt: string;
  resumePrompt?: string;
  summary?: string;
  currentPlanRef?: string;
  currentPlanVersion?: number;
  completedAt?: string;
};

function moduleIdForIdea(ideaId: string): string {
  return `${MODULE_ID_PREFIX}${ideaId}`;
}

function parseSession(raw: string | null | undefined): PlanningChatSessionRecord | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Partial<PlanningChatSessionRecord>;
    if (record.schemaVersion !== 1 || typeof record.ideaId !== "string" || typeof record.title !== "string") {
      return null;
    }
    if (
      typeof record.status !== "string" ||
      !isPlanningChatSessionStatus(record.status) ||
      typeof record.createdAt !== "string" ||
      typeof record.updatedAt !== "string"
    ) {
      return null;
    }
    if (typeof record.sessionId !== "string" || !record.sessionId.trim()) {
      return {
        ...(record as PlanningChatSessionRecord),
        sessionId: `pcs-${record.ideaId}`
      };
    }
    return record as PlanningChatSessionRecord;
  } catch {
    return null;
  }
}

function writeSessionRecord(db: Sqlite.Database, ideaId: string, record: PlanningChatSessionRecord, nowIso: string): void {
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version=excluded.state_schema_version,
       state_json=excluded.state_json,
       updated_at=excluded.updated_at`
  ).run(moduleIdForIdea(ideaId), STATE_SCHEMA_VERSION, JSON.stringify(record), nowIso);
}

export function persistPlanningChatSession(
  db: Sqlite.Database,
  input: { ideaId: string; title: string; note?: string; resumePrompt?: string; sessionId?: string },
  nowIso: string
): PlanningChatSessionRecord {
  const prior = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleIdForIdea(input.ideaId)) as { state_json: string } | undefined;
  const existing = parseSession(prior?.state_json);
  const requestedSessionId = input.sessionId?.trim();
  const record: PlanningChatSessionRecord = {
    schemaVersion: 1,
    sessionId:
      existing?.sessionId ??
      (requestedSessionId && requestedSessionId.length > 0 ? requestedSessionId : `pcs-${crypto.randomUUID()}`),
    ideaId: input.ideaId,
    title: input.title,
    ...(input.note ? { note: input.note } : {}),
    status: "active",
    ...(input.resumePrompt ? { resumePrompt: input.resumePrompt } : {}),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  writeSessionRecord(db, input.ideaId, record, nowIso);
  return record;
}

export function getPlanningChatSession(db: Sqlite.Database, ideaId: string): PlanningChatSessionRecord | null {
  const prior = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleIdForIdea(ideaId)) as { state_json: string } | undefined;
  return parseSession(prior?.state_json);
}

export function toPlanningChatSessionResponse(session: PlanningChatSessionRecord): PlanningChatSessionResponse {
  return {
    sessionId: session.sessionId,
    status: session.status,
    startedAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.resumePrompt ? { resumePrompt: session.resumePrompt } : {}),
    ...(session.summary ? { summary: session.summary } : {}),
    ...(session.currentPlanRef ? { currentPlanRef: session.currentPlanRef } : {}),
    ...(typeof session.currentPlanVersion === "number" ? { currentPlanVersion: session.currentPlanVersion } : {}),
    ...(session.completedAt ? { completedAt: session.completedAt } : {})
  };
}

export function updatePlanningChatSession(
  db: Sqlite.Database,
  input: {
    ideaId: string;
    sessionId: string;
    status: PlanningChatSessionStatus;
    summary?: string;
    currentPlanRef?: string;
    currentPlanVersion?: number;
  },
  nowIso: string
): PlanningChatSessionRecord | null {
  const existing = getPlanningChatSession(db, input.ideaId);
  if (!existing || existing.sessionId !== input.sessionId) {
    return null;
  }
  const record: PlanningChatSessionRecord = {
    ...existing,
    status: input.status,
    updatedAt: nowIso,
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.currentPlanRef !== undefined ? { currentPlanRef: input.currentPlanRef } : {}),
    ...(input.currentPlanVersion !== undefined ? { currentPlanVersion: input.currentPlanVersion } : {}),
    ...(input.status === "completed" ? { completedAt: existing.completedAt ?? nowIso } : {})
  };
  writeSessionRecord(db, input.ideaId, record, nowIso);
  return record;
}

export function listPlanningChatSessions(db: Sqlite.Database): PlanningChatSessionRecord[] {
  const rows = db
    .prepare(
      "SELECT state_json FROM workspace_module_state WHERE module_id LIKE ? ORDER BY updated_at DESC"
    )
    .all(`${MODULE_ID_PREFIX}%`) as Array<{ state_json: string }>;
  return rows.map((row) => parseSession(row.state_json)).filter((row): row is PlanningChatSessionRecord => row !== null);
}
