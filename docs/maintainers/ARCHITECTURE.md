# Architecture Overview

This document provides a high-level architecture map for Workflow Cannon.

## System intent

Workflow Cannon is a modular developer workflow platform for VS Code users who want safe, reproducible, package-first workflow automation. It models planning, tasks, policy, and execution as versioned contracts, runs repeatable workflows with deterministic outcomes and evidence capture, and is designed to continuously improve itself through a human-governed enhancement loop fed by observed friction and outcome data.

## Core architectural directions

- Modular capability system with explicit contracts, dependency graphs, and command dispatch.
- Structured task engine with typed schemas, lifecycle transitions, and pluggable task-type adapters.
- Deterministic configuration and policy evaluation with explainable precedence.
- Human-governed enhancement loop that generates evidence-backed recommendations.
- Package-first delivery with parity validation and release-blocking evidence gates.
- Safe-by-default automation with dry-run, diff, and rollback support.
- Observability and supportability as first-class design constraints.

## Key building blocks

- Module Registry — validates dependency graph, enforces registration contracts, determines startup order.
- Module Command Router — discovers, lists, and dispatches commands across enabled modules with alias resolution.
- Documentation Module — template-driven generation for paired AI (`.ai/`) and human (`docs/maintainers/`) documentation surfaces.
- Task Engine (Phase 1) — core schema, lifecycle transitions, and pluggable task-type adapters.
- Configuration Registry (Phase 2) — typed config with deterministic precedence and explain output.
- Policy Engine (Phase 2) — layered config with explain paths, approval gates, decision traces; maintainer-local task cutover docs (no packaged migration runtime in `v0.4.0`).
- Config/policy hardening + UX (Phase 2b) — stricter validation, full effective-config resolution, versioned traces and config-driven sensitive ops; CLI `config` group, persisted layers, metadata-driven explain/docs, guardrails, and mutation evidence (`v0.4.1`).
- Enhancement Engine (Phase 3) — recommendation intake, evidence-backed generation, and artifact lineage tracking (`v0.5.0`).

## Foundational design principles

- Safety and trustworthiness take priority over speed and convenience.
- Deterministic behavior for supported workflows; no silent degradation.
- Backward-compatible evolution with explicit, documented migration paths.
- Clear boundaries between canonical AI docs, generated human docs, and runtime state.
- Evidence-backed decisions and auditable provenance for all changes.
- Incremental, reversible changes preferred over broad rewrites.

## Related docs

- `docs/maintainers/ROADMAP.md` — strategic direction and phase plan
- `docs/maintainers/TASKS.md` — execution queue and task dependencies
- `docs/maintainers/RELEASING.md` — release process and evidence requirements
- `.ai/PRINCIPLES.md` — canonical decision priorities
- `.ai/module-build.md` — module development contract
