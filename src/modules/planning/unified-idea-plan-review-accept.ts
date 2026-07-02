import type Database from "better-sqlite3";
import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import type { PlanArtifactReviewRecordV1 } from "../../core/planning/plan-artifact-review-record.js";
import type { ReviewPlanArtifactResult } from "../../core/planning/review-plan-artifact.js";
import {
  applyLatestReviewToPlanArtifactIndex,
  getPlanArtifactStoragePaths,
  readPlanArtifactIndex,
  resolveLatestPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import {
  isIdeaPlanDocument,
  readIdeaPlanArtifactVersion,
  writeNextIdeaPlanArtifactVersion
} from "../ideas/idea-plan-artifact-storage.js";
import {
  enforceIdeaPlanStatusTransition,
  IdeaPlanStatusTransitionError
} from "../ideas/idea-plan-status-machine.js";
import {
  type IdeaPlanDocumentWithPlanningPayload,
  synthesizePlanArtifactFromStoredDocument
} from "../ideas/idea-plan-planning-init.js";
import { loadIdeaPlanStateSchema } from "../ideas/idea-plan-state-schema-loader.js";
import type { IdeaPlanDocument, IdeaPlanReviewSection } from "../ideas/idea-plan-types.js";
import { buildPlanArtifactReviewRecord } from "../../core/planning/plan-artifact-review-record.js";

export type ResolvedStoredPlanArtifact =
  | { kind: "plan-artifact"; artifact: PlanArtifactV1 }
  | { kind: "idea-plan"; document: IdeaPlanDocumentWithPlanningPayload; artifact: PlanArtifactV1 };

export function readStoredPlanArtifactVersion(
  workspacePath: string,
  planId: string,
  version: number,
  fallback: PlanArtifactV1
): ResolvedStoredPlanArtifact | null {
  const synthesized = synthesizePlanArtifactFromStoredDocument(workspacePath, planId, version, fallback);
  const ideaPlan = readIdeaPlanArtifactVersion(workspacePath, planId, version);
  if (ideaPlan) {
    return {
      kind: "idea-plan",
      document: ideaPlan as IdeaPlanDocumentWithPlanningPayload,
      artifact: synthesized
    };
  }
  if (synthesized.schemaVersion === 1 && synthesized.identity) {
    return { kind: "plan-artifact", artifact: synthesized };
  }
  return null;
}

export function readLatestStoredPlanArtifact(
  workspacePath: string,
  planId: string,
  fallback: PlanArtifactV1
): (ResolvedStoredPlanArtifact & { version: number }) | null {
  const version = resolveLatestPlanArtifactVersion(workspacePath, planId);
  if (version === null) {
    return null;
  }
  const resolved = readStoredPlanArtifactVersion(workspacePath, planId, version, fallback);
  if (!resolved) {
    return null;
  }
  return { ...resolved, version };
}

export function ideaPlanStatusInvalidResult(
  code: "idea-plan-status-invalid",
  message: string,
  planId: string,
  status: string,
  expectedStatus?: string
): ModuleCommandResult {
  return {
    ok: false,
    code,
    message,
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId,
      status,
      ...(expectedStatus ? { expectedStatus } : {})
    }
  };
}

export function buildIdeaPlanReviewSection(
  review: ReviewPlanArtifactResult,
  reviewedAt: string
): IdeaPlanReviewSection {
  return {
    passed: review.passed,
    blockerCount: review.blockers.length,
    warningCount: review.warnings.length,
    openQuestionCount: review.openQuestionCount,
    reviewedAt
  };
}

export function buildUnifiedIdeaPlanReviewRecord(
  document: IdeaPlanDocument,
  artifact: PlanArtifactV1,
  review: ReviewPlanArtifactResult,
  reviewedAt: string
): PlanArtifactReviewRecordV1 {
  return buildPlanArtifactReviewRecord({
    artifact: { ...artifact, planId: document.planId, version: document.version, planRef: document.planRef },
    result: review,
    reviewedAt
  });
}

export function persistUnifiedIdeaPlanReview(args: {
  workspacePath: string;
  document: IdeaPlanDocumentWithPlanningPayload;
  review: ReviewPlanArtifactResult;
  reviewedAt: string;
  sqliteDb: Database.Database;
  artifactForReview: PlanArtifactV1;
}): { document: IdeaPlanDocument; reviewRecord: PlanArtifactReviewRecordV1 } {
  const { workspacePath, document, review, reviewedAt, sqliteDb, artifactForReview } = args;
  if (document.status !== "planning") {
    throw new IdeaPlanStatusTransitionError(document.status, "reviewed");
  }
  const nextStatus = enforceIdeaPlanStatusTransition(document.status, "reviewed");
  const reviewedDirective = loadIdeaPlanStateSchema("reviewed", workspacePath).agentDirective;
  const updated: IdeaPlanDocumentWithPlanningPayload = {
    ...document,
    status: nextStatus,
    updatedAt: reviewedAt,
    agentDirective: reviewedDirective,
    review: buildIdeaPlanReviewSection(review, reviewedAt)
  };
  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, updated, { sqliteDb });
  const reviewRecord = buildUnifiedIdeaPlanReviewRecord(
    persisted,
    {
      ...artifactForReview,
      planId: persisted.planId,
      version: persisted.version,
      planRef: persisted.planRef,
      status: "reviewed"
    },
    review,
    reviewedAt
  );
  applyLatestReviewToPlanArtifactIndex(sqliteDb, persisted.planId, reviewRecord);
  return { document: persisted, reviewRecord };
}

