import type Database from "better-sqlite3";
import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { PlanArtifactApprovalRecord, PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import {
  resolvePlanArtifactReviewProfile,
  reviewPlanArtifact
} from "../../core/planning/review-plan-artifact.js";
import {
  getPlanArtifactStoragePaths,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion,
  writeNextPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { persistModuleStateRow } from "../../core/state/module-state-sidecar-migration.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { digestPayload, planningConcurrencySaveOpts, readIdempotencyValue, stableStringify } from "../task-engine/mutation-utils.js";

const ACCEPT_IDEMPOTENCY_MODULE_PREFIX = "planning-plan-artifact-accept-idempotency:";

export type PlanArtifactAcceptIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  planId: string;
  version: number;
  planRef: string;
  storagePath: string;
};

export type PlanArtifactApprovalRecordInput = {
  schemaVersion: 1;
  confirmed: boolean;
  approvedVersion: number;
  approvedAt: string;
  approvedBy: string;
  planRef: string;
  reviewSummary?: string;
  openQuestionsAccepted?: string[];
};

export function parsePlanArtifactApprovalRecord(raw: unknown): PlanArtifactApprovalRecordInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (row.schemaVersion !== 1 || row.confirmed !== true) {
    return null;
  }
  if (typeof row.approvedVersion !== "number" || !Number.isInteger(row.approvedVersion) || row.approvedVersion < 1) {
    return null;
  }
  if (typeof row.approvedAt !== "string" || row.approvedAt.trim().length === 0) {
    return null;
  }
  if (typeof row.approvedBy !== "string" || row.approvedBy.trim().length === 0) {
    return null;
  }
  if (typeof row.planRef !== "string" || row.planRef.trim().length === 0) {
    return null;
  }
  const openQuestionsAccepted = Array.isArray(row.openQuestionsAccepted)
    ? row.openQuestionsAccepted.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: row.approvedVersion,
    approvedAt: row.approvedAt.trim(),
    approvedBy: row.approvedBy.trim(),
    planRef: row.planRef.trim(),
    ...(typeof row.reviewSummary === "string" && row.reviewSummary.trim().length > 0
      ? { reviewSummary: row.reviewSummary.trim() }
      : {}),
    ...(openQuestionsAccepted && openQuestionsAccepted.length > 0 ? { openQuestionsAccepted } : {})
  };
}

export function acceptPlanArtifactPersistDigest(
  planId: string,
  approvedVersion: number,
  approvalRecord: PlanArtifactApprovalRecordInput
): string {
  return digestPayload({
    planId,
    approvedVersion,
    approvalRecord: JSON.parse(stableStringify(approvalRecord)) as Record<string, unknown>
  });
}

function parseVersion(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  return undefined;
}

/** Version the approval record refers to (draft row), not the storage row after accept bumps version. */
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
  return `${ACCEPT_IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`;
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

