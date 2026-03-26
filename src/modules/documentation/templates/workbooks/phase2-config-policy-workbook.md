{{{AI Documentation Directive}}}

# Phase 2 workbook — config, policy, local task cutover

Binding design baseline for configuration and policy behavior in `v0.4.0`.

## Scope and non-goals

{{{
Summarize Phase 2 scope and explicit non-goals.
Method:
1) Read `docs/maintainers/workbooks/phase2-config-policy-workbook.md`.
2) Preserve task coverage and non-goal statements.
Output format:
- Short scope line + 3-5 non-goal bullets.
Validation:
- Keep references aligned to current task-engine state.
}}}

## Config precedence and merge semantics

{{{
Document layered precedence and merge model.
Method:
1) Extract precedence stack and merge behavior from maintainer workbook.
Output format:
- Numbered precedence list and one merge-semantics note.
Validation:
- Order must remain exact and deterministic.
}}}

## Policy and approvals baseline

{{{
Capture sensitive operation gating and approval model.
Method:
1) Read workbook sections for sensitive operations and approvals.
Output format:
- Operation table + approval bullets.
Validation:
- Preserve fail-closed policy behavior and actor resolution order.
}}}
