# Machine playbook summaries (agents)

**Agents:** ordered checklists live in **`.ai/playbooks/*.md`** (attach with `@`). **Maintainers** also have rendered copies under `docs/maintainers/playbooks/` after **`pnpm run generate-maintainer-docs-from-ai`**. Attach requestable Cursor rules when the editor supports it.

## Single task → phase integration branch (delivery loop)

1. Ensure **`release/phase-<N>`** exists (from `main` if new phase); branch a **task branch** from that line.
2. **Before the first implementation commit:** Tier A `run-transition` **`start`** (JSON **`policyApproval`**) if the task is still **`ready`**; pass **`expectedPlanningGeneration`** when policy **`require`**. Staying **`ready`** while coding is wrong — see playbook step **0b**.
3. Implement with commits; run `pnpm run check` / `pnpm run test` as appropriate. Optional: Tier C **`update-task`** on **`summary`** / **`metadata`** at milestones (PR opened, CI green).
4. Open **PR targeting `release/phase-<N>`** (not `main`); iterate review; merge into the phase branch.
5. After merge: Tier A **`complete`** with JSON **`policyApproval`** so the store matches shipped work.

Optional Cursor rule: `.cursor/rules/playbook-task-to-phase-branch.mdc`. Full checklist: **`.ai/playbooks/task-to-phase-branch.md`**.

## Phase closeout → `main` + release

When the phase is done: validate and fix on **`release/phase-<N>`**, obtain human approval, **merge phase branch to `main`**, then follow **`.ai/RELEASING.md`** on the **`main`** tip.

After publish and evidence (**playbook §6**), end with **§7 Phase delivery summary**: compact copy-paste block, **`{placeholders}`** only — counts from **`list-tasks`** / task store + roadmap scope (see playbook **§7 evidence rules**), not chat memory.

Full checklist: **`.ai/playbooks/phase-closeout-and-release.md`**.

Optional Cursor rule: `.cursor/rules/playbook-phase-closeout.mdc`.

## Improvement discovery (research → log)

Research transcripts/docs/architecture first, then persist a **problem report** (`metadata.issue` + `metadata.supportingReasoning`, scoped body)—not raw trace paste. Use Tier B `workspace-kit run` commands from `.ai/machine-cli-policy.md` / **`.ai/AGENT-CLI-MAP.md`** to persist—never chat-only approval for gated commands.

Full checklist: **`.ai/playbooks/improvement-task-discovery.md`**.

## Improvement scout (bounded rehearsal → optional persist)

Use **`improvement-scout`** when you want **capped** candidate findings (1–3), **lens + zone rotation**, and an **evidence floor** before opening tasks. Read-only JSON: `workspace-kit run scout-report '{}'` (no task persistence). Persist only via **`create-task`** or Tier B ingest/generate with **`policyApproval`**.

Full checklist: **`.ai/playbooks/improvement-scout.md`**.

## Improvement triage (≤3 → ready)

Pick at most three `proposed` improvement tasks, document rationale, **`accept`** to **`ready`** with **`policyApproval`** on the transition args.

Full checklist: **`.ai/playbooks/improvement-triage-top-three.md`**.

## Wishlist intake → execution

Rank **`wishlist_intake`** items with **`list-wishlist`** / **`get-wishlist`**, confirm operator timing, clarify scope, pick a target **`phaseKey`**, then **`convert-wishlist`** with **`expectedPlanningGeneration`** when policy is **`require`**.

Full checklist: **`.ai/playbooks/wishlist-intake-to-execution.md`**.

Agents attach the **`.ai/playbooks/...`** path; rendered copies under **`docs/maintainers/playbooks/`** are for humans after **`pnpm run generate-maintainer-docs-from-ai`** (see playbook **Agent paths vs maintainer-rendered mirrors**).

Optional Cursor rule: `.cursor/rules/playbook-wishlist-intake-to-execution.mdc`.

## Chat onboarding (`/onboarding`)

Numbered **Your Role** / **Agent Temperament**; persist after each answer; **`get-next-actions`** token before mutating `run` when policy **`require`**.

Full checklist: **`.ai/playbooks/workspace-kit-chat-onboarding.md`**.

Optional Cursor rule: `.cursor/rules/playbook-workspace-kit-chat-onboarding.mdc`.

## Chat behavior interview (`/behavior-interview`)

Six numbered scribe questions; persist each **`interview-behavior-profile`** answer; **`start` resets** — see playbook **gaps** for resume.

Full checklist: **`.ai/playbooks/workspace-kit-chat-behavior-interview.md`**.

Optional Cursor rule: `.cursor/rules/playbook-workspace-kit-chat-behavior-interview.mdc`.

### Confidence tiers (improvement inbox)

Recommendation tasks carry **`metadata.confidenceTier`** (`high` / `medium` / `low`). Filter with:

`pnpm run wk run list-tasks '{"type":"improvement","status":"ready","confidenceTier":"medium"}'`

## Long-session reload

See `.ai/LONG-SESSION-RELOAD.md`.
