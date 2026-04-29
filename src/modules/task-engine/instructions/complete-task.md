<!--
agentCapsule|v=1|command=complete-task|module=task-engine|schema_only=pnpm exec wk run complete-task --schema-only '{}'
-->

# complete-task

Intent wrapper around `run-transition` with action `complete`.

This command uses the same transition path as `run-transition`; it does not bypass guards, policy traces, planning-generation checks, idempotency, or delivery-evidence behavior.

## Usage

```
workspace-kit run complete-task '{"taskId":"T400","expectedPlanningGeneration":124,"clientMutationId":"complete-T400","policyApproval":{"confirmed":true,"rationale":"criteria met"}}'
```

## Arguments

- `taskId` (string, required): task to transition.
- `expectedPlanningGeneration` (integer/string, required when `tasks.planningGenerationPolicy` is `require`): optimistic concurrency token from a prior read.
- `clientMutationId` (string, optional): retry key; replays use `task-intent-idempotent-replay`.
- `actor` (string, optional): actor recorded on transition evidence.
- `policyApproval` (object, required by policy): JSON approval in the run args object.

## Returns

Success returns `task-intent-applied` with the same transition evidence shape as `run-transition`. Use raw `run-transition` for less common lifecycle actions or when you need explicit source/target reasoning.
