# agent-mutation-plan

Build a read-only mutation plan for a `workspace-kit run` command before executing it.

## Usage

```
workspace-kit run agent-mutation-plan '{"commandName":"run-transition","taskId":"T400","action":"start"}'
```

## Arguments

- `commandName` (string, required): the `workspace-kit run` command to plan.
- `taskId` (string, optional): task context for task-scoped commands.
- `action` (string, optional): requested lifecycle action for `run-transition`.

## Returns

Success `data` includes schema-only metadata, policy approval lane guidance, current `planningGeneration`, whether `expectedPlanningGeneration` is required, idempotency guidance, and a ready-to-run argv example.

For `run-transition` with `taskId`, `data.lifecycle` includes the task status, current `allowedActions`, dependency blockers, and whether the requested action is valid now.

This command is read-only and never accepts `policyApproval`. It explains that `WORKSPACE_KIT_POLICY_APPROVAL` does not approve `workspace-kit run`; mutating commands must carry JSON `policyApproval` inside the run args object when required.
