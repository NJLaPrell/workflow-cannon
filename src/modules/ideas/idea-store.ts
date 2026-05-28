import type Sqlite from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";

export const IDEAS_KIT_MIN_USER_VERSION = 29;

export type IdeaStatus = "open" | "planning" | "planned";

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
  return raw === "open" || raw === "planning" || raw === "planned" ? raw : undefined;
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

function allocateNextIdeaId(db: Sqlite.Database): string {
  const rows = db.prepare("SELECT id FROM workflow_ideas WHERE id GLOB 'I[0-9]*'").all() as Array<{ id: string }>;
  const max = rows.reduce((acc, row) => {
    const n = Number(row.id.slice(1));
    return Number.isInteger(n) && n > acc ? n : acc;
  }, 0);
  return `I${String(max + 1).padStart(3, "0")}`;
}

function nextSortOrder(db: Sqlite.Database): number {
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

export function createIdea(db: Sqlite.Database, input: CreateIdeaInput, nowIso: string): IdeaRecord {
  const id = allocateNextIdeaId(db);
  const sortOrder = nextSortOrder(db);
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