import { hydrateTaskRowForCae } from "../../core/cae/cae-run-preflight.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { toCompactMaintainerDeliveryPolicy } from "../task-engine/maintainer-delivery-hints.js";
import {
  resolveMaintainerDeliveryPolicy,
  type ResolvedMaintainerDeliveryPolicyV1
} from "../task-engine/maintainer-delivery-policy-resolver.js";
import {
  getTaskStatusFromPlanningSqlite,
  isProtectedMaintainerBranch,
  readGitWorkingTreeSnapshot,
  resolvePlanningSqliteAbsolute
} from "../task-engine/maintainer-delivery-git.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import type { TaskEntity } from "../task-engine/types.js";

type CaeFamily = "policy" | "think" | "do" | "review";
export type GuidanceCardsByFamily = Record<CaeFamily, Record<string, unknown>[]>;

const THINK_FAMILY_LABEL = "Things to consider";
/** Matches `GUIDANCE_PRODUCT_LABELS.families.policy` in cae-command-dispatch. */
const POLICY_FAMILY_LABEL = "Rules to follow";

function taskRowSliceToEntityForPolicy(slice: NonNullable<ReturnType<typeof hydrateTaskRowForCae>>): TaskEntity {
  return {
    id: slice.id,
    status: slice.status as TaskEntity["status"],
    type: "execution",
    title: typeof slice.title === "string" && slice.title.length > 0 ? slice.title : "",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    phaseKey: slice.phaseKey ?? undefined,
    metadata: slice.metadata ?? undefined
  };
}

/**
 * Stable copy lines for CAE synthetic maintainer-delivery policy cards (read-only; no network).
 * Exported for unit tests.
 */
export function buildMaintainerDeliveryPolicyGuidanceTitles(resolved: ResolvedMaintainerDeliveryPolicyV1): string[] {
  const mergeTarget =
    resolved.phaseIntegrationBranch ??
    resolved.mergeTarget.branch ??
    resolved.mergeTarget.pattern.replace("{phaseKey}", "<phaseKey>");
  const taskBranch = resolved.taskBranchExample ?? resolved.taskBranchPattern;
  if (resolved.reviewMode === "github-pr" && resolved.evidenceMode === "github-pr") {
    return [
      `Review via ${resolved.prProvider} pull request; land changes on ${mergeTarget} before closing the task.`,
      `Example task branch: ${taskBranch}. Delivery evidence mode: ${resolved.evidenceMode} (see tasks.deliveryEvidence policy).`,
      `Playbook: ${resolved.playbookPath}`
    ];
  }
  if (resolved.evidenceMode === "manual") {
    return [
      `Review mode: ${resolved.reviewMode}; record delivery evidence for manual or locally reviewed merge flows — chat-only activity is not evidence.`,
      resolved.requiresPhaseBranch
        ? `Phase integration branch pattern resolves to ${mergeTarget} (pattern ${resolved.phaseBranchPattern}).`
        : "This profile relaxes the phase-branch requirement; still follow team merge discipline.",
      `Example task branch: ${taskBranch}. Playbook: ${resolved.playbookPath}`
    ];
  }
  return [
    `Profile ${resolved.profileName}: review=${resolved.reviewMode}, evidence=${resolved.evidenceMode}.`,
    `Merge target: ${mergeTarget}. Example task branch: ${taskBranch}.`,
    resolved.playbookPath
  ];
}

/**
 * Prepend a compact policy-context card for the preview task (SQLite hydrate + resolver only; no network).
 */
export async function prependMaintainerDeliveryPolicyGuidanceCard(
  workspacePath: string,
  effective: Record<string, unknown>,
  taskId: string | undefined,
  cards: GuidanceCardsByFamily
): Promise<void> {
  if (!taskId) {
    return;
  }
  const slice = hydrateTaskRowForCae(workspacePath, effective, taskId);
  if (!slice) {
    return;
  }
  const task = taskRowSliceToEntityForPolicy(slice);
  const { resolvedPolicy, warnings } = resolveMaintainerDeliveryPolicy({
    effectiveConfig: effective,
    task
  });
  const sourceTitles = buildMaintainerDeliveryPolicyGuidanceTitles(resolvedPolicy);
  const card: Record<string, unknown> = {
    activationId: "cae.advisory.maintainer-delivery-policy.v1",
    family: "policy" satisfies CaeFamily,
    familyLabel: POLICY_FAMILY_LABEL,
    title: sourceTitles[0] ?? "Maintainer delivery policy",
    attention: "advisory",
    artifactIds: [],
    sourceTitles,
    priority: 900,
    aggregateTightness: 0,
    detail: {
      taskId,
      synthetic: true,
      resolvedPolicy: toCompactMaintainerDeliveryPolicy(resolvedPolicy, warnings),
      warningCodes: warnings.map((w) => w.code)
    }
  };
  cards.policy = [card, ...cards.policy];
}

/**
 * Prepend a synthetic shadow Guidance card when the preview task is in_progress, git is dirty,
 * and HEAD is on a protected integration branch (main / master / release/phase-<n>).
 */
export async function prependMaintainerDeliveryLoopGuidanceCard(
  workspacePath: string,
  effective: Record<string, unknown>,
  taskId: string | undefined,
  cards: GuidanceCardsByFamily
): Promise<void> {
  if (!taskId) {
    return;
  }
  const git = readGitWorkingTreeSnapshot(workspacePath);
  if (!git.available || !git.isDirty || !isProtectedMaintainerBranch(git.branch)) {
    return;
  }
  const ctx = { workspacePath, effectiveConfig: effective } as ModuleLifecycleContext;
  const dbAbs = resolvePlanningSqliteAbsolute(workspacePath, planningSqliteDatabaseRelativePath(ctx));
  const st = await getTaskStatusFromPlanningSqlite(dbAbs, taskId);
  if (st !== "in_progress") {
    return;
  }
  const card: Record<string, unknown> = {
    activationId: "cae.advisory.maintainer-delivery-loop.v1",
    family: "think" satisfies CaeFamily,
    familyLabel: THINK_FAMILY_LABEL,
    title: "Maintainer delivery: avoid dirty work on integration branch",
    attention: "advisory",
    artifactIds: [],
    sourceTitles: [
      "Branch from the phase integration branch before implementation commits; follow the maintainer delivery policy card in this preview for review and evidence expectations."
    ],
    priority: 1000,
    aggregateTightness: 0,
    detail: {
      branch: git.branch,
      taskId,
      synthetic: true,
      remediationPlaybook: ".ai/playbooks/task-to-phase-branch.md"
    }
  };
  cards.think = [card, ...cards.think];
}
