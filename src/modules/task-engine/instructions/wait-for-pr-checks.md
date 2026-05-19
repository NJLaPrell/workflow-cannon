<!--
agentCapsule|v=1|command=wait-for-pr-checks|module=task-engine|schema_only=pnpm exec wk run wait-for-pr-checks --schema-only '{}'
-->

# wait-for-pr-checks

Poll GitHub PR checks until a terminal state (success, failure, or timeout). **Read-only** for the task store; requires `gh` auth and network.

## Usage

```bash
pnpm exec wk run wait-for-pr-checks '{"pr":400,"timeoutSec":1800,"intervalSec":20,"requiredOnly":true}'
pnpm exec wk run wait-for-pr-checks '{"pr":"https://github.com/org/repo/pull/400"}'
```

## Args

| Field | Default | Notes |
| --- | --- | --- |
| `pr` | required | PR number or GitHub pull URL. |
| `timeoutSec` | `1800` | Max wait before `state: "timeout"`. |
| `intervalSec` | `20` | Sleep between polls when checks are pending or not yet reported. |
| `requiredOnly` | `true` | Passes `--required` to `gh pr checks`. |

## Response

`data.state` is one of: `passed`, `failed`, `timeout`, `no-checks-yet`.

- `failedChecks[]` — rows not in SUCCESS/SKIPPED/NEUTRAL when state is `failed`.
- `elapsedSec`, `pollCount`, `checks[]` — audit fields.

`ok: false` when state is not `passed` (exit code non-zero for scripts).

## Related

- Playbook §5a in `.ai/playbooks/task-to-phase-branch.md` — shell fallback when this command is unavailable.
- `harvest-delivery-evidence` — attach PR metadata after merge.
