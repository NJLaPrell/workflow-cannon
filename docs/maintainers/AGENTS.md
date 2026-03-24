# AGENTS

Basic operating guidance for AI agents working in this repository.

## Source-of-truth order

1. `.ai/PRINCIPLES.md` - goals, trade-off order, approval gates
2. `.ai/module-build.md` - canonical module build directives and gates
3. `docs/maintainers/ROADMAP.md` - phase and release sequencing
4. `docs/maintainers/TASKS.md` - executable task queue and dependencies
5. `docs/maintainers/RELEASING.md` - release gates and evidence requirements
6. `docs/maintainers/TERMS.md` - canonical terminology
7. `docs/maintainers/module-build-guide.md` - human-readable companion to module build rules

## Core expectations

- Use high autonomy when task intent is clear.
- Follow soft-gate behavior on principle conflicts: explain the conflict and ask for confirmation.
- Require explicit user confirmation before:
  - release actions
  - migration/upgrade-path changes
  - policy or approval-model changes
- Prefer small, reversible, evidence-backed changes.

## Working rules

- Keep strategy in `docs/maintainers/ROADMAP.md`, execution detail in `docs/maintainers/TASKS.md`, and release process in `docs/maintainers/RELEASING.md`.
- When scope changes, update docs in the same change set.
- Preserve deterministic behavior and compatibility where practical; document migration impact when needed.

## Task execution

- Execute tasks in dependency order from `docs/maintainers/TASKS.md`.
- Treat each task's `Approach`, `Technical scope`, and `Acceptance criteria` as binding implementation guidance.
- If a task is too large for one change, split into supporting tasks before implementation.
