/**
 * Unified IdeaPlan document types and six-state lifecycle machine.
 *
 * Storage decision: `.ai/adrs/ADR-idea-plan-unified-document-storage-v1.md`
 * Persisted artifact path: `.workspace-kit/planning/plan-artifacts/<uuid>/artifact.vN.json`
 */

export const IDEA_PLAN_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type IdeaPlanDocumentSchemaVersion = typeof IDEA_PLAN_DOCUMENT_SCHEMA_VERSION;

/** Six-state unified IdeaPlan lifecycle (Phase 140). */
export const IDEA_PLAN_STATUSES = [
  "idea",
  "brainstorming",
  "planning",
  "reviewed",
  "accepted",
  "delivered"
] as const;

export type IdeaPlanStatus = (typeof IDEA_PLAN_STATUSES)[number];

/** Legacy workflow_ideas.status values and aliases accepted at API boundaries. */
export const IDEA_PLAN_STATUS_LEGACY_ALIASES = ["open", "planning", "planned"] as const;

export type IdeaPlanStatusLegacyAlias = (typeof IDEA_PLAN_STATUS_LEGACY_ALIASES)[number];

/** Nine accepted status strings: six canonical states plus three legacy aliases. */
export const IDEA_PLAN_STATUS_INPUTS = [
  ...IDEA_PLAN_STATUSES,
  "open",
  "planned"
] as const;

export type IdeaPlanStatusInput = (typeof IDEA_PLAN_STATUS_INPUTS)[number];

const IDEA_PLAN_STATUS_LEGACY_TO_CANONICAL: Record<IdeaPlanStatusLegacyAlias, IdeaPlanStatus> = {
  open: "idea",
  planning: "planning",
  planned: "accepted"
};

/**
 * Allowed status transitions for the unified IdeaPlan document.
 * Same-state entries support idempotent updates and in-place session mutation.
 * `idea` may skip brainstorming and advance directly to `planning`.
 */
export const IDEA_PLAN_STATUS_TRANSITIONS: Record<IdeaPlanStatus, readonly IdeaPlanStatus[]> = {
  idea: ["brainstorming", "planning"],
  brainstorming: ["brainstorming", "planning"],
  planning: ["planning", "reviewed"],
  reviewed: ["reviewed", "planning", "accepted"],
  accepted: ["accepted", "delivered"],
  delivered: ["delivered"]
};

export function isIdeaPlanStatus(value: string): value is IdeaPlanStatus {
  return (IDEA_PLAN_STATUSES as readonly string[]).includes(value);
}

export function isIdeaPlanStatusInput(value: string): value is IdeaPlanStatusInput {
  return (IDEA_PLAN_STATUS_INPUTS as readonly string[]).includes(value);
}

export function normalizeIdeaPlanStatus(value: string): IdeaPlanStatus | undefined {
  if (isIdeaPlanStatus(value)) {
    return value;
  }
  if (value === "open" || value === "planning" || value === "planned") {
    return IDEA_PLAN_STATUS_LEGACY_TO_CANONICAL[value];
  }
  return undefined;
}

export function parseIdeaPlanStatus(raw: unknown): IdeaPlanStatus | undefined {
  return typeof raw === "string" ? normalizeIdeaPlanStatus(raw) : undefined;
}

export function isIdeaPlanStatusTransitionAllowed(from: IdeaPlanStatus, to: IdeaPlanStatus): boolean {
  return IDEA_PLAN_STATUS_TRANSITIONS[from].includes(to);
}

export type AgentDirectiveQuestionType = "score-1-10" | "text" | "enum";

export type AgentDirectiveQuestionPhase =
  | "context"
  | "value-scoring"
  | "risk-scoring"
  | "effort-scoring"
  | "confidence-scoring"
  | "unknowns"
  | "alternatives"
  | "session-notes";

/** One guided input in a state-specific agentDirective block. */
export type AgentDirectiveQuestion = {
  phase: AgentDirectiveQuestionPhase;
  fieldName: string;
  prompt: string;
  type: AgentDirectiveQuestionType;
  validRange?: { min: number; max: number };
  validValues?: string[];
  guidance?: string;
};

export type AgentDirectiveComputeStep = {
  id: string;
  formula: string;
  description?: string;
};

export type AgentDirectiveSynthesisStep = {
  /** When sessions.length===1, synthesized=session scores; else latest×0.60+mean(prior)×0.40 */
  formula: string;
  description?: string;
};

/**
 * Machine-readable agent behavior prescription for the current IdeaPlan state.
 * Full JSON Schema authoring lives under `schemas/ideas/states/` (WBS-1B+).
 */
