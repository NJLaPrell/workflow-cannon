export type IdeaPlanningPromptInput = {
  ideaId: string;
  title: string;
  note?: string;
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts?: string[];
};

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out && out.length > 0 ? out : undefined;
}

function cleanRefs(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

export function buildIdeaPlanningPrompt(input: IdeaPlanningPromptInput): string {
  const ideaId = trimmed(input.ideaId);
  const title = trimmed(input.title);
  const note = trimmed(input.note);
  const linkedPlanArtifact = trimmed(input.linkedPlanArtifact);
  const activeDraftPlanArtifact = trimmed(input.activeDraftPlanArtifact);
  const previousPlanArtifacts = cleanRefs(input.previousPlanArtifacts);

  const lines = [
    "Run **planner-chat** for this Workflow Cannon Ideas row (playbook id **`planner-chat`**).",
    "",
    ideaId ? `Idea id: **${ideaId}**` : undefined,
    title ? `Idea title: **${title}**` : undefined,
    note ? `Idea note: ${note}` : undefined,
    linkedPlanArtifact ? `Linked accepted plan: **${linkedPlanArtifact}**` : undefined,
    activeDraftPlanArtifact ? `Active draft plan: **${activeDraftPlanArtifact}**` : undefined,
    previousPlanArtifacts.length > 0
      ? `Previous plan artifacts: ${previousPlanArtifacts.map((ref) => `**${ref}**`).join(", ")}`
      : undefined,
    "",
    "Attach **`.ai/playbooks/planner-chat.md`** and follow it from §0.",
    "",
    "Preserve PlanArtifact provenance: set `provenance.sourceIdeaId` to the Ideas row id when present, and carry `provenance.previousPlanArtifacts` forward when provided.",
    "",
    "Target an accepted PlanArtifact with complete WBS. Use command-layer transitions for draft, review, approval, and session updates.",
    "",
    "Use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for gated `workspace-kit run` commands. Keep normal user-facing chat focused on planning decisions, not raw CLI choreography."
  ].filter((line): line is string => line !== undefined);

  return lines.join("\n");
}
