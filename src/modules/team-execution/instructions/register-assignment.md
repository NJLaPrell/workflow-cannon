# register-assignment

```bash
workspace-kit run register-assignment '{"executionTaskId":"T665","supervisorId":"alice","workerId":"bob","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"register assignment"}}'
```

Creates an **`assigned`** row. **`executionTaskId`** must exist in **`task_engine_tasks`**. Optional **`assignmentId`** (UUID if omitted), **`metadata`** object.

Mutating: JSON **`policyApproval`** + **`expectedPlanningGeneration`** when planning policy requires it.
