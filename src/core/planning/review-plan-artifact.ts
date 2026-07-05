/**
 * Deterministic PlanArtifact v1 review engine.
 */
import type {
  PlanArtifactReviewProfile,
  PlanArtifactV1,
  PlanArtifactWbsItem
} from "./plan-artifact-v1.js";
import { validatePlanArtifactWbsItemShape } from "./normalize-wbs-to-task-draft.js";

export type PlanArtifactReviewSeverity = "blocker" | "warning";

export type PlanArtifactReviewFinding = {
  code: string;
  severity: PlanArtifactReviewSeverity;
  message: string;
  path?: string;
  wbsId?: string;
};

export type PlanArtifactCoverageSliceStatus = "covered" | "missing" | "waived" | "not-applicable";

export type PlanArtifactCoverageMap = {
  goals: { covered: string[]; uncovered: string[] };
  userStories: { covered: string[]; uncovered: string[] };
  slices: {
    architecture: PlanArtifactCoverageSliceStatus;
    uiUx: PlanArtifactCoverageSliceStatus;
    testing: PlanArtifactCoverageSliceStatus;
    rolloutDocsMigration: PlanArtifactCoverageSliceStatus;
  };
};

export type PlanArtifactReviewWaiver = {
  code: string;
  rationale: string;
};

export type ReviewPlanArtifactOptions = {
  profile?: PlanArtifactReviewProfile;
  waivers?: PlanArtifactReviewWaiver[];
};

export type ReviewPlanArtifactResult = {
  passed: boolean;
  profile: PlanArtifactReviewProfile;
  blockers: PlanArtifactReviewFinding[];
  warnings: PlanArtifactReviewFinding[];
  coverageMap: PlanArtifactCoverageMap;
  sizingFindings: PlanArtifactReviewFinding[];
  openQuestionCount: number;
};

const PLANNING_TYPES = new Set([
  "task-breakdown",
  "sprint-phase",
  "task-ordering",
  "new-feature",
  "change"
]);

const VAGUE_AC_RE = /^(done|complete|works)$/i;
const VERIFY_KEYWORD_RE = /\b(test|verify|check|ci|extension|e2e)\b/i;
const UI_SYSTEM_RE = /\b(dashboard|extension|webview|ui)\b/i;
const ROLLOUT_SIGNAL_RE = /\b(production|prod|release|deploy|migration|rollout|rollback)\b/i;
const ROLLOUT_WBS_RE = /\b(rollout|rollback|migration|deploy|release|docs)\b/i;
const BEHAVIOR_CHANGE_RE =
  /\b(behavior|breaking|compatib|migration|schema|api.change|contract|runtime)\b/i;
const PERSISTENCE_TASK_GEN_RE =
  /\b(persistence|sqlite|workspace-kit\.db|create-task|persist-planning|finalize-plan|task.store|task.generation|migrate-task|generatedTaskPayload)\b/i;

function blocker(
  code: string,
  message: string,
  opts?: { path?: string; wbsId?: string }
): PlanArtifactReviewFinding {
  return { code, severity: "blocker", message, ...opts };
}

function warning(
  code: string,
  message: string,
  opts?: { path?: string; wbsId?: string }
): PlanArtifactReviewFinding {
  return { code, severity: "warning", message, ...opts };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((x) => typeof x === "string" && x.trim().length > 0)
  );
}

export function resolvePlanArtifactReviewProfile(
  _artifact: PlanArtifactV1,
  explicit?: PlanArtifactReviewProfile
): PlanArtifactReviewProfile {
  if (explicit) {
    return explicit;
  }
  return "minimal";
}

/** Critical open questions use a stable prefix from idea-planning artifact composition. */
export function isCriticalOpenQuestion(question: string): boolean {
  const q = question.trim();
  if (q.length === 0) {
    return false;
  }
  const lower = q.toLowerCase();
  return (
    lower.startsWith("unresolved critical question:") ||
    lower.startsWith("[critical]") ||
    lower.startsWith("critical:")
  );
}

