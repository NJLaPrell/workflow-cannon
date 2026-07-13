export type IdeaPlanningPromptInput = {
  ideaId: string;
  title: string;
  note?: string;
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts?: string[];
  planningSessionId?: string;
  brainstormDigest?: string;
  canonicalPhaseKey?: string;
  currentKitPhase?: string | null;
};

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out && out.length > 0 ? out : undefined;
}

function cleanRefs(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

export function formatPlanLineageSummary(input: {
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts?: string[];
}): string {
  const linkedPlanArtifact = trimmed(input.linkedPlanArtifact);
  const activeDraftPlanArtifact = trimmed(input.activeDraftPlanArtifact);
  const previousPlanArtifacts = cleanRefs(input.previousPlanArtifacts);
  const parts: string[] = [];

  if (linkedPlanArtifact) {
    parts.push(`accepted **${linkedPlanArtifact}**`);
  }
  if (activeDraftPlanArtifact) {
    parts.push(`active draft **${activeDraftPlanArtifact}**`);
  }
  if (previousPlanArtifacts.length > 0) {
    const label = previousPlanArtifacts.length === 1 ? "prior artifact" : "prior artifacts";
    parts.push(
      `${previousPlanArtifacts.length} ${label}: ${previousPlanArtifacts.map((ref) => `**${ref}**`).join(", ")}`
    );
  }

  if (parts.length === 0) {
    return "Plan lineage: none yet — produce the first accepted PlanArtifact with complete WBS.";
  }

  return `Plan lineage: ${parts.join("; ")}.`;
}

export function buildIdeaPlanningPrompt(input: IdeaPlanningPromptInput): string {
  const ideaId = trimmed(input.ideaId);
  const title = trimmed(input.title);
  const note = trimmed(input.note);
  const linkedPlanArtifact = trimmed(input.linkedPlanArtifact);
  const activeDraftPlanArtifact = trimmed(input.activeDraftPlanArtifact);
  const previousPlanArtifacts = cleanRefs(input.previousPlanArtifacts);
  const planningSessionId = trimmed(input.planningSessionId);
  const lineageSummary = formatPlanLineageSummary({
    linkedPlanArtifact,
    activeDraftPlanArtifact,
    previousPlanArtifacts
  });

  const lines = [
    "Run **planner-chat** for this Workflow Cannon Ideas row (playbook id **`planner-chat`**).",
    "",
    ideaId ? `Source idea id: **${ideaId}**` : undefined,
    title ? `Idea title: **${title}**` : undefined,
    input.canonicalPhaseKey
      ? `Canonical workspace phase: **${input.canonicalPhaseKey}**${input.currentKitPhase ? ` (workspace status: ${input.currentKitPhase})` : ""}`
      : undefined,
    note ? `Idea note: ${note}` : undefined,
    input.brainstormDigest ? `Brainstorm digest:\n${input.brainstormDigest}` : undefined,
    planningSessionId ? `Planning session: **${planningSessionId}** (active).` : undefined,
    lineageSummary,
    "",
    "Attach **`.ai/playbooks/planner-chat.md`** and follow it from §0.",
    "",
    "Target outcome: an accepted PlanArtifact with complete WBS. Use planner command-layer transitions for draft, review, acceptance, session updates, and phase finalization — not ad-hoc state edits.",
    "",
    "Preserve PlanArtifact provenance: set `provenance.sourceIdeaId` to the Ideas row id when present, and carry `provenance.previousPlanArtifacts` forward when provided.",
    "",
    "Use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for gated `workspace-kit run` commands. Keep normal user-facing chat focused on planning decisions, not raw CLI choreography."
  ].filter((line): line is string => line !== undefined);

  return lines.join("\n");
}
