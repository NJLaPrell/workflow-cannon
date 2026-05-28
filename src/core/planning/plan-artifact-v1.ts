/**
 * PlanArtifact v1 — structured planning document types.
 *
 * Field-level spec: repo-root `PLANNER_SCHEMA.md` (A-SCHEMA).
 * JSON Schema (WP-1.2): `schemas/planning/plan-artifact.v1.schema.json`.
 */

/** Literal envelope version; bump only with a migration story. */
export const PLAN_ARTIFACT_SCHEMA_VERSION = 1 as const;

export type PlanArtifactSchemaVersion = typeof PLAN_ARTIFACT_SCHEMA_VERSION;

/** Lifecycle of a persisted plan artifact (not task execution status). */
export type PlanArtifactStatus =
  | "draft"
  | "reviewed"
  | "accepted"
  | "finalized"
  | "superseded";

/**
 * Aligns with `build-plan` / `PLANNING_WORKFLOW_TYPES` in `src/modules/planning/types.ts`.
 * Kept local to avoid core → planning module imports for types-only consumers.
 */
export type PlanArtifactPlanningType =
  | "task-breakdown"
  | "sprint-phase"
  | "task-ordering"
  | "new-feature"
  | "change";

/** Review rubric profile selection (see PLANNER_SCHEMA.md §3). */
export type PlanArtifactReviewProfile = "minimal" | "refactor" | "full-feature" | "sprint-phase";

export type PlanArtifactConfidence = "high" | "medium" | "low";

export type PlanArtifactUserStoryPriority = "must" | "should" | "could";

export type PlanArtifactRiskSeverity = "high" | "medium" | "low";

export type PlanArtifactProvenanceSource =
  | "draft-plan-artifact"
  | "import-build-plan"
  | "import-wishlist";

export type PlanArtifactIdentity = {
  title: string;
  planningType: PlanArtifactPlanningType;
  summary?: string;
  tags?: string[];
};

export type PlanArtifactUserStory = {
  id: string;
  asA: string;
  iWant: string;
  soThat: string;
  priority: PlanArtifactUserStoryPriority;
};

export type PlanArtifactValueAssessment = {
  impact: string;
  confidence: PlanArtifactConfidence;
  rationale?: string;
};

export type PlanArtifactRiskItem = {
  id: string;
  description: string;
  severity: PlanArtifactRiskSeverity;
  mitigation?: string;
};

export type PlanArtifactTechnicalImpact = {
  systemsTouched: string[];
  compatibilityNotes?: string;
  migrationImpact?: string;
};

export type PlanArtifactArchitectureDecision = {
  id: string;
  decision: string;
  rationale: string;
};

export type PlanArtifactArchitecture = {
  overview: string;
  decisions?: PlanArtifactArchitectureDecision[];
  diagrams?: Array<{
    title: string;
    mermaid?: string;
    caption?: string;
  }>;
};

export type PlanArtifactUiUxDirection = {
  hasUiChanges: boolean;
  summary?: string;
  /** Repo paths or URLs — not embedded binaries in v1. */
  mockupRefs?: string[];
};

export type PlanArtifactTestingStrategy = {
  layers: string[];
  criticalPaths: string[];
  outOfScopeTesting?: string[];
};

export type PlanArtifactPhaseRecommendation = {
  phaseKey: string;
  label: string;
  rationale: string;
  /** Exactly one entry should be true when multiple phases are listed. */
  isPrimary?: boolean;
};

/**
 * Task row shape for `persist-planning-execution-drafts` / finalize.
 * `id` is allocated at finalize when omitted.
 */
export type PlanArtifactGeneratedTaskPayload = {
  id?: string;
  title: string;
  type?: string;
  priority?: "P1" | "P2" | "P3";
  phase?: string;
  phaseKey?: string;
  approach: string;
  technicalScope: string[];
  acceptanceCriteria: string[];
  dependsOn?: string[];
  status?: "proposed" | "ready";
};

export type PlanArtifactWbsItem = {
  wbsId: string;
  path?: string;
  title: string;
  goalMapping: string[];
  suggestedTaskTitle: string;
  approach: string;
  technicalScope: string[];
  acceptanceCriteria: string[];
  testingVerification: string[];
  dependsOn: string[];
  recommendedPhase?: string;
  recommendedOrder?: number;
  sizingConfidence: PlanArtifactConfidence;
  riskNotes?: string;
  doneMeans: string;
  generatedTaskPayload: PlanArtifactGeneratedTaskPayload;
};

export type PlanArtifactApprovalRecord = {
  schemaVersion: 1;
  confirmed: boolean;
  approvedVersion: number;
  approvedAt: string;
  approvedBy: string;
  /** Duplicated from envelope `planRef` for task metadata copy-through (PLANNER Gap 4). */
  planRef: string;
  reviewSummary?: string;
  /** Deferred open-question text or ids accepted at sign-off. */
  openQuestionsAccepted?: string[];
};

export type PlanArtifactProvenance = {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  source: PlanArtifactProvenanceSource;
  chatSessionRef?: string;
  parentPlanId?: string;
  sourceIdeaId?: string;
  previousPlanArtifacts?: string[];
  /** Optional audit payload; dashboard should redact (A-SCHEMA §9). */
  sourceAnswers?: Record<string, string>;
};

/**
 * Canonical persisted PlanArtifact document (artifact.v{n}.json).
 */
export type PlanArtifactV1 = {
  schemaVersion: PlanArtifactSchemaVersion;
  planId: string;
  version: number;
  planRef: string;
  status: PlanArtifactStatus;
  identity: PlanArtifactIdentity;
  goals: string[];
  nonGoals: string[];
  userStories?: PlanArtifactUserStory[];
  valueAssessment: PlanArtifactValueAssessment;
  riskAssessment: PlanArtifactRiskItem[];
  technicalImpact: PlanArtifactTechnicalImpact;
  architecture?: PlanArtifactArchitecture;
  uiUxDirection?: PlanArtifactUiUxDirection;
  testingStrategy: PlanArtifactTestingStrategy;
  implementationGuidance: string[];
  whatNotToDo: string[];
  assumptions: string[];
  openQuestions: string[];
  wbs: PlanArtifactWbsItem[];
  phaseRecommendations: PlanArtifactPhaseRecommendation[];
  /**
   * Optional denormalized preview from finalize dry-run; canonical source is `wbs[].generatedTaskPayload`.
   */
  taskGenerationPayloads?: PlanArtifactGeneratedTaskPayload[];
  approvalRecord?: PlanArtifactApprovalRecord;
  provenance: PlanArtifactProvenance;
};

export function isPlanArtifactSchemaVersion(value: unknown): value is PlanArtifactSchemaVersion {
  return value === PLAN_ARTIFACT_SCHEMA_VERSION;
}

/** Narrow unknown JSON to PlanArtifact v1 envelope (structural; not full schema validation). */
export function isPlanArtifactV1(value: unknown): value is PlanArtifactV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const doc = value as Record<string, unknown>;
  return (
    isPlanArtifactSchemaVersion(doc.schemaVersion) &&
    typeof doc.planId === "string" &&
    typeof doc.version === "number" &&
    typeof doc.planRef === "string" &&
    typeof doc.status === "string" &&
    doc.identity !== null &&
    typeof doc.identity === "object" &&
    Array.isArray(doc.goals) &&
    Array.isArray(doc.wbs) &&
    doc.provenance !== null &&
    typeof doc.provenance === "object"
  );
}