function waivedCodes(waivers: PlanArtifactReviewWaiver[] | undefined): Set<string> {
  return new Set((waivers ?? []).map((w) => w.code).filter((c) => c.length > 0));
}

function goalReferencedInWbs(goal: string, wbs: PlanArtifactWbsItem[]): boolean {
  const needle = goal.trim().toLowerCase();
  return wbs.some(
    (row) =>
      row.goalMapping.some((g) => g.trim().toLowerCase() === needle) ||
      row.title.toLowerCase().includes(needle) ||
      row.approach.toLowerCase().includes(needle)
  );
}

function storyReferenced(artifact: PlanArtifactV1, storyId: string): boolean {
  const needle = storyId.trim().toLowerCase();
  const story = artifact.userStories?.find((s) => s.id === storyId);
  const textNeedles = [
    needle,
    story?.asA?.toLowerCase() ?? "",
    story?.iWant?.toLowerCase() ?? "",
    story?.soThat?.toLowerCase() ?? ""
  ].filter((t) => t.length > 3);

  for (const row of artifact.wbs) {
    const haystack = `${row.title} ${row.approach} ${row.goalMapping.join(" ")}`.toLowerCase();
    if (textNeedles.some((t) => haystack.includes(t))) {
      return true;
    }
  }
  return false;
}

function uiInScope(artifact: PlanArtifactV1): boolean {
  if (artifact.uiUxDirection?.hasUiChanges === true) {
    return true;
  }
  return (artifact.technicalImpact.systemsTouched ?? []).some((s) => UI_SYSTEM_RE.test(s));
}

function planTextHaystack(artifact: PlanArtifactV1): string {
  return [
    ...artifact.goals,
    ...(artifact.technicalImpact.systemsTouched ?? []),
    ...artifact.implementationGuidance,
    ...artifact.wbs.flatMap((row) => [
      row.title,
      row.approach,
      ...row.technicalScope,
      ...row.testingVerification
    ])
  ]
    .join(" ")
    .toLowerCase();
}

function behaviorChangeInScope(artifact: PlanArtifactV1): boolean {
  if (artifact.identity.planningType === "change") {
    return true;
  }
  return BEHAVIOR_CHANGE_RE.test(planTextHaystack(artifact));
}

function hasMigrationOrCompatibilityNotes(artifact: PlanArtifactV1): boolean {
  return (
    nonEmptyString(artifact.technicalImpact.migrationImpact) ||
    nonEmptyString(artifact.technicalImpact.compatibilityNotes)
  );
}

function persistenceOrTaskGenChangeInScope(artifact: PlanArtifactV1): boolean {
  return PERSISTENCE_TASK_GEN_RE.test(planTextHaystack(artifact));
}

function hasRolloutOrRollbackCoverage(artifact: PlanArtifactV1): boolean {
  if (nonEmptyString(artifact.technicalImpact.migrationImpact)) {
    return true;
  }
  if (artifact.implementationGuidance.some((g) => ROLLOUT_WBS_RE.test(g))) {
    return true;
  }
  return artifact.wbs.some(
    (row) =>
      ROLLOUT_WBS_RE.test(row.title) ||
      row.technicalScope.some((s) => ROLLOUT_WBS_RE.test(s)) ||
      row.testingVerification.some((s) => ROLLOUT_WBS_RE.test(s)) ||
      ROLLOUT_WBS_RE.test(row.approach)
  );
}

function testingSliceCovered(artifact: PlanArtifactV1): boolean {
  const layers = artifact.testingStrategy.layers.map((l) => l.toLowerCase());
  if (layers.length === 0) {
    return false;
  }
  return artifact.wbs.some((row) =>
    row.testingVerification.some((line) => {
      const lower = line.toLowerCase();
      return layers.some((layer) => lower.includes(layer)) || VERIFY_KEYWORD_RE.test(lower);
    })
  );
}

