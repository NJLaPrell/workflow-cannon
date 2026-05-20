<!--
agentCapsule|v=1|command=get-last-output|module=task-engine|schema_only=pnpm exec wk run get-last-output --schema-only '{}'
-->

# get-last-output

Retrieve a prior **`wk run`** invocation's persisted JSON response from the planning SQLite **`kit_run_log`** table (populated by run-log persistence).

## Usage

```bash
workspace-kit run get-last-output '{"invocationId":"<uuid>"}'
workspace-kit run get-last-output '{"last":true}'
```

## Arguments

Provide **exactly one** of:

- **`invocationId`** (string): UUID from a prior command envelope's **`invocationId`** field.
- **`last`** (boolean, `true`): Most recently finished invocation in the run log.

## Response

On success (`code`: `run-log-output-read`), **`data`** includes:

- **`invocationId`**, **`command`**, **`startedAt`**, **`finishedAt`**, **`ok`**, **`code`**
- **`args`**, **`response`**: redacted JSON objects as stored in the run log

## Errors

| Code | Meaning |
| --- | --- |
| `invalid-run-args` | Neither or both of `invocationId` / `last` were provided |
| `run-log-disabled` | `kit_run_log` table missing |
| `invocation-not-found` | No matching row |
