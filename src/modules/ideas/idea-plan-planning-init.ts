import type Database from "better-sqlite3";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import { readPlanArtifactVersion } from "../../core/planning/plan-artifact-storage.js";
import { enforceIdeaPlanStatusTransition, IdeaPlanStatusTransitionError } from "./idea-plan-status-machine.js";
import {
  readIdeaPlanArtifact,
  readIdeaPlanArtifactVersion,
  writeNextIdeaPlanArtifactVersion
} from "./idea-plan-artifact-storage.js";
import { loadIdeaPlanStateSchema } from "./idea-plan-state-schema-loader.js";
import type { IdeaPlanDocument, IdeaPlanPlanSection } from "./idea-plan-types.js";
import { getIdea, isIdeaId, updateIdea, type IdeaRecord } from "./idea-store.js";
import { readActiveDraftPlanArtifact } from "./idea-planning-metadata.js";

export type IdeaPlanPlanningPayload = Pick<
  PlanArtifactV1,
  | "identity"
  | "goals"
  | "nonGoals"
  | "userStories"
  | "valueAssessment"
  | "riskAssessment"
  | "technicalImpact"
  | "architecture"
  | "uiUxDirection"
  | "testingStrategy"
  | "implementationGuidance"
  | "whatNotToDo"
  | "assumptions"
  | "openQuestions"
  | "wbs"
  | "phaseRecommendations"
  | "taskGenerationPayloads"
  | "provenance"
>;

export type IdeaPlanDocumentWithPlanningPayload = IdeaPlanDocument & Partial<IdeaPlanPlanningPayload>;

export function buildInitialIdeaPlanPlanSection(idea: Pick<IdeaRecord, "title" | "note">): IdeaPlanPlanSection {
  const summary = typeof idea.note === "string" && idea.note.trim() ? idea.note.trim() : undefined;
  return {
    title: idea.title,
    summary: summary ?? "Author structured plan sections from planner-chat.",
    wbsRowCount: 0
  };
}

export function ensureIdeaPlanPlanningSection(
  document: IdeaPlanDocument,
  idea: Pick<IdeaRecord, "title" | "note">,
  workspacePath: string,
  nowIso: string
): IdeaPlanDocument {
  const planningDirective = loadIdeaPlanStateSchema("planning", workspacePath).agentDirective;
  const initial = buildInitialIdeaPlanPlanSection(idea);
  const plan: IdeaPlanPlanSection = document.plan?.title && document.plan?.summary
    ? {
        title: document.plan.title,
        summary: document.plan.summary,
        ...(document.plan.planningType ? { planningType: document.plan.planningType } : {}),
        wbsRowCount: document.plan.wbsRowCount ?? initial.wbsRowCount ?? 0
      }
    : {
        ...initial,
        ...(document.plan?.planningType ? { planningType: document.plan.planningType } : {})
      };

  let status = document.status;
  if (status !== "planning") {
    status = enforceIdeaPlanStatusTransition(document.status, "planning");
  }

  return {
    ...document,
    status,
    updatedAt: nowIso,
    agentDirective: planningDirective,
    plan
  };
}

export function mergePlanArtifactIntoIdeaPlanDocument(
  document: IdeaPlanDocument,
  artifact: PlanArtifactV1,
  workspacePath: string,
  nowIso: string
): IdeaPlanDocumentWithPlanningPayload {
  const planningDirective = loadIdeaPlanStateSchema("planning", workspacePath).agentDirective;
  const plan: IdeaPlanPlanSection = {
    title: artifact.identity.title,
    summary: artifact.identity.summary ?? document.plan?.summary ?? "Author structured plan sections from planner-chat.",
    planningType: artifact.identity.planningType,
    wbsRowCount: artifact.wbs.length
  };

  let status = document.status;
  if (status !== "planning") {
    try {
      status = enforceIdeaPlanStatusTransition(document.status, "planning");
    } catch (err) {
      if (!(err instanceof IdeaPlanStatusTransitionError)) {
        throw err;
      }
    }
  }

  return {
    ...document,
    status,
    updatedAt: nowIso,
    agentDirective: planningDirective,
    plan,
    identity: artifact.identity,
    goals: artifact.goals,
    nonGoals: artifact.nonGoals,
    ...(artifact.userStories ? { userStories: artifact.userStories } : {}),
    valueAssessment: artifact.valueAssessment,
    riskAssessment: artifact.riskAssessment,
    technicalImpact: artifact.technicalImpact,
    ...(artifact.architecture ? { architecture: artifact.architecture } : {}),
    ...(artifact.uiUxDirection ? { uiUxDirection: artifact.uiUxDirection } : {}),
    testingStrategy: artifact.testingStrategy,
    implementationGuidance: artifact.implementationGuidance,
    whatNotToDo: artifact.whatNotToDo,
    assumptions: artifact.assumptions,
    openQuestions: artifact.openQuestions,
    wbs: artifact.wbs,
    phaseRecommendations: artifact.phaseRecommendations,
    ...(artifact.taskGenerationPayloads ? { taskGenerationPayloads: artifact.taskGenerationPayloads } : {}),
    provenance: artifact.provenance
  };
}