function rolloutSliceCovered(artifact: PlanArtifactV1): boolean {
  const systems = artifact.technicalImpact.systemsTouched.join(" ").toLowerCase();
  const needsRollout =
    ROLLOUT_SIGNAL_RE.test(systems) ||
    ROLLOUT_SIGNAL_RE.test(artifact.goals.join(" ")) ||
    persistenceOrTaskGenChangeInScope(artifact);
  if (!needsRollout) {
    return true;
  }
  return hasRolloutOrRollbackCoverage(artifact);
}

function buildMinimalCoverageMap(artifact: PlanArtifactV1): PlanArtifactCoverageMap {
  return {
    goals: { covered: [...(artifact.goals ?? [])], uncovered: [] },
    userStories: { covered: [], uncovered: [] },
    slices: {
      architecture: "not-applicable",
      uiUx: "not-applicable",
      testing: "not-applicable",
      rolloutDocsMigration: "not-applicable"
    }
  };
}

/**
 * Minimal profile blockers — core completeness only.
 */
function reviewMinimalBlockers(
  artifact: PlanArtifactV1,
  blockers: PlanArtifactReviewFinding[],
  warnings: PlanArtifactReviewFinding[]
): void {
  if (!nonEmptyStringArray(artifact.goals)) {
    blockers.push(blocker("RUBRIC-MIN-GOALS", "goals must be a non-empty array", { path: "goals" }));
  }

  if (!Array.isArray(artifact.wbs) || artifact.wbs.length === 0) {
    blockers.push(blocker("RUBRIC-MIN-WBS", "wbs must contain at least one row", { path: "wbs" }));
    return;
  }

  for (let i = 0; i < artifact.wbs.length; i += 1) {
    const row = artifact.wbs[i];
    const basePath = `wbs[${i}]`;

    if (!nonEmptyStringArray(row.acceptanceCriteria)) {
      blockers.push(
        blocker("RUBRIC-MIN-WBS-AC", "WBS row lacks acceptance criteria", {
          path: `${basePath}.acceptanceCriteria`,
          wbsId: row.wbsId
        })
      );
    }

    if (!nonEmptyStringArray(row.testingVerification)) {
      blockers.push(
        blocker("RUBRIC-MIN-WBS-VERIFY", "WBS row lacks testing verification", {
          path: `${basePath}.testingVerification`,
          wbsId: row.wbsId
        })
      );
    }
  }

  if (!Array.isArray(artifact.openQuestions)) {
    blockers.push(
      blocker("RUBRIC-MIN-OQ-MISSING", "openQuestions field is required", { path: "openQuestions" })
    );
    return;
  }

  for (let i = 0; i < artifact.openQuestions.length; i += 1) {
    const question = artifact.openQuestions[i];
    if (isCriticalOpenQuestion(question)) {
      blockers.push(
        blocker("RUBRIC-MIN-OQ-CRITICAL", `Unresolved critical open question: ${question}`, {
          path: `openQuestions[${i}]`
        })
      );
    }
  }

  const nonCriticalCount = artifact.openQuestions.filter((q) => !isCriticalOpenQuestion(q)).length;
  if (nonCriticalCount > 0) {
    warnings.push(
      warning("RUBRIC-OQ-UNRESOLVED", `${nonCriticalCount} non-critical open question(s) remain`, {
        path: "openQuestions"
      })
    );
  }
}

