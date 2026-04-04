# Feature taxonomy (task coverage)

Canonical **product features** for mapping **task-engine** work: each task should reference **one or more** feature slugs. Features are grouped into **categories** for reporting, filtering, and roadmap roll-ups.

<!-- GENERATED: do not hand-edit. Source: `src/modules/documentation/data/feature-taxonomy.json`. Regenerate: `pnpm run wk run generate-document '{"documentType":"FEATURE-TAXONOMY.md"}'`. -->

## How to use

- **Slug** — Stable identifier for APIs, DB, and `list-tasks` filters; use **kebab-case**, never rename once shipped (add a new slug and deprecate in docs if a concept splits).
- **Category** — Roll-up only; a task may span categories by listing multiple features.
- **Task mapping** — Prefer **1–3** features per task; use more only when the task truly cuts across surfaces.

## Categories and features

The table below is generated from the **planning SQLite feature registry** when available (`user_version` 5+), otherwise from **`src/modules/documentation/data/feature-taxonomy.json`** (export with `export-feature-taxonomy-json`).

| Category | Slug | Feature | Covers |
| --- | --- | --- | --- |
| Task engine & queue | `next-actions` | Next-actions & queue intelligence | get-next-actions, blocking analysis, ordering, queue namespaces |
| Task engine & queue | `task-dependencies` | Dependencies & unblock | dependsOn, blocked → ready cascades |
| Task engine & queue | `task-guards` | Guards & validation | State validity, dependency checks, policy hooks on transitions |
| Task engine & queue | `task-lifecycle` | Lifecycle transitions | Status machine, demotions, transition evidence |
| Task engine & queue | `task-mutations` | Task mutations & history | create/update, transition logs, introspection commands |
| Task engine & queue | `task-schema` | Task schema & envelopes | IDs, types, phase labels, priority, scope, acceptance criteria |
| Persistence & planning store | `planning-concurrency` | Planning generation & concurrency | planningGeneration, expectedPlanningGeneration, idempotency |
| Persistence & planning store | `store-migrations` | Migrations & recovery | user_version, migration commands, operator recovery |
| Persistence & planning store | `task-persistence` | Task persistence backends | SQLite blob vs relational rows, dual-planning stores |
| Config, policy & trust | `approvals` | Approvals & decision records | Decisions on recommendations and sensitive flows |
| Config, policy & trust | `config-cli` | Config CLI & layers | Project/user layers, validation, safe writes, mutation evidence |
| Config, policy & trust | `config-model` | Config model & resolution | Registry, precedence, explain/resolve, generated CONFIG docs |
| Config, policy & trust | `policy-registry` | Sensitive operations & policy registry | Gated ops, extension from effective config, CLI tiering |
| Config, policy & trust | `policy-traces` | Policy traces & versioning | Trace schema, upgrade notes, audit output |
| Improvement loop & signals | `evidence-dedupe` | Evidence & deduplication | evidenceKey, provenance, confidence/heuristics |
| Improvement loop & signals | `improvement-triage` | Improvement backlog & triage | proposed → ready, churn signals, maintainer rubrics |
| Improvement loop & signals | `recommendations` | Recommendation generation | generate-recommendations, cursors, cadence |
| Transcripts & automation | `automation-hooks` | Editor & CI automation hooks | Cursor/VS Code tasks, optional hooks |
| Transcripts & automation | `transcript-sync` | Transcript sync & privacy | Paths, redaction, storage boundaries |
| CLI, modules & agent surfaces | `agent-behavior` | Agent behavior profiles | Resolve/interview behavior (advisory; not permission) |
| CLI, modules & agent surfaces | `instructions` | Instructions & machine operability | instructions/*.md, JSON shapes, agent-first flows |
| CLI, modules & agent surfaces | `module-platform` | Command router & module platform | Enable/disable, dispatch, startup contracts |
| CLI, modules & agent surfaces | `response-templates` | Response templates | Registry, advisory enforcement, result shaping |
| Docs, playbooks & maintainer UX | `doc-generation` | Documentation generation | document-project, template validation, .ai pairing |
| Docs, playbooks & maintainer UX | `playbooks` | Playbooks, runbooks, TERMS | Direction sets, ops procedures, glossary alignment |
| Extension & human visibility | `cursor-extension` | Cursor extension & dashboard | Tasks UI, DnD, dashboard-summary, human-visible store fields |
| Release, quality & consumers | `ci-guards` | Check pipeline & CI gates | pnpm run check, instruction coverage, contract guards |
| Release, quality & consumers | `consumer-parity` | Consumer parity & compatibility | Compatibility matrix, packaged checks, native SQLite consumer |
| Release, quality & consumers | `doctor-diagnostics` | Doctor & diagnostics | wk doctor, persistence map, phase snapshot alignment |
| Release, quality & consumers | `release-versioning` | Release & versioning | Tags, changelog, phase closeout evidence |

**Count:** 9 categories, 30 features.
