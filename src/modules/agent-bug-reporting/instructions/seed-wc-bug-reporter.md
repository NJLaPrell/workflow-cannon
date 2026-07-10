<!--
agentCapsule|v=1|command=seed-wc-bug-reporter|module=agent-bug-reporting|schema_only=pnpm exec wk run seed-wc-bug-reporter --schema-only '{}'
-->

# seed-wc-bug-reporter

Register (or preview) the builtin **`wc-bug-reporter`** subagent definition from the agent-bug-reporting module seed.

## Preview (default)

```
pnpm exec wk run seed-wc-bug-reporter '{}'
```

Returns `registerArgs` suitable for `register-subagent` without writing SQLite.

## Apply

```
pnpm exec wk run seed-wc-bug-reporter '{"apply":true,"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"seed wc-bug-reporter definition"}}'
```

Upserts the non-retired definition with:

- `subagentId`: `wc-bug-reporter`
- `allowedCommands`: `file-bug-report`, `recommend-model`, `get-task`
- `metadata.preferredModel`: `composer-2.5` (`cheap_fast`)

Under `tasks.planningGenerationPolicy: require`, `expectedPlanningGeneration` is auto-filled when omitted.
