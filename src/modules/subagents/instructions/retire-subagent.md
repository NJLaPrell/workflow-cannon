# retire-subagent

```bash
workspace-kit run retire-subagent '{"subagentId":"my-agent","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"retire definition"}}'
```

Marks a definition retired (no new spawns). Tier B: `policyApproval` + planning generation when required.
