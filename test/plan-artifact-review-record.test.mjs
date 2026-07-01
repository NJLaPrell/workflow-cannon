import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanArtifactReviewFindingRecords,
  buildPlanArtifactReviewRecord,
  parsePlanArtifactReviewRecord
} from "../dist/core/planning/plan-artifact-review-record.js";

describe("plan-artifact-review-record findings", () => {
  it("buildPlanArtifactReviewRecord persists bounded blocker and warning rows", () => {
    const record = buildPlanArtifactReviewRecord({
      artifact: {
        version: 2,
        planRef: "PLAN-1",
        wbs: [{ wbsId: "W1" }],
        openQuestions: ["Still open?"]
      },
      reviewedAt: "2026-06-01T00:00:00.000Z",
      result: {
        passed: false,
        profile: "minimal",
        blockers: [
          {
            code: "RUBRIC-MIN-WBS-AC",
            severity: "blocker",
            message: "WBS row lacks acceptance criteria",
            path: "wbs[0]",
            wbsId: "W1"
          }
        ],
        warnings: [
          {
            code: "RUBRIC-OQ-UNRESOLVED",
            severity: "warning",
            message: "1 open question(s) remain",
            path: "openQuestions"
          }
        ],
        coverageMap: {
          goals: { covered: [], uncovered: [] },
          userStories: { covered: [], uncovered: [] },
          slices: {
            architecture: "not-applicable",
            uiUx: "not-applicable",
            testing: "not-applicable",
            rolloutDocsMigration: "not-applicable"
          }
        },
        sizingFindings: [],
        openQuestionCount: 1
      }
    });

    assert.equal(record.blockerCount, 1);
    assert.equal(record.warningCount, 1);
    assert.ok(Array.isArray(record.findings));
    assert.equal(record.findings.length, 2);
    assert.equal(record.findings[0].code, "RUBRIC-MIN-WBS-AC");
    assert.equal(record.findings[0].wbsId, "W1");
    assert.equal(record.findings[1].severity, "warning");
  });

  it("parsePlanArtifactReviewRecord accepts optional findings array", () => {
    const parsed = parsePlanArtifactReviewRecord({
      schemaVersion: 1,
      reviewedAt: "2026-06-01T00:00:00.000Z",
      reviewedVersion: 1,
      planRef: "PLAN-1",
      profile: "minimal",
      passed: true,
      blockerCount: 0,
      warningCount: 0,
      wbsCount: 1,
      openQuestionCount: 0,
      sizingFindingCount: 0,
      reviewSummary: "0 blockers, 0 warnings",
      coverageSummary: {
        goalsCovered: 1,
        goalsUncovered: 0,
        userStoriesCovered: 0,
        userStoriesUncovered: 0,
        slices: {
          architecture: "not-applicable",
          uiUx: "not-applicable",
          testing: "not-applicable",
          rolloutDocsMigration: "not-applicable"
        }
      },
      findings: [
        {
          code: "RUBRIC-OQ-UNRESOLVED",
          severity: "warning",
          message: "legacy row",
          path: "openQuestions"
        }
      ]
    });

    assert.ok(parsed);
    assert.equal(parsed.findings?.length, 1);
    assert.equal(buildPlanArtifactReviewFindingRecords({ blockers: [], warnings: [] }).length, 0);
  });
});