function reviewCoreSections(
  artifact: PlanArtifactV1,
  findings: { blockers: PlanArtifactReviewFinding[]; warnings: PlanArtifactReviewFinding[] }
): void {
  const { blockers, warnings } = findings;
  if (!nonEmptyString(artifact.identity?.title)) {
    blockers.push(blocker("RUBRIC-CORE-TITLE", "identity.title is required", { path: "identity.title" }));
  }
  if (!PLANNING_TYPES.has(artifact.identity.planningType)) {
    blockers.push(
      blocker("RUBRIC-CORE-PLANNING-TYPE", "identity.planningType is invalid", {
        path: "identity.planningType"
      })
    );
  }
  if (!nonEmptyStringArray(artifact.goals)) {
    blockers.push(blocker("RUBRIC-CORE-GOALS", "goals must be a non-empty array", { path: "goals" }));
  }
  if (!Array.isArray(artifact.nonGoals)) {
    blockers.push(blocker("RUBRIC-CORE-NONGOALS", "nonGoals field is required", { path: "nonGoals" }));
  }
  if (!artifact.valueAssessment || !nonEmptyString(artifact.valueAssessment.impact)) {
    blockers.push(
      blocker("RUBRIC-CORE-VALUE", "valueAssessment.impact is required", { path: "valueAssessment.impact" })
    );
  }
  if (!artifact.valueAssessment?.confidence) {
    blockers.push(
      blocker("RUBRIC-CORE-VALUE", "valueAssessment.confidence is required", {
        path: "valueAssessment.confidence"
      })
    );
  }
  if (!Array.isArray(artifact.riskAssessment)) {
    blockers.push(
      blocker("RUBRIC-CORE-RISK", "riskAssessment field is required", { path: "riskAssessment" })
    );
  }
  if (!artifact.technicalImpact || !Array.isArray(artifact.technicalImpact.systemsTouched)) {
    blockers.push(
      blocker("RUBRIC-CORE-TECH", "technicalImpact.systemsTouched is required", {
        path: "technicalImpact.systemsTouched"
      })
    );
  }
  if (!nonEmptyStringArray(artifact.testingStrategy?.layers)) {
    blockers.push(
      blocker("RUBRIC-CORE-TEST-LAYERS", "testingStrategy.layers must be non-empty", {
        path: "testingStrategy.layers"
      })
    );
  }
  if (!nonEmptyStringArray(artifact.testingStrategy?.criticalPaths)) {
    blockers.push(
      blocker("RUBRIC-CORE-TEST-PATHS", "testingStrategy.criticalPaths must be non-empty", {
        path: "testingStrategy.criticalPaths"
      })
    );
  }
  if (!nonEmptyStringArray(artifact.implementationGuidance)) {
    blockers.push(
      blocker("RUBRIC-CORE-GUIDANCE", "implementationGuidance must be non-empty", {
        path: "implementationGuidance"
      })
    );
  }
  if (!nonEmptyStringArray(artifact.whatNotToDo)) {
    blockers.push(
      blocker("RUBRIC-CORE-ANTIPATTERNS", "whatNotToDo must be non-empty", { path: "whatNotToDo" })
    );
  }
  if (!Array.isArray(artifact.assumptions)) {
    blockers.push(blocker("RUBRIC-CORE-ASSUMPTIONS", "assumptions field is required", { path: "assumptions" }));
  }
  if (!Array.isArray(artifact.openQuestions)) {
    blockers.push(
      blocker("RUBRIC-CORE-OPEN-QUESTIONS", "openQuestions field is required", { path: "openQuestions" })
    );
  }
  if (!Array.isArray(artifact.wbs) || artifact.wbs.length === 0) {
    blockers.push(blocker("RUBRIC-CORE-WBS", "wbs must contain at least one row", { path: "wbs" }));
  }
  if (!Array.isArray(artifact.phaseRecommendations) || artifact.phaseRecommendations.length === 0) {
    blockers.push(
      blocker("RUBRIC-CORE-PHASES", "phaseRecommendations must be non-empty", {
        path: "phaseRecommendations"
      })
    );
  } else if (!artifact.phaseRecommendations.some((p) => p.isPrimary === true)) {
    blockers.push(
      blocker("RUBRIC-CORE-PHASE-PRIMARY", "phaseRecommendations requires one isPrimary: true", {
        path: "phaseRecommendations"
      })
    );
  }
  const prov = artifact.provenance;
  if (
    !prov ||
    !nonEmptyString(prov.createdAt) ||
    !nonEmptyString(prov.updatedAt) ||
    !nonEmptyString(prov.createdBy) ||
    !nonEmptyString(prov.source)
  ) {
    blockers.push(blocker("RUBRIC-CORE-PROVENANCE", "provenance required fields missing", { path: "provenance" }));
  }

  if (artifact.openQuestions.length > 0) {
    warnings.push(
      warning("RUBRIC-OQ-UNRESOLVED", `${artifact.openQuestions.length} open question(s) remain`, {
        path: "openQuestions"
      })
    );
  }
  for (const risk of artifact.riskAssessment) {
    if (risk.severity === "high" && !nonEmptyString(risk.mitigation)) {
      warnings.push(
        warning("RUBRIC-RISK-HIGH-UNMITIGATED", `High risk '${risk.id}' has no mitigation`, {
          path: `riskAssessment/${risk.id}`
        })
      );
    }
  }
  if (artifact.valueAssessment.confidence === "low" && artifact.assumptions.length < 2) {
    warnings.push(
      warning(
        "RUBRIC-VALUE-LOW-CONFIDENCE",
        "valueAssessment.confidence is low with fewer than 2 assumptions",
        { path: "valueAssessment.confidence" }
      )
    );
  }
}

