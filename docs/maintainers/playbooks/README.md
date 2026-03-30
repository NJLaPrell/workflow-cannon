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

## Discovery

- Human/agent entry: [`docs/maintainers/AGENTS.md`](../AGENTS.md) (playbook index).
- Invocation: `docs/maintainers/runbooks/agent-playbooks.md` (maintainer runbook; ships in the same phase).
