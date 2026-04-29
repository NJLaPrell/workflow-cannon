<!--
agentCapsule|v=1|command=message-subagent|module=subagents|schema_only=pnpm exec wk run message-subagent --schema-only '{}'
-->

# message-subagent

```bash
workspace-kit run message-subagent '{"sessionId":"<uuid>","direction":"outbound","body":"…","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"log handoff"}}'
```

`direction`: `outbound` | `inbound` | `system`. Appends to `kit_subagent_messages` for audit.