function reviewGeneratedTaskPayload(
  row: PlanArtifactWbsItem,
  basePath: string,
  blockers: PlanArtifactReviewFinding[]
): void {
  const payload = row.generatedTaskPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    blockers.push(
      blocker("RUBRIC-WBS-PAYLOAD-INVALID", "generatedTaskPayload missing or invalid", {
        path: `${basePath}.generatedTaskPayload`,
        wbsId: row.wbsId
      })
    );
    return;
  }
  const issues: string[] = [];
  if (!nonEmptyString(payload.title)) {
    issues.push("title");
  }
  if (!nonEmptyString(payload.approach)) {
    issues.push("approach");
  }
  if (!nonEmptyStringArray(payload.technicalScope)) {
    issues.push("technicalScope");
  }
  if (!nonEmptyStringArray(payload.acceptanceCriteria)) {
    issues.push("acceptanceCriteria");
  }
  if (issues.length > 0) {
    blockers.push(
      blocker(
        "RUBRIC-WBS-PAYLOAD-INVALID",
        `generatedTaskPayload missing or empty: ${issues.join(", ")}`,
        { path: `${basePath}.generatedTaskPayload`, wbsId: row.wbsId }
      )
    );
  }
}

function reviewProfileSections(
  artifact: PlanArtifactV1,
  profile: PlanArtifactReviewProfile,
  blockers: PlanArtifactReviewFinding[]
): void {
  if (profile === "refactor" || profile === "full-feature") {
    if (!nonEmptyStringArray(artifact.technicalImpact?.systemsTouched)) {
      blockers.push(
        blocker(
          "RUBRIC-PROFILE-SYSTEMS",
          "technicalImpact.systemsTouched must identify affected systems for this profile",
          { path: "technicalImpact.systemsTouched" }
        )
      );
    }
    if (behaviorChangeInScope(artifact) && !hasMigrationOrCompatibilityNotes(artifact)) {
      blockers.push(
        blocker(
          "RUBRIC-PROFILE-MIGRATION",
          "migrationImpact or compatibilityNotes required when plan changes behavior",
          { path: "technicalImpact.migrationImpact" }
        )
      );
    }
    if (!nonEmptyString(artifact.architecture?.overview)) {
      blockers.push(
        blocker("RUBRIC-PROFILE-ARCH", "architecture.overview is required for this profile", {
          path: "architecture.overview"
        })
      );
    }
  }
  if (profile === "full-feature") {
    if (!Array.isArray(artifact.userStories) || artifact.userStories.length === 0) {
      blockers.push(
        blocker("RUBRIC-PROFILE-STORIES", "userStories must be non-empty for full-feature profile", {
          path: "userStories"
        })
      );
    }
    if (uiInScope(artifact) && !nonEmptyString(artifact.uiUxDirection?.summary)) {
      blockers.push(
        blocker("RUBRIC-PROFILE-UI", "uiUxDirection.summary is required when UI is in scope", {
          path: "uiUxDirection.summary"
        })
      );
    }
    if (persistenceOrTaskGenChangeInScope(artifact) && !hasRolloutOrRollbackCoverage(artifact)) {
      blockers.push(
        blocker(
          "RUBRIC-PROFILE-ROLLOUT",
          "rollout or rollback notes required when persistence, commands, or task generation change",
          { path: "implementationGuidance" }
        )
      );
    }
  }
  if (profile === "refactor" && !testingSliceCovered(artifact)) {
    blockers.push(
      blocker(
        "RUBRIC-PROFILE-TEST",
        "testingStrategy layers must be reflected in WBS testingVerification for refactor profile",
        { path: "testingStrategy.layers" }
      )
    );
  }
  if (profile === "sprint-phase" && artifact.phaseRecommendations.length < 2) {
    blockers.push(
      blocker("RUBRIC-PROFILE-SPRINT-PHASES", "sprint-phase profile requires >= 2 phaseRecommendations", {
        path: "phaseRecommendations"
      })
    );
  }
}

