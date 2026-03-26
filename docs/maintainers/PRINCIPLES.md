# Workflow Cannon Principles (Human-Readable)

This document is the human-readable companion to `.ai/PRINCIPLES.md` (canonical rules format).
If there is any conflict, `.ai/PRINCIPLES.md` is authoritative.

## Purpose

These principles guide planning, implementation, and release decisions across this repository. This file is for humans and agents who want a prose summary; the canonical machine-oriented rules live in `.ai/PRINCIPLES.md`.

## Decision Priority Order

When trade-offs conflict, resolve them in this order:

1. Safety and trustworthiness
2. Correctness and determinism
3. Compatibility and upgrade safety
4. Operability and evidence quality
5. Delivery speed and convenience

## Source of Truth Order

When sources disagree, use this precedence:

1. Canonical AI docs (`.ai/`)
2. Code and configuration reality
3. Generated human docs (`docs/maintainers/`)
4. Narrative docs

## Core Principles

- Prioritize safety and trustworthiness first in all trade-offs.
- Maintain correct, deterministic behavior for supported workflows.
- Preserve compatibility when behavior changes, or provide a documented migration path.
- Produce release evidence for readiness and parity checks before any release.
- Optimize for fast iteration in low-risk, clear, routine work.
- Apply high agent autonomy when user intent is clear.
- Keep documentation boundaries clean: strategy in ROADMAP, execution in canonical task-engine state (`.workspace-kit/tasks/state.json`) with `.workspace-kit/tasks/state.json` view, release operations in RELEASING.
- Prefer incremental, reversible changes over broad, high-risk changes.
- Do not bypass release, migration, or policy gates to increase delivery speed.
- Record explicit override rationale in task-engine state or DECISIONS when principles are overridden.

## Required Human Approval

Human approval is required before:

- Any release execution
- Any migration or upgrade-path change
- Any policy or approval-model change

Work must stop when there is unapproved risk of irreversible data loss or critical secret exposure.

## Conflict and Override Handling

- If a requested change conflicts with these principles, use soft-gate behavior: state the conflict and ask for confirmation before proceeding.
- If principles are explicitly overridden, record rationale in `.workspace-kit/tasks/state.json` (and regenerate `.workspace-kit/tasks/state.json`) or `docs/maintainers/DECISIONS.md`.

## Documentation Boundaries

To avoid ownership drift:

- Strategy belongs in `docs/maintainers/ROADMAP.md`
- Execution belongs in `.workspace-kit/tasks/state.json` (with `.workspace-kit/tasks/state.json` as view)
- Release operations belong in `docs/maintainers/RELEASING.md`

## Validation Gates

Before merge, release, or execution, confirm:

- **Release gate:** readiness and parity evidence exists before release. Satisfied by CI parity job + release-readiness job green.
- **Compatibility gate:** migration guidance exists for compatibility-impacting changes before merge or release. Satisfied by `docs/maintainers/CHANGELOG.md` migration notes.
- **Policy-sensitive gate:** required human approval is recorded before execution. Satisfied by explicit maintainer confirmation.

## Related References

- `.ai/PRINCIPLES.md` (canonical)
- `docs/maintainers/ROADMAP.md`
- `.workspace-kit/tasks/state.json`
- `.workspace-kit/tasks/state.json` (view)
- `docs/maintainers/DECISIONS.md`
- `docs/maintainers/RELEASING.md`
- `docs/maintainers/CHANGELOG.md`
