import fs from "node:fs";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { persistModuleStateRow } from "../state/module-state-sidecar-migration.js";
import { UnifiedStateDb } from "../state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import {
  isPlanArtifactV1,
  type PlanArtifactStatus,
  type PlanArtifactV1
} from "./plan-artifact-v1.js";

/**
 * Canonical PlanArtifact JSON files (gitignored workspace data):
 *   `.workspace-kit/planning/plan-artifacts/{planId}/artifact.v{version}.json`
 *
 * Fast dashboard / list pointer in planning SQLite module-state:
 *   module id `planning-plan-artifact:{planId}` → {@link PlanArtifactIndexStateV1}
 */
export const PLAN_ARTIFACT_ROOT_REL = path.join(".workspace-kit", "planning", "plan-artifacts");

export const PLAN_ARTIFACT_MODULE_ID_PREFIX = "planning-plan-artifact:";

const INDEX_STATE_SCHEMA = 1;

/** Redacted summary index; full WBS lives in the JSON file only. */
export type PlanArtifactIndexStateV1 = {
  schemaVersion: 1;
  planId: string;
  currentVersion: number;
  planRef: string;
  status: PlanArtifactStatus;
  title: string;
  planningType: string;
  updatedAt: string;
  wbsRowCount: number;
  openQuestionCount: number;
};

export type PlanArtifactStoragePaths = {
  rootRelative: string;
  rootAbsolute: string;
  planDirRelative: string;
  planDirAbsolute: string;
  artifactFileRelative: (version: number) => string;
  artifactFileAbsolute: (version: number) => string;
  moduleId: string;
};

function dbRelativePath(workspacePath: string, effectiveConfig?: Record<string, unknown>): string {
  return planningSqliteDatabaseRelativePath({
    workspacePath,
    effectiveConfig
  } as ModuleLifecycleContext);
}

export function planArtifactModuleId(planId: string): string {
  return `${PLAN_ARTIFACT_MODULE_ID_PREFIX}${planId}`;
}

export function getPlanArtifactStoragePaths(workspacePath: string, planId: string): PlanArtifactStoragePaths {
  const planDirRelative = path.join(PLAN_ARTIFACT_ROOT_REL, planId);
  const rootAbsolute = path.resolve(workspacePath, PLAN_ARTIFACT_ROOT_REL);
  const planDirAbsolute = path.resolve(workspacePath, planDirRelative);
  return {
    rootRelative: PLAN_ARTIFACT_ROOT_REL,
    rootAbsolute,
    planDirRelative,
    planDirAbsolute,
    artifactFileRelative: (version: number) => path.join(planDirRelative, `artifact.v${version}.json`),
    artifactFileAbsolute: (version: number) => path.join(planDirAbsolute, `artifact.v${version}.json`),
    moduleId: planArtifactModuleId(planId)
  };
}

function indexFromArtifact(artifact: PlanArtifactV1): PlanArtifactIndexStateV1 {
  return {
    schemaVersion: 1,
    planId: artifact.planId,
    currentVersion: artifact.version,
    planRef: artifact.planRef,
    status: artifact.status,
    title: artifact.identity.title,
    planningType: artifact.identity.planningType,
    updatedAt: artifact.provenance.updatedAt,
    wbsRowCount: artifact.wbs.length,
    openQuestionCount: artifact.openQuestions.length
  };
}

function parseIndex(raw: unknown): PlanArtifactIndexStateV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as PlanArtifactIndexStateV1;
  if (row.schemaVersion !== 1 || typeof row.planId !== "string") return null;
  return row;
}

function listVersionFiles(planDirAbsolute: string): number[] {
  if (!fs.existsSync(planDirAbsolute)) return [];
  const names = fs.readdirSync(planDirAbsolute);
  const versions: number[] = [];
  for (const name of names) {
    const match = /^artifact\.v(\d+)\.json$/.exec(name);
    if (match) {
      versions.push(Number(match[1]));
    }
  }
  return versions.sort((a, b) => a - b);
}

