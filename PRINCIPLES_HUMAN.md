# Workflow Cannon Principles (Human-Readable)

This document is the human-readable companion to `PRINCIPLES.md` (canonical rules format).  
If there is any conflict, `PRINCIPLES.md` is authoritative.

## Purpose

These principles guide planning, implementation, and release decisions across this repository.

## Decision Priority Order

When trade-offs conflict, resolve them in this order:

1. Safety and trustworthiness
2. Correctness and determinism
3. Compatibility and upgrade safety
4. Operability and evidence quality
5. Delivery speed and convenience

## Source of Truth Order

When sources disagree, use this precedence:

1. Canonical AI docs
2. Code and configuration reality
3. Generated human docs
4. Narrative docs

## Core Principles

- Prioritize safety and trustworthiness first in all trade-offs.
- Maintain correct, deterministic behavior for supported workflows.
- Preserve compatibility when behavior changes, or provide a documented migration path.
- Require release evidence for readiness and parity before release.
- Move fast on low-risk, clear, routine work.
- Use high agent autonomy when user intent is clear.
- Prefer incremental, reversible changes over broad, high-risk changes.
- Do not bypass release, migration, or policy gates for speed.

## Required Human Approval

Human approval is required before:

- Any release execution
- Any migration or upgrade-path change
- Any policy or approval-model change

Work must stop when there is unapproved risk of irreversible data loss or critical secret exposure.

## Conflict and Override Handling

- If a requested change conflicts with these principles, use soft-gate behavior: state the conflict and ask for confirmation before proceeding.
- If principles are explicitly overridden, record rationale in `TASKS.md` or `DECISIONS.md`.

## Documentation Boundaries

To avoid ownership drift:

- Strategy belongs in `ROADMAP.md`
- Execution belongs in `TASKS.md`
- Release operations belong in `RELEASING.md`

## Validation Gates

Before merge/release/execution, confirm:

- **Release gate:** readiness and parity evidence exists before release.
- **Compatibility gate:** migration guidance exists for compatibility-impacting changes before merge or release.
- **Policy-sensitive gate:** required human approval is recorded before execution.

## Related References

- `PRINCIPLES.md` (canonical)
- `ROADMAP.md`
- `TASKS.md`
- `DECISIONS.md`
- `RELEASING.md`
- `CHANGELOG.md`
