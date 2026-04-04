# reconcile-assignment

```bash
workspace-kit run reconcile-assignment '{"assignmentId":"<id>","supervisorId":"alice","checkpoint":{"schemaVersion":1,"mergedSummary":"Accepted worker summary + edits"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"reconcile"}}'
```

Supervisor path: **`submitted` → `reconciled`**. **`checkpoint`** v1 requires **`schemaVersion` 1** and non-empty **`mergedSummary`**.