export function resolveLatestPlanArtifactVersion(workspacePath: string, planId: string): number | null {
  const paths = getPlanArtifactStoragePaths(workspacePath, planId);
  const fromDisk = listVersionFiles(paths.planDirAbsolute);
  if (fromDisk.length > 0) {
    return fromDisk[fromDisk.length - 1] ?? null;
  }
  const rel = dbRelativePath(workspacePath);
  const db = new UnifiedStateDb(workspacePath, rel);
  const index = parseIndex(db.getModuleState(paths.moduleId)?.state);
  return index?.currentVersion ?? null;
}

export function writePlanArtifactVersion(
  workspacePath: string,
  artifact: PlanArtifactV1,
  effectiveConfig?: Record<string, unknown>
): PlanArtifactStoragePaths {
  if (!isPlanArtifactV1(artifact)) {
    throw new Error("writePlanArtifactVersion requires a PlanArtifact v1 document");
  }
  const paths = getPlanArtifactStoragePaths(workspacePath, artifact.planId);
  fs.mkdirSync(paths.planDirAbsolute, { recursive: true });
  const target = paths.artifactFileAbsolute(artifact.version);
  const temp = `${target}.tmp`;
  const payload = `${JSON.stringify(artifact, null, 2)}\n`;
  fs.writeFileSync(temp, payload, "utf8");
  fs.renameSync(temp, target);

  const index = indexFromArtifact(artifact);
  persistModuleStateRow({
    workspacePath,
    databaseRelativePath: dbRelativePath(workspacePath, effectiveConfig),
    moduleId: paths.moduleId,
    stateSchemaVersion: INDEX_STATE_SCHEMA,
    state: index as unknown as Record<string, unknown>
  });
  return paths;
}

export function readPlanArtifactVersion(
  workspacePath: string,
  planId: string,
  version: number
): PlanArtifactV1 | null {
  const paths = getPlanArtifactStoragePaths(workspacePath, planId);
  const file = paths.artifactFileAbsolute(version);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return isPlanArtifactV1(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readLatestPlanArtifact(
  workspacePath: string,
  planId: string
): PlanArtifactV1 | null {
  const version = resolveLatestPlanArtifactVersion(workspacePath, planId);
  if (version === null) return null;
  return readPlanArtifactVersion(workspacePath, planId, version);
}

export function readPlanArtifactIndex(
  workspacePath: string,
  planId: string,
  effectiveConfig?: Record<string, unknown>
): PlanArtifactIndexStateV1 | null {
  const paths = getPlanArtifactStoragePaths(workspacePath, planId);
  const db = new UnifiedStateDb(workspacePath, dbRelativePath(workspacePath, effectiveConfig));
  return parseIndex(db.getModuleState(paths.moduleId)?.state);
}

/**
 * Persist a new version (increments from latest on disk). Caller supplies merged document body.
 */
export function writeNextPlanArtifactVersion(
  workspacePath: string,
  artifact: PlanArtifactV1,
  effectiveConfig?: Record<string, unknown>
): { artifact: PlanArtifactV1; paths: PlanArtifactStoragePaths } {
  const latest = resolveLatestPlanArtifactVersion(workspacePath, artifact.planId);
  const version = latest === null ? 1 : latest + 1;
  const { version: _prior, ...body } = artifact;
  const full: PlanArtifactV1 = {
    ...body,
    version
  };
  const paths = writePlanArtifactVersion(workspacePath, full, effectiveConfig);
  return { artifact: full, paths };
}

export function listPlanArtifactSummaries(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): PlanArtifactIndexStateV1[] {
  const db = new UnifiedStateDb(workspacePath, dbRelativePath(workspacePath, effectiveConfig));
  return db
    .listModuleStates()
    .filter((row) => row.moduleId.startsWith(PLAN_ARTIFACT_MODULE_ID_PREFIX))
    .map((row) => parseIndex(row.state))
    .filter((row): row is PlanArtifactIndexStateV1 => row !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