export type AgentDirective = {
  schemaVersion: 1;
  state: IdeaPlanStatus;
  questions: AgentDirectiveQuestion[];
  computeSteps?: AgentDirectiveComputeStep[];
  synthesisStep?: AgentDirectiveSynthesisStep;
};

/** Returned when a state schema file is missing or cannot be parsed. */
export type DegradedAgentDirective = {
  degraded: true;
  reason: string;
  requiredFields: [];
  validTransitions: [];
};

export type AgentDirectiveLoadValue = AgentDirective | DegradedAgentDirective;

export function isDegradedAgentDirective(value: AgentDirectiveLoadValue): value is DegradedAgentDirective {
  return (value as DegradedAgentDirective).degraded === true;
}

export type BrainstormTShirtSize = "XS" | "S" | "M" | "L" | "XL";

/** Computed aggregate scores for a brainstorm session. */
export type BrainstormScoreInputs = {
  value?: number;
  risk?: number;
  effort?: number;
  confidence?: number;
  priority?: number;
  tShirtSize?: BrainstormTShirtSize;
  complexity?: number;
};

/** Progressive session inputs (scoring sub-inputs plus context text fields). */
export type BrainstormSessionInputs = {
  valueImpact?: number;
  valueReach?: number;
  valueUrgency?: number;
  valueStrategicFit?: number;
  riskTechnical?: number;
  riskOperational?: number;
  riskUnknowns?: number;
  riskReversibility?: number;
  tShirtSize?: BrainstormTShirtSize;
  complexity?: number;
  confidenceEvidence?: number;
  confidenceExpertise?: number;
  confidenceClarity?: number;
  contextProblem?: string;
  contextAudience?: string;
  unknownsNotes?: string;
  alternativesConsidered?: string;
  sessionNotes?: string;
};

export type BrainstormIdeationTextItem = {
  text: string;
};

export type BrainstormIdeationRationaleItem = {
  text: string;
  rationale?: string;
};

export type BrainstormIdeationTranscriptEntry = {
  role: "agent" | "operator";
  text: string;
  at: string;
};

/** Qualitative ideation captured during a guided brainstorm session. */
export type BrainstormSessionIdeation = {
  featureIdeas?: BrainstormIdeationRationaleItem[];
  perspectives?: BrainstormIdeationTextItem[];
  expectations?: BrainstormIdeationTextItem[];
  openThreads?: BrainstormIdeationTextItem[];
  decisions?: BrainstormIdeationRationaleItem[];
  transcript?: BrainstormIdeationTranscriptEntry[];
};

/**
 * Mutable brainstorm session record. Commands create the slot, then fill it progressively.
 */
export type BrainstormSession = {
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  inputs?: Partial<BrainstormSessionInputs>;
  ideation?: BrainstormSessionIdeation;
  scores?: BrainstormScoreInputs;
  synthesized?: BrainstormScoreInputs;
  notes?: string;
};

export type IdeaPlanBrainstormSection = {
  sessions: BrainstormSession[];
  activeSessionId?: string;
  synthesis?: BrainstormScoreInputs;
};

export type IdeaPlanPlanSection = {
  title?: string;
  summary?: string;
  planningType?: string;
  wbsRowCount?: number;
};

export type IdeaPlanReviewSection = {
  passed?: boolean;
  blockerCount?: number;
  openQuestionCount?: number;
  warningCount?: number;
  reviewedAt?: string;
};

export type IdeaPlanAcceptanceSection = {
  acceptedAt?: string;
  acceptedBy?: string;
  acceptedVersion?: number;
};

export type IdeaPlanDeliverySection = {
  deliveredAt?: string;
  taskCount?: number;
  phaseKey?: string;
  /** Task-engine ids materialized from the accepted WBS (written by finalize-plan-to-phase). */
  taskRefs?: string[];
};

/**
 * Unified IdeaPlan document envelope. Progressive sections are optional until their state is reached.
 */
export type IdeaPlanDocument = {
  schemaVersion: IdeaPlanDocumentSchemaVersion;
  planId: string;
  version: number;
  planRef: string;
  status: IdeaPlanStatus;
  ideaId: string;
  createdAt: string;
  updatedAt: string;
  agentDirective?: AgentDirective;
  brainstorm?: IdeaPlanBrainstormSection;
  plan?: IdeaPlanPlanSection;
  review?: IdeaPlanReviewSection;
  acceptance?: IdeaPlanAcceptanceSection;
  delivery?: IdeaPlanDeliverySection;
};
