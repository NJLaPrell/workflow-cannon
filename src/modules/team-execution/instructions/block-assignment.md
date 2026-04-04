# block-assignment

```bash
workspace-kit run block-assignment '{"assignmentId":"<id>","supervisorId":"alice","reason":"waiting on upstream","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"block assignment"}}'
```

Supervisor path: sets **`blocked`** from **`assigned`** or **`submitted`**. **`supervisorId`** must match the row.
