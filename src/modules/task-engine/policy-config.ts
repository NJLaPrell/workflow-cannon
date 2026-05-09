export type TaskPolicyEnforcementMode = "off" | "advisory" | "enforce";

/** Intake policy adds `enforce-on-accept` (block proposed→ready only; creates stay permissive). */
export type TaskIntakeEnforcementMode = "off" | "advisory" | "enforce-on-accept" | "enforce";

export type MaintainerDeliveryProfileName = "github-pr" | string;

export type MaintainerDeliveryProfile = {
  requiresPhaseBranch: boolean;
  /**
   * Phase integration branch pattern; must include `{phaseKey}` (validated in config-metadata).
   * Resolver output also labels this `phaseBranchPattern` for agent clarity.
   */
  branchPattern: string;
  /** Task branch pattern; tokens: `taskId`, `slug`, `phaseKey`, `moduleId`, `version`. */
  taskBranchPattern?: string;
  /** Optional release tag pattern (same token set). */
  releaseTagPattern?: string;
  review: "github-pr" | "manual" | "none";
  evidenceKind: "github-pr" | "manual" | "waiver";
  /** PR host for tooling hints; default github for github-pr review. */
  prProvider?: "github";
  mergeStrategy?: "merge" | "squash" | "rebase";
  /** How phase work lands on main — informational for agents (phase closeout vs direct). */
  phaseToMainMode?: "phase-closeout" | "direct";
};

export type MaintainerDeliveryOverride = {
  profile: MaintainerDeliveryProfileName;
  enforcementMode?: TaskPolicyEnforcementMode;
};

export type MaintainerDeliveryPolicyConfig = {
  defaultProfile: MaintainerDeliveryProfileName;
  enforcementMode: TaskPolicyEnforcementMode;
  profiles: Record<string, MaintainerDeliveryProfile>;
  moduleOverrides: Record<string, MaintainerDeliveryOverride>;
};

export type TaskIntakeProfileName = "advisory" | string;

export type TaskIntakeFieldRule = {
  minItems?: number;
  minLength?: number;
  maxLength?: number;
  itemMinLength?: number;
  allowedValues?: unknown[];
  requiresAny?: string[];
};

export type TaskIntakeProfile = {
  requiredFields: string[];
  recommendedFields: string[];
  forbiddenFields: string[];
  fieldRules: Record<string, TaskIntakeFieldRule>;
  enforcementMode: TaskIntakeEnforcementMode;
};

export type TaskIntakeOverride = {
  profile: TaskIntakeProfileName;
  enforcementMode?: TaskIntakeEnforcementMode;
};

export type TaskIntakePolicyConfig = {
  defaultProfile: TaskIntakeProfileName;
  enforcementMode: TaskIntakeEnforcementMode;
  profiles: Record<string, TaskIntakeProfile>;
  moduleOverrides: Record<string, TaskIntakeOverride>;
};

export type TaskPolicyOverridePrecedence = "task" | "module" | "workspace" | "built-in";

export const TASK_POLICY_OVERRIDE_PRECEDENCE: TaskPolicyOverridePrecedence[] = [
  "task",
  "module",
  "workspace",
  "built-in"
];

export const DEFAULT_MAINTAINER_DELIVERY_POLICY: MaintainerDeliveryPolicyConfig = {
  defaultProfile: "github-pr",
  enforcementMode: "advisory",
  profiles: {
    "github-pr": {
      requiresPhaseBranch: true,
      branchPattern: "release/phase-{phaseKey}",
      taskBranchPattern: "feature/{taskId}-{slug}",
      releaseTagPattern: "v{version}",
      review: "github-pr",
      evidenceKind: "github-pr",
      prProvider: "github",
      mergeStrategy: "merge",
      phaseToMainMode: "phase-closeout"
    }
  },
  moduleOverrides: {}
};

export const DEFAULT_TASK_INTAKE_POLICY: TaskIntakePolicyConfig = {
  defaultProfile: "advisory",
  enforcementMode: "advisory",
  profiles: {
    advisory: {
      requiredFields: [],
      recommendedFields: ["title", "summary", "technicalScope", "acceptanceCriteria"],
      forbiddenFields: [],
      fieldRules: {},
      enforcementMode: "advisory"
    },
    improvement: {
      requiredFields: ["technicalScope", "acceptanceCriteria", "metadata.issue", "metadata.supportingReasoning"],
      recommendedFields: ["title", "summary", "metadata.proposedSolutions"],
      forbiddenFields: [],
      fieldRules: {
        technicalScope: { minItems: 1, itemMinLength: 1 },
        acceptanceCriteria: { minItems: 1, itemMinLength: 1 },
        "metadata.issue": { minLength: 1 },
        "metadata.supportingReasoning": { minLength: 1 }
      },
      enforcementMode: "advisory"
    }
  },
  moduleOverrides: {}
};

export const TASK_POLICY_COMPATIBILITY_NOTES = [
  "metadata.maintainerDeliveryProfile remains a task-level override source for delivery policy resolvers.",
  "metadata.requiresPhaseBranch remains compatible with the built-in github-pr delivery profile.",
  "Task intake enforcement supports enforce-on-accept (proposed→ready only) in addition to advisory and full enforce."
] as const;
