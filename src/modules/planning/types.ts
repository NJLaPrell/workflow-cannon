export const PLANNING_WORKFLOW_TYPES = [
  "task-breakdown",
  "sprint-phase",
  "task-ordering",
  "new-feature",
  "change"
] as const;

export type PlanningWorkflowType = (typeof PLANNING_WORKFLOW_TYPES)[number];

export type PlanningWorkflowDescriptor = {
  type: PlanningWorkflowType;
  title: string;
  description: string;
  outcomeFocus: string;
};

export const PLANNING_WORKFLOW_DESCRIPTORS: PlanningWorkflowDescriptor[] = [
  {
    type: "task-breakdown",
    title: "Task Breakdown",
    description: "Break work into coherent, reviewable slices with explicit acceptance criteria.",
    outcomeFocus: "Clear decomposition into actionable units."
  },
  {
    type: "sprint-phase",
    title: "Sprint / Phase Plan",
    description: "Define phase goals, sequencing, and completion checkpoints.",
    outcomeFocus: "Time-ordered delivery framing with clear phase boundaries."
  },
  {
    type: "task-ordering",
    title: "Task Ordering",
    description: "Prioritize and sequence tasks with dependency awareness.",
    outcomeFocus: "Deterministic ordering with explicit dependency intent."
  },
  {
    type: "new-feature",
    title: "New Feature",
    description: "Guide discovery for new feature goals, architecture choices, and rollout fit.",
    outcomeFocus: "High-confidence feature direction and constraints."
  },
  {
    type: "change",
    title: "Change / Refactor",
    description: "Assess behavior-impacting changes and migration/compatibility risks.",
    outcomeFocus: "Safe, justified change plan with risk controls."
  }
];
