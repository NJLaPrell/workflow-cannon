<!--
agentCapsule|v=1|command=open-agent-session|module=task-engine|schema_only=pnpm exec wk run open-agent-session --schema-only '{}'
-->

# open-agent-session

Record an AgentSession v1 row in kit SQLite.

Use this to represent a host session (`cursor`, `vscode`, `cli`, `manual`) and optionally bridge an existing subagent session.

## Usage

```bash
workspace-kit run open-agent-session '{"agentId":"orchestrator-main","hostHint":"cursor","currentTaskId":"T100641","expectedPlanningGeneration":4312,"policyApproval":{"confirmed":true,"rationale":"record active agent session"}}'
```

## Notes

- Sensitive command: include JSON `policyApproval`.
- `agentId` is required unless `subagentSessionId` is provided.
- This command records pointers only; it does not mutate assignment or activity ownership.