export function resolveUnifiedIdeaPlanReviewGate(
  document: IdeaPlanDocument,
  workspacePath: string,
  planId: string,
  effectiveConfig?: Record<string, unknown>
): { ok: true; reviewRecord: PlanArtifactReviewRecordV1 } | { ok: false; result: ModuleCommandResult } {
  if (document.status !== "reviewed") {
    return {
      ok: false,
      result: ideaPlanStatusInvalidResult(
        "idea-plan-status-invalid",
        `accept-plan-artifact requires unified document status reviewed (current: ${document.status})`,
        planId,
        document.status,
        "reviewed"
      )
    };
  }

  const reviewSection = document.review;
  if (!reviewSection?.reviewedAt) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "plan-artifact-accept-blocked",
        message: "Accept blocked: unified document is missing review section metadata",
        data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: document.version }
      }
    };
  }

  const indexReview = readPlanArtifactIndex(workspacePath, planId, effectiveConfig)?.latestReview;
  const reviewRecord =
    indexReview && indexReview.reviewedVersion === document.version
      ? indexReview
      : buildPlanArtifactReviewRecord({
          artifact: {
            schemaVersion: 1,
            planId: document.planId,
            version: document.version,
            planRef: document.planRef,
            status: "reviewed",
            identity: {
              title: document.plan?.title ?? "Idea plan",
              planningType: (document.plan?.planningType as PlanArtifactV1["identity"]["planningType"]) ?? "new-feature"
            },
            goals: [],
            nonGoals: [],
            valueAssessment: { impact: "", confidence: "medium" },
            riskAssessment: [],
            technicalImpact: { systemsTouched: [] },
            testingStrategy: { layers: [], criticalPaths: [] },
            implementationGuidance: [],
            whatNotToDo: [],
            assumptions: [],
            openQuestions: [],
            wbs: [],
            phaseRecommendations: [],
            provenance: {
              createdAt: document.createdAt,
              updatedAt: document.updatedAt,
              createdBy: "agent",
              source: "draft-plan-artifact"
            }
          },
          result: {
            passed: reviewSection.passed === true,
            profile: "minimal",
            blockers: [],
            warnings: [],
            coverageMap: {
              goals: { covered: [], uncovered: [] },
              userStories: { covered: [], uncovered: [] },
              slices: {
                architecture: "not-applicable",
                uiUx: "not-applicable",
                testing: "not-applicable",
                rolloutDocsMigration: "not-applicable"
              }
            },
            sizingFindings: [],
            openQuestionCount: reviewSection.openQuestionCount ?? 0
          },
          reviewedAt: reviewSection.reviewedAt
        });

  if (!reviewRecord.passed || reviewRecord.blockerCount > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "plan-artifact-accept-blocked",
        message: "Accept blocked: reviewed unified document has blockers",
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId,
          version: document.version,
          blockerCount: reviewRecord.blockerCount,
          warningCount: reviewRecord.warningCount,
          reviewSummary: reviewRecord.reviewSummary
        }
      }
    };
  }

  return { ok: true, reviewRecord };
}

export function persistUnifiedIdeaPlanAccept(args: {
  workspacePath: string;
  document: IdeaPlanDocumentWithPlanningPayload;
  approvedAt: string;
  approvedBy: string;
  approvedVersion: number;
  sqliteDb: Database.Database;
}): IdeaPlanDocument {
  const { workspacePath, document, approvedAt, approvedBy, approvedVersion, sqliteDb } = args;
  if (document.status !== "reviewed") {
    throw new IdeaPlanStatusTransitionError(document.status, "accepted");
  }
  const nextStatus = enforceIdeaPlanStatusTransition(document.status, "accepted");
  const acceptedDirective = loadIdeaPlanStateSchema("accepted", workspacePath).agentDirective;
  const updated: IdeaPlanDocumentWithPlanningPayload = {
    ...document,
    status: nextStatus,
    updatedAt: approvedAt,
    agentDirective: acceptedDirective,
    acceptance: {
      acceptedAt: approvedAt,
      acceptedBy: approvedBy,
      acceptedVersion: approvedVersion
    }
  };
  return writeNextIdeaPlanArtifactVersion(workspacePath, updated, { sqliteDb });
}

export function isUnifiedIdeaPlanStoredDocument(
  workspacePath: string,
  planId: string,
  version: number
): boolean {
  const ideaPlan = readIdeaPlanArtifactVersion(workspacePath, planId, version);
  return ideaPlan !== null && isIdeaPlanDocument(ideaPlan);
}

export function unifiedIdeaPlanStoragePath(workspacePath: string, planId: string, version: number): string {
  return getPlanArtifactStoragePaths(workspacePath, planId).artifactFileRelative(version);
}
