import type Database from "better-sqlite3";
import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import { persistModuleStateRow } from "../../core/state/module-state-sidecar-migration.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import { findImmutablePlanArtifactVersion } from "../../core/planning/plan-artifact-immutability.js";
import {
  getPlanArtifactStoragePaths,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion,
  writeNextPlanArtifactVersion,
  type PlanArtifactStoragePaths
} from "../../core/planning/plan-artifact-storage.js";
import { linkActiveDraftPlanArtifactFromPersistedDraft } from "./idea-plan/idea-planning-metadata.js";
import {
  pinArtifactToUnifiedIdeaPlan,
  resolveUnifiedIdeaPlanDraftTarget,
  synthesizePlanArtifactFromStoredDocument
} from "./idea-plan/idea-plan-planning-init.js";
import { promotePlanningSessionToDraftReadyAfterDraftPersist } from "./idea-plan/planning-session-draft-ready.js";
import { toPlanningChatSessionResponse } from "./idea-plan/planning-chat-session.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import { digestPayload, stableStringify } from "../task-engine/mutation-utils.js";
import { commitUnifiedIdeaPlanDraftPersist } from "./persist-unified-idea-plan-draft.js";

const DRAFT_IDEMPOTENCY_MODULE_PREFIX = "planning-plan-artifact-draft-idempotency:";

export type PlanArtifactDraftIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  planId: string;
  version: number;
  planRef: string;
  storagePath: string;
};

export function userSuppliedPlanArtifactVersion(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const version = (raw as Record<string, unknown>).version;
  if (typeof version === "number" && Number.isInteger(version) && version >= 1) {
    return version;
  }
  return undefined;
}

export function resolveNextPlanArtifactVersion(workspacePath: string, planId: string): number {
  const latest = resolveLatestPlanArtifactVersion(workspacePath, planId);
  return latest === null ? 1 : latest + 1;
}

/** Digest for idempotency (normalized body, planId, target version). */
export function planArtifactDraftPersistDigest(
  artifact: PlanArtifactV1,
  targetVersion: number
): string {
  const { version: _drop, ...body } = artifact;
  return digestPayload({
    planId: artifact.planId,
    version: targetVersion,
    artifact: JSON.parse(stableStringify(body)) as Record<string, unknown>
  });
}

function idempotencyModuleId(clientMutationId: string): string {
  return `${DRAFT_IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`;
}

