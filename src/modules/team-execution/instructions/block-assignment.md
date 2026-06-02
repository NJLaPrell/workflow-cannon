<!--
agentCapsule|v=1|command=block-assignment|module=team-execution|schema_only=pnpm exec wk run block-assignment --schema-only '{}'
-->

# block-assignment

```bash
workspace-kit run block-assignment '{"assignmentId":"<id>","supervisorId":"alice","reason":"waiting on upstream","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"block assignment"}}'
```

Supervisor path: sets **`blocked`** from **`assigned`** or **`submitted`**. **`supervisorId`** must match the row.

Admin override: if caller actor id is listed in **`orchestration.adminIds`** or **`teamExecution.adminIds`**, supervisor lifecycle authority is accepted.

Stable lifecycle errors: **`assignment-not-found`**, **`assignment-authority-denied`**, **`assignment-status-invalid`**.
