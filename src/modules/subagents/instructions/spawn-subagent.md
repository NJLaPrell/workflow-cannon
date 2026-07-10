<!--
agentCapsule|v=1|command=spawn-subagent|module=subagents|schema_only=pnpm exec wk run spawn-subagent --schema-only '{}'
-->

# spawn-subagent

```bash
workspace-kit run spawn-subagent '{"subagentId":"my-agent","executionTaskId":"T662","hostHint":"cursor","promptSummary":"Investigate X","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"record spawn"}}'
```

Creates a session row (`status` `open`). Does not launch Cursor; host executes separately. Optional `sessionId` (UUID default).

For the platform-agnostic bug-reporter child (`wc-bug-reporter`), prefer host adapters + CLI fallback documented in `.ai/runbooks/bug-reporter-host-spawn.md` — this command only records provenance.
