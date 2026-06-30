import type { PlanArtifactCoverageMap, ReviewPlanArtifactResult } from "./review-plan-artifact.js";
import type { PlanArtifactReviewProfile, PlanArtifactV1 } from "./plan-artifact-v1.js";

export type PlanArtifactCoverageSummaryV1 = {
  goalsCovered: number;
  goalsUncovered: number;
  userStoriesCovered: number;
  userStoriesUncovered: number;
  slices: PlanArtifactCoverageMap["slices"];
};

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
    coverageSummary: buildPlanArtifactCoverageSummary(result.coverageMap)
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
  return row as PlanArtifactReviewRecordV1;
}
