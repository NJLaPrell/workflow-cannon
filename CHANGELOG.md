# Changelog

Canonical changelog location: `docs/maintainers/CHANGELOG.md`.

This root file is intentionally pointer-only to avoid split release history.

## [Unreleased]

- See `docs/maintainers/CHANGELOG.md` for all release notes, migration notes, and historical entries.

## [0.99.12] - 2026-05-27

- **Phase 110 - planner closeout:** PlanArtifact lifecycle dashboard actions, CLI golden-path coverage, fixture CI gate, and planner release evidence.

## [0.99.11] - 2026-05-27

- **Phase 115 — git canonical task state:** git-backed authoritative task history, snapshot/tail hydrate, publish/hydrate admission fixes, and phase task batch completion.

## [0.99.10] - 2026-05-26

- **Phase 114 — task-state event log foundations:** protect live planning SQLite from routine commits (S0.1); non-authoritative export envelope metadata (S0.2); doctor backup/persistence readiness commands (S0.3); canonical task-state event envelope and lifecycle/mutation event models (S1.1–S1.2); deterministic event applier and admission validation (S1.3–S1.4); projection metadata table, rebuild/apply-events commands, and repair-cache path (S2.1–S2.4).

## [0.99.9] - 2026-05-26

- Patch release for task-store recovery and phase snapshot alignment after the phase 108/113 dashboard closeout sequence.
- Captures phase 114/115 task-state event-log planning tasks in the task engine so maintainers can pick up the migration work from a fresh dashboard.

Latest release: **v0.99.12** (Phase 110 planner closeout; see canonical changelog).
