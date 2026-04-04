# register-subagent

```bash
workspace-kit run register-subagent '{"subagentId":"my-agent","displayName":"My agent","description":"…","allowedCommands":["list-tasks","get-task"],"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"register subagent definition"}}'
```

Creates or updates a non-retired definition. Mutating: pass `expectedPlanningGeneration` when `tasks.planningGenerationPolicy` is `require`, plus JSON `policyApproval`.
