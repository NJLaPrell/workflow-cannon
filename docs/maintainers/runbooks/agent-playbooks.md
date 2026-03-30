# Invoking maintainer playbooks (agents and operators)

Playbooks live under [`docs/maintainers/playbooks/`](../playbooks/). They are **markdown direction sets** — not executable scripts and not loaded automatically by `workspace-kit`.

## How agents get playbook content

1. **Explicit attachment** — Include the playbook file in the editor context (`@docs/maintainers/playbooks/phase-closeout-and-release.md` in Cursor) or paste a short excerpt plus the path.
2. **Requestable Cursor rules** — Rules such as `.cursor/rules/playbook-phase-closeout.mdc` (when present) point at the same files; attach the rule when you want that mode. They are **not** a substitute for reading [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md) or running [`workspace-kit`](../AGENT-CLI-MAP.md) commands.
3. **`/qt` templates** — Templates under `tasks/*.md` (e.g. `tasks/phase-closeout.md`) tell the agent to open a playbook first; `/qt` itself does **not** execute `workspace-kit` or satisfy policy.

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
