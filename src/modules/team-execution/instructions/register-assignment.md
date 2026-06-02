<!--
agentCapsule|v=1|command=register-assignment|module=team-execution|schema_only=pnpm exec wk run register-assignment --schema-only '{}'
-->

# register-assignment

```bash
workspace-kit run register-assignment '{"executionTaskId":"T665","supervisorId":"alice","workerId":"bob","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"register assignment"}}'
```

Creates an **`assigned`** row. **`executionTaskId`** must exist in **`task_engine_tasks`**. Optional **`assignmentId`** (UUID if omitted), **`metadata`** object.

When metadata is provided, response rows include additive **`orchestrationMetadataSummary`** with key linkage fields and path/lock counts.

Mutating: JSON **`policyApproval`** + **`expectedPlanningGeneration`** when planning policy requires it.
