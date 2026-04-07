<!-- GENERATED FROM .ai/runbooks/agent-playbooks.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Invoking maintainer playbooks (agents and operators)

Playbooks are **markdown checklists** under **`.ai/playbooks/`** (machine canon). They are not executable scripts and are not auto-loaded by `workspace-kit`. Maintainer-rendered copies under **`docs/maintainers/playbooks/`** exist for humans — **agents** should attach **`.ai/playbooks/…`** per **`AGENTS.md`** and **`.cursor/rules/agent-doc-routing.mdc`**.

## How agents get playbook content

1. **Explicit attachment** — Include the **`.ai`** playbook in context, e.g. **`@.ai/playbooks/phase-closeout-and-release.md`**, **`@.ai/playbooks/task-to-phase-branch.md`**, **`@.ai/playbooks/improvement-task-discovery.md`**, **`@.ai/playbooks/improvement-triage-top-three.md`**. For **phase ship**, **§7 Phase delivery summary** is the required wrap-up: compact copy-paste block, **evidence-backed counts**, and **no unfilled placeholders** — use **`{phaseNumber}`**, **`{completedExecutionTaskCount}`**, **`{followOnExecutionTaskCountOrNone}`**, **`{featureMarkdownBullets}`** (each line **`- …`**)**, **`{optionalNotesBlockOrEmpty}`** per **`.ai/playbooks/phase-closeout-and-release.md`** §7 (there is no **`{feature}`** slot in current canon).
2. **Requestable Cursor rules** — e.g. **`.cursor/rules/playbook-phase-closeout.mdc`**, **`.cursor/rules/playbook-task-to-phase-branch.mdc`**, **`.cursor/rules/playbook-improvement-task-discovery.mdc`**, **`.cursor/rules/playbook-improvement-triage-top-three.mdc`**, **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**, onboarding / behavior-interview rules. They **do not** replace **`POLICY-APPROVAL.md`** or **`workspace-kit run`**.
3. **Cursor slash commands** — Operator entrypoints under **`.cursor/commands/`** (e.g. **`complete-phase.md`** for **`/complete-phase <N> [approve-release]`**) compose with the same **`.ai`** playbooks; slash text is **intent only** for Tier A/B **`wk run`** (**`.ai/POLICY-APPROVAL.md`**).
4. **`tasks/*.md` templates** — Prompt-only; they do **not** execute **`workspace-kit`** or satisfy policy.

## Relationship to canonical docs

Playbooks **compose by reference**:

- **`.ai/AGENT-CLI-MAP.md`**, **`.ai/POLICY-APPROVAL.md`**, **`.ai/RELEASING.md`**
- Maintainer delivery loop: **`.cursor/rules/maintainer-delivery-loop.mdc`**

## Discovery

- **`.ai/MACHINE-PLAYBOOKS.md`** — compact index
- **`.cursor/commands/`** — slash command specs (Cursor)
- Human index: **`docs/maintainers/AGENTS.md`** → Maintainer playbooks (do not use as the agent bootstrap path)
