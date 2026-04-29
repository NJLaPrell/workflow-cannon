<!--
agentCapsule|v=1|command=start-task|module=task-engine|schema_only=pnpm exec wk run start-task --schema-only '{}'
-->

# start-task

Intent wrapper around `run-transition` with action `start`.

This command uses the same transition path as `run-transition`; it does not bypass guards, policy traces, planning-generation checks, idempotency, or dependency checks.

## Usage

```
workspace-kit run start-task '{"taskId":"T400","expectedPlanningGeneration":123,"clientMutationId":"start-T400","policyApproval":{"confirmed":true,"rationale":"begin T400"}}'
```

## Arguments

- `taskId` (string, required): task to transition.
- `expectedPlanningGeneration` (integer/string, required when `tasks.planningGenerationPolicy` is `require`): optimistic concurrency token from a prior read.
- `clientMutationId` (string, optional): retry key; replays use `task-intent-idempotent-replay`.
- `actor` (string, optional): actor recorded on transition evidence.
- `policyApproval` (object, required by policy): JSON approval in the run args object.

## Returns

Success returns `task-intent-applied` with the same transition evidence shape as `run-transition`. Use raw `run-transition` for less common lifecycle actions or when you need explicit source/target reasoning.