export function resolveIdeaPlanRefForIdea(db: Database.Database, idea: IdeaRecord): string | undefined {
  return idea.linkedPlanArtifact ?? readActiveDraftPlanArtifact(db, idea.id);
}

export function resolveUnifiedIdeaPlanDraftTarget(
  workspacePath: string,
  db: Database.Database,
  artifact: PlanArtifactV1
): { planRef: string; document: IdeaPlanDocument } | null {
  const ideaId = typeof artifact.provenance?.sourceIdeaId === "string" ? artifact.provenance.sourceIdeaId.trim() : "";
  if (!ideaId || !isIdeaId(ideaId)) {
    return null;
  }
  const idea = getIdea(db, ideaId);
  if (!idea) {
    return null;
  }
  const planRef = resolveIdeaPlanRefForIdea(db, idea);
  if (!planRef) {
    return null;
  }
  const document = readIdeaPlanArtifact(workspacePath, planRef);
  if (!document) {
    return null;
  }
  return { planRef, document };
}

export function pinArtifactToUnifiedIdeaPlan(artifact: PlanArtifactV1, document: IdeaPlanDocument): PlanArtifactV1 {
  return {
    ...artifact,
    planId: document.planId,
    planRef: document.planRef
  };
}

export function synthesizePlanArtifactFromStoredDocument(
  workspacePath: string,
  planId: string,
  version: number,
  fallback: PlanArtifactV1
): PlanArtifactV1 {
  const storedPlanArtifact = readPlanArtifactVersion(workspacePath, planId, version);
  if (storedPlanArtifact) {
    return storedPlanArtifact;
  }
  const ideaPlan = readIdeaPlanArtifactVersion(workspacePath, planId, version);
  if (!ideaPlan) {
    return {
      ...fallback,
      planId,
      version,
      planRef: `plan-artifact:${planId}`
    };
  }
  const payload = ideaPlan as IdeaPlanDocumentWithPlanningPayload;
  if (!payload.identity || !Array.isArray(payload.goals) || !Array.isArray(payload.wbs) || !payload.provenance) {
    return {
      ...fallback,
      planId: ideaPlan.planId,
      version: ideaPlan.version,
      planRef: ideaPlan.planRef,
      status: "draft"
    };
  }
  return {
    schemaVersion: 1,
    planId: ideaPlan.planId,
    version: ideaPlan.version,
    planRef: ideaPlan.planRef,
    status: "draft",
    identity: payload.identity,
    goals: payload.goals,
    nonGoals: payload.nonGoals ?? [],
    ...(payload.userStories ? { userStories: payload.userStories } : {}),
    valueAssessment: payload.valueAssessment!,
    riskAssessment: payload.riskAssessment ?? [],
    technicalImpact: payload.technicalImpact!,
    ...(payload.architecture ? { architecture: payload.architecture } : {}),
    ...(payload.uiUxDirection ? { uiUxDirection: payload.uiUxDirection } : {}),
    testingStrategy: payload.testingStrategy!,
    implementationGuidance: payload.implementationGuidance ?? [],
    whatNotToDo: payload.whatNotToDo ?? [],
    assumptions: payload.assumptions ?? [],
    openQuestions: payload.openQuestions ?? [],
    wbs: payload.wbs,
    phaseRecommendations: payload.phaseRecommendations ?? [],
    ...(payload.taskGenerationPayloads ? { taskGenerationPayloads: payload.taskGenerationPayloads } : {}),
    provenance: payload.provenance
  };
}

export type InitializeIdeaPlanPlanningSectionResult = {
  idea: IdeaRecord;
  ideaPlan?: IdeaPlanDocument;
  planRef?: string;
};

/** Initialize or refresh the unified document plan section when starting idea planning. */
export function initializeIdeaPlanPlanningSectionForStart(
  workspacePath: string,
  db: Database.Database,
  idea: IdeaRecord,
  nowIso: string
): InitializeIdeaPlanPlanningSectionResult {
  const planRef = resolveIdeaPlanRefForIdea(db, idea);
  if (!planRef) {
    return { idea };
  }

  const existing = readIdeaPlanArtifact(workspacePath, planRef);
  if (!existing) {
    return { idea };
  }

  let updatedIdea = idea;
  try {
    const nextDocument = ensureIdeaPlanPlanningSection(existing, idea, workspacePath, nowIso);
    const unchanged =
      nextDocument.status === existing.status &&
      nextDocument.plan?.title === existing.plan?.title &&
      nextDocument.plan?.summary === existing.plan?.summary &&
      nextDocument.plan?.wbsRowCount === existing.plan?.wbsRowCount;
    const persisted = unchanged ? existing : writeNextIdeaPlanArtifactVersion(workspacePath, nextDocument, { sqliteDb: db });

    if (!idea.linkedPlanArtifact) {
      const linked = updateIdea(db, idea.id, { linkedPlanArtifact: persisted.planRef }, nowIso);
      if (linked) {
        updatedIdea = linked;
      }
    }

    return {
      idea: updatedIdea,
      ideaPlan: persisted,
      planRef: persisted.planRef
    };
  } catch {
    return { idea };
  }
}
