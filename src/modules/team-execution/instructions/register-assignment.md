<!--
agentCapsule|v=1|command=register-assignment|module=team-execution|schema_only=pnpm exec wk run register-assignment --schema-only '{}'
-->

# register-assignment

```bash
workspace-kit run register-assignment '{"executionTaskId":"T665","supervisorId":"alice","workerId":"bob","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"register assignment"}}'
```

Creates an **`assigned`** row. **`executionTaskId`** must exist in **`task_engine_tasks`**. Optional **`assignmentId`** (UUID if omitted), **`metadata`** object.

When metadata is provided, the persisted v1 packet is normalized with **`modelTierRecommendation`**, **`packetId`**, **`packetDigest`**, and bounded **`validationCommands`**. The command also stores the full packet body in the assignment packet registry for later lookup.

Response rows include additive **`orchestrationMetadataSummary`** with packet fields, validation-command counts, and packet audit status so orchestrators can confirm which bounded context the worker received.

Mutating: JSON **`policyApproval`** + **`expectedPlanningGeneration`** when planning policy requires it.
