import type Database from "better-sqlite3";
import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { PlanArtifactApprovalRecord, PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import type { PlanArtifactReviewRecordV1 } from "../../core/planning/plan-artifact-review-record.js";
import {
  getPlanArtifactStoragePaths,
  readPlanArtifactIndex,
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
import { promoteAcceptedPlanArtifactFromAcceptedDraft } from "../ideas/idea-planning-metadata.js";
import { completePlanningSessionAfterPlanAccept } from "../ideas/planning-session-completed-after-accept.js";
import { toPlanningChatSessionResponse } from "../ideas/planning-chat-session.js";

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
  idea?: Record<string, unknown>;
  planningChatSession?: ReturnType<typeof toPlanningChatSessionResponse>;
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
      replayed: args.replayed,
      ...(args.idea ? { idea: args.idea } : {}),
      ...(args.planningChatSession ? { planningChatSession: args.planningChatSession } : {})
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

function normalizeOpenQuestionList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

function acceptBlockedResult(
  planId: string,
  version: number,
  message: string,
  extraData: Record<string, unknown> = {}
): ModuleCommandResult {
  return {
    ok: false,
    code: "plan-artifact-accept-blocked",
    message,
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId,
      version,
      passed: false,
      ...extraData
    }
  };
}

function resolveReviewedVersionGate(args: {
  workspacePath: string;
  planId: string;
  loaded: PlanArtifactV1;
  effectiveConfig?: Record<string, unknown>;
}): { ok: true; reviewRecord: PlanArtifactReviewRecordV1 } | { ok: false; result: ModuleCommandResult } {
  const { workspacePath, planId, loaded, effectiveConfig } = args;
  if (loaded.status !== "reviewed") {
    return {
      ok: false,
      result: acceptBlockedResult(
        planId,
        loaded.version,
        "Accept blocked: latest version must be reviewed before acceptance",
        { status: loaded.status }
      )
    };
  }

  const reviewRecord = readPlanArtifactIndex(workspacePath, planId, effectiveConfig)?.latestReview;
  if (!reviewRecord) {
    return {
      ok: false,
      result: acceptBlockedResult(
        planId,
        loaded.version,
        "Accept blocked: latest reviewed version is missing persisted review metadata"
      )
    };
  }

  if (reviewRecord.planRef !== loaded.planRef || reviewRecord.reviewedVersion !== loaded.version) {
    return {
      ok: false,
      result: acceptBlockedResult(
        planId,
        loaded.version,
        "Accept blocked: current version does not match the latest reviewed version",
        {
          reviewedVersion: reviewRecord.reviewedVersion,
          currentVersion: loaded.version
        }
      )
    };
  }

  if (!reviewRecord.passed || reviewRecord.blockerCount > 0) {
    return {
      ok: false,
      result: acceptBlockedResult(planId, loaded.version, "Accept blocked: reviewed version has blockers", {
        blockerCount: reviewRecord.blockerCount,
        warningCount: reviewRecord.warningCount,
        reviewSummary: reviewRecord.reviewSummary
      })
    };
  }

  return { ok: true, reviewRecord };
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

  const reviewedVersionGate = resolveReviewedVersionGate({
    workspacePath: ctx.workspacePath,
    planId,
    loaded,
    effectiveConfig
  });
  if (!reviewedVersionGate.ok) {
    return reviewedVersionGate.result;
  }

  const openQuestions = normalizeOpenQuestionList(loaded.openQuestions);
  if (openQuestions.length > 0) {
    const accepted = new Set(normalizeOpenQuestionList(approvalRecord.openQuestionsAccepted));
    const missing = openQuestions.filter((question) => !accepted.has(question));
    if (missing.length > 0) {
      return acceptBlockedResult(
        planId,
        loaded.version,
        "Accept blocked: open questions remain unresolved or undeferred",
        {
          openQuestionCount: openQuestions.length,
          acceptedOpenQuestionCount: accepted.size,
          missingOpenQuestionsAccepted: missing
        }
      );
    }
  }

  const now = new Date().toISOString();
  const reviewSummary = approvalRecord.reviewSummary ?? reviewedVersionGate.reviewRecord.reviewSummary;

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
  let linkedIdea: Record<string, unknown> | undefined;
  let planningChatSession: ReturnType<typeof toPlanningChatSessionResponse> | undefined;
  try {
    stores.sqliteDual.withTransaction(() => {
      written = writeNextPlanArtifactVersion(ctx.workspacePath, acceptedBody, {
        effectiveConfig,
        sqliteDb
      });
      const promoted = promoteAcceptedPlanArtifactFromAcceptedDraft(sqliteDb, written!.artifact, now);
      if (promoted.idea) {
        linkedIdea = promoted.idea as unknown as Record<string, unknown>;
      }
      const completedSession = completePlanningSessionAfterPlanAccept(sqliteDb, written!.artifact, now);
      if (completedSession) {
        planningChatSession = toPlanningChatSessionResponse(completedSession);
      }
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
    replayed: false,
    ...(linkedIdea ? { idea: linkedIdea } : {}),
    ...(planningChatSession ? { planningChatSession } : {})
  });
  attachPolicyMeta(
    result.data as Record<string, unknown>,
    ctx,
    stores.sqliteDual.getPlanningGeneration(),
    pg.warnings
  );
  return result;
}