function reviewWbsRows(
  artifact: PlanArtifactV1,
  blockers: PlanArtifactReviewFinding[],
  warnings: PlanArtifactReviewFinding[]
): void {
  const seenIds = new Set<string>();
  const knownIds = new Set(artifact.wbs.map((r) => r.wbsId));

  for (let i = 0; i < artifact.wbs.length; i += 1) {
    const row = artifact.wbs[i];
    const basePath = `wbs[${i}]`;

    if (seenIds.has(row.wbsId)) {
      blockers.push(
        blocker("RUBRIC-WBS-DUP-ID", `Duplicate wbsId '${row.wbsId}'`, { path: basePath, wbsId: row.wbsId })
      );
    } else {
      seenIds.add(row.wbsId);
    }

    const shape = validatePlanArtifactWbsItemShape(row);
    if (!shape.ok) {
      const payloadFinding = shape.findings.find((f) =>
        f.field?.startsWith("generatedTaskPayload")
      );
      if (payloadFinding) {
        blockers.push(
          blocker("RUBRIC-WBS-PAYLOAD-INVALID", payloadFinding.message, {
            path: `${basePath}.generatedTaskPayload`,
            wbsId: row.wbsId
          })
        );
      } else {
        blockers.push(
          blocker("RUBRIC-WBS-MISSING-FIELD", shape.findings[0]?.message ?? "WBS row invalid", {
            path: basePath,
            wbsId: row.wbsId
          })
        );
      }
      continue;
    }

    const item = shape.item;
    reviewGeneratedTaskPayload(item, basePath, blockers);
    if (
      item.technicalScope.length === 0 ||
      item.acceptanceCriteria.length === 0 ||
      item.testingVerification.length === 0
    ) {
      blockers.push(
        blocker("RUBRIC-WBS-EMPTY-SCOPE", "WBS row has empty scope, AC, or testingVerification", {
          path: basePath,
          wbsId: item.wbsId
        })
      );
    }

    for (const dep of item.dependsOn) {
      if (!knownIds.has(dep)) {
        blockers.push(
          blocker("RUBRIC-WBS-BAD-DEP", `dependsOn references unknown wbsId '${dep}'`, {
            path: `${basePath}.dependsOn`,
            wbsId: item.wbsId
          })
        );
      }
    }

    const bulletCount = item.technicalScope.length + item.acceptanceCriteria.length;
    if (item.sizingConfidence === "low" && bulletCount > 12) {
      blockers.push(
        blocker("RUBRIC-WBS-LOW-SIZING-OVERSIZE", `WBS row has ${bulletCount} scope/AC bullets with low sizing`, {
          path: basePath,
          wbsId: item.wbsId
        })
      );
    }
    if (item.sizingConfidence === "medium" && bulletCount > 8) {
      warnings.push(
        warning("RUBRIC-WBS-MEDIUM-LARGE", `WBS row has ${bulletCount} scope/AC bullets with medium sizing`, {
          path: basePath,
          wbsId: item.wbsId
        })
      );
    }

    for (const ac of item.acceptanceCriteria) {
      const words = ac.trim().split(/\s+/).filter(Boolean);
      if (words.length < 4 || VAGUE_AC_RE.test(ac.trim())) {
        warnings.push(
          warning("RUBRIC-WBS-VAGUE-AC", `Vague acceptance criterion: "${ac}"`, {
            path: `${basePath}.acceptanceCriteria`,
            wbsId: item.wbsId
          })
        );
      }
    }

    if (item.doneMeans.trim().split(/\s+/).filter(Boolean).length < 10) {
      warnings.push(
        warning("RUBRIC-WBS-VAGUE-DONE", "doneMeans is shorter than 10 words", {
          path: `${basePath}.doneMeans`,
          wbsId: item.wbsId
        })
      );
    }

    if (!item.testingVerification.some((line) => VERIFY_KEYWORD_RE.test(line))) {
      warnings.push(
        warning("RUBRIC-WBS-NO-VERIFY", "testingVerification lacks test-layer keywords", {
          path: `${basePath}.testingVerification`,
          wbsId: item.wbsId
        })
      );
    }
  }
}

