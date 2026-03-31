# Transcript Automation Baseline (Phase 5)

Canonical design baseline for Phase 5 transcript intelligence automation.

AI-canonical companion: `.ai/workbooks/transcript-automation-baseline.md`.

## Scope

- Primary implementation scope: `T244`, `T245`, `T246`, `T247`, `T248`, `T259`.
- Follow-on hardening tasks (`T249`-`T258`, `T260`-`T266`) must remain compatible with this baseline unless explicitly re-planned.

## Improvement task lifecycle (execution planning)

- `generate-recommendations` / transcript ingest may create **`type: improvement`** tasks (including `imp-*` ids) in the **Task Engine** store (default **SQLite** via `tasks.persistenceBackend: sqlite`; see `docs/maintainers/ADR-sqlite-default-persistence.md`).
- New recommendations are typically **`proposed`** until a maintainer promotes them to **`ready`** with `workspace-kit run run-transition` **`action":"accept"`** (bounded triage: [`improvement-triage-top-three.md`](../playbooks/improvement-triage-top-three.md)).
- To pull work out of the ready queue without cancelling, use **`action":"demote"`** (`ready` → `proposed`); see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) and `src/modules/task-engine/instructions/run-transition.md`.
- Friction research and logging before tasks exist: [`improvement-task-discovery.md`](../playbooks/improvement-task-discovery.md).

## Command model

- `workspace-kit run sync-transcripts`
  - Purpose: copy transcript JSONL files from configured source path into local archive path.
  - Behavior: deterministic, non-destructive copy; source is read-only; existing identical files are skipped; conflicting destination files are skipped and reported.
- `workspace-kit run ingest-transcripts` (policy-sensitive)
  - Purpose: run sync + recommendation generation in one explicit flow.
  - Behavior: runs sync first, applies cadence policy, then runs `generate-recommendations` when cadence allows or `forceGenerate` is set.
- `workspace-kit run generate-recommendations`
  - Purpose: generate recommendation tasks from transcript/policy/config/task evidence.
  - Behavior: evidence-key dedupe + append-only lineage as in Phase 3.

## Config contract

All keys resolve through canonical layered config precedence.

- `improvement.transcripts.sourcePath` (default: `.cursor/agent-transcripts`)
- `improvement.transcripts.archivePath` (default: `agent-transcripts`)
- `improvement.cadence.minIntervalMinutes` (default: `15`)
- `improvement.cadence.skipIfNoNewTranscripts` (default: `true`)

## Cadence and backoff policy

- Manual-first and event-driven by default (no scheduler required).
- Ingest cadence decision rules:
  - Skip generation when `skipIfNoNewTranscripts=true` and sync copies zero files.
  - Skip generation when elapsed time since last ingest is below `minIntervalMinutes`.
  - Allow generation when first run, interval is satisfied, or generation is forced.
- Decision reason is returned in structured output (`cadence.decision`).

## Safety and privacy boundaries

- Transcript archives are local-only by default (`agent-transcripts/` ignored by git).
- Sync never mutates source transcripts.
- Output includes machine-readable counters and error details without requiring raw log inspection.
- Recommendation generation remains policy-gated for mutating task creation.

## Observability contract

`sync-transcripts` summary includes:

- `scanned`, `copied`, `skippedExisting`, `skippedConflict`, `errors[]`, `copiedFiles[]`

`ingest-transcripts` summary includes:

- nested `sync` summary
- `cadence` decision fields (`minIntervalMinutes`, `skipIfNoNewTranscripts`, `decision`)
- `generatedRecommendations` block when generation runs

### `cadence.decision` values (operator matrix)

Values are produced by `resolveCadenceDecision` (`src/modules/improvement/transcript-sync-runtime.ts`). The JSON field `cadence.decision` is always one of these strings. **`generate-recommendations`** runs when the cadence allows **or** when the caller sets **`forceGenerate`** / **`runGenerate`** to `true` (override — generation can run even if `decision` shows a skip).

| `cadence.decision` | `generate-recommendations` when no override | Typical follow-up |
| --- | --- | --- |
| `skipped-no-new-transcripts` | No (if `skipIfNoNewTranscripts` is true and sync copied 0 files) | Wait for new transcripts, disable skip, or pass **`forceGenerate`** / **`runGenerate`** with policy approval |
| `skipped-min-interval` | No | Wait for interval, lower `improvement.cadence.minIntervalMinutes`, or force generate |
| `run-first-ingest` | Yes | First ingest or no prior `lastIngestRunAt` |
| `run-invalid-last-ingest-at` | Yes | Corrupt/unparseable prior timestamp — treated as allow |
| `run-min-interval-satisfied` | Yes | Interval elapsed since last ingest |

Deeper operations guidance: [`runbooks/transcript-ingestion-operations.md`](../runbooks/transcript-ingestion-operations.md).

## Rollout guardrails

- Keep this baseline authoritative for all transcript-automation follow-on tasks.
- Any compatibility-impacting changes to command semantics, config keys, or cadence logic require roadmap/task/doc updates in the same change set.
- Preserve fail-closed policy behavior for sensitive recommendation-generation flows.

