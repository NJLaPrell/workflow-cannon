# Decisions

This file captures key technical and product decisions that affect architecture, operations, or compatibility.

## Format

Use this template for each new entry:

```md
## D-XXX - <title>
- Date: YYYY-MM-DD
- Status: proposed | accepted | superseded
- Context: <why this decision is needed>
- Decision: <what was chosen>
- Consequences: <trade-offs and impacts>
- Follow-ups: <tasks/docs/migrations required>
```

## Existing recorded decisions

- Project/repository identity: Workflow Cannon (`workflow-cannon`).
- Package identity: `@workflow-cannon/workspace-kit`.
- Extraction strategy: subtree split from `packages/workspace-kit`.

## ADR hygiene expectations

- Record medium/high-impact architecture or policy model changes in either this file (`D-XXX`) or `docs/adr/` before merge.
- If a change intentionally does **not** warrant an ADR, include a one-line rationale in the related task notes or PR description.
- Keep decision ownership explicit: strategic rationale here, queue/execution state in `.workspace-kit/tasks/state.json`.
