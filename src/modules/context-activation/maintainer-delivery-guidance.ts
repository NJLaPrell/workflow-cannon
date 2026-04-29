import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  getTaskStatusFromPlanningSqlite,
  isProtectedMaintainerBranch,
  readGitWorkingTreeSnapshot,
  resolvePlanningSqliteAbsolute
} from "../task-engine/maintainer-delivery-git.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";

type CaeFamily = "policy" | "think" | "do" | "review";
export type GuidanceCardsByFamily = Record<CaeFamily, Record<string, unknown>[]>;

const THINK_FAMILY_LABEL = "Things to consider";

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
      "Branch from the phase integration branch before implementation commits; open a PR per .ai/playbooks/task-to-phase-branch.md"
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
