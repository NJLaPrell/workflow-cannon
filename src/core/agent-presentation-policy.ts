import type { ResolvedAgentGuidance } from "./agent-guidance-catalog.js";

export const AGENT_PRESENTATION_POLICY_SCHEMA_VERSION = 1 as const;

export type AgentPresentationConfigMode = "derived" | "explicit";
export type AgentPresentationConfigValue<T extends string> = "derived" | T;

export type AgentPresentationWorkLog = "off" | "minimal" | "normal" | "frequent";
export type AgentPresentationRationale = "none" | "simple" | "technical";
export type AgentPresentationTechnicality = "plain" | "balanced" | "technical";
export type AgentPresentationFinalAnswerDetail = "concise" | "normal" | "detailed";
export type AgentPrivateReasoningPolicy = "never_disclose";

export type AgentPresentationConfig = {
  mode?: AgentPresentationConfigMode;
  workLog?: AgentPresentationConfigValue<AgentPresentationWorkLog>;
  rationale?: AgentPresentationConfigValue<AgentPresentationRationale>;
  technicality?: AgentPresentationConfigValue<AgentPresentationTechnicality>;
  finalAnswerDetail?: AgentPresentationConfigValue<AgentPresentationFinalAnswerDetail>;
};

export type AgentPresentationBehaviorDimensions = {
  deliberationDepth?: string;
  checkInFrequency?: string;
  explanationVerbosity?: string;
  ambiguityHandling?: string;
};

export type AgentPresentationBehaviorProfileInput = {
  id?: string;
  label?: string;
  dimensions?: AgentPresentationBehaviorDimensions;
};

export type AgentPresentationPolicySource = {
  field: "workLog" | "rationale" | "technicality" | "finalAnswerDetail";
  source: "config" | "role" | "temperament";
  reason: string;
};

export type ResolvedAgentPresentationPolicy = {
  schemaVersion: typeof AGENT_PRESENTATION_POLICY_SCHEMA_VERSION;
  mode: AgentPresentationConfigMode;
  workLog: AgentPresentationWorkLog;
  rationale: AgentPresentationRationale;
  technicality: AgentPresentationTechnicality;
  finalAnswerDetail: AgentPresentationFinalAnswerDetail;
  privateReasoning: AgentPrivateReasoningPolicy;
  source: {
    roleTier: number;
    roleLabel: string;
    temperamentProfileId: string | null;
    temperamentLabel: string | null;
    fields: AgentPresentationPolicySource[];
  };
  agentInstruction: string;
};

type PresentationFields = Pick<
  ResolvedAgentPresentationPolicy,
  "workLog" | "rationale" | "technicality" | "finalAnswerDetail"
>;

const DEFAULT_FIELDS: PresentationFields = {
  workLog: "normal",
  rationale: "simple",
  technicality: "balanced",
  finalAnswerDetail: "normal"
};

function readPresentationConfig(effective: Record<string, unknown> | undefined): AgentPresentationConfig {
  const raw = effective?.agentPresentation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as AgentPresentationConfig;
}

function baseFieldsForTier(tier: number): { fields: PresentationFields; reasons: AgentPresentationPolicySource[] } {
  const bounded = Math.min(5, Math.max(1, Math.round(tier)));
  const roleReason = `derived from agent guidance tier ${bounded}`;
  const source = (field: AgentPresentationPolicySource["field"]): AgentPresentationPolicySource => ({
    field,
    source: "role",
    reason: roleReason
  });

  if (bounded <= 1) {
    return {
      fields: {
        workLog: "minimal",
        rationale: "none",
        technicality: "plain",
        finalAnswerDetail: "concise"
      },
      reasons: [source("workLog"), source("rationale"), source("technicality"), source("finalAnswerDetail")]
    };
  }
  if (bounded === 2 || bounded === 3) {
    return {
      fields: { ...DEFAULT_FIELDS },
      reasons: [source("workLog"), source("rationale"), source("technicality"), source("finalAnswerDetail")]
    };
  }
  return {
    fields: {
      workLog: "frequent",
      rationale: "technical",
      technicality: "technical",
      finalAnswerDetail: "detailed"
    },
    reasons: [source("workLog"), source("rationale"), source("technicality"), source("finalAnswerDetail")]
  };
}

function withTemperamentNudges(
  fields: PresentationFields,
  reasons: AgentPresentationPolicySource[],
  behavior?: AgentPresentationBehaviorProfileInput
): { fields: PresentationFields; reasons: AgentPresentationPolicySource[] } {
  const next: PresentationFields = { ...fields };
  const out = [...reasons];
  const dims = behavior?.dimensions ?? {};
  const verbosity = String(dims.explanationVerbosity ?? "").toLowerCase();
  const checkIns = String(dims.checkInFrequency ?? "").toLowerCase();
  const deliberation = String(dims.deliberationDepth ?? "").toLowerCase();

  if (checkIns === "often") {
    next.workLog = "frequent";
    out.push({ field: "workLog", source: "temperament", reason: "checkInFrequency often raises visible work-log cadence" });
  } else if (checkIns === "rare" && next.workLog === "normal") {
    next.workLog = "minimal";
    out.push({ field: "workLog", source: "temperament", reason: "checkInFrequency rare lowers routine work-log cadence" });
  }

  if (verbosity === "terse") {
    if (next.finalAnswerDetail === "detailed") next.finalAnswerDetail = "normal";
    if (next.rationale === "technical") next.rationale = "simple";
    out.push({ field: "finalAnswerDetail", source: "temperament", reason: "explanationVerbosity terse reduces final-answer detail" });
    out.push({ field: "rationale", source: "temperament", reason: "explanationVerbosity terse avoids technical rationale by default" });
  } else if (verbosity === "verbose") {
    if (next.finalAnswerDetail === "concise") next.finalAnswerDetail = "normal";
    else next.finalAnswerDetail = "detailed";
    if (next.rationale === "none") next.rationale = "simple";
    out.push({ field: "finalAnswerDetail", source: "temperament", reason: "explanationVerbosity verbose raises final-answer detail" });
    out.push({ field: "rationale", source: "temperament", reason: "explanationVerbosity verbose keeps rationale summaries available" });
  }

  if (deliberation === "high" && next.technicality !== "technical" && next.rationale === "technical") {
    next.technicality = "technical";
    out.push({ field: "technicality", source: "temperament", reason: "high deliberation depth supports technical summaries when rationale is technical" });
  }

  return { fields: next, reasons: out };
}

function overrideField<T extends string>(
  field: keyof PresentationFields,
  value: AgentPresentationConfigValue<T> | undefined,
  current: PresentationFields,
  reasons: AgentPresentationPolicySource[]
): void {
  if (!value || value === "derived") return;
  (current as Record<string, string>)[field] = value;
  reasons.push({ field, source: "config", reason: `explicit agentPresentation.${field}` });
}

function buildAgentInstruction(fields: PresentationFields): string {
  return [
    "Reason privately. Do not reveal chain-of-thought, hidden deliberation, scratchpad notes, or step-by-step private reasoning.",
    `Visible work-log policy: ${fields.workLog}.`,
    `Visible rationale-summary policy: ${fields.rationale}.`,
    `Technicality policy: ${fields.technicality}.`,
    `Final-answer detail policy: ${fields.finalAnswerDetail}.`,
    "Always surface blockers, required approvals, destructive-action warnings, verification failures, and residual risks even when work-log detail is minimal or off."
  ].join("\n");
}

export function resolveAgentPresentationPolicy(input: {
  effectiveConfig?: Record<string, unknown>;
  guidance: ResolvedAgentGuidance;
  behaviorProfile?: AgentPresentationBehaviorProfileInput;
}): ResolvedAgentPresentationPolicy {
  const cfg = readPresentationConfig(input.effectiveConfig);
  const mode: AgentPresentationConfigMode = cfg.mode === "explicit" ? "explicit" : "derived";
  const base = baseFieldsForTier(input.guidance.tier);
  const nudged = mode === "explicit"
    ? { fields: { ...DEFAULT_FIELDS }, reasons: [] as AgentPresentationPolicySource[] }
    : withTemperamentNudges(base.fields, base.reasons, input.behaviorProfile);
  const fields: PresentationFields = { ...nudged.fields };
  const reasons = [...nudged.reasons];

  overrideField("workLog", cfg.workLog, fields, reasons);
  overrideField("rationale", cfg.rationale, fields, reasons);
  overrideField("technicality", cfg.technicality, fields, reasons);
  overrideField("finalAnswerDetail", cfg.finalAnswerDetail, fields, reasons);

  return {
    schemaVersion: AGENT_PRESENTATION_POLICY_SCHEMA_VERSION,
    mode,
    ...fields,
    privateReasoning: "never_disclose",
    source: {
      roleTier: input.guidance.tier,
      roleLabel: input.guidance.displayLabel,
      temperamentProfileId: input.behaviorProfile?.id ?? null,
      temperamentLabel: input.behaviorProfile?.label ?? null,
      fields: reasons
    },
    agentInstruction: buildAgentInstruction(fields)
  };
}
