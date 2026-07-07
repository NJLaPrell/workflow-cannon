import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";
import {
  getPlanArtifactStoragePaths,
  PLAN_ARTIFACT_ROOT_REL,
  resolveLatestPlanArtifactVersion,
  type PlanArtifactIndexStateV1,
  upsertPlanArtifactIndexOnDatabase
} from "../../core/planning/plan-artifact-storage.js";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import { parsePlanIdFromPlanArtifactRef } from "../task-engine/plan-artifact-execute-policy.js";
import {
  IDEA_PLAN_DOCUMENT_SCHEMA_VERSION,
  type IdeaPlanDocument,
  type IdeaPlanStatus,
  isIdeaPlanStatus
} from "./idea-plan-types.js";
import type { IdeaPlanDocumentWithPlanningPayload } from "./idea-plan-planning-init.js";

export type WriteIdeaPlanArtifactOptions = {
  sqliteDb?: Database.Database;
};

function mapIdeaPlanStatusToPlanArtifactIndexStatus(
  status: IdeaPlanStatus
): PlanArtifactIndexStateV1["status"] {
  if (status === "reviewed") {
    return "reviewed";
  }
  if (status === "accepted" || status === "delivered") {
    return status === "delivered" ? "finalized" : "accepted";
  }
  return "draft";
}

