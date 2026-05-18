<!--
agentCapsule|v=1|command=agent-mutation-plan|module=task-engine|schema_only=pnpm exec wk run agent-mutation-plan --schema-only '{}'
-->

# agent-mutation-plan

Policy-aware argv builder: read-only plan for any `workspace-kit run` command before executing it (schema, validation, policy lane, planning generation, idempotency).

## Usage

```
workspace-kit run agent-mutation-plan '{"commandName":"run-transition","taskId":"T400","action":"start"}'
```

## Arguments

- `commandName` (string, required): the `workspace-kit run` command to plan.
- `taskId` (string, optional): task context for task-scoped commands.
- `action` (string, optional): requested lifecycle action for `run-transition`.

## Returns

Success `data` includes schema-only metadata, `argvBuilder` notes, `readyRun.args` / `readyRun.argv`, `readyRun.argvValid` + `argvValidation` when pilot schema applies, policy approval lane guidance, current `planningGeneration`, idempotency guidance, and remediation paths under `.ai/`.

For `run-transition` with `taskId`, `data.lifecycle` includes the task status, current `allowedActions`, dependency blockers, and whether the requested action is valid now.

This command is read-only and never accepts `policyApproval`. It explains that `WORKSPACE_KIT_POLICY_APPROVAL` does not approve `workspace-kit run`; mutating commands must carry JSON `policyApproval` inside the run args object when required.
