/**
 * Composer seed for phase closeout + release (dashboard Complete & Release).
 * Machine canon: `.ai/playbooks/phase-closeout-and-release.md`, `task-to-phase-branch.md`.
 */

export type PhaseCompleteReleaseScope = "current" | "bucket";

export type PhaseCompleteReleasePromptOptions = {
  /** Stable phase key (e.g. `"64"`). Names `release/phase-<key>`. */
  phaseKey?: string;
  workspaceCurrentPhase?: string;
  workspaceNextPhase?: string;
  /** Ready-task ids from the dashboard bucket (preview; refresh via list-tasks). */
  seededTaskIds?: string[];
  scope?: PhaseCompleteReleaseScope;
};

function branchRef(phaseKey: string | undefined): string {
  const pk = phaseKey?.trim();
  return pk ? `release/phase-${pk}` : "release/phase-<N>";
}

function mismatchWarning(
  target: string | undefined,
  current: string | undefined
): string | null {
  const t = target?.trim();
  const c = current?.trim();
  if (!t || !c || t === c) {
    return null;
  }
  return `target phaseKey ${t} ≠ workspace current ${c} — confirm operator intends to close ${t}, not ${c}, before Stage 2.`;
}

export function buildPhaseCompleteReleaseChatPrompt(
  phasePhrase: string,
  options?: PhaseCompleteReleasePromptOptions
): string {
  const pk = options?.phaseKey?.trim();
  const cur = options?.workspaceCurrentPhase?.trim() ?? "";
  const next = options?.workspaceNextPhase?.trim() ?? "";
  const scope = options?.scope ?? (pk && cur && pk === cur ? "current" : "bucket");
  const branch = branchRef(pk);
  const mismatch = mismatchWarning(pk, cur);
  const seeded =
    options?.seededTaskIds && options.seededTaskIds.length > 0
      ? options.seededTaskIds.join(", ")
      : "none (refresh via list-tasks)";

  const lines: string[] = [
    "## Complete & Release",
    "",
    "**Intent:** Dashboard Complete & Release → drain target phase → closeout → publish. Operator authorizes ship; confirm once in chat before `pnpm run publish:npm`. Tier A/B `wk run` still needs JSON `policyApproval` (`.ai/POLICY-APPROVAL.md`).",
    "",
    "**Context**",
    `- target phaseKey: ${pk ?? "<resolve from phase-status>"}`,
    `- label: ${phasePhrase.trim() || pk || "unknown"}`,
    `- workspace current / next: ${cur || "—"} / ${next || "—"}`,
    `- scope: ${scope}`,
    `- integration branch: \`${branch}\``,
    `- seeded ready ids (preview): ${seeded}`
  ];
  if (mismatch) {
    lines.push(`- **mismatch:** ${mismatch}`);
  }
  lines.push(
    "",
    "**Attach:** `@.ai/playbooks/phase-closeout-and-release.md` `@.ai/playbooks/task-to-phase-branch.md` `@.ai/MACHINE-PLAYBOOKS.md` `@.ai/AGENT-CLI-MAP.md`",
    "**Rules:** `@.cursor/rules/maintainer-delivery-loop.mdc` `@.cursor/rules/playbook-task-to-phase-branch.mdc` `@.cursor/rules/playbook-phase-closeout.mdc`",
    "**If needed:** `@.ai/playbooks/improvement-triage-top-three.md` `@.ai/playbooks/wishlist-intake-to-execution.md`",
    "",
    "### 0 — Inventory (read-only; task store wins)",
    "`pnpm exec wk doctor` · `pnpm exec wk run phase-status '{}'` · `pnpm exec wk run get-next-actions '{}'` · `pnpm exec wk run resolve-maintainer-delivery-policy '{}'`",
    `\`pnpm exec wk run phase-closeout-readiness '{"phaseKey":"${pk ?? "<N>"}"}'\``,
    "`pnpm exec wk run list-tasks` — filter by phaseKey for **all non-terminal** statuses and types (not execution-only).",
    "",
    "### 1 — Drain phase (closeout §2)",
    "**Gate:** `phase-closeout-readiness` passed OR every remainder explicitly handled (defer/cancel/waiver needs operator confirm).",
    "",
    "| status / type | action |",
    "| --- | --- |",
    "| proposed (execution / improvement) | accept → deliver |",
    "| ready | branch from `" + branch + "` → `run-transition` start → implement → PR base=phase branch → merge → complete + delivery evidence |",
    "| in_progress | finish → complete |",
    "| blocked | unblock, cancel, or documented waiver |",
    "| wishlist_intake | `convert-wishlist` or defer to next phase (operator confirm) |",
    "",
    "One `T###` per delivery loop unless operator approves batch. Playbook: `task-to-phase-branch`.",
    "",
    "### 2 — Closeout & release (closeout §3–§7, `.ai/RELEASING.md`)",
    "1. `phase-delivery-preflight` with `baseRef=origin/" + branch + "`",
    "2. `pnpm run build` · `check` · `test` · `parity` · `pre-merge-gates`",
    "3. CHANGELOG + `package.json` version; sync `schemas/task-engine-run-contracts.schema.json` + `schemas/pilot-run-args.snapshot.json` `packageVersion`",
    "4. `release-evidence-manifest` with validation records",
    "5. `" + branch + "` → `main` PR merge",
    "6. Chat confirm → `pnpm run publish:npm` → `gh run watch`",
    "7. `set-current-phase` rollover · `phase-status` verify",
    "8. Playbook §7 summary — expand all tokens from CLI evidence (no placeholders)",
    "",
    "**Handoff if blocked:** remaining `T###` ids · branch names · last CLI JSON · next step (0, 1, or 2)."
  );

  return lines.join("\n");
}