function readAcceptIdempotencyRecord(
  workspacePath: string,
  clientMutationId: string,
  effectiveConfig?: Record<string, unknown>,
  sqliteDb?: Database.Database
): PlanArtifactAcceptIdempotencyStateV1 | null {
  const moduleId = idempotencyModuleId(clientMutationId);
  const raw = sqliteDb
    ? readModuleStateJson(sqliteDb, moduleId)
    : new UnifiedStateDb(workspacePath, sqliteDbRelativePath(workspacePath, effectiveConfig)).getModuleState(
        moduleId
      )?.state;
  if (!raw) {
    return null;
  }
  const row = raw as PlanArtifactAcceptIdempotencyStateV1;
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

function writeAcceptIdempotencyRecord(
  workspacePath: string,
  clientMutationId: string,
  record: PlanArtifactAcceptIdempotencyStateV1,
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

function acceptSuccessResult(args: {
  code: "plan-artifact-accepted" | "plan-artifact-accept-idempotent-replay";
  artifact: PlanArtifactV1;
  storagePath: string;
  replayed: boolean;
}): ModuleCommandResult {
  return {
    ok: true,
    code: args.code,
    message: args.replayed ? "PlanArtifact accept idempotent replay" : "PlanArtifact accepted",
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId: args.artifact.planId,
      version: args.artifact.version,
      planRef: args.artifact.planRef,
      status: args.artifact.status,
      approvalRecord: args.artifact.approvalRecord,
      storagePath: args.storagePath,
      replayed: args.replayed
    }
  };
}

function mergeOpenQuestionsAccepted(
  record: PlanArtifactApprovalRecordInput,
  argvAccepted: unknown
): PlanArtifactApprovalRecordInput {
  const fromArgv = Array.isArray(argvAccepted)
    ? argvAccepted.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  if (fromArgv.length === 0) {
    return record;
  }
  const merged = [...(record.openQuestionsAccepted ?? []), ...fromArgv];
  return { ...record, openQuestionsAccepted: [...new Set(merged)] };
}

export async function runAcceptPlanArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planId = typeof args.planId === "string" ? args.planId.trim() : "";
  if (!planId) {
    return { ok: false, code: "invalid-run-args", message: "accept-plan-artifact requires planId" };
  }

  const approvalInput = parsePlanArtifactApprovalRecord(args.approvalRecord);
  if (!approvalInput) {
    return {
      ok: false,
      code: "plan-artifact-schema-invalid",
      message: "approvalRecord is missing required fields",
      data: { schemaVersion: 1, responseSchemaVersion: 1, missingFields: ["approvalRecord"] }
    };
  }

  const approvalRecord = mergeOpenQuestionsAccepted(approvalInput, args.openQuestionsAccepted);
  const strict = args.strict !== false;
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

  const latestVersion = resolveLatestPlanArtifactVersion(ctx.workspacePath, planId);
  if (latestVersion === null) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId }
    };
  }

  const targetVersion = requestedVersion ?? latestVersion;
  const loaded = readPlanArtifactVersion(ctx.workspacePath, planId, targetVersion);
  if (!loaded) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} version ${targetVersion} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion }
    };
  }

  if (requestedVersion !== undefined && requestedVersion !== latestVersion) {
    return {
      ok: false,
      code: "plan-artifact-version-mismatch",
      message: `Requested version ${requestedVersion} is not the latest (${latestVersion})`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: requestedVersion, latestVersion }
    };
  }

  const approvalTargetVersion = resolveApprovalTargetVersion(loaded);
  if (approvalRecord.approvedVersion !== approvalTargetVersion) {
    return {
      ok: false,
      code: "plan-artifact-version-mismatch",
      message: `approvalRecord.approvedVersion ${approvalRecord.approvedVersion} does not match approval target version ${approvalTargetVersion}`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        approvalTargetVersion,
        approvedVersion: approvalRecord.approvedVersion
      }
    };
  }

  if (approvalRecord.planRef !== loaded.planRef) {
    return {
      ok: false,
      code: "plan-artifact-schema-invalid",
      message: "approvalRecord.planRef does not match artifact planRef",
      data: { schemaVersion: 1, responseSchemaVersion: 1, missingFields: ["approvalRecord.planRef"] }
    };
  }

  const digest = acceptPlanArtifactPersistDigest(
    planId,
    approvalRecord.approvedVersion,
    approvalRecord
  );
  const sqliteDb = stores.sqliteDual.getDatabase();
  const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;

  if (clientMutationId) {
    const prior = readAcceptIdempotencyRecord(ctx.workspacePath, clientMutationId, effectiveConfig, sqliteDb);
    if (prior) {
      if (prior.payloadDigest !== digest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different accept-plan-artifact payload`
        };
      }
      const stored = readPlanArtifactVersion(ctx.workspacePath, prior.planId, prior.version) ?? loaded;
      return acceptSuccessResult({
        code: "plan-artifact-accept-idempotent-replay",
        artifact: stored,
        storagePath: prior.storagePath,
        replayed: true
      });
    }
  }

  if (
    loaded.status === "accepted" &&
    loaded.approvalRecord?.confirmed === true &&
    loaded.approvalRecord.approvedVersion === approvalRecord.approvedVersion &&
    acceptPlanArtifactPersistDigest(planId, loaded.approvalRecord.approvedVersion, {
      schemaVersion: 1,
      confirmed: true,
      approvedVersion: loaded.approvalRecord.approvedVersion,
      approvedAt: loaded.approvalRecord.approvedAt,
      approvedBy: loaded.approvalRecord.approvedBy,
      planRef: loaded.approvalRecord.planRef,
      ...(loaded.approvalRecord.reviewSummary ? { reviewSummary: loaded.approvalRecord.reviewSummary } : {}),
      ...(loaded.approvalRecord.openQuestionsAccepted
        ? { openQuestionsAccepted: loaded.approvalRecord.openQuestionsAccepted }
        : {})
    }) === digest
  ) {
    const paths = getPlanArtifactStoragePaths(ctx.workspacePath, planId);
    return acceptSuccessResult({
      code: "plan-artifact-accept-idempotent-replay",
      artifact: loaded,
      storagePath: paths.artifactFileRelative(loaded.version),
      replayed: true
    });
  }

  if (strict) {
    const review = reviewPlanArtifact(loaded, {
      profile: resolvePlanArtifactReviewProfile(loaded)
    });
    if (review.blockers.length > 0) {
      return {
        ok: false,
        code: "plan-artifact-accept-blocked",
        message: "Accept blocked: review has blockers",
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId,
          version: loaded.version,
          passed: false,
          blockers: review.blockers,
          warnings: review.warnings
        }
      };
    }
  }

  if (loaded.openQuestions.length > 0) {
    const accepted = approvalRecord.openQuestionsAccepted ?? [];
    if (accepted.length === 0) {
      return {
        ok: false,
        code: "plan-artifact-accept-blocked",
        message: "Accept blocked: open questions remain without openQuestionsAccepted",
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId,
          version: loaded.version,
          openQuestionCount: loaded.openQuestions.length
        }
      };
    }
  }

  const now = new Date().toISOString();
  const reviewSummary =
    approvalRecord.reviewSummary ??
    (() => {
      const review = reviewPlanArtifact(loaded, { profile: resolvePlanArtifactReviewProfile(loaded) });
      const blockers = review.blockers.length;
      const warnings = review.warnings.length;
      if (blockers === 0 && warnings === 0) {
        return "0 blockers, 0 warnings";
      }
      if (blockers === 0) {
        return `0 blockers, ${warnings} warning(s)`;
      }
      return `${blockers} blocker(s), ${warnings} warning(s)`;
    })();

  const approvalPersisted: PlanArtifactApprovalRecord = {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: approvalRecord.approvedVersion,
    approvedAt: approvalRecord.approvedAt,
    approvedBy: approvalRecord.approvedBy,
    planRef: approvalRecord.planRef,
    reviewSummary,
    ...(approvalRecord.openQuestionsAccepted ? { openQuestionsAccepted: approvalRecord.openQuestionsAccepted } : {})
  };

  const acceptedBody: PlanArtifactV1 = {
    ...loaded,
    status: "accepted",
    approvalRecord: approvalPersisted,
    provenance: {
      ...loaded.provenance,
      updatedAt: now
    }
  };

  let written;
  try {
    stores.sqliteDual.withTransaction(() => {
      written = writeNextPlanArtifactVersion(ctx.workspacePath, acceptedBody, {
        effectiveConfig,
        sqliteDb
      });
      if (clientMutationId) {
        const storagePath = written!.paths.artifactFileRelative(written!.artifact.version);
        writeAcceptIdempotencyRecord(
          ctx.workspacePath,
          clientMutationId,
          {
            schemaVersion: 1,
            payloadDigest: digest,
            planId,
            version: written!.artifact.version,
            planRef: written!.artifact.planRef,
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
  const result = acceptSuccessResult({
    code: "plan-artifact-accepted",
    artifact: written!.artifact,
    storagePath,
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
