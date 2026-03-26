# query-lineage

Read-only audit helper: list immutable lineage events for a recommendation task.

## Command

`query-lineage`

## Arguments (JSON)

- `taskId` (string, required): Task Engine id of an `improvement` task.

## Result

Structured JSON with `events` (chronological) and `byType` (`rec`, `dec`, `app`, `corr`).

## Notes

- Does not mutate workspace state.
- Events live under `.workspace-kit/lineage/events.jsonl`.
