<!--
agentCapsule|v=1|command=close-subagent-session|module=subagents|schema_only=pnpm exec wk run close-subagent-session --schema-only '{}'
-->

# close-subagent-session

```bash
workspace-kit run close-subagent-session '{"sessionId":"<uuid>","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"close session"}}'
```

Sets session `status` to `closed`.