function buildCoverageMap(
  artifact: PlanArtifactV1,
  profile: PlanArtifactReviewProfile,
  waived: Set<string>
): { map: PlanArtifactCoverageMap; blockers: PlanArtifactReviewFinding[] } {
  const blockers: PlanArtifactReviewFinding[] = [];
  const coveredGoals: string[] = [];
  const uncoveredGoals: string[] = [];
  for (const goal of artifact.goals) {
    if (goalReferencedInWbs(goal, artifact.wbs)) {
      coveredGoals.push(goal);
    } else {
      uncoveredGoals.push(goal);
      blockers.push(
        blocker("RUBRIC-COV-GOAL", `Goal has no WBS goalMapping: ${goal}`, { path: "goals" })
      );
    }
  }

  const coveredStories: string[] = [];
  const uncoveredStories: string[] = [];
  if (profile === "full-feature" && artifact.userStories) {
    for (const story of artifact.userStories) {
      if (storyReferenced(artifact, story.id)) {
        coveredStories.push(story.id);
      } else {
        uncoveredStories.push(story.id);
        blockers.push(
          blocker("RUBRIC-COV-STORY", `User story '${story.id}' is not referenced in WBS`, {
            path: "userStories"
          })
        );
      }
    }
  }

  let architecture: PlanArtifactCoverageSliceStatus = nonEmptyString(artifact.architecture?.overview)
    ? "covered"
    : "missing";
  if (profile !== "refactor" && profile !== "full-feature") {
    architecture = nonEmptyString(artifact.architecture?.overview) ? "covered" : "not-applicable";
  }

  let uiUx: PlanArtifactCoverageSliceStatus;
  if (!uiInScope(artifact)) {
    uiUx = "not-applicable";
  } else {
    uiUx = nonEmptyString(artifact.uiUxDirection?.summary) ? "covered" : "missing";
  }

  const testing: PlanArtifactCoverageSliceStatus = testingSliceCovered(artifact) ? "covered" : "missing";
  let rollout: PlanArtifactCoverageSliceStatus = rolloutSliceCovered(artifact) ? "covered" : "missing";

  const applyWaiver = (
    code: string,
    slice: keyof PlanArtifactCoverageMap["slices"],
    current: PlanArtifactCoverageSliceStatus
  ): PlanArtifactCoverageSliceStatus => {
    if (!waived.has(code) || current !== "missing") {
      return current;
    }
    const idx = blockers.findIndex((b) => b.code === code);
    if (idx >= 0) {
      blockers.splice(idx, 1);
    }
    return "waived";
  };

  if (profile === "refactor" || profile === "full-feature") {
    if (architecture === "missing" && !waived.has("RUBRIC-COV-ARCH")) {
      blockers.push(blocker("RUBRIC-COV-ARCH", "Architecture slice is missing", { path: "architecture" }));
    }
    architecture = applyWaiver("RUBRIC-COV-ARCH", "architecture", architecture);
  }

  if (uiInScope(artifact)) {
    if (uiUx === "missing" && !waived.has("RUBRIC-COV-UI")) {
      blockers.push(blocker("RUBRIC-COV-UI", "UI/UX slice is missing", { path: "uiUxDirection" }));
    }
    uiUx = applyWaiver("RUBRIC-COV-UI", "uiUx", uiUx);
  }

  if (testing === "missing" && !waived.has("RUBRIC-COV-TEST")) {
    blockers.push(blocker("RUBRIC-COV-TEST", "Testing slice is missing in WBS verification", { path: "wbs" }));
  }
  const testingFinal = applyWaiver("RUBRIC-COV-TEST", "testing", testing);

  if (rollout === "missing" && !waived.has("RUBRIC-COV-ROLLOUT")) {
    blockers.push(
      blocker("RUBRIC-COV-ROLLOUT", "Rollout/docs/migration slice is missing", { path: "technicalImpact" })
    );
  }
  rollout = applyWaiver("RUBRIC-COV-ROLLOUT", "rolloutDocsMigration", rollout);

  return {
    map: {
      goals: { covered: coveredGoals, uncovered: uncoveredGoals },
      userStories: { covered: coveredStories, uncovered: uncoveredStories },
      slices: {
        architecture,
        uiUx,
        testing: testingFinal,
        rolloutDocsMigration: rollout
      }
    },
    blockers
  };
}

