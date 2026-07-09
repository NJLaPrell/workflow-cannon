<!--
agentCapsule|v=1|command=file-bug-report|module=agent-bug-reporting|schema_only=pnpm exec wk run file-bug-report --schema-only '{}'
-->

# file-bug-report

Create a **`type: improvement`** task in **`status: proposed`** with rich evidence metadata — Tier C (non-sensitive), proposed-only.

Hard-coded shape: always `improvement` @ `proposed`. Attempts to pass `status: ready` or a non-improvement `type` **fail closed**. Accept/promote to ready remains a normal gated transition.

## Usage

```
pnpm exec wk run file-bug-report '{"title":"CLI parse failure","symptom":"wk run args mangled in zsh","command":"pnpm exec wk run create-task","code":"exit 2 invalid-run-args","remediation":"quote JSON argv","issueKind":"agent-ergonomics","evidenceKey":"bug:cli-parse:zsh-mangle","clientMutationId":"bug:cli-parse:zsh-mangle"}'
```

Under `tasks.planningGenerationPolicy: require`, the handler **auto-reads** the current planning generation when `expectedPlanningGeneration` is omitted — no parent pre-read required.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | `string` | yes | Short defect title. |
| `symptom` | `string` | yes* | Problem statement → `metadata.issue` and task `summary`. Aliases: `summary`, `issue`. |
| `command` | `string` | no | Command that failed (stored in metadata + supportingReasoning). |
| `code` | `string` | no | Exit code / error code fragment. |
| `remediation` | `string` | no | Suggested fix hint. |
| `evidence` | `string` | no | Extra freeform evidence appended to supportingReasoning. |
| `issueKind` | `string` | no | One of: `bug-fix`, `agent-ergonomics`, `docs-gap`, `policy-friction`, `other`. |
| `relatedTaskId` | `string` | no | Recorded in `metadata.relatedTaskId`. |
| `evidenceKey` | `string` | no | Dedupe key; matching existing task returns idempotent replay. Also used as `clientMutationId` when that field is omitted. |
| `clientMutationId` | `string` | no | Idempotency key forwarded to `create-task`. |
| `features` | `string[]` | no | Feature taxonomy slugs. |
| `phaseKey` / `phase` | `string` | no | Optional phase fields. |
| `priority` | `P1`/`P2`/`P3` | no | Optional priority. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Optional; auto-filled under policy `require`. |
| `actor` | `string` | no | Actor on mutation evidence. |
| `type` / `status` | — | — | Must be omitted or exactly `improvement` / `proposed`; anything else is rejected. |

\* One of `symptom`, `summary`, or `issue` is required.

## Defaults

- `technicalScope`: Investigate symptom, Reproduce failure, Propose remediation
- `acceptanceCriteria`: Root cause documented, Fix landed or follow-up tasks filed
- `metadata.filedVia`: `file-bug-report`

## Returns

- **`file-bug-report-created`** — new improvement task in `data.task` / `data.taskId`.
- **`file-bug-report-idempotent-replay`** — same `evidenceKey` or `clientMutationId` as a prior create.
- **`file-bug-report-status-rejected`** / **`file-bug-report-type-rejected`** — fail-closed on ready/non-improvement.

## Policy

`policySensitivity: non-sensitive` (Tier C). No interactive `policyApproval` for this command. It cannot create ready tasks.
