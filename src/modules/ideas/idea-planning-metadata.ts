import type Sqlite from "better-sqlite3";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import { getIdea, isIdeaId } from "./idea-store.js";

const ACTIVE_DRAFT_MODULE_PREFIX = "ideas-active-draft-plan:";

export type IdeaActiveDraftPlanStateV1 = {
  schemaVersion: 1;
  planRef: string;
  updatedAt: string;
};

function moduleIdForIdea(ideaId: string): string {
  return `${ACTIVE_DRAFT_MODULE_PREFIX}${ideaId}`;
}

function parseActiveDraft(raw: string | null | undefined): IdeaActiveDraftPlanStateV1 | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Partial<IdeaActiveDraftPlanStateV1>;
    if (record.schemaVersion !== 1 || typeof record.planRef !== "string" || !record.planRef.trim()) {
      return null;
    }
    return record as IdeaActiveDraftPlanStateV1;
  } catch {
    return null;
  }
}

export function readActiveDraftPlanArtifact(db: Sqlite.Database, ideaId: string): string | undefined {
  const moduleId = moduleIdForIdea(ideaId);
  const prior = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleId) as { state_json: string } | undefined;
  const record = parseActiveDraft(prior?.state_json);
  return record?.planRef;
}

export function writeActiveDraftPlanArtifact(
  db: Sqlite.Database,
  ideaId: string,
  planRef: string,
  nowIso: string
): void {
  const moduleId = moduleIdForIdea(ideaId);
  const record: IdeaActiveDraftPlanStateV1 = {
    schemaVersion: 1,
    planRef,
    updatedAt: nowIso
  };
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version=excluded.state_schema_version,
       state_json=excluded.state_json,
       updated_at=excluded.updated_at`
  ).run(moduleId, 1, JSON.stringify(record), nowIso);
}

/** Link a persisted draft to its source idea without mutating accepted `linkedPlanArtifact`. */
export function linkActiveDraftPlanArtifactFromPersistedDraft(
  db: Sqlite.Database,
  artifact: PlanArtifactV1,
  nowIso: string
): { linked: boolean; ideaId?: string; planRef?: string } {
  const ideaId = typeof artifact.provenance?.sourceIdeaId === "string" ? artifact.provenance.sourceIdeaId.trim() : "";
  if (!ideaId || !isIdeaId(ideaId)) {
    return { linked: false };
  }
  const idea = getIdea(db, ideaId);
  if (!idea) {
    return { linked: false };
  }
  const planRef = artifact.planRef.trim();
  if (!planRef) {
    return { linked: false };
  }
  writeActiveDraftPlanArtifact(db, ideaId, planRef, nowIso);
  return { linked: true, ideaId, planRef };
}
