<!--
agentCapsule|v=1|command=close-agent-session|module=task-engine|schema_only=pnpm exec wk run close-agent-session --schema-only '{}'
-->

# close-agent-session

Close an AgentSession v1 row.

## Usage

```bash
workspace-kit run close-agent-session '{"sessionId":"<uuid>","expectedPlanningGeneration":4312,"policyApproval":{"confirmed":true,"rationale":"session ended"}}'
```

## Notes

- Sensitive command: include JSON `policyApproval`.
- This updates session lifecycle status only.
