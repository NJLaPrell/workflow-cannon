AI agents: `./.ai/` is the authoritative source of truth; read all files there before any analysis, planning, or code changes, and follow `./.ai/` over `README.md`, `./docs/`, and conflicting existing code patterns.

# Workflow Cannon

Workflow Cannon is the canonical home of `@workflow-cannon/workspace-kit` and the operational docs that drive its evolution.

It is built for developers using VS Code who want safe, reproducible, package-first workflow automation with clear release evidence.

## Table of Contents

- [What This Repository Is](#what-this-repository-is)
- [Big-Picture Vision](#big-picture-vision)
- [Current Status](#current-status)
- [Goals](#goals)
- [Package](#package)
- [Repository Map](#repository-map)
- [Documentation Index](#documentation-index)
- [License](#license)

## What This Repository Is

Workflow Cannon is the source of truth for:

- The `@workflow-cannon/workspace-kit` package
- Maintainer planning and execution artifacts
- Consumer validation and release-readiness evidence

Guiding characteristics:

- Package-first delivery and verification
- Deterministic, auditable workflows
- Safe-by-default operations (validation, traceability, rollback-friendly changes)

## Big-Picture Vision

Workflow Cannon is evolving from a package and docs repository into a developer workflow platform that can:

- model planning, tasks, policy, and execution as first-class, versioned contracts
- run repeatable workflows with deterministic outcomes and evidence capture
- continuously improve itself based on observed friction and outcome data

The long-term direction in this repository is to close the loop between:

1. **What happened** (transcripts, diffs, run artifacts, diagnostics)
2. **What should change** (recommendations to templates, rules, process, and config)
3. **What gets adopted** (human-reviewed approvals, policy checks, safe rollout)

### Enhancement Engine (automatic learning and correction)

The Improvement/Enhancement Engine is intended to detect weak spots in workflows and rules, then generate high-signal fixes with supporting evidence. Instead of hard-coding static process forever, the system should learn from real usage patterns and propose better defaults.

In practice, this means:

- detect recurring failure patterns, manual rework, and template drift
- emit recommendation items with confidence, deduping, and provenance
- route recommendations through an approval queue (`accept`, `decline`, `accept edited`)
- apply approved changes through guarded automation (dry-run, diff, rollback-ready)
- measure post-change outcomes so future recommendations improve over time

This keeps automation adaptive without sacrificing safety, governance, or developer trust.

## Current Status

- **Phase 0** and **Phase 1** (task engine, `v0.3.0`) are complete.
- **Phase 2** (layered config, policy gates, cutover docs, `v0.4.0`) is complete in-repo; see `docs/maintainers/TASKS.md` and `docs/maintainers/ROADMAP.md`.
- **Phase 2b** (policy + config UX, `v0.4.1`) and **Phase 3** (enhancement loop MVP, `v0.5.0`) are complete in-repo: evidence-driven **improvement** tasks, **`approvals`** (`review-item`), heuristic confidence, and append-only lineage.
- **Phase 4** (`v0.6.0`) is complete in-repo: compatibility matrix/gates, diagnostics/SLO baseline evidence, release-channel mapping, and planning-doc consistency checks.

## Goals

- Keep package implementation and release operations centralized here.
- Preserve independent consumer validation and update cadence.
- Grow modular capabilities for planning, tasking, configuration, policy, and improvement.
- Build a human-governed enhancement loop that learns from usage and recommends better workflows/rules.
- Maintain deterministic and auditable behavior as system complexity increases.

## Package

Install:

```bash
npm install @workflow-cannon/workspace-kit
```

## Repository Map

- `README.md` - project entry point
- `.ai/PRINCIPLES.md` - project goals and decision principles (canonical AI)
- `docs/maintainers/ROADMAP.md` - roadmap and decision log
- `docs/maintainers/TASKS.md` - execution tracking
- `docs/maintainers/ARCHITECTURE.md` - architecture direction
- `docs/maintainers/DECISIONS.md` - focused design/decision notes
- `docs/maintainers/RELEASING.md` - release checklist and validation expectations
- `.ai/module-build.md` - canonical AI module build guidance
- `docs/maintainers/` - maintainer process and boundary docs
- `docs/maintainers/module-build-guide.md` - human-readable module build guidance
- `docs/adr/` - ADR templates and records

## Documentation Index

- Project goals and decision principles: `.ai/PRINCIPLES.md`
- Strategy and long-range direction: `docs/maintainers/ROADMAP.md`
- Active execution tasks: `docs/maintainers/TASKS.md`
- Glossary and agent-guidance terms: `docs/maintainers/TERMS.md`
- Architecture direction: `docs/maintainers/ARCHITECTURE.md`
- Project decisions: `docs/maintainers/DECISIONS.md`
- Contribution guidelines: `docs/maintainers/CONTRIBUTING.md`
- Release process and gates: `docs/maintainers/RELEASING.md`
- Canonical AI module build guidance: `.ai/module-build.md`
- Human module build guide: `docs/maintainers/module-build-guide.md`
- Security, support, and governance: `docs/maintainers/SECURITY.md`, `docs/maintainers/SUPPORT.md`, `docs/maintainers/GOVERNANCE.md`
- AI behavior rules and command wrappers: `.cursor/rules/`, `.cursor/commands/`

## License

Licensed under MIT. See `LICENSE`.
