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

export function nextPlanningQuestions(
  planningType: PlanningWorkflowType,
  answers: Record<string, unknown>
): { missingCritical: PlanningQuestion[]; adaptiveFollowups: PlanningQuestion[] } {
  const base = BASE_QUESTIONS[planningType];
  const missingCritical = base.filter((q) => {
    const value = answers[q.id];
    return !(typeof value === "string" && value.trim().length > 0);
  });

  const adaptiveFollowups: PlanningQuestion[] = [];
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
    adaptiveFollowups.push({
      id: "decisionRationale",
      prompt: "What major technical decision is most likely and why?",
      examples: ["CLI-first before UI for safer rollout", "Reuse existing module config patterns"],
      whyItMatters: "Captures rationale for later review and refinement.",
      critical: false
    });
  }

  return { missingCritical, adaptiveFollowups };
}