function upsertModuleStateOnDatabase(
  db: Database.Database,
  moduleId: string,
  stateSchemaVersion: number,
  state: Record<string, unknown>
): void {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version=excluded.state_schema_version,
       state_json=excluded.state_json,
       updated_at=excluded.updated_at`
  ).run(moduleId, stateSchemaVersion, JSON.stringify(state), updatedAt);
}

function sqliteDbRelativePath(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): string {
  return planningSqliteDatabaseRelativePath({
    runtimeVersion: "0",
    workspacePath,
    effectiveConfig
  });
}

function readModuleStateJson(
  db: Database.Database,
  moduleId: string
): Record<string, unknown> | null {
  const row = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleId) as { state_json: string } | undefined;
  if (!row) {
    return null;
  }
  const parsed = JSON.parse(row.state_json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

function readIdempotencyRecord(
  workspacePath: string,
  clientMutationId: string,
  effectiveConfig?: Record<string, unknown>,
  sqliteDb?: Database.Database
): PlanArtifactDraftIdempotencyStateV1 | null {
  const moduleId = idempotencyModuleId(clientMutationId);
  const raw = sqliteDb
    ? readModuleStateJson(sqliteDb, moduleId)
    : new UnifiedStateDb(workspacePath, sqliteDbRelativePath(workspacePath, effectiveConfig)).getModuleState(
        moduleId
      )?.state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as PlanArtifactDraftIdempotencyStateV1;
  if (
    row.schemaVersion !== 1 ||
    typeof row.payloadDigest !== "string" ||
    typeof row.planId !== "string" ||
    typeof row.version !== "number" ||
    typeof row.planRef !== "string" ||
    typeof row.storagePath !== "string"
  ) {
    return null;
  }
  return row;
}

export function writePlanArtifactDraftIdempotencyRecord(
  workspacePath: string,
  clientMutationId: string,
  record: PlanArtifactDraftIdempotencyStateV1,
  effectiveConfig?: Record<string, unknown>,
  sqliteDb?: Database.Database
): void {
  const moduleId = idempotencyModuleId(clientMutationId);
  const state = record as unknown as Record<string, unknown>;
  if (sqliteDb) {
    upsertModuleStateOnDatabase(sqliteDb, moduleId, 1, state);
    return;
  }
  persistModuleStateRow({
    workspacePath,
    databaseRelativePath: sqliteDbRelativePath(workspacePath, effectiveConfig),
    moduleId,
    stateSchemaVersion: 1,
    state
  });
}

export type PlanArtifactDraftPersistPrelude =
  | { kind: "replay"; artifact: PlanArtifactV1; storagePath: string; paths: PlanArtifactStoragePaths }
  | { kind: "conflict"; code: "plan-artifact-version-conflict" | "plan-artifact-version-immutable" | "idempotency-key-conflict"; message: string; data?: Record<string, unknown> }
  | { kind: "commit"; targetVersion: number; digest: string; artifact: PlanArtifactV1 };

export function resolveDraftPlanArtifactForPersist(args: {
  workspacePath: string;
  artifact: PlanArtifactV1;
  sqliteDb?: Database.Database;
}): PlanArtifactV1 {
  const { workspacePath, artifact, sqliteDb } = args;
  if (!sqliteDb) {
    return artifact;
  }
  const target = resolveUnifiedIdeaPlanDraftTarget(workspacePath, sqliteDb, artifact);
  if (!target) {
    return artifact;
  }
  return pinArtifactToUnifiedIdeaPlan(artifact, target.document);
}

export function preludePlanArtifactDraftPersist(args: {
  workspacePath: string;
  artifact: PlanArtifactV1;
  artifactRaw: unknown;
  clientMutationId?: string;
  effectiveConfig?: Record<string, unknown>;
  sqliteDb?: Database.Database;
}): PlanArtifactDraftPersistPrelude {
  const { workspacePath, artifact, artifactRaw, clientMutationId, effectiveConfig, sqliteDb } = args;
  const workingArtifact = resolveDraftPlanArtifactForPersist({ workspacePath, artifact, sqliteDb });
  const isUnifiedDraft = sqliteDb
    ? resolveUnifiedIdeaPlanDraftTarget(workspacePath, sqliteDb, workingArtifact) !== null
    : false;
  const targetVersion = resolveNextPlanArtifactVersion(workspacePath, workingArtifact.planId);

  if (clientMutationId) {
    const prior = readIdempotencyRecord(workspacePath, clientMutationId, effectiveConfig, sqliteDb);
    if (prior) {
      const replayDigest = planArtifactDraftPersistDigest(workingArtifact, prior.version);
      if (prior.payloadDigest !== replayDigest) {
        return {
          kind: "conflict",
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different draft-plan-artifact payload`
        };
      }
      const stored =
        readPlanArtifactVersion(workspacePath, prior.planId, prior.version) ??
        synthesizePlanArtifactFromStoredDocument(workspacePath, prior.planId, prior.version, workingArtifact);
      return {
        kind: "replay",
        artifact: stored,
        storagePath: prior.storagePath,
        paths: getPlanArtifactStoragePaths(workspacePath, prior.planId)
      };
    }
  }

  const suppliedVersion = isUnifiedDraft ? undefined : userSuppliedPlanArtifactVersion(artifactRaw);
  if (suppliedVersion !== undefined) {
    const immutable = findImmutablePlanArtifactVersion(workspacePath, workingArtifact.planId, suppliedVersion);
    if (immutable) {
      return { kind: "conflict", code: immutable.code, message: immutable.message, data: { schemaVersion: 1, responseSchemaVersion: 1, planId: immutable.planId, version: immutable.version, status: immutable.status } };
    }
    if (suppliedVersion !== targetVersion) {
      return { kind: "conflict", code: "plan-artifact-version-conflict", message: `artifact.version ${suppliedVersion} does not match next version ${targetVersion} for plan ${workingArtifact.planId}` };
    }
  }

  const digest = planArtifactDraftPersistDigest(workingArtifact, targetVersion);
  return { kind: "commit", targetVersion, digest, artifact: workingArtifact };
}

