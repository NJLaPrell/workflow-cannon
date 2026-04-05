# ADR: Policy rehearsal for `generate-recommendations` (`dryRun`)

## Status

Accepted — implemented in v0.36.0 (pilot scope).

## Context

Operators want to exercise sensitive-command policy wiring and trace append behavior without mutating the task store, copying transcripts, or advancing improvement cursors.

## Decision

`generate-recommendations` accepts **`dryRun: true`** in the third JSON argument (with normal **`policyApproval`** when the command is policy-gated). In dry mode:

- Transcript **`sync-transcripts`** is skipped (no filesystem copies, no improvement state timestamp updates from sync).
- Candidate scoring runs against the existing archive path (same as live mode).
- No tasks are persisted, no lineage events are written, and improvement state is not saved after the run.
- Successful CLI responses use code **`recommendations-rehearsal`** and include **`simulatedCreates`** task ids.
- Policy traces prefix **`policy-rehearsal`** on the **`message`** field when approval is recorded.

## Consequences

- Dry-run and live paths share ingest/scoring logic but diverge on persistence; CI should assert stable trace prefixes and response codes, not byte-identical side effects.
- Other sensitive commands are out of scope until individually specified.
