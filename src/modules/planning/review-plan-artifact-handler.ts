import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  reviewPlanArtifact,
  type PlanArtifactReviewWaiver,
  type ReviewPlanArtifactResult
} from "../../core/planning/review-plan-artifact.js";
import type { PlanArtifactReviewProfile, PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import {
  buildPlanArtifactReviewRecord,
  formatPlanArtifactReviewSummary
} from "../../core/planning/plan-artifact-review-record.js";
import {
  applyLatestReviewToPlanArtifactIndex,
  readLatestPlanArtifact,
  readPlanArtifactIndex,
  readPlanArtifactVersion,
  writeNextPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import { validatePlanArtifactDraftInput } from "../../core/planning/validate-plan-artifact.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { promotePlanningSessionAfterReview } from "../ideas/planning-session-after-review.js";
import { toPlanningChatSessionResponse } from "../ideas/planning-chat-session.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { planningConcurrencySaveOpts } from "../task-engine/mutation-utils.js";

const REVIEW_PROFILES = new Set<PlanArtifactReviewProfile>([
  "minimal",
  "refactor",
  "full-feature",
  "sprint-phase"
]);

function parseProfile(raw: unknown): PlanArtifactReviewProfile | undefined {
  if (typeof raw === "string" && REVIEW_PROFILES.has(raw as PlanArtifactReviewProfile)) {
    return raw as PlanArtifactReviewProfile;
  }
  return undefined;
}

function parseWaivers(raw: unknown): PlanArtifactReviewWaiver[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const waivers: PlanArtifactReviewWaiver[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.code === "string" && typeof row.rationale === "string") {
      const code = row.code.trim();
      const rationale = row.rationale.trim();
      if (code.length > 0 && rationale.length > 0) {
        waivers.push({ code, rationale });
      }
    }
  }
  return waivers.length > 0 ? waivers : undefined;
}

function parseVersion(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  return undefined;
}

function cleanIdeaId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function cleanSessionId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function reviewDataPayload(
  result: ReviewPlanArtifactResult,
  artifact: PlanArtifactV1,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  const reviewSummary = formatPlanArtifactReviewSummary(result);
  const reviewRecord = buildPlanArtifactReviewRecord({
    artifact,
    result,
    reviewedAt: new Date().toISOString(),
    reviewSummary
  });
  return {
    schemaVersion: 1,
    responseSchemaVersion: 1,
    passed: result.passed,
    profile: result.profile,
    blockers: result.blockers,
    warnings: result.warnings,
    coverageMap: result.coverageMap,
    sizingFindings: result.sizingFindings,
    openQuestionCount: result.openQuestionCount,
    blockerCount: reviewRecord.blockerCount,
    warningCount: reviewRecord.warningCount,
    wbsCount: reviewRecord.wbsCount,
    coverageSummary: reviewRecord.coverageSummary,
    reviewSummary,
    reviewRecord,
    ...extras
  };
}

function reviewSuccessResult(
  result: ReviewPlanArtifactResult,
  artifact: PlanArtifactV1,
  extras: Record<string, unknown> = {}
): ModuleCommandResult {
  return {
    ok: true,
    code: result.passed ? "plan-artifact-review-complete" : "plan-artifact-review-blocked",
    message: result.passed ? "PlanArtifact review passed" : "PlanArtifact review has blockers",
    data: reviewDataPayload(result, artifact, extras)
  };
}

async function resolveArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext
): Promise<
  | { ok: true; artifact: PlanArtifactV1; planId: string }
  | { ok: false; result: ModuleCommandResult }
> {
  const artifactRaw = args.artifact;
  const hasArtifact =
    artifactRaw && typeof artifactRaw === "object" && !Array.isArray(artifactRaw);
  const planIdRaw = typeof args.planId === "string" ? args.planId.trim() : "";

  if (hasArtifact) {
    const ideaId = cleanIdeaId(args.ideaId);
    const validation = validatePlanArtifactDraftInput(artifactRaw, {
      workspaceRoot: ctx.workspacePath,
      planId: planIdRaw || undefined,
      ideaId,
      actor: typeof args.actor === "string" ? args.actor : undefined
    });
    if (!validation.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "plan-artifact-schema-invalid",
          message: "PlanArtifact validation failed",
          data: {
            schemaVersion: 1,
            responseSchemaVersion: 1,
            errors: validation.errors
          }
        }
      };
    }
    return { ok: true, artifact: validation.artifact, planId: validation.artifact.planId };
  }

  if (!planIdRaw) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-run-args",
        message: "review-plan-artifact requires planId or artifact"
      }
    };
  }

  const version = parseVersion(args.version);
  const loaded =
    version !== undefined
      ? readPlanArtifactVersion(ctx.workspacePath, planIdRaw, version)
      : readLatestPlanArtifact(ctx.workspacePath, planIdRaw);

  if (!loaded) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "plan-artifact-not-found",
        message:
          version !== undefined
            ? `PlanArtifact ${planIdRaw} version ${version} not found`
            : `PlanArtifact ${planIdRaw} not found`,
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId: planIdRaw,
          version
        }
      }
    };
  }

  return { ok: true, artifact: loaded, planId: planIdRaw };
}

export async function runReviewPlanArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const recordReview = args.recordReview === true;
  const resolved = await resolveArtifact(args, ctx);
  if (!resolved.ok) {
    return resolved.result;
  }

  const profile = parseProfile(args.profile);
  const waivers = parseWaivers(args.waivers);
  const review = reviewPlanArtifact(resolved.artifact, { profile, waivers });

  if (!recordReview) {
    return reviewSuccessResult(review, resolved.artifact, {
      planId: resolved.planId,
      version: resolved.artifact.version,
      planRef: resolved.artifact.planRef,
      recordReview: false
    });
  }

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

  const now = new Date().toISOString();
  const reviewedBody: PlanArtifactV1 = {
    ...resolved.artifact,
    status: "reviewed",
    provenance: {
      ...resolved.artifact.provenance,
      updatedAt: now
    }
  };

  let written;
  let planningChatSession: ReturnType<typeof toPlanningChatSessionResponse> | undefined;
  try {
    stores.sqliteDual.withTransaction(() => {
      const sqliteDb = stores.sqliteDual.getDatabase();
      written = writeNextPlanArtifactVersion(ctx.workspacePath, reviewedBody, {
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        sqliteDb
      });
      const reviewRecord = buildPlanArtifactReviewRecord({
        artifact: written!.artifact,
        result: review,
        reviewedAt: now
      });
      applyLatestReviewToPlanArtifactIndex(sqliteDb, written!.artifact.planId, reviewRecord);
      const promoted = promotePlanningSessionAfterReview(
        sqliteDb,
        written!.artifact,
        reviewRecord,
        now,
        {
          ideaId: cleanIdeaId(args.ideaId),
          sessionId: cleanSessionId(args.sessionId)
        }
      );
      if (promoted) {
        planningChatSession = toPlanningChatSessionResponse(promoted);
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
  const index = readPlanArtifactIndex(
    ctx.workspacePath,
    written!.artifact.planId,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const result = reviewSuccessResult(review, written!.artifact, {
    planId: written!.artifact.planId,
    version: written!.artifact.version,
    planRef: written!.artifact.planRef,
    status: written!.artifact.status,
    storagePath,
    recordReview: true,
    ...(index?.latestReview ? { persistedReview: index.latestReview } : {}),
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