export type CommitPlanArtifactDraftPersistResult = {
  artifact: PlanArtifactV1;
  paths: PlanArtifactStoragePaths;
  storagePath: string;
  planningChatSession?: ReturnType<typeof toPlanningChatSessionResponse>;
};

/** Write artifact file + index; record idempotency when `clientMutationId` is set. */
export function commitPlanArtifactDraftPersist(args: {
  workspacePath: string;
  artifact: PlanArtifactV1;
  clientMutationId?: string;
  digest: string;
  effectiveConfig?: Record<string, unknown>;
  sqliteDb?: Database.Database;
}): CommitPlanArtifactDraftPersistResult {
  const { workspacePath, artifact, clientMutationId, digest, effectiveConfig, sqliteDb } = args;
  if (sqliteDb && resolveUnifiedIdeaPlanDraftTarget(workspacePath, sqliteDb, artifact)) {
    return commitUnifiedIdeaPlanDraftPersist({
      workspacePath,
      artifact,
      clientMutationId,
      digest,
      sqliteDb
    });
  }
  const toWrite: PlanArtifactV1 = { ...artifact, status: "draft" };
  const { artifact: written, paths } = writeNextPlanArtifactVersion(workspacePath, toWrite, {
    effectiveConfig,
    sqliteDb
  });
  const storagePath = paths.artifactFileRelative(written.version);
  let planningChatSession: ReturnType<typeof toPlanningChatSessionResponse> | undefined;
  if (sqliteDb) {
    const nowIso = new Date().toISOString();
    linkActiveDraftPlanArtifactFromPersistedDraft(sqliteDb, written, nowIso);
    const promoted = promotePlanningSessionToDraftReadyAfterDraftPersist(sqliteDb, written, nowIso);
    if (promoted) planningChatSession = toPlanningChatSessionResponse(promoted);
  }
  if (clientMutationId) {
    writePlanArtifactDraftIdempotencyRecord(
      workspacePath,
      clientMutationId,
      {
        schemaVersion: 1,
        payloadDigest: digest,
        planId: written.planId,
        version: written.version,
        planRef: written.planRef,
        storagePath
      },
      effectiveConfig,
      sqliteDb
    );
  }
  return {
    artifact: written,
    paths,
    storagePath,
    ...(planningChatSession ? { planningChatSession } : {})
  };
}

export function planArtifactDraftPersistSuccessResult(args: {
  code: "plan-artifact-draft-persisted" | "plan-artifact-draft-idempotent-replay";
  artifact: PlanArtifactV1;
  storagePath: string;
  replayed: boolean;
  planningChatSession?: ReturnType<typeof toPlanningChatSessionResponse>;
}): ModuleCommandResult {
  return {
    ok: true,
    code: args.code,
    message: args.replayed ? "PlanArtifact draft idempotent replay" : "PlanArtifact draft persisted",
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId: args.artifact.planId,
      version: args.artifact.version,
      planRef: args.artifact.planRef,
      status: args.artifact.status,
      storagePath: args.storagePath,
      replayed: args.replayed,
      ...(args.planningChatSession ? { planningChatSession: args.planningChatSession } : {})
    }
  };
}
