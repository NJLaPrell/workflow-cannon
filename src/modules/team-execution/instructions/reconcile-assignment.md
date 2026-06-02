<!--
agentCapsule|v=1|command=reconcile-assignment|module=team-execution|schema_only=pnpm exec wk run reconcile-assignment --schema-only '{}'
-->

# reconcile-assignment

```bash
workspace-kit run reconcile-assignment '{"assignmentId":"<id>","supervisorId":"alice","checkpoint":{"schemaVersion":1,"mergedSummary":"Accepted worker summary + edits"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"reconcile"}}'
```

Supervisor path: **`submitted` → `reconciled`**. **`checkpoint`** v1 requires **`schemaVersion` 1** and non-empty **`mergedSummary`**.

Admin override: if caller actor id is listed in **`orchestration.adminIds`** or **`teamExecution.adminIds`**, supervisor lifecycle authority is accepted.

Stable lifecycle errors: **`assignment-not-found`**, **`assignment-authority-denied`**, **`assignment-status-invalid`**.
