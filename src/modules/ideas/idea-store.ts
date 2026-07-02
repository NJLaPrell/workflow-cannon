import type Sqlite from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { isIdeaPlanStatusInput, parseIdeaPlanStatus, type IdeaPlanStatus } from "./idea-plan-types.js";

export const IDEAS_KIT_MIN_USER_VERSION = 29;

export type IdeaStatus = "open" | "planning" | "planned";

const IDEA_PLAN_STATUS_TO_SQLITE_HINT: Partial<Record<IdeaPlanStatus, IdeaStatus>> = {
  idea: "open",
  planning: "planning",
  accepted: "planned"
};

export type IdeaRecord = {
  id: string;
  title: string;
  note?: string;
  status: IdeaStatus;
  sortOrder: number;
  linkedPlanArtifact?: string;
  previousPlanArtifacts: string[];
  createdAt: string;
  updatedAt: string;
};

type IdeaRow = {
  id: string;
  title: string;
  note: string | null;
  status: IdeaStatus;
  sort_order: number;
  linked_plan_artifact: string | null;
  previous_plan_artifacts_json: string;
  created_at: string;
  updated_at: string;
};

export function assertIdeasKitSchema(
  dbPathAbs: string
): { ok: true } | { ok: false; message: string } {
  const userVersion = readKitSqliteUserVersion(dbPathAbs);
  if (userVersion < IDEAS_KIT_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `ideas commands require kit SQLite user_version >= ${IDEAS_KIT_MIN_USER_VERSION} (current ${userVersion}); open the workspace DB once with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

export function isIdeaId(raw: string): boolean {
  return /^I[0-9]+$/.test(raw);
}

export function parseIdeaStatus(raw: unknown): IdeaStatus | undefined {
  if (raw === "open" || raw === "planning" || raw === "planned") {
    return raw;
  }
  const canonical = parseIdeaPlanStatus(raw);
  if (!canonical) {
    return undefined;
  }
  return IDEA_PLAN_STATUS_TO_SQLITE_HINT[canonical];
}

export function isIdeaStatusInput(raw: unknown): raw is string {
  return typeof raw === "string" && isIdeaPlanStatusInput(raw);
}

export function readStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function toIdeaRecord(row: IdeaRow): IdeaRecord {
  return {
    id: row.id,
    title: row.title,
    ...(row.note ? { note: row.note } : {}),
    status: row.status,
    sortOrder: row.sort_order,
    ...(row.linked_plan_artifact ? { linkedPlanArtifact: row.linked_plan_artifact } : {}),
    previousPlanArtifacts: readStringArray(row.previous_plan_artifacts_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function allocateNextIdeaId(db: Sqlite.Database): string {
  const rows = db.prepare("SELECT id FROM workflow_ideas WHERE id GLOB 'I[0-9]*'").all() as Array<{ id: string }>;
  const max = rows.reduce((acc, row) => {
    const n = Number(row.id.slice(1));
    return Number.isInteger(n) && n > acc ? n : acc;
  }, 0);
  return `I${String(max + 1).padStart(3, "0")}`;
}

export function nextIdeaSortOrder(db: Sqlite.Database): number {
  const row = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM workflow_ideas").get() as
    | { next_order: number }
    | undefined;
  return row?.next_order ?? 0;
}

export type CreateIdeaInput = {
  title: string;
  note?: string;
  status?: IdeaStatus;
  linkedPlanArtifact?: string;
  previousPlanArtifacts?: string[];
};

export type UpdateIdeaInput = {
  title?: string;
  note?: string | null;
  status?: IdeaStatus;
  linkedPlanArtifact?: string | null;
  previousPlanArtifacts?: string[];
};

export function createIdea(db: Sqlite.Database, input: CreateIdeaInput, nowIso: string): IdeaRecord {
  const id = allocateNextIdeaId(db);
  const sortOrder = nextIdeaSortOrder(db);
  const status = input.status ?? "open";
  const previousPlanArtifacts = input.previousPlanArtifacts ?? [];
  db.prepare(
    `INSERT INTO workflow_ideas (
       id, title, note, status, sort_order, linked_plan_artifact,
       previous_plan_artifacts_json, created_at, updated_at
     ) VALUES (
       @id, @title, @note, @status, @sort_order, @linked_plan_artifact,
       @previous_plan_artifacts_json, @created_at, @updated_at
     )`
  ).run({
    id,
    title: input.title,
    note: input.note ?? null,
    status,
    sort_order: sortOrder,
    linked_plan_artifact: input.linkedPlanArtifact ?? null,
    previous_plan_artifacts_json: JSON.stringify(previousPlanArtifacts),
    created_at: nowIso,
    updated_at: nowIso
  });
  return {
    id,
    title: input.title,
    ...(input.note ? { note: input.note } : {}),
    status,
    sortOrder,
    ...(input.linkedPlanArtifact ? { linkedPlanArtifact: input.linkedPlanArtifact } : {}),
    previousPlanArtifacts,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function getIdea(db: Sqlite.Database, ideaId: string): IdeaRecord | null {
  const row = db.prepare("SELECT * FROM workflow_ideas WHERE id = ?").get(ideaId) as IdeaRow | undefined;
  return row ? toIdeaRecord(row) : null;
}

export function listIdeas(db: Sqlite.Database, status?: IdeaStatus): IdeaRecord[] {
  const rows = status
    ? (db
        .prepare("SELECT * FROM workflow_ideas WHERE status = ? ORDER BY sort_order ASC, id ASC")
        .all(status) as IdeaRow[])
    : (db.prepare("SELECT * FROM workflow_ideas ORDER BY sort_order ASC, id ASC").all() as IdeaRow[]);
  return rows.map(toIdeaRecord);
}

export function updateIdea(
  db: Sqlite.Database,
  ideaId: string,
  input: UpdateIdeaInput,
  nowIso: string
): IdeaRecord | null {
  const existing = getIdea(db, ideaId);
  if (!existing) {
    return null;
  }
  db.prepare(
    `UPDATE workflow_ideas
        SET title = @title,
            note = @note,
            status = @status,
            linked_plan_artifact = @linked_plan_artifact,
            previous_plan_artifacts_json = @previous_plan_artifacts_json,
            updated_at = @updated_at
      WHERE id = @id`
  ).run({
    id: ideaId,
    title: input.title ?? existing.title,
    note: input.note === undefined ? existing.note ?? null : input.note,
    status: input.status ?? existing.status,
    linked_plan_artifact:
      input.linkedPlanArtifact === undefined ? existing.linkedPlanArtifact ?? null : input.linkedPlanArtifact,
    previous_plan_artifacts_json: JSON.stringify(input.previousPlanArtifacts ?? existing.previousPlanArtifacts),
    updated_at: nowIso
  });
  return getIdea(db, ideaId);
}

export function deleteIdea(db: Sqlite.Database, ideaId: string): IdeaRecord | null {
  const existing = getIdea(db, ideaId);
  if (!existing) {
    return null;
  }
  db.prepare("DELETE FROM workflow_ideas WHERE id = ?").run(ideaId);
  return existing;
}

export function reorderIdeas(db: Sqlite.Database, ideaIds: string[], nowIso: string): IdeaRecord[] | null {
  const current = listIdeas(db);
  const currentIds = current.map((idea) => idea.id);
  if (ideaIds.length !== currentIds.length) {
    return null;
  }
  const currentSet = new Set(currentIds);
  const nextSet = new Set(ideaIds);
  if (nextSet.size !== ideaIds.length || currentIds.some((id) => !nextSet.has(id)) || ideaIds.some((id) => !currentSet.has(id))) {
    return null;
  }
  const update = db.prepare("UPDATE workflow_ideas SET sort_order = ?, updated_at = ? WHERE id = ?");
  db.transaction(() => {
    ideaIds.forEach((id, index) => update.run(index, nowIso, id));
  })();
  return listIdeas(db);
}