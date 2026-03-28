import {
  type PlanningWorkflowType
} from "./types.js";

export type PlanningQuestion = {
  id: string;
  prompt: string;
  examples: string[];
  whyItMatters: string;
  critical: boolean;
};

export type PlanningQuestionDepth = "minimal" | "guided" | "adaptive";
export type AdaptiveFinalizePolicy = "off" | "warn" | "block";

export type PlanningRulePack = {
  baseQuestions: PlanningQuestion[];
  adaptiveQuestions: PlanningQuestion[];
};

const BASE_QUESTIONS: Record<PlanningWorkflowType, PlanningQuestion[]> = {
  "task-breakdown": [
    {
      id: "goal",
      prompt: "What is the primary goal of this work?",
      examples: ["Improve release reliability", "Deliver planning module CLI flow"],
      whyItMatters: "Clarifies what success looks like before decomposition.",
      critical: true
    },
    {
      id: "constraints",
      prompt: "What constraints must we respect?",
      examples: ["No breaking changes", "Single release", "CLI-first"],
      whyItMatters: "Prevents planning paths that cannot be delivered safely.",
      critical: true
    },
    {
      id: "successSignals",
      prompt: "How will we know the plan worked?",
      examples: ["All gates pass", "Operators complete flow in under 5 minutes"],
      whyItMatters: "Anchors acceptance criteria and evidence quality.",
      critical: true
    }
  ],
  "sprint-phase": [
    {
      id: "goal",
      prompt: "What is the phase objective?",
      examples: ["Ship planning module v1", "Complete stabilization hardening"],
      whyItMatters: "Defines what this phase must deliver.",
      critical: true
    },
    {
      id: "timeline",
      prompt: "What timeline window should this phase target?",
      examples: ["Single release train", "Two sprint sequence"],
      whyItMatters: "Sets ordering and scope pressure explicitly.",
      critical: true
    },
    {
      id: "criticalPath",
      prompt: "What dependencies define the critical path?",
      examples: ["Scaffold before adaptive engine", "Rules before artifact generation"],
      whyItMatters: "Avoids deadlocks and unrealistic sequencing.",
      critical: true
    }
  ],
  "task-ordering": [
    {
      id: "goal",
      prompt: "What outcome should ordering optimize for?",
      examples: ["Risk reduction first", "Fastest path to demo"],
      whyItMatters: "Provides ranking criteria for sequencing choices.",
      critical: true
    },
    {
      id: "dependencyIntent",
      prompt: "What dependency constraints are mandatory?",
      examples: ["T347 depends on T345", "Validation follows schema contracts"],
      whyItMatters: "Ensures ordering respects hard blockers.",
      critical: true
    },
    {
      id: "riskPriority",
      prompt: "Which risks should be front-loaded?",
      examples: ["Policy approval edge cases", "Migration complexity"],
      whyItMatters: "Improves confidence and rollback safety.",
      critical: true
    }
  ],
  "new-feature": [
    {
      id: "featureGoal",
      prompt: "What user problem should the feature solve?",
      examples: ["Guide planning interviews", "Improve dashboard visibility"],
      whyItMatters: "Prevents building features disconnected from need.",
      critical: true
    },
    {
      id: "placement",
      prompt: "Where should this feature be surfaced?",
      examples: ["CLI command", "Extension dashboard panel", "Admin-only view"],
      whyItMatters: "Drives architecture, permissions, and UX decisions.",
      critical: true
    },
    {
      id: "technology",
      prompt: "What technology/runtime constraints apply?",
      examples: ["TypeScript + CLI runtime", "No new native dependencies"],
      whyItMatters: "Bounds implementation options early.",
      critical: true
    },
    {
      id: "targetAudience",
      prompt: "Who is the target audience?",
      examples: ["AI Agent Operators", "Developers", "Maintainers"],
      whyItMatters: "Shapes defaults and interaction style.",
      critical: true
    }
  ],
  "change": [
    {
      id: "changeGoal",
      prompt: "What behavior or system change is needed?",
      examples: ["Replace brittle flow", "Refactor planning config handling"],
      whyItMatters: "Separates desired outcome from implementation details.",
      critical: true
    },
    {
      id: "compatibilityRisk",
      prompt: "What compatibility risks exist?",
      examples: ["CLI contract changes", "state schema shifts"],
      whyItMatters: "Supports migration-safe release planning.",
      critical: true
    },
    {
      id: "rollbackPlan",
      prompt: "What rollback strategy is available?",
      examples: ["Feature flag off switch", "Revert to prior command behavior"],
      whyItMatters: "Maintains trustworthiness under failure.",
      critical: true
    }
  ]
};

