import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";
import {
  getPlanArtifactStoragePaths,
  readPlanArtifactIndex,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion
} from "../../../core/planning/plan-artifact-storage.js";
import type { PlanArtifactReviewRecordV1 } from "../../../core/planning/plan-artifact-review-record.js";
import { isPlanArtifactV1, type PlanArtifactV1 } from "../../../core/planning/plan-artifact-v1.js";
import { parsePlanIdFromPlanArtifactRef } from "../../task-engine/plan-artifact-execute-policy.js";
import {
  buildIdeaPlanReviewSection
} from "../idea-plan/unified-idea-plan-review-accept.js";
import { reviewPlanArtifact } from "../../../core/planning/review-plan-artifact.js";
import {
  isIdeaPlanDocument,
  readIdeaPlanArtifact,
  writeIdeaPlanArtifactVersion,
  writeNextIdeaPlanArtifactVersion
} from "../idea-plan/idea-plan-artifact-storage.js";
import {
  mergePlanArtifactIntoIdeaPlanDocument,
  type IdeaPlanDocumentWithPlanningPayload
} from "../idea-plan/idea-plan-planning-init.js";
import { upsertIdeaPlanArtifactIndexFromDocument } from "../idea-plan/idea-plan-artifact-storage.js";
import { loadIdeaPlanStateSchema } from "../idea-plan/idea-plan-state-schema-loader.js";
import { requireIdeaPlanAgentDirective } from "../idea-plan/idea-plan-state-schema-guard.js";
import type {
  IdeaPlanAcceptanceSection,
  IdeaPlanDeliverySection,
  IdeaPlanDocument,
  IdeaPlanReviewSection,
  IdeaPlanStatus
} from "../idea-plan/idea-plan-types.js";
import { normalizeIdeaPlanStatus } from "../idea-plan/idea-plan-types.js";
import {
  deriveIdeaPlanningLifecycleState,
  type IdeaPlanningLifecycleState
} from "../../ideas/derive-idea-planning-lifecycle-state.js";
import {
  clearActiveDraftPlanArtifact,
  readActiveDraftPlanArtifact
} from "../../ideas/idea-planning-metadata.js";
import { getPlanningChatSession } from "../../ideas/planning-chat-session.js";
import { listIdeas, updateIdea, type IdeaRecord } from "./idea-store.js";

export type MigrateIdeaOutcomeAction =
  | "already-unified"
  | "created"
  | "merged"
  | "skipped";

export type MigrateIdeaOutcome = {
  ideaId: string;
  action: MigrateIdeaOutcomeAction;
  planRef?: string;
  planId?: string;
  status?: IdeaPlanStatus;
  reason?: string;
};

export type MigrateIdeasToUnifiedDocumentResult = {
  schemaVersion: 1;
  dryRun: boolean;
  snapshotPath?: string;
  ideaCount: number;
  outcomes: MigrateIdeaOutcome[];
  errors: string[];
  dataLossReported: boolean;
};

const MIGRATION_BACKUP_ROOT = path.join(".workspace-kit", "migration-backups");

export function mapLifecycleToUnifiedStatus(lifecycle: IdeaPlanningLifecycleState): IdeaPlanStatus {
  switch (lifecycle) {
    case "open":
      return "idea";
    case "planning":
    case "draft_ready":
    case "needs_revision":
      return "planning";
    case "approval_ready":
      return "reviewed";
    case "accepted":
      return "accepted";
    case "finalized":
      return "delivered";
    case "superseded":
      return "idea";
    default:
      return "idea";
  }
}

export function resolveMigrationPlanRef(db: Database.Database, idea: IdeaRecord): string | undefined {
  return idea.linkedPlanArtifact ?? readActiveDraftPlanArtifact(db, idea.id);
}

export function resolveUnifiedStatusForMigration(
  idea: IdeaRecord,
  planArtifact: PlanArtifactV1 | null,
  latestReview: PlanArtifactReviewRecordV1 | null,
  lifecycle: IdeaPlanningLifecycleState
): IdeaPlanStatus {
  if (planArtifact) {
    const artifactStatus = planArtifact.status;
    if (artifactStatus === "finalized") {
      return "delivered";
    }
    if (artifactStatus === "accepted") {
      return "accepted";
    }
    if (artifactStatus === "reviewed") {
      return "reviewed";
    }
    if (artifactStatus === "draft") {
      return lifecycle === "approval_ready" ? "reviewed" : "planning";
    }
  }
  const fromLifecycle = mapLifecycleToUnifiedStatus(lifecycle);
  const fromIdea = normalizeIdeaPlanStatus(idea.status);
  if (fromLifecycle !== "idea") {
    return fromLifecycle;
  }
  return fromIdea ?? "idea";
}

function buildReviewSection(
  review: PlanArtifactReviewRecordV1 | null,
  artifact: PlanArtifactV1 | null
): IdeaPlanReviewSection | undefined {
  if (review) {
    return {
      passed: review.passed,
      blockerCount: review.blockerCount,
      openQuestionCount: review.openQuestionCount,
      warningCount: review.warningCount,
      reviewedAt: review.reviewedAt
    };
  }
  if (!artifact || artifact.status !== "reviewed") {
    return undefined;
  }
  const rubric = reviewPlanArtifact(artifact);
  return buildIdeaPlanReviewSection(rubric, artifact.provenance.updatedAt);
}