function readPlanArtifactIndexFromDatabase(
  db: Database.Database,
  moduleId: string
): PlanArtifactIndexStateV1 | null {
  const row = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleId) as { state_json: string } | undefined;
  if (!row?.state_json) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.state_json) as PlanArtifactIndexStateV1;
    if (parsed.schemaVersion !== 1 || typeof parsed.planId !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildIdeaPlanArtifactIndex(
  document: IdeaPlanDocument | IdeaPlanDocumentWithPlanningPayload,
  planArtifact?: PlanArtifactV1 | null,
  prior?: PlanArtifactIndexStateV1 | null
): PlanArtifactIndexStateV1 {
  const payload = document as IdeaPlanDocumentWithPlanningPayload;
  return {
    schemaVersion: 1,
    planId: document.planId,
    currentVersion: document.version,
    planRef: document.planRef,
    status: mapIdeaPlanStatusToPlanArtifactIndexStatus(document.status),
    title: document.plan?.title ?? planArtifact?.identity.title ?? "Idea plan",
    planningType: document.plan?.planningType ?? planArtifact?.identity.planningType ?? "new-feature",
    updatedAt: document.updatedAt,
    wbsRowCount: payload.wbs?.length ?? planArtifact?.wbs.length ?? document.plan?.wbsRowCount ?? 0,
    openQuestionCount: payload.openQuestions?.length ?? planArtifact?.openQuestions.length ?? 0,
    ...(prior?.latestReview ? { latestReview: prior.latestReview } : {})
  };
}

/** Keep dashboard plan index rows aligned with unified IdeaPlan artifact writes. */
export function upsertIdeaPlanArtifactIndexFromDocument(
  db: Database.Database,
  document: IdeaPlanDocument | IdeaPlanDocumentWithPlanningPayload,
  planArtifact?: PlanArtifactV1 | null
): void {
  const paths = getPlanArtifactStoragePaths("", document.planId);
  const prior = readPlanArtifactIndexFromDatabase(db, paths.moduleId);
  const index = buildIdeaPlanArtifactIndex(document, planArtifact ?? null, prior);
  upsertPlanArtifactIndexOnDatabase(db, paths.moduleId, index);
}

/** Rebuild plan-artifact index rows from on-disk unified IdeaPlan documents. */
export function reconcileIdeaPlanArtifactIndexes(
  workspacePath: string,
  db: Database.Database
): { reconciled: number } {
  let reconciled = 0;
  for (const document of listIdeaPlanArtifacts(workspacePath)) {
    upsertIdeaPlanArtifactIndexFromDocument(db, document);
    reconciled += 1;
  }
  return { reconciled };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseIdeaPlanPlanId(planRef: string): string | null {
  return parsePlanIdFromPlanArtifactRef(planRef.trim());
}

export function isIdeaPlanDocument(value: unknown): value is IdeaPlanDocument {
  if (!isRecord(value)) {
    return false;
  }
  if (value.schemaVersion !== IDEA_PLAN_DOCUMENT_SCHEMA_VERSION) {
    return false;
  }
  if (typeof value.planId !== "string" || !value.planId.trim()) {
    return false;
  }
  if (typeof value.status !== "string" || !isIdeaPlanStatus(value.status)) {
    return false;
  }
  if (typeof value.ideaId !== "string" || !/^I[0-9]+$/.test(value.ideaId)) {
    return false;
  }
  return true;
}

export function readIdeaPlanArtifactVersion(
  workspacePath: string,
  planId: string,
  version: number
): IdeaPlanDocument | null {
  const paths = getPlanArtifactStoragePaths(workspacePath, planId);
  const file = paths.artifactFileAbsolute(version);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return isIdeaPlanDocument(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readIdeaPlanArtifact(workspacePath: string, planRef: string): IdeaPlanDocument | null {
  const planId = parseIdeaPlanPlanId(planRef);
  if (!planId) {
    return null;
  }
  const version = resolveLatestPlanArtifactVersion(workspacePath, planId);
  if (version === null) {
    return null;
  }
  return readIdeaPlanArtifactVersion(workspacePath, planId, version);
}

function ideaPlanRecoveryRank(status: IdeaPlanStatus): number {
  switch (status) {
    case "idea":
      return 0;
    case "brainstorming":
      return 1;
    case "planning":
      return 2;
    case "reviewed":
      return 3;
    case "accepted":
      return 4;
    case "delivered":
      return 5;
  }
}

export function listIdeaPlanArtifacts(workspacePath: string): IdeaPlanDocument[] {
  const root = path.resolve(workspacePath, PLAN_ARTIFACT_ROOT_REL);
  if (!fs.existsSync(root)) {
    return [];
  }
  const documents: IdeaPlanDocument[] = [];
  for (const planId of fs.readdirSync(root)) {
    const version = resolveLatestPlanArtifactVersion(workspacePath, planId);
    if (version === null) {
      continue;
    }
    const document = readIdeaPlanArtifactVersion(workspacePath, planId, version);
    if (document) {
      documents.push(document);
    }
  }
  documents.sort((a, b) => {
    const rank = ideaPlanRecoveryRank(b.status) - ideaPlanRecoveryRank(a.status);
    if (rank !== 0) {
      return rank;
    }
    const updated = b.updatedAt.localeCompare(a.updatedAt);
    return updated !== 0 ? updated : b.version - a.version;
  });
  return documents;
}

export function listIdeaPlanArtifactsForIdea(workspacePath: string, ideaId: string): IdeaPlanDocument[] {
  return listIdeaPlanArtifacts(workspacePath).filter((document) => document.ideaId === ideaId);
}

export function writeIdeaPlanArtifactVersion(
  workspacePath: string,
  document: IdeaPlanDocument,
  options?: WriteIdeaPlanArtifactOptions
): IdeaPlanDocument {
  const paths = getPlanArtifactStoragePaths(workspacePath, document.planId);
  fs.mkdirSync(paths.planDirAbsolute, { recursive: true });
  const target = paths.artifactFileAbsolute(document.version);
  const temp = `${target}.tmp`;
  const payload = `${JSON.stringify(document, null, 2)}\n`;
  fs.writeFileSync(temp, payload, "utf8");
  fs.renameSync(temp, target);
  if (options?.sqliteDb) {
    upsertIdeaPlanArtifactIndexFromDocument(options.sqliteDb, document);
  }
  return document;
}

export function writeNextIdeaPlanArtifactVersion(
  workspacePath: string,
  document: IdeaPlanDocument,
  options?: WriteIdeaPlanArtifactOptions
): IdeaPlanDocument {
  const latest = resolveLatestPlanArtifactVersion(workspacePath, document.planId);
  const version = latest === null ? 1 : latest + 1;
  const next: IdeaPlanDocument = {
    ...document,
    version
  };
  return writeIdeaPlanArtifactVersion(workspacePath, next, options);
}

export function withIdeaPlanStatus(
  document: IdeaPlanDocument,
  status: IdeaPlanStatus,
  updatedAt: string
): IdeaPlanDocument {
  return {
    ...document,
    status,
    updatedAt
  };
}
