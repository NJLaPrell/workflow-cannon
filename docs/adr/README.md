# Architecture Decision Records (ADR)

Use ADRs for decisions that materially affect architecture, module contracts, data models, or operational behavior.

## When ADRs are required

Create an ADR (or an equivalent `D-XXX` entry in `docs/maintainers/DECISIONS.md`) when the change:

- Introduces or removes cross-module contracts
- Changes policy/approval behavior or governance boundaries
- Alters persistence schemas, migration paths, or release-critical workflows

If you skip an ADR for a substantial change, record an explicit opt-out rationale in task or PR evidence.

## Naming

Use sequential files:

- `0001-short-title.md`
- `0002-short-title.md`

## ADR template

```md
# ADR 000X - <title>

## Status
Proposed | Accepted | Superseded

## Context
<problem and constraints>

## Decision
<chosen approach>

## Consequences
<benefits, risks, migration impact>
```
