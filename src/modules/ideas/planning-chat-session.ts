import type Sqlite from "better-sqlite3";

const MODULE_ID_PREFIX = "planning-chat-session:";
const STATE_SCHEMA_VERSION = 1;

export type PlanningChatSessionRecord = {
  schemaVersion: 1;
  ideaId: string;
  title: string;
  note?: string;
  status: "active";
  resumePrompt?: string;
  createdAt: string;
  updatedAt: string;
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
    if (record.status !== "active" || typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") {
      return null;
    }
    return record as PlanningChatSessionRecord;
  } catch {
    return null;
  }
}

export function persistPlanningChatSession(
  db: Sqlite.Database,
  input: { ideaId: string; title: string; note?: string; resumePrompt?: string },
  nowIso: string
): PlanningChatSessionRecord {
  const moduleId = moduleIdForIdea(input.ideaId);
  const prior = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleId) as { state_json: string } | undefined;
  const existing = parseSession(prior?.state_json);
  const record: PlanningChatSessionRecord = {
    schemaVersion: 1,
    ideaId: input.ideaId,
    title: input.title,
    ...(input.note ? { note: input.note } : {}),
    status: "active",
    ...(input.resumePrompt ? { resumePrompt: input.resumePrompt } : {}),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version=excluded.state_schema_version,
       state_json=excluded.state_json,
       updated_at=excluded.updated_at`
  ).run(moduleId, STATE_SCHEMA_VERSION, JSON.stringify(record), nowIso);
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