const BASE_ADAPTIVE_QUESTIONS: Record<PlanningWorkflowType, PlanningQuestion[]> = {
  "task-breakdown": [
    {
      id: "handoffRisk",
      prompt: "Where is handoff risk highest in this breakdown?",
      examples: ["Schema-to-runtime boundary", "CLI-to-extension behavior"],
      whyItMatters: "Highlights where extra tests or review checks are needed.",
      critical: false
    }
  ],
  "sprint-phase": [
    {
      id: "phaseExitSignal",
      prompt: "What is the explicit exit signal for this phase?",
      examples: ["All tasks completed and release gates pass", "PR merged with parity evidence"],
      whyItMatters: "Prevents ambiguous “done” states.",
      critical: false
    }
  ],
  "task-ordering": [
    {
      id: "parallelization",
      prompt: "Which work items can run in parallel safely?",
      examples: ["Docs in parallel with runtime hardening", "UI after API contracts are stable"],
      whyItMatters: "Improves throughput without violating dependencies.",
      critical: false
    }
  ],
  "new-feature": [
    {
      id: "decisionRationale",
      prompt: "What major technical decision is most likely and why?",
      examples: ["CLI-first before UI for safer rollout", "Reuse existing module config patterns"],
      whyItMatters: "Captures rationale for later review and refinement.",
      critical: false
    }
  ],
  "change": [
    {
      id: "migrationNotes",
      prompt: "What migration or rollout notes should operators receive?",
      examples: ["No migration required", "Enable setting X before command Y"],
      whyItMatters: "Protects compatibility and operator trust.",
      critical: false
    }
  ]
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseQuestionList(value: unknown): PlanningQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: PlanningQuestion[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    const whyItMatters = typeof row.whyItMatters === "string" ? row.whyItMatters.trim() : "";
    if (!id || !prompt || !whyItMatters) continue;
    parsed.push({
      id,
      prompt,
      whyItMatters,
      examples: Array.isArray(row.examples)
        ? row.examples.filter((x): x is string => typeof x === "string")
        : [],
      critical: row.critical === true
    });
  }
  return parsed;
}

function parseDepth(value: unknown): PlanningQuestionDepth {
  if (value === "minimal" || value === "guided" || value === "adaptive") {
    return value;
  }
  return "adaptive";
}

function parseAdaptiveFinalizePolicy(value: unknown): AdaptiveFinalizePolicy {
  if (value === "off" || value === "warn" || value === "block") {
    return value;
  }
  return "off";
}

export function resolvePlanningConfig(config: Record<string, unknown> | undefined): {
  depth: PlanningQuestionDepth;
  hardBlockCriticalUnknowns: boolean;
  adaptiveFinalizePolicy: AdaptiveFinalizePolicy;
  rulePacks: Partial<Record<PlanningWorkflowType, PlanningRulePack>>;
} {
  const planning = asRecord(config?.planning);
  const depth = parseDepth(planning?.defaultQuestionDepth);
  const hardBlockCriticalUnknowns = planning?.hardBlockCriticalUnknowns !== false;
  const adaptiveFinalizePolicy = parseAdaptiveFinalizePolicy(planning?.adaptiveFinalizePolicy);
  const rulesRoot = asRecord(planning?.rulePacks);
  const rulePacks: Partial<Record<PlanningWorkflowType, PlanningRulePack>> = {};
  if (rulesRoot) {
    for (const workflowType of Object.keys(BASE_QUESTIONS) as PlanningWorkflowType[]) {
      const pack = asRecord(rulesRoot[workflowType]);
      if (!pack) continue;
      const baseQuestions = parseQuestionList(pack.baseQuestions);
      const adaptiveQuestions = parseQuestionList(pack.adaptiveQuestions);
      if (baseQuestions.length === 0 && adaptiveQuestions.length === 0) continue;
      rulePacks[workflowType] = {
        baseQuestions: baseQuestions.length > 0 ? baseQuestions : BASE_QUESTIONS[workflowType],
        adaptiveQuestions
      };
    }
  }
  return { depth, hardBlockCriticalUnknowns, adaptiveFinalizePolicy, rulePacks };
}

export function resolvePlanningRulePack(
  planningType: PlanningWorkflowType,
  config: Record<string, unknown> | undefined
): PlanningRulePack {
  const resolved = resolvePlanningConfig(config);
  const override = resolved.rulePacks[planningType];
  return {
    baseQuestions: override?.baseQuestions ?? BASE_QUESTIONS[planningType],
    adaptiveQuestions: override?.adaptiveQuestions ?? BASE_ADAPTIVE_QUESTIONS[planningType]
  };
}

export function nextPlanningQuestions(
  planningType: PlanningWorkflowType,
  answers: Record<string, unknown>,
  config?: Record<string, unknown>
): { missingCritical: PlanningQuestion[]; adaptiveFollowups: PlanningQuestion[] } {
  const { depth } = resolvePlanningConfig(config);
  const rules = resolvePlanningRulePack(planningType, config);
  const base = rules.baseQuestions;
  const missingCritical = base.filter((q) => {
    const value = answers[q.id];
    return !(typeof value === "string" && value.trim().length > 0);
  });

  if (depth === "minimal") {
    return { missingCritical, adaptiveFollowups: [] };
  }

  const adaptiveFollowups: PlanningQuestion[] = [...rules.adaptiveQuestions];
  if (depth === "guided") {
    return { missingCritical, adaptiveFollowups };
  }

  const complexity = typeof answers.complexity === "string" ? answers.complexity.toLowerCase() : "";
  if (complexity === "high") {
    adaptiveFollowups.push({
      id: "mitigationPlan",
      prompt: "What mitigation strategy addresses high complexity risks?",
      examples: ["Ship in slices", "Add parity checks before release"],
      whyItMatters: "Reduces probability of destabilizing execution.",
      critical: false
    });
  }
  if (planningType === "new-feature" && !answers["decisionRationale"]) {
    if (!adaptiveFollowups.some((q) => q.id === "decisionRationale")) {
      adaptiveFollowups.push({
        id: "decisionRationale",
        prompt: "What major technical decision is most likely and why?",
        examples: ["CLI-first before UI for safer rollout", "Reuse existing module config patterns"],
        whyItMatters: "Captures rationale for later review and refinement.",
        critical: false
      });
    }
  }

  return { missingCritical, adaptiveFollowups };
}
