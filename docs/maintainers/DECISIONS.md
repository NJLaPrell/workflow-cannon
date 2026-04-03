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

## D-033 - Governance onboarding, doc mirrors, and drift checks

- Date: 2026-03-31
- Status: accepted
- Context: Maintainer and agent docs overlapped across `docs/maintainers/`, `.cursor/rules/`, `.ai/`, and optional **`tasks/*.md`** prompt templates, increasing sync cost and policy confusion.
- Decision: Use **progressive disclosure** (README + `AGENTS.md` tiers); treat **`.cursor/rules/*.mdc`** as pointer-first mirrors of maintainer canon; label **`tasks/*.md`** templates as prompt-only (no policy satisfaction); add CI **fixtures** for `.ai/PRINCIPLES.md` `rule|id=R###` inventory and for `AGENTS.md` § Source-of-truth backtick path order; rename primary release gate scripts to **`maintainer-gates`** / **`pre-merge-gates`** while keeping **`phase4-gates`** / **`phase5-gates`** as compatibility aliases.
- Consequences: Intentional changes to rule ids or precedence paths require updating **`scripts/fixtures/principles-rule-ids.json`** and **`scripts/fixtures/governance-doc-order.json`** (or adjusting checks with the same PR).
- Follow-ups: Optional deprecation warning on **`phase*`** script names if maintainers want a removal timeline.

## ADR hygiene expectations

- Record medium/high-impact architecture or policy model changes in either this file (`D-XXX`) or a maintainer ADR (`docs/maintainers/ADR-*.md`) before merge.
- If a change intentionally does **not** warrant an ADR, include a one-line rationale in the related task notes or PR description.
- Keep decision ownership explicit: strategic rationale here, queue/execution state in `.workspace-kit/tasks/state.json`.
