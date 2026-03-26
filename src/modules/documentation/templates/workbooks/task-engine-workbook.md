{{{AI Documentation Directive}}}

# Task Engine Schema Workbook

Design workbook for Task Engine lifecycle, transitions, persistence, and guard behavior.

## Design decisions

{{{
Capture resolved design decisions and rationale.
Method:
1) Read `docs/maintainers/workbooks/task-engine-workbook.md`.
2) Preserve canonical choices for lifecycle, persistence, evidence, and command surfaces.
Output format:
- Markdown decision table.
Validation:
- Keep decisions consistent with current runtime behavior and tests.
}}}

## State model and transitions

{{{
Document lifecycle states and transition contract.
Method:
1) Use state/transition sections from maintainer workbook.
Output format:
- State list and allowed transition table.
Validation:
- Transition rules must match runtime guard behavior.
}}}

## Persistence and evidence contract

{{{
Describe state store schema and transition evidence requirements.
Method:
1) Read persistence/evidence sections from maintainer workbook.
Output format:
- Store schema summary and evidence field bullets.
Validation:
- Store path and required evidence fields must match implementation.
}}}
