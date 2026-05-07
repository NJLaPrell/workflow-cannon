export type TaskPolicyEnforcementMode = "off" | "advisory" | "enforce";

export type MaintainerDeliveryProfileName = "github-pr" | string;

export type MaintainerDeliveryProfile = {
  requiresPhaseBranch: boolean;
  branchPattern: string;
  review: "github-pr" | "manual" | "none";
  evidenceKind: "github-pr" | "manual" | "waiver";
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

export type TaskIntakeProfile = {
  requiredFields: string[];
  recommendedFields: string[];
  enforcementMode: TaskPolicyEnforcementMode;
};

export type TaskIntakeOverride = {
  profile: TaskIntakeProfileName;
  enforcementMode?: TaskPolicyEnforcementMode;
};

export type TaskIntakePolicyConfig = {
  defaultProfile: TaskIntakeProfileName;
  enforcementMode: TaskPolicyEnforcementMode;
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
      review: "github-pr",
      evidenceKind: "github-pr"
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
      enforcementMode: "advisory"
    }
  },
  moduleOverrides: {}
};

export const TASK_POLICY_COMPATIBILITY_NOTES = [
  "metadata.maintainerDeliveryProfile remains a task-level override source for delivery policy resolvers.",
  "metadata.requiresPhaseBranch remains compatible with the built-in github-pr delivery profile.",
  "Existing improvement-task guardrails stay advisory until intake policy enforcement is wired by downstream tasks."
] as const;