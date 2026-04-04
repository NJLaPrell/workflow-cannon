# spawn-subagent

```bash
workspace-kit run spawn-subagent '{"subagentId":"my-agent","executionTaskId":"T662","hostHint":"cursor","promptSummary":"Investigate X","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"record spawn"}}'
```

Creates a session row (`status` `open`). Does not launch Cursor; host executes separately. Optional `sessionId` (UUID default).
