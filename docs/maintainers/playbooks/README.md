# Maintainer playbooks (direction sets)

Versioned **direction sets** for recurring maintainer and agent flows. Terminology aligns with **Direction set (maintainer playbook)** in [`docs/maintainers/TERMS.md`](../TERMS.md).

## What belongs here

- **Ordered checklists** you can attach in chat or load via `@` / requestable Cursor rules.
- **Compose by reference**: link to canonical docs and run the steps they describe — do **not** paste full copies of [`RELEASING.md`](../RELEASING.md), the maintainer delivery loop, or long excerpts from [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md).
- **Stable playbook ids**: use the markdown **filename stem** as the id (e.g. `phase-closeout-and-release` → `phase-closeout-and-release.md`).

## What does not belong here

- Forking or paraphrasing entire release or policy documents (drift risk).
- Replacing task-engine state: execution queue and transitions remain in the configured task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`); playbooks **point** at `workspace-kit run` patterns from the CLI map.

## Authoring rules

1. **Link canon** — each step names the owning doc or instruction path and what to do there.
2. **Ordered steps only** — numbered or clear sequencing; no hidden branches without calling them out.
3. **CLI lines** — when a step mutates kit-owned state, cite the copy-paste pattern from [`docs/maintainers/AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) (Tier A/B and `policyApproval` as required by [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md)).
4. **Human gates** — call out explicit operator approval where [`RELEASING.md`](../RELEASING.md) requires it (e.g. before publish).

## Playbook ids (stable)

Use the **filename stem** as the stable id.

## Index

| Playbook id | File | Use when |
| --- | --- | --- |
| `phase-closeout-and-release` | [`phase-closeout-and-release.md`](./phase-closeout-and-release.md) | Finishing a phase: queue hygiene, delivery loop, human release gate, RELEASING evidence |
| `task-to-phase-branch` | [`task-to-phase-branch.md`](./task-to-phase-branch.md) | One **`T###`**: `release/phase-<N>`, task branch, PR into phase branch, review loop, merge, then task-engine **`complete`** |
| `improvement-task-discovery` | [`improvement-task-discovery.md`](./improvement-task-discovery.md) | Research friction → log **`improvement`** tasks / recommendations (transcripts, docs, architecture, release ops) |
| `improvement-triage-top-three` | [`improvement-triage-top-three.md`](./improvement-triage-top-three.md) | Analyze **`improvement`** backlog; promote **≤3** best **`proposed`** → **`ready`** (Tier A **`accept`**) |
| `wishlist-intake-to-execution` | [`wishlist-intake-to-execution.md`](./wishlist-intake-to-execution.md) | Rank wishlist ideation, confirm timing, clarify scope, pick target phase, run **`convert-wishlist`** with planning-generation hygiene |

## Discovery

- Human/agent entry: [`docs/maintainers/AGENTS.md`](../AGENTS.md) (playbook index).
- Invocation: [`docs/maintainers/runbooks/agent-playbooks.md`](../runbooks/agent-playbooks.md).
