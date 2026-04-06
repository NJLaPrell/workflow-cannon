# ADR: Cursor 3 task-flow subagent packaging (Phase 64)

## Status

Accepted — Phase 64.

## Context

Maintainers deliver **`T###`** work through a fixed loop: queue reads from the task engine, Tier A **`run-transition`**, branch/PR into **`release/phase-<N>`**, policy JSON on **`workspace-kit run`**, and evidence-backed completion. Cursor supports optional rules and skills that shape how agents load context.

## Decision

- **Packaging:** Ship an **optional** Cursor rule plus a small **skill** under **`.cursor/`** that points at machine canon only: **`.ai/playbooks/task-to-phase-branch.md`**, **`.ai/MACHINE-PLAYBOOKS.md`**, **`.ai/AGENT-CLI-MAP.md`**, **`.ai/POLICY-APPROVAL.md`**, **`.ai/WORKSPACE-KIT-SESSION.md`**, and **`.ai/LONG-SESSION-RELOAD.md`**. Invocation: attach the rule or invoke the skill when explicitly driving **single-task delivery** — not for general chat.
- **Cursor version:** Assumes Cursor rule/skill loading as of 2026; product changes may require revisiting file layout — keep **`.cursor/rules/playbook-task-flow-subagent.mdc`** as the pointer doc.
- **Main session vs subagent:** Policy-sensitive mutations stay in the session that can pass JSON **`policyApproval`** on **`pnpm exec wk run …`**. A dedicated “task-flow” subagent (when used) should load **read-heavy** playbook + CLI map context; it must **not** claim that chat approval replaces **`policyApproval`**.

## Non-goals

- Replacing **`workspace-kit`** as source of truth for task lifecycle.
- Bypassing **`run-transition`** or env/chat lanes for Tier A/B **`run`** commands.
- Duplicating full **AGENT-CLI-MAP** prose inside editor snippets (link only).

## Consequences

- Low-friction onboarding for task delivery without forking kit policy.
- Operators must still run **`workspace-kit`** locally or in CI with JSON approval where required.
