import type { PlanArtifactCoverageMap, PlanArtifactReviewSeverity, ReviewPlanArtifactResult } from "./review-plan-artifact.js";
import type { PlanArtifactReviewProfile, PlanArtifactV1 } from "./plan-artifact-v1.js";

export type PlanArtifactCoverageSummaryV1 = {
  goalsCovered: number;
  goalsUncovered: number;
  userStoriesCovered: number;
  userStoriesUncovered: number;
  slices: PlanArtifactCoverageMap["slices"];
};

/** Bounded rubric finding row persisted on the plan index for dashboard rollups. */
export type PlanArtifactReviewFindingRecordV1 = {
  code: string;
  severity: PlanArtifactReviewSeverity;
  message: string;
  path?: string;
  wbsId?: string;
};

const PLAN_REVIEW_FINDING_MESSAGE_MAX = 220;
const PLAN_REVIEW_FINDINGS_MAX = 40;

export function buildPlanArtifactReviewFindingRecords(
  result: Pick<ReviewPlanArtifactResult, "blockers" | "warnings">
): PlanArtifactReviewFindingRecordV1[] {
  return [...result.blockers, ...result.warnings].slice(0, PLAN_REVIEW_FINDINGS_MAX).map((finding) => {
    const message =
      finding.message.length > PLAN_REVIEW_FINDING_MESSAGE_MAX
        ? finding.message.slice(0, PLAN_REVIEW_FINDING_MESSAGE_MAX - 3).trimEnd() + "..."
        : finding.message;
    return {
      code: finding.code,
      severity: finding.severity,
      message,
      ...(finding.path ? { path: finding.path } : {}),
      ...(finding.wbsId ? { wbsId: finding.wbsId } : {})
    };
  });
}

function parseReviewFindingRecords(raw: unknown): PlanArtifactReviewFindingRecordV1[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: PlanArtifactReviewFindingRecordV1[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Partial<PlanArtifactReviewFindingRecordV1>;
    if (typeof row.code !== "string" || typeof row.message !== "string") {
      continue;
    }
    if (row.severity !== "blocker" && row.severity !== "warning") {
      continue;
    }
    out.push({
      code: row.code,
      severity: row.severity,
      message: row.message,
      ...(typeof row.path === "string" && row.path.trim().length > 0 ? { path: row.path.trim() } : {}),
      ...(typeof row.wbsId === "string" && row.wbsId.trim().length > 0 ? { wbsId: row.wbsId.trim() } : {})
    });
  }
  return out;
}

/** Persisted on plan index (`latestReview`) and returned as `data.reviewRecord` when recorded. */
export type PlanArtifactReviewRecordV1 = {
  schemaVersion: 1;
  reviewedAt: string;
  reviewedVersion: number;
  planRef: string;
  profile: PlanArtifactReviewProfile;
  passed: boolean;
  blockerCount: number;
  warningCount: number;
  wbsCount: number;
  openQuestionCount: number;
  sizingFindingCount: number;
  reviewSummary: string;
  coverageSummary: PlanArtifactCoverageSummaryV1;
  /** Rubric blockers/warnings from the recorded review (bounded for dashboard rollups). */
  findings?: PlanArtifactReviewFindingRecordV1[];
};

export function buildPlanArtifactCoverageSummary(coverageMap: PlanArtifactCoverageMap): PlanArtifactCoverageSummaryV1 {
  return {
    goalsCovered: coverageMap.goals.covered.length,
    goalsUncovered: coverageMap.goals.uncovered.length,
    userStoriesCovered: coverageMap.userStories.covered.length,
    userStoriesUncovered: coverageMap.userStories.uncovered.length,
    slices: { ...coverageMap.slices }
  };
}

export function formatPlanArtifactReviewSummary(result: Pick<ReviewPlanArtifactResult, "blockers" | "warnings">): string {
  const blockers = result.blockers.length;
  const warnings = result.warnings.length;
  if (blockers === 0 && warnings === 0) {
    return "0 blockers, 0 warnings";
  }
  if (blockers === 0) {
    return `0 blockers, ${warnings} warning(s)`;
  }
  return `${blockers} blocker(s), ${warnings} warning(s)`;
}

export function buildPlanArtifactReviewRecord(args: {
  artifact: PlanArtifactV1;
  result: ReviewPlanArtifactResult;
  reviewedAt: string;
  reviewSummary?: string;
}): PlanArtifactReviewRecordV1 {
  const { artifact, result, reviewedAt } = args;
  const reviewSummary = args.reviewSummary ?? formatPlanArtifactReviewSummary(result);
  const findings = buildPlanArtifactReviewFindingRecords(result);
  return {
    schemaVersion: 1,
    reviewedAt,
    reviewedVersion: artifact.version,
    planRef: artifact.planRef,
    profile: result.profile,
    passed: result.passed,
    blockerCount: result.blockers.length,
    warningCount: result.warnings.length,
    wbsCount: artifact.wbs.length,
    openQuestionCount: result.openQuestionCount,
    sizingFindingCount: result.sizingFindings.length,
    reviewSummary,
    coverageSummary: buildPlanArtifactCoverageSummary(result.coverageMap),
    ...(findings.length > 0 ? { findings } : {})
  };
}

export function parsePlanArtifactReviewRecord(raw: unknown): PlanArtifactReviewRecordV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Partial<PlanArtifactReviewRecordV1>;
  if (
    row.schemaVersion !== 1 ||
    typeof row.reviewedAt !== "string" ||
    typeof row.reviewedVersion !== "number" ||
    typeof row.planRef !== "string" ||
    typeof row.profile !== "string" ||
    typeof row.passed !== "boolean" ||
    typeof row.blockerCount !== "number" ||
    typeof row.warningCount !== "number" ||
    typeof row.wbsCount !== "number" ||
    typeof row.openQuestionCount !== "number" ||
    typeof row.sizingFindingCount !== "number" ||
    typeof row.reviewSummary !== "string" ||
    !row.coverageSummary ||
    typeof row.coverageSummary !== "object"
  ) {
    return null;
  }
  const findings =
    row.findings === undefined ? undefined : parseReviewFindingRecords(row.findings);
  if (row.findings !== undefined && findings === null) {
    return null;
  }
  const base = row as PlanArtifactReviewRecordV1;
  if (findings === undefined) {
    return base;
  }
  return { ...base, findings: findings as PlanArtifactReviewFindingRecordV1[] };
}
