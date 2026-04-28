# claim-next-task

Atomically claim the current `get-next-actions` suggestion by transitioning it with `start`.

This command uses the same transition path as `run-transition`; it does not bypass guards, policy traces, planning-generation checks, idempotency, dependency checks, or delivery-evidence behavior.

## Usage

```
workspace-kit run claim-next-task '{"expectedPlanningGeneration":123,"clientMutationId":"claim-1","policyApproval":{"confirmed":true,"rationale":"claim next runnable task"}}'
```

## Arguments

- `queueNamespace` (string, optional): namespace filter matching `get-next-actions`.
- `expectedPlanningGeneration` (integer/string, required when `tasks.planningGenerationPolicy` is `require`): optimistic concurrency token from a prior read.
- `clientMutationId` (string, optional): retry key; replays use `task-intent-idempotent-replay`.
- `actor` (string, optional): actor recorded on transition evidence.
- `policyApproval` (object, required by policy): JSON approval in the run args object.

## Returns

Success returns `task-intent-applied` with transition evidence for action `start`. `claim-next-task` can return `claim-next-task-noop` without mutating state when there is no runnable suggestion, the suggestion changed before mutation, or the suggested task is dependency-blocked.

Use raw `run-transition` for less common lifecycle actions or when you need explicit source/target reasoning.
