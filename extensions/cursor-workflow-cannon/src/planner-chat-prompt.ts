/**
 * Prompt text for driving Ideas → planner-chat → PlanArtifact in Cursor chat (Composer).
 * Kept free of `.env` / exfil-ish substrings — Cursor's deeplink validator rejects those.
 *
 * Behavioral checklist lives in `.ai/playbooks/planner-chat.md`; this file adds dashboard
 * context from an Ideas row and canonical path pointers.
 */

export type PlannerChatPromptOptions = {
  ideaId?: string;
  title?: string;
  note?: string;
  previousPlanArtifacts?: string[];
};

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out && out.length > 0 ? out : undefined;
}

function cleanRefs(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

export function buildPlannerChatPrompt(options?: PlannerChatPromptOptions): string {
  const ideaId = trimmed(options?.ideaId);
  const title = trimmed(options?.title);
  const note = trimmed(options?.note);
  const previousPlanArtifacts = cleanRefs(options?.previousPlanArtifacts);

  const lines = [
    "Run **planner-chat** for this Workflow Cannon Ideas row (playbook id **`planner-chat`**).",
    "",
    ideaId ? `Idea id: **${ideaId}**` : undefined,
    title ? `Idea title: **${title}**` : undefined,
    note ? `Idea note: ${note}` : undefined,
    previousPlanArtifacts.length > 0
      ? `Previous plan artifacts: ${previousPlanArtifacts.map((ref) => `**${ref}**`).join(", ")}`
      : undefined,
    "",
    "Attach **`.ai/playbooks/planner-chat.md`** and follow it from §0.",
    "",
    "Preserve PlanArtifact provenance: set `provenance.sourceIdeaId` to the Ideas row id when present, and carry `provenance.previousPlanArtifacts` forward when provided.",
    "",
    "Use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for gated `workspace-kit run` commands. Keep normal user-facing chat focused on planning decisions, not raw CLI choreography."
  ].filter((line): line is string => line !== undefined);

  return lines.join("\n");
}
