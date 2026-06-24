import type Database from "better-sqlite3";
import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type {
  PlanArtifactExecuteEvidenceBundle,
  PlanArtifactExecutionLinkage,
  PlanArtifactV1
} from "../../core/planning/plan-artifact-v1.js";
import {
  getPlanArtifactStoragePaths,
  readPlanArtifactVersion,
  writeNextPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { resolveActorWithFallback } from "../../core/policy.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { persistModuleStateRow } from "../../core/state/module-state-sidecar-migration.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import {
  loadExecuteEligiblePlan,
  PLAN_EXECUTION_EVIDENCE_METADATA_KEY,
  type PlanExecutionEvidenceMetadata
} from "../task-engine/plan-artifact-execute-policy.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { digestPayload, planningConcurrencySaveOpts, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";

const EXECUTE_IDEMPOTENCY_MODULE_PREFIX = "planning-plan-artifact-execute-idempotency:";

type PlanArtifactExecuteIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  planId: string;
  version: number;
  planRef: string;
  taskId: string;
  storagePath: string;
};

function parseVersion(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  return undefined;
}

function resolveApprovalTargetVersion(loaded: PlanArtifactV1): number {
  if (loaded.status === "accepted" && loaded.approvalRecord?.approvedVersion !== undefined) {
    return loaded.approvalRecord.approvedVersion;
  }
  return loaded.version;
}

function sqliteDbRelativePath(workspacePath: string, effectiveConfig?: Record<string, unknown>): string {
  return planningSqliteDatabaseRelativePath({
    runtimeVersion: "0",
    workspacePath,
    effectiveConfig
  });
}

function idempotencyModuleId(clientMutationId: string): string {
  return `${EXECUTE_IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`;
}

