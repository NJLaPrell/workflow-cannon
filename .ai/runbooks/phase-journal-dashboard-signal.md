# Phase journal dashboard capture signal

Machine runbook for **T100310** — phase-journal silence nudge on the Workflow Cannon dashboard.

## Payload

`dashboard-summary.data.phaseJournalStats` (`schemaVersion: 1`):

- `phases[]` — `{ phaseKey, activeNoteCount, latestNoteAt }` for each phase with active notes
- `currentPhase` — `{ phaseKey, activeNoteCount, completedDeliveryTaskCount, silenceWarning }`

## Silence warning

`silenceWarning` is **true** when:

- workspace current phase is set
- `activeNoteCount === 0`
- `completedDeliveryTaskCount >= 1` (delivery tasks in phase reached `completed`)

Threshold constant: `PHASE_JOURNAL_SILENCE_COMPLETED_THRESHOLD` in `build-dashboard-phase-journal-stats.ts`.

## Extension surfaces

- Queue tab: **Notes captured this phase** banner (warning border when silent)
- Queue quick actions: **Add phase note** → existing `add-phase-note` drawer
- Phase Notes card: **New** button (unchanged)

## Operator action

Use **Add phase note** / **New** or `pnpm exec wk run add-phase-note` with JSON `policyApproval` when required.
