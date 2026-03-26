# AGENTS

Basic operating guidance for AI agents working in this repository.

## Source-of-truth order

1. `.ai/PRINCIPLES.md` — goals, trade-off order, approval gates
2. `.ai/module-build.md` — module development contracts and enforcement
3. `docs/maintainers/ROADMAP.md` — phase strategy and release cadence
4. canonical task-engine state (`.workspace-kit/tasks/state.json`) — execution queue and dependency ordering 
5. `docs/maintainers/RELEASING.md` — release gates and evidence requirements
6. `docs/maintainers/TERMS.md` — canonical terminology
7. `docs/maintainers/module-build-guide.md` — human-readable module development companion

## Core expectations

- Use high autonomy when task intent is clear.
- Follow soft-gate behavior on principle conflicts: state the conflict and ask for confirmation.
- Stop when an action risks irreversible data loss or critical secret exposure without approval.
- Require explicit user confirmation before:
  - release actions
  - migration or upgrade-path changes
  - policy or approval-model changes
- Prefer small, reversible, evidence-backed changes.

## Working rules

- Keep strategy in `docs/maintainers/ROADMAP.md`, execution detail in task-engine state (`workspace-kit run` task commands), and release process in `docs/maintainers/RELEASING.md`; treat `.workspace-kit/tasks/state.json` as view.
- Treat `docs/maintainers/` governance/process docs as canonical; overlapping `.cursor/rules/` files are enforcement mirrors and should not introduce conflicting policy.
- When scope changes, update all related docs in the same change set.
- Preserve deterministic behavior and compatibility; document migration impact when changes affect consumers.

## Task execution

- Execute tasks in dependency order from task-engine state (`workspace-kit run list-tasks` / `get-next-actions`).
- Treat each task's `Approach`, `Technical scope`, and `Acceptance criteria` as binding implementation guidance.
- If a task is too large for one change, split into supporting tasks before starting implementation.

## Documentation generation

Use the documentation module for doc generation:

- `document-project` generates all templates in batch (AI to `.ai/`, human to `docs/maintainers/`).
- `generate-document` generates a single document by type.
- Follow `src/modules/documentation/RULES.md` for precedence and validation. Shipped templates and command inputs are documented in `src/modules/documentation/instructions/document-project.md`, `src/modules/documentation/instructions/generate-document.md`, and `src/modules/documentation/README.md`.
