<!--
agentCapsule|v=1|command=update-agent-session|module=task-engine|schema_only=pnpm exec wk run update-agent-session --schema-only '{}'
-->

# update-agent-session

Update AgentSession v1 host/model/task pointers and metadata.

## Usage

```bash
workspace-kit run update-agent-session '{"sessionId":"<uuid>","currentTaskId":"T100641","modelTier":"cheap-codex","expectedPlanningGeneration":4312,"policyApproval":{"confirmed":true,"rationale":"refresh session pointers"}}'
```

## Notes

- Sensitive command: include JSON `policyApproval`.
- Session must be `open`.
- Omitted fields keep existing values.
