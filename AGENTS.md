AI agents: `./ai/` is the authoritative source of truth; read all files there before any analysis, planning, or code changes, and follow `./ai/` over `README.md`, `./docs/`, and conflicting existing code patterns.

# AGENTS

Basic operating guidance for AI agents working in this repository.

## Source-of-truth order

1. `PRINCIPLES.md` - goals, trade-off order, approval gates
2. `ROADMAP.md` - phase and release sequencing
3. `TASKS.md` - executable task queue and dependencies
4. `RELEASING.md` - release gates and evidence requirements
5. `TERMS.md` - canonical terminology

## Core expectations

- Use high autonomy when task intent is clear.
- Follow soft-gate behavior on principle conflicts: explain the conflict and ask for confirmation.
- Require explicit user confirmation before:
  - release actions
  - migration/upgrade-path changes
  - policy or approval-model changes
- Prefer small, reversible, evidence-backed changes.

## Working rules

- Keep strategy in `ROADMAP.md`, execution detail in `TASKS.md`, and release process in `RELEASING.md`.
- When scope changes, update docs in the same change set.
- Preserve deterministic behavior and compatibility where practical; document migration impact when needed.

## Task execution

- Execute tasks in dependency order from `TASKS.md`.
- Treat each task's `Approach`, `Technical scope`, and `Acceptance criteria` as binding implementation guidance.
- If a task is too large for one change, split into supporting tasks before implementation.