function buildAcceptanceSection(
  artifact: PlanArtifactV1 | null,
  status: IdeaPlanStatus,
  version: number,
  nowIso: string
): IdeaPlanAcceptanceSection | undefined {
  if (status !== "accepted" && status !== "delivered") {
    return undefined;
  }
  const acceptedAt = artifact?.approvalRecord?.approvedAt ?? artifact?.provenance.updatedAt ?? nowIso;
  const acceptedBy = artifact?.approvalRecord?.approvedBy;
  return {
    acceptedAt,
    ...(acceptedBy ? { acceptedBy } : {}),
    acceptedVersion: version
  };
}

function buildDeliverySection(
  artifact: PlanArtifactV1 | null,
  status: IdeaPlanStatus,
  nowIso: string
): IdeaPlanDeliverySection | undefined {
  if (status !== "delivered") {
    return undefined;
  }
  const taskRefs = artifact?.executionLinkages
    ?.map((link) => link.taskId)
    .filter((taskId): taskId is string => typeof taskId === "string" && taskId.trim().length > 0);
  return {
    deliveredAt: artifact?.provenance.updatedAt ?? nowIso,
    ...(taskRefs && taskRefs.length > 0 ? { taskRefs, taskCount: taskRefs.length } : {})
  };
}

export function buildIdeaOnlyUnifiedDocument(
  idea: IdeaRecord,
  workspacePath: string,
  nowIso: string,
  planId = crypto.randomUUID()
): IdeaPlanDocument {
  const agentDirective = requireIdeaPlanAgentDirective(loadIdeaPlanStateSchema("idea", workspacePath));
  return {
    schemaVersion: 1,
    planId,
    version: 1,
    planRef: `plan-artifact:${planId}`,
    status: "idea",
    ideaId: idea.id,
    createdAt: idea.createdAt,
    updatedAt: nowIso,
    agentDirective
  };
}

/** Create and link a unified IdeaPlan document when create-idea did not supply planRef. */
export function createUnifiedIdeaPlanDocumentForIdea(
  workspacePath: string,
  db: Database.Database,
  idea: IdeaRecord,
  nowIso: string
): { idea: IdeaRecord; document: IdeaPlanDocument } {
  const document = buildIdeaOnlyUnifiedDocument(idea, workspacePath, nowIso);
  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, document, { sqliteDb: db });
  const updated = updateIdea(db, idea.id, { linkedPlanArtifact: persisted.planRef }, nowIso);
  return { idea: updated ?? idea, document: persisted };
}

