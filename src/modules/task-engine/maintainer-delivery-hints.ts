import type { TaskEntity } from "./types.js";
import { WISHLIST_INTAKE_TASK_TYPE } from "./wishlist/wishlist-intake.js";

/** Optional task metadata: documented in .ai/WORKSPACE-KIT-SESSION.md */
export const MAINTAINER_DELIVERY_PROFILE_METADATA_KEY = "maintainerDeliveryProfile";
/** Optional: maintainer sets true to document PR/phase-branch delivery expectation */
export const REQUIRES_PHASE_BRANCH_METADATA_KEY = "requiresPhaseBranch";

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
};

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
}): MaintainerDeliveryHintsV1 {
  const inProgressTasks = input.tasks
    .filter((t) => t.status === "in_progress" && !isWishlistIntakeEntity(t))
    .map((t) => ({
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
  return {
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
}

function isWishlistIntakeEntity(t: TaskEntity): boolean {
  return t.type === WISHLIST_INTAKE_TASK_TYPE;
}