/**
 * Run A-RUBRIC checks on a validated PlanArtifact v1 document.
 */
export function reviewPlanArtifact(
  artifact: PlanArtifactV1,
  options: ReviewPlanArtifactOptions = {}
): ReviewPlanArtifactResult {
  const profile = resolvePlanArtifactReviewProfile(artifact, options.profile);
  const blockers: PlanArtifactReviewFinding[] = [];
  const warnings: PlanArtifactReviewFinding[] = [];

  if (profile === "minimal") {
    reviewMinimalBlockers(artifact, blockers, warnings);
    return {
      passed: blockers.length === 0,
      profile,
      blockers,
      warnings,
      coverageMap: buildMinimalCoverageMap(artifact),
      sizingFindings: [],
      openQuestionCount: Array.isArray(artifact.openQuestions) ? artifact.openQuestions.length : 0
    };
  }

  reviewCoreSections(artifact, { blockers, warnings });
  reviewProfileSections(artifact, profile, blockers);
  reviewWbsRows(artifact, blockers, warnings);

  const { map: coverageMap, blockers: coverageBlockers } = buildCoverageMap(
    artifact,
    profile,
    waivedCodes(options.waivers)
  );
  blockers.push(...coverageBlockers);

  const sizingFindings = [...blockers, ...warnings].filter(
    (f) => f.wbsId && f.code.startsWith("RUBRIC-WBS-")
  );

  return {
    passed: blockers.length === 0,
    profile,
    blockers,
    warnings,
    coverageMap,
    sizingFindings,
    openQuestionCount: artifact.openQuestions.length
  };
}