function readModuleStateJson(db: Database.Database, moduleId: string): Record<string, unknown> | null {
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

function readExecuteIdempotencyRecord(
  workspacePath: string,
  clientMutationId: string,
  effectiveConfig?: Record<string, unknown>,
  sqliteDb?: Database.Database
): PlanArtifactExecuteIdempotencyStateV1 | null {
  const moduleId = idempotencyModuleId(clientMutationId);
  const raw = sqliteDb
    ? readModuleStateJson(sqliteDb, moduleId)
    : new UnifiedStateDb(workspacePath, sqliteDbRelativePath(workspacePath, effectiveConfig)).getModuleState(
        moduleId
      )?.state;
  if (!raw) {
    return null;
  }
  const row = raw as PlanArtifactExecuteIdempotencyStateV1;
  if (
    row.schemaVersion !== 1 ||
    typeof row.payloadDigest !== "string" ||
    typeof row.planId !== "string" ||
    typeof row.version !== "number" ||
    typeof row.planRef !== "string" ||
    typeof row.taskId !== "string" ||
    typeof row.storagePath !== "string"
  ) {
    return null;
  }
  return row;
}

function writeExecuteIdempotencyRecord(
  workspacePath: string,
  clientMutationId: string,
  record: PlanArtifactExecuteIdempotencyStateV1,
  effectiveConfig?: Record<string, unknown>,
  sqliteDb?: Database.Database
): void {
  const moduleId = idempotencyModuleId(clientMutationId);
  const state = record as unknown as Record<string, unknown>;
  const updatedAt = new Date().toISOString();
  if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(module_id) DO UPDATE SET
           state_schema_version=excluded.state_schema_version,
           state_json=excluded.state_json,
           updated_at=excluded.updated_at`
      )
      .run(moduleId, 1, JSON.stringify(state), updatedAt);
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

function executePlanArtifactPersistDigest(args: {
  planId: string;
  taskId: string;
  wbsId?: string;
  approvedPlanVersion?: number;
}): string {
  return digestPayload({
    planId: args.planId,
    taskId: args.taskId,
    ...(args.wbsId ? { wbsId: args.wbsId } : {}),
    ...(args.approvedPlanVersion !== undefined ? { approvedPlanVersion: args.approvedPlanVersion } : {})
  });
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildPlanExecutionEvidenceMetadata(
  loaded: PlanArtifactV1,
  evidenceBundle: PlanArtifactExecuteEvidenceBundle
): PlanExecutionEvidenceMetadata {
  return {
    schemaVersion: 1,
    planId: loaded.planId,
    planRef: loaded.planRef,
    planVersion: evidenceBundle.planRevision,
    ...(evidenceBundle.approvedPlanVersion !== undefined
      ? { approvedPlanVersion: evidenceBundle.approvedPlanVersion }
      : {}),
    evidenceBundle
  };
}

function validateExistingExecuteLinkage(
  task: { metadata?: Record<string, unknown> },
  loaded: PlanArtifactV1,
  taskId: string
): PlanExecutionEvidenceMetadata | null {
  const raw = task.metadata?.[PLAN_EXECUTION_EVIDENCE_METADATA_KEY];
  if (!isRecordLike(raw) || raw.schemaVersion !== 1) {
    return null;
  }
  if (typeof raw.planId !== "string" || raw.planId !== loaded.planId) {
    return null;
  }
  if (typeof raw.planRef !== "string" || raw.planRef !== loaded.planRef) {
    return null;
  }
  const bundle = raw.evidenceBundle;
  if (!isRecordLike(bundle) || bundle.taskId !== taskId || bundle.command !== "execute-plan-artifact") {
    return null;
  }
  return buildPlanExecutionEvidenceMetadata(loaded, bundle as PlanArtifactExecuteEvidenceBundle);
}

function executeSuccessResult(args: {
  code: "plan-artifact-execute-linked" | "plan-artifact-execute-idempotent-replay";
  artifact: PlanArtifactV1;
  storagePath: string;
  taskId: string;
  evidenceBundle: PlanArtifactExecuteEvidenceBundle;
  planExecutionEvidence: PlanExecutionEvidenceMetadata;
  replayed: boolean;
}): ModuleCommandResult {
  return {
    ok: true,
    code: args.code,
    message: args.replayed ? "PlanArtifact execute idempotent replay" : "PlanArtifact execute linked",
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId: args.artifact.planId,
      version: args.artifact.version,
      planRef: args.artifact.planRef,
      status: args.artifact.status,
      taskId: args.taskId,
      storagePath: args.storagePath,
      evidenceBundle: args.evidenceBundle,
      planExecutionEvidence: args.planExecutionEvidence,
      replayed: args.replayed
    }
  };
}

export async function runExecutePlanArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planId = typeof args.planId === "string" ? args.planId.trim() : "";
  const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
  if (!planId) {
    return { ok: false, code: "invalid-run-args", message: "execute-plan-artifact requires planId" };
  }
  if (!taskId) {
    return { ok: false, code: "invalid-run-args", message: "execute-plan-artifact requires taskId" };
  }

  const wbsId = typeof args.wbsId === "string" && args.wbsId.trim().length > 0 ? args.wbsId.trim() : undefined;
  const requestedVersion = parseVersion(args.version);
  const clientMutationId = readIdempotencyValue(args);

  const stores = await openPlanningStores(ctx);
  const pg = planningGenPolicyGate(
    ctx,
    args,
    instructionPath,
    stores.sqliteDual.getPlanningGeneration()
  );
  if (pg.block) {
    return pg.block;
  }

  const loadedResult = loadExecuteEligiblePlan(ctx.workspacePath, planId, requestedVersion);
  if (!loadedResult.ok) {
    return {
      ok: false,
      code: loadedResult.code,
      message: loadedResult.message,
      data: loadedResult.data
    };
  }
  const loaded = loadedResult.artifact;

  const task = stores.taskStore.getTask(taskId);
  if (!task) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Task '${taskId}' not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, taskId }
    };
  }

  if (wbsId && !loaded.wbs.some((row) => row.wbsId === wbsId)) {
    return {
      ok: false,
      code: "plan-artifact-execute-blocked",
      message: `WBS row '${wbsId}' not found on PlanArtifact ${planId}`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, wbsId }
    };
  }

  const approvedPlanVersion = resolveApprovalTargetVersion(loaded);
  const digest = executePlanArtifactPersistDigest({
    planId,
    taskId,
    wbsId,
    approvedPlanVersion
  });
  const sqliteDb = stores.sqliteDual.getDatabase();
  const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;

  if (clientMutationId) {
    const prior = readExecuteIdempotencyRecord(ctx.workspacePath, clientMutationId, effectiveConfig, sqliteDb);
    if (prior) {
      if (prior.payloadDigest !== digest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different execute-plan-artifact payload`
        };
      }
      const stored = readPlanArtifactVersion(ctx.workspacePath, prior.planId, prior.version) ?? loaded;
      const evidenceBundle =
        stored.executionLinkages?.find((row) => row.taskId === taskId)?.evidenceBundle ??
        (() => {
          const existingEvidence = task.metadata?.[PLAN_EXECUTION_EVIDENCE_METADATA_KEY];
          if (
            isRecordLike(existingEvidence) &&
            isRecordLike(existingEvidence.evidenceBundle)
          ) {
            return existingEvidence.evidenceBundle as PlanArtifactExecuteEvidenceBundle;
          }
          return null;
        })();
      if (!evidenceBundle) {
        return {
          ok: false,
          code: "plan-artifact-execute-blocked",
          message: "Idempotent replay could not resolve evidence bundle"
        };
      }
      return executeSuccessResult({
        code: "plan-artifact-execute-idempotent-replay",
        artifact: stored,
        storagePath: prior.storagePath,
        taskId,
        evidenceBundle,
        planExecutionEvidence: buildPlanExecutionEvidenceMetadata(stored, evidenceBundle),
        replayed: true
      });
    }
  }

  const existingEvidence = validateExistingExecuteLinkage(task, loaded, taskId);
  if (existingEvidence) {
    const paths = getPlanArtifactStoragePaths(ctx.workspacePath, planId);
    return executeSuccessResult({
      code: "plan-artifact-execute-idempotent-replay",
      artifact: loaded,
      storagePath: paths.artifactFileRelative(loaded.version),
      taskId,
      evidenceBundle: existingEvidence.evidenceBundle,
      planExecutionEvidence: existingEvidence,
      replayed: true
    });
  }

  const actor = await resolveActorWithFallback(ctx.workspacePath, args, process.env);
  const linkedAt = new Date().toISOString();
  const nextRevision = loaded.version + 1;
  const evidenceBundle: PlanArtifactExecuteEvidenceBundle = {
    schemaVersion: 1,
    command: "execute-plan-artifact",
    planId: loaded.planId,
    planRef: loaded.planRef,
    planRevision: nextRevision,
    approvedPlanVersion,
    taskId,
    ...(wbsId ? { wbsId } : {}),
    linkedAt,
    linkedBy: actor
  };

  const linkage: PlanArtifactExecutionLinkage = {
    schemaVersion: 1,
    taskId,
    ...(wbsId ? { wbsId } : {}),
    linkedAt,
    linkedBy: actor,
    planVersion: nextRevision,
    approvedPlanVersion,
    evidenceBundle
  };

  const planExecutionEvidence = buildPlanExecutionEvidenceMetadata(loaded, evidenceBundle);
  const linkedBody: PlanArtifactV1 = {
    ...loaded,
    executionLinkages: [...(loaded.executionLinkages ?? []), linkage],
    provenance: {
      ...loaded.provenance,
      updatedAt: linkedAt
    }
  };

  let written;
  try {
    stores.sqliteDual.withTransaction(() => {
      written = writeNextPlanArtifactVersion(ctx.workspacePath, linkedBody, {
        effectiveConfig,
        sqliteDb
      });
      const updatedTask = stores.taskStore.getTask(taskId);
      if (!updatedTask) {
        throw new TaskEngineError("task-not-found", `Task '${taskId}' not found during execute linkage persist`);
      }
      stores.taskStore.updateTask({
        ...updatedTask,
        updatedAt: linkedAt,
        metadata: {
          ...(updatedTask.metadata ?? {}),
          [PLAN_EXECUTION_EVIDENCE_METADATA_KEY]: planExecutionEvidence
        }
      });
      if (clientMutationId) {
        const storagePath = written!.paths.artifactFileRelative(written!.artifact.version);
        writeExecuteIdempotencyRecord(
          ctx.workspacePath,
          clientMutationId,
          {
            schemaVersion: 1,
            payloadDigest: digest,
            planId,
            version: written!.artifact.version,
            planRef: written!.artifact.planRef,
            taskId,
            storagePath
          },
          effectiveConfig,
          sqliteDb
        );
      }
    }, planningConcurrencySaveOpts(args));
  } catch (err) {
    if (err instanceof TaskEngineError) {
      const data =
        err.code === "planning-generation-mismatch" && err.details
          ? (err.details as Record<string, unknown>)
          : undefined;
      return { ok: false, code: err.code, message: err.message, data };
    }
    throw err;
  }

  const storagePath = written!.paths.artifactFileRelative(written!.artifact.version);
  const result = executeSuccessResult({
    code: "plan-artifact-execute-linked",
    artifact: written!.artifact,
    storagePath,
    taskId,
    evidenceBundle: {
      ...evidenceBundle,
      planRevision: written!.artifact.version
    },
    planExecutionEvidence: {
      ...planExecutionEvidence,
      planVersion: written!.artifact.version,
      evidenceBundle: {
        ...evidenceBundle,
        planRevision: written!.artifact.version
      }
    },
    replayed: false
  });
  attachPolicyMeta(
    result.data as Record<string, unknown>,
    ctx,
    stores.sqliteDual.getPlanningGeneration(),
    pg.warnings
  );
  return result;
}
