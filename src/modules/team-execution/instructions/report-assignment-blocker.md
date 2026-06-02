<!--
agentCapsule|v=1|command=report-assignment-blocker|module=team-execution|schema_only=pnpm exec wk run report-assignment-blocker --schema-only '{}'
-->

# report-assignment-blocker

```bash
workspace-kit run report-assignment-blocker '{"assignmentId":"<id>","workerId":"bob","reason":"blocked on reproducible crash in planner flow","outputRefs":["artifacts/repro-log.txt"],"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"worker blocker report + defect intake"}}'
```

Worker path: sets assignment status **`assigned|submitted -> blocked`** for the matching **`workerId`** and, by default, creates a linked defect task through `report-defect`.

Optional fields for defect intake: `createDefect` (default `true`), `defectTitle`, `defectSummary`, `defectEvidence`, `severity`, `features`, `phaseKey`, `phase`, `actor`.

Linking behavior:
- `reason` persists as assignment `blockReason`.
- `outputRefs` are attached to blocker reporting output and used to seed defect evidence text.
- `relatedTaskId` on the defect is populated from assignment `executionTaskId`.
