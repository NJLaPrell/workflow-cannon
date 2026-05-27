/**
 * CAE scope for PlanArtifact planning sessions (WP-2 T-2.3).
 * Activations in `.ai/cae/registry/activations.v1.json` use `commandName` (+ optional `commandArgEquals`).
 */

/** Commands that receive planning-lens CAE bundles during brainstorm / plan-artifact workflow. */
export const PLANNING_SESSION_CAE_COMMANDS = [
  "draft-plan-artifact",
  "review-plan-artifact",
  "accept-plan-artifact",
  "finalize-plan-to-phase",
  "build-plan"
] as const;

export type PlanningSessionCaeCommand = (typeof PLANNING_SESSION_CAE_COMMANDS)[number];

const PLANNING_SESSION_COMMAND_SET = new Set<string>(PLANNING_SESSION_CAE_COMMANDS);

export const PLANNING_SESSION_CAE_MODULE_ID = "planning";

export function isPlanningSessionCaeCommand(
  commandName: string
): commandName is PlanningSessionCaeCommand {
  return PLANNING_SESSION_COMMAND_SET.has(commandName);
}

/** Lens artifact ids required when `cae.activation.think.planning-session-draft` matches. */
export const PLANNING_SESSION_DRAFT_REQUIRED_LENS_IDS = [
  "cae.doc.planning-lenses-index",
  "cae.reasoning.planning-completeness"
] as const;

export function collectThinkArtifactIdsFromBundle(bundle: Record<string, unknown>): string[] {
  const fam = bundle.families as Record<string, unknown[]> | undefined;
  const think = fam?.think;
  if (!Array.isArray(think)) return [];
  const ids: string[] = [];
  for (const row of think) {
    if (!row || typeof row !== "object") continue;
    const aids = (row as { artifactIds?: unknown }).artifactIds;
    if (!Array.isArray(aids)) continue;
    for (const id of aids) {
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  return ids;
}
