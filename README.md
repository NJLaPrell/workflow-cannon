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

**Release and phase truth:** see `docs/maintainers/ROADMAP.md` and `docs/maintainers/data/workspace-kit-status.yaml`. **Task queue:** `.workspace-kit/tasks/state.json` (ids and `status` are authoritative for execution).

- **Phases 0–7** are complete through **`v0.9.0`** (see roadmap for slice ids).
- **Phase 8** ships maintainer/onboarding hardening (`v0.10.0`): policy denial clarity, runbooks, and doc alignment for CLI vs `run` approval.
- **Phase 9–10** ship agent/onboarding parity (`v0.11.0`): interactive policy opt-in, strict response-template mode, Agent CLI map (`docs/maintainers/AGENT-CLI-MAP.md`), and CLI-first Cursor guidance.
- **Phase 11** ships architectural review follow-up hardening (`v0.12.0`): policy/session denial edge tests, persistence concurrency semantics, release doc-sweep checklist, and runtime path audit note.
- **Phase 12** is the active queue: Cursor-native thin-client extension delivery (`T296`–`T310`).

Historical note: this file’s milestone list is not the live queue—always check task state for **`ready`** work.

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

### How to run the CLI (this repo and consumers)

There is **no** IDE slash command like `/qt` defined by this package unless your own editor config adds one. Supported entrypoints:

| Context | Command |
| --- | --- |
| **Installed package** | `npx @workflow-cannon/workspace-kit --help` or `pnpm exec workspace-kit --help` when the package is a dependency |
| **Developing this repo** | `pnpm run build` then `node dist/cli.js --help` or `pnpm exec workspace-kit --help` if linked |
| **Transcript helpers** | `pnpm run transcript:sync` / `pnpm run transcript:ingest` (see maintainer runbooks) |

Mutating commands require policy approval: **`docs/maintainers/POLICY-APPROVAL.md`** (JSON **`policyApproval`** for `workspace-kit run`, env for `config`/`init`/`upgrade`).

## Repository Map

- `README.md` - project entry point
- `.ai/PRINCIPLES.md` - project goals and decision principles (canonical AI)
- `docs/maintainers/ROADMAP.md` - roadmap and decision log
- `.workspace-kit/tasks/state.json` - execution tracking
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
- Active execution tasks: `.workspace-kit/tasks/state.json`
- Glossary and agent-guidance terms: `docs/maintainers/TERMS.md`
- Architecture direction: `docs/maintainers/ARCHITECTURE.md`
- Project decisions: `docs/maintainers/DECISIONS.md`
- Governance policy surface: `docs/maintainers/GOVERNANCE.md`
- Release process and gates: `docs/maintainers/RELEASING.md`
- Policy / approval surfaces: `docs/maintainers/POLICY-APPROVAL.md`
- Canonical changelog: `docs/maintainers/CHANGELOG.md` (`CHANGELOG.md` at repo root is pointer-only)
- Canonical AI module build guidance: `.ai/module-build.md`
- Human module build guide: `docs/maintainers/module-build-guide.md`
- Security, support, and governance: `docs/maintainers/SECURITY.md`, `docs/maintainers/SUPPORT.md`, `docs/maintainers/GOVERNANCE.md`
- AI behavior rules and command wrappers: `.cursor/rules/`, `.cursor/commands/`

## License

Licensed under MIT. See `LICENSE`.