export function buildUnifiedDocumentFromLegacy(
  idea: IdeaRecord,
  planRef: string,
  workspacePath: string,
  db: Database.Database,
  nowIso: string
): { document: IdeaPlanDocumentWithPlanningPayload; mergedFromPlanArtifact: boolean } | null {
  const planId = parsePlanIdFromPlanArtifactRef(planRef);
  if (!planId) {
    return null;
  }

  const version = resolveLatestPlanArtifactVersion(workspacePath, planId);
  if (version === null) {
    return null;
  }

  const paths = getPlanArtifactStoragePaths(workspacePath, planId);
  const file = paths.artifactFileAbsolute(version);
  if (!fs.existsSync(file)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (isIdeaPlanDocument(raw)) {
    return { document: raw, mergedFromPlanArtifact: false };
  }

  if (!isPlanArtifactV1(raw)) {
    return null;
  }

  const planArtifact = raw;
  const index = readPlanArtifactIndex(workspacePath, planId);
  const planningChatSession = getPlanningChatSession(db, idea.id);
  const lifecycle = deriveIdeaPlanningLifecycleState({
    idea,
    planningChatSession,
    linkedPlanArtifact: idea.linkedPlanArtifact ?? index ?? planRef,
    activeDraftPlanArtifact: readActiveDraftPlanArtifact(db, idea.id) ?? planRef,
    latestReview: index?.latestReview ?? null
  });
  const status = resolveUnifiedStatusForMigration(idea, planArtifact, index?.latestReview ?? null, lifecycle);
  const agentDirective = requireIdeaPlanAgentDirective(loadIdeaPlanStateSchema(status, workspacePath));

  const base: IdeaPlanDocument = {
    schemaVersion: 1,
    planId,
    version,
    planRef: planArtifact.planRef,
    status,
    ideaId: idea.id,
    createdAt: planArtifact.provenance.createdAt ?? idea.createdAt,
    updatedAt: nowIso,
    agentDirective
  };

  let document = mergePlanArtifactIntoIdeaPlanDocument(base, planArtifact, workspacePath, nowIso);
  document = {
    ...document,
    status,
    version,
    agentDirective,
    review: buildReviewSection(index?.latestReview ?? null, planArtifact),
    acceptance: buildAcceptanceSection(planArtifact, status, version, nowIso),
    delivery: buildDeliverySection(planArtifact, status, nowIso)
  };

  return { document, mergedFromPlanArtifact: true };
}

function upsertUnifiedPlanIndex(
  db: Database.Database,
  document: IdeaPlanDocumentWithPlanningPayload,
  planArtifact: PlanArtifactV1 | null
): void {
  upsertIdeaPlanArtifactIndexFromDocument(db, document, planArtifact);
}

function copyIfExists(source: string, target: string): boolean {
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  return true;
}

export function createMigrationSnapshotWithDb(
  workspacePath: string,
  db: Database.Database,
  nowIso: string
): string {
  const stamp = nowIso.replace(/[:.]/g, "-");
  const snapshotDir = path.resolve(workspacePath, MIGRATION_BACKUP_ROOT, stamp);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const dbRel = path.join(".workspace-kit", "tasks", "workspace-kit.db");
  const dbAbs = path.resolve(workspacePath, dbRel);
  const planningAbs = path.resolve(workspacePath, ".workspace-kit", "planning");

  const copied: string[] = [];
  if (copyIfExists(dbAbs, path.join(snapshotDir, dbRel))) {
    copied.push(dbRel);
  }
  if (copyIfExists(planningAbs, path.join(snapshotDir, ".workspace-kit", "planning"))) {
    copied.push(".workspace-kit/planning");
  }

  const ideas = listIdeas(db);
  fs.writeFileSync(
    path.join(snapshotDir, "ideas-export.json"),
    `${JSON.stringify({ exportedAt: nowIso, ideas }, null, 2)}\n`,
    "utf8"
  );
  copied.push("ideas-export.json");

  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, createdAt: nowIso, copiedPaths: copied }, null, 2)}\n`,
    "utf8"
  );

  return path.relative(workspacePath, snapshotDir);
}

export function migrateIdeasToUnifiedDocument(args: {
  workspacePath: string;
  db: Database.Database;
  dryRun: boolean;
  nowIso?: string;
}): MigrateIdeasToUnifiedDocumentResult {
  const { workspacePath, db, dryRun } = args;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const ideas = listIdeas(db);
  const outcomes: MigrateIdeaOutcome[] = [];
  const errors: string[] = [];
  let dataLossReported = false;
  let snapshotPath: string | undefined;

  if (!dryRun) {
    snapshotPath = createMigrationSnapshotWithDb(workspacePath, db, nowIso);
  }

  for (const idea of ideas) {
    const planRef = resolveMigrationPlanRef(db, idea);
    if (planRef) {
      const existingUnified = readIdeaPlanArtifact(workspacePath, planRef);
      if (existingUnified && existingUnified.ideaId === idea.id) {
        outcomes.push({
          ideaId: idea.id,
          action: "already-unified",
          planRef: existingUnified.planRef,
          planId: existingUnified.planId,
          status: existingUnified.status
        });
        if (!dryRun && idea.linkedPlanArtifact !== existingUnified.planRef) {
          updateIdea(db, idea.id, { linkedPlanArtifact: existingUnified.planRef }, nowIso);
        }
        continue;
      }

      const built = buildUnifiedDocumentFromLegacy(idea, planRef, workspacePath, db, nowIso);
      if (!built) {
        dataLossReported = true;
        errors.push(`Idea ${idea.id}: failed to read legacy plan artifact at ${planRef}`);
        outcomes.push({
          ideaId: idea.id,
          action: "skipped",
          reason: `unreadable plan artifact ${planRef}`
        });
        continue;
      }

      if (!built.mergedFromPlanArtifact) {
        outcomes.push({
          ideaId: idea.id,
          action: "already-unified",
          planRef: built.document.planRef,
          planId: built.document.planId,
          status: built.document.status
        });
        continue;
      }

      const planArtifact = readPlanArtifactVersion(workspacePath, built.document.planId, built.document.version);
      outcomes.push({
        ideaId: idea.id,
        action: "merged",
        planRef: built.document.planRef,
        planId: built.document.planId,
        status: built.document.status
      });

      if (!dryRun) {
        writeIdeaPlanArtifactVersion(workspacePath, built.document, { sqliteDb: db });
        upsertUnifiedPlanIndex(db, built.document, planArtifact);
        updateIdea(db, idea.id, { linkedPlanArtifact: built.document.planRef }, nowIso);
        if (readActiveDraftPlanArtifact(db, idea.id) === planRef) {
          clearActiveDraftPlanArtifact(db, idea.id);
        }
      }
      continue;
    }

    const document = buildIdeaOnlyUnifiedDocument(idea, workspacePath, nowIso);
    outcomes.push({
      ideaId: idea.id,
      action: "created",
      planRef: document.planRef,
      planId: document.planId,
      status: document.status
    });

    if (!dryRun) {
      writeIdeaPlanArtifactVersion(workspacePath, document, { sqliteDb: db });
      upsertUnifiedPlanIndex(db, document, null);
      updateIdea(db, idea.id, { linkedPlanArtifact: document.planRef }, nowIso);
    }
  }

  return {
    schemaVersion: 1,
    dryRun,
    snapshotPath,
    ideaCount: ideas.length,
    outcomes,
    errors,
    dataLossReported
  };
}
