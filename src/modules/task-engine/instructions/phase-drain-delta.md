<!--
agentCapsule|v=1|command=phase-drain-delta|module=task-engine|schema_only=pnpm exec wk run phase-drain-delta --schema-only '{}'
-->

# phase-drain-delta

Return a bounded delta for phase-drain refresh loops after an initial full phase packet read.

## Usage

```bash
pnpm exec wk run phase-drain-delta '{"cursor":{"schemaVersion":1,"phaseKey":"130","planningGeneration":4465,"verdict":"tasks-remaining","task":{"updatedAt":"2026-06-03T20:00:00.000Z","ids":["T100683"]},"assignment":{"updatedAt":"2026-06-03T20:00:00.000Z","ids":["asg-1"]}}}'
```

## Arguments

- `cursor` — prior `nextCursor` returned by `phase-drain-delta`
- `taskLimit` — optional cap for `changedTasks[]` (default `10`)
- `assignmentLimit` — optional cap for `changedAssignments[]` (default `10`)

## Response highlights (`data`)

- `refreshRecommendation` — `delta` when the cursor is valid, `full-refresh` when the cursor is missing, invalid, or stale
- `cursorAccepted`, `cursorStatus`, `cursorStatusReason`
- `phasePath` — current verdict, next action, and whether the phase path changed since the previous cursor
- bounded `changedTasks[]` and `changedAssignments[]`
- `newlyReadyTop[]`, `blockedDecisionTop[]`, `submittedAssignmentsTop[]`
- `overflow.changedTasks` / `overflow.changedAssignments` with `overflowRefs[]` when caps are exceeded
- `nextCursor` — pass this to the next refresh call

## Related

- `phase-release-orchestration-state`
- `phase-focus-dashboard`
- `list-assignments`