# Transcript Automation Baseline (Phase 5)

Canonical design baseline for Phase 5 transcript intelligence automation.

AI-canonical companion: `.ai/workbooks/transcript-automation-baseline.md`.

## Scope

- Primary implementation scope: `T244`, `T245`, `T246`, `T247`, `T248`, `T259`.
- Follow-on hardening tasks (`T249`-`T258`, `T260`-`T266`) must remain compatible with this baseline unless explicitly re-planned.

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

## Rollout guardrails

- Keep this baseline authoritative for all transcript-automation follow-on tasks.
- Any compatibility-impacting changes to command semantics, config keys, or cadence logic require roadmap/task/doc updates in the same change set.
- Preserve fail-closed policy behavior for sensitive recommendation-generation flows.

