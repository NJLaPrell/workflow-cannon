import type { ResolvedMaintainerDeliveryPolicyV1 } from "./maintainer-delivery-policy-resolver.js";
import { resolveMaintainerDeliveryPolicy } from "./maintainer-delivery-policy-resolver.js";
import {
  MAINTAINER_DELIVERY_PROFILE_METADATA_KEY,
  REQUIRES_PHASE_BRANCH_METADATA_KEY
} from "./maintainer-delivery-metadata-keys.js";
import type { TaskEntity } from "./types.js";
import { WISHLIST_INTAKE_TASK_TYPE } from "./wishlist/wishlist-intake.js";

export {
  MAINTAINER_DELIVERY_PROFILE_METADATA_KEY,
  REQUIRES_PHASE_BRANCH_METADATA_KEY
} from "./maintainer-delivery-metadata-keys.js";

/** Compact resolver output for agent readouts (no explain chain, no network). */
export type MaintainerDeliveryResolvedPolicyCompactV1 = {
  schemaVersion: 1;
  profileName: string;
  reviewMode: string;
  evidenceMode: string;
  prProvider: string;
  mergeStrategy: string;
  phaseToMainMode: string;
  requiresPhaseBranch: boolean;
  phaseIntegrationBranch: string | null;
  taskBranchExample: string | null;
  mergeTargetPattern: string;
  mergeTargetBranch: string | null;
  maintainerDeliveryEnforcementMode: string;
  deliveryEvidenceEnforcementMode: string;
  /** Resolver warning codes only — messages stay in logs / separate tooling. */
  warningCodes?: string[];
};

export type MaintainerDeliveryHintsV1 = {
  schemaVersion: 1;
  playbookPath: string;
  playbookCursorRulePath: string;
  machinePlaybooksPath: string;
  /** Suggested Git integration branch when phase key is known (e.g. `release/phase-75`). */
  phaseIntegrationBranch: string | null;
  reminder: string;
  inProgressTasks: Array<{
    id: string;
    title: string;
    maintainerDeliveryProfile: string | null;
    requiresPhaseBranch: boolean;
  }>;
  /** From `suggestedNext` task metadata when present. */
  suggestedNextMaintainerDeliveryProfile: string | null;
  suggestedNextRequiresPhaseBranch: boolean;
  /**
   * When `buildMaintainerDeliveryHints` is called with `effectiveConfig`, compact resolved policy
   * for the suggested-next task (if any).
   */
  resolvedPolicySuggestedNext?: MaintainerDeliveryResolvedPolicyCompactV1 | null;
  /**
   * When `effectiveConfig` is passed, one entry per in-progress execution task (same order as
   * `inProgressTasks`).
   */
  resolvedPolicyInProgress?: Array<{
    id: string;
    title: string;
    resolvedPolicy: MaintainerDeliveryResolvedPolicyCompactV1;
  }>;
};

export function toCompactMaintainerDeliveryPolicy(
  resolved: ResolvedMaintainerDeliveryPolicyV1,
  warnings?: readonly { code: string }[]
): MaintainerDeliveryResolvedPolicyCompactV1 {
  const out: MaintainerDeliveryResolvedPolicyCompactV1 = {
    schemaVersion: 1,
    profileName: resolved.profileName,
    reviewMode: resolved.reviewMode,
    evidenceMode: resolved.evidenceMode,
    prProvider: resolved.prProvider,
    mergeStrategy: resolved.mergeStrategy,
    phaseToMainMode: resolved.phaseToMainMode,
    requiresPhaseBranch: resolved.requiresPhaseBranch,
    phaseIntegrationBranch: resolved.phaseIntegrationBranch,
    taskBranchExample: resolved.taskBranchExample,
    mergeTargetPattern: resolved.mergeTarget.pattern,
    mergeTargetBranch: resolved.mergeTarget.branch,
    maintainerDeliveryEnforcementMode: resolved.maintainerDeliveryEnforcementMode,
    deliveryEvidenceEnforcementMode: resolved.deliveryEvidenceEnforcementMode
  };
  if (warnings && warnings.length > 0) {
    out.warningCodes = warnings.map((w) => w.code);
  }
  return out;
}

function readProfile(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const v = meta[MAINTAINER_DELIVERY_PROFILE_METADATA_KEY];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function readRequiresPhaseBranch(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  return meta[REQUIRES_PHASE_BRANCH_METADATA_KEY] === true;
}

/**
 * Machine-readable hints for GitHub maintainer delivery (phase branch + task branch + playbook).
 * Safe on every read — no git subprocess.
 */
export function buildMaintainerDeliveryHints(input: {
  tasks: TaskEntity[];
  canonicalPhaseKey: string | null;
  suggestedNext: { id: string } | null;
  /** When set, attaches compact `resolveMaintainerDeliveryPolicy` output for queue-relevant tasks. */
  effectiveConfig?: Record<string, unknown> | undefined;
}): MaintainerDeliveryHintsV1 {
  const inProgressEntities = input.tasks.filter(
    (t) => t.status === "in_progress" && !isWishlistIntakeEntity(t)
  );
  const inProgressTasks = inProgressEntities.map((t) => ({
    id: t.id,
    title: t.title,
    maintainerDeliveryProfile: readProfile(t.metadata),
    requiresPhaseBranch: readRequiresPhaseBranch(t.metadata)
  }));
  const sn = input.suggestedNext
    ? input.tasks.find((t) => t.id === input.suggestedNext!.id)
    : undefined;
  const phaseIntegrationBranch = input.canonicalPhaseKey
    ? `release/phase-${input.canonicalPhaseKey}`
    : null;
  const base: MaintainerDeliveryHintsV1 = {
    schemaVersion: 1,
    playbookPath: ".ai/playbooks/task-to-phase-branch.md",
    playbookCursorRulePath: ".cursor/rules/playbook-task-to-phase-branch.mdc",
    machinePlaybooksPath: ".ai/MACHINE-PLAYBOOKS.md",
    phaseIntegrationBranch,
    reminder:
      "GitHub owns branch, PR, review, merge. Branch from the phase integration branch before the first implementation commit; run run-transition start no later than that commit. workspace-kit run-transition owns task lifecycle evidence.",
    inProgressTasks,
    suggestedNextMaintainerDeliveryProfile: readProfile(sn?.metadata),
    suggestedNextRequiresPhaseBranch: readRequiresPhaseBranch(sn?.metadata)
  };

  if (input.effectiveConfig === undefined) {
    return base;
  }

  let resolvedPolicySuggestedNext: MaintainerDeliveryResolvedPolicyCompactV1 | null = null;
  if (sn) {
    const { resolvedPolicy, warnings } = resolveMaintainerDeliveryPolicy({
      effectiveConfig: input.effectiveConfig,
      task: sn
    });
    resolvedPolicySuggestedNext = toCompactMaintainerDeliveryPolicy(resolvedPolicy, warnings);
  }

  const resolvedPolicyInProgress = inProgressEntities.map((t) => {
    const { resolvedPolicy, warnings } = resolveMaintainerDeliveryPolicy({
      effectiveConfig: input.effectiveConfig,
      task: t
    });
    return {
      id: t.id,
      title: t.title,
      resolvedPolicy: toCompactMaintainerDeliveryPolicy(resolvedPolicy, warnings)
    };
  });

  return {
    ...base,
    resolvedPolicySuggestedNext,
    ...(resolvedPolicyInProgress.length > 0 ? { resolvedPolicyInProgress } : {})
  };
}

function isWishlistIntakeEntity(t: TaskEntity): boolean {
  return t.type === WISHLIST_INTAKE_TASK_TYPE;
}
