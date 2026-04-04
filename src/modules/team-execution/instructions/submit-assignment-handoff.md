# submit-assignment-handoff

```bash
workspace-kit run submit-assignment-handoff '{"assignmentId":"<id>","workerId":"bob","handoff":{"schemaVersion":1,"summary":"Done","evidenceRefs":["url"]},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"submit handoff"}}'
```

Worker path: status **`assigned` → `submitted`**. **`handoff`** must match contract v1 (`schemaVersion` **1**, non-empty **`summary`**; optional **`evidenceRefs`** string array). **`workerId`** must match the row.
