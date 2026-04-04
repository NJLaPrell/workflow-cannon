# Invoking maintainer playbooks (agents and operators)

Playbooks live under [`docs/maintainers/playbooks/`](../playbooks/). They are **markdown direction sets** — not executable scripts and not loaded automatically by `workspace-kit`.

## How agents get playbook content

1. **Explicit attachment** — Include the playbook file in the editor context (e.g. `@docs/maintainers/playbooks/phase-closeout-and-release.md` — **§7 Phase delivery summary** is an optional evidence-backed wrap-up template; `@docs/maintainers/playbooks/task-to-phase-branch.md`, `@docs/maintainers/playbooks/improvement-task-discovery.md`, or `@docs/maintainers/playbooks/improvement-triage-top-three.md` in Cursor) or paste a short excerpt plus the path.
2. **Requestable Cursor rules** — e.g. `.cursor/rules/playbook-phase-closeout.mdc` (phase closeout + release), `.cursor/rules/playbook-task-to-phase-branch.mdc` (single **`T###`** → PR → **`release/phase-<N>`**), `.cursor/rules/playbook-improvement-task-discovery.mdc` (improvement research → log), `.cursor/rules/playbook-improvement-triage-top-three.mdc` (**≤3** **`improvement`** **`proposed`** → **`ready`**), `.cursor/rules/playbook-wishlist-intake-to-execution.mdc` (wishlist ideation → **`convert-wishlist`**). Attach the rule when you want that mode. They are **not** a substitute for reading [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md) or running [`workspace-kit`](../AGENT-CLI-MAP.md) commands.
3. **`tasks/*.md` templates** — e.g. `tasks/phase-closeout.md` can tell the agent to open a playbook first; those files do **not** execute `workspace-kit` or satisfy policy.

There is **no** product hook that auto-injects playbooks into every session. If the path is not in context, assume the agent has **not** loaded it.

## Relationship to canonical docs

Playbooks **compose by reference**. For task lifecycle, approvals, and release gates, follow linked canon:

- [`docs/maintainers/AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md)
- [`docs/maintainers/POLICY-APPROVAL.md`](../POLICY-APPROVAL.md)
- [`docs/maintainers/RELEASING.md`](../RELEASING.md)
- Maintainer delivery loop (e.g. `.cursor/rules/maintainer-delivery-loop.mdc`)

## Discovery

- Index table: [`docs/maintainers/AGENTS.md`](../AGENTS.md) → **Maintainer playbooks**
- Playbook catalog and authoring rules: [`docs/maintainers/playbooks/README.md`](../playbooks/README.md)
