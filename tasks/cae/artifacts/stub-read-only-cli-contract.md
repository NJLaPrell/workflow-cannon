# CAE read-only CLI contract (STUB)

**Status:** Draft shell — replace with normative contract in task **T847**.

## Command inventory (placeholders)

| Command | Purpose | Args (JSON) | Output |
| --- | --- | --- | --- |
| `cae-list-artifacts` | List registry entries | filters TBD | `{ ok, artifacts[] }` |
| `cae-get-artifact` | Get one artifact | `{ artifactId }` | `{ ok, artifact }` |
| `cae-list-activations` | List activation definitions | filters TBD | `{ ok, activations[] }` |
| `cae-get-activation` | Get one activation | `{ activationId }` | `{ ok, activation }` |
| `cae-evaluate` | Compute effective bundle | context + flags | `{ ok, bundle, traceId }` |
| `cae-explain` | Explain evaluation | `{ traceId }` or inline eval ref | `{ ok, explanation }` |
| `cae-activation-health` | Registry + last eval health | optional | `{ ok, health }` |
| `cae-activation-conflicts` | List/detect conflicts | optional | `{ ok, conflicts[] }` |
| `cae-activation-trace` | Fetch trace by id | `{ traceId }` | `{ ok, trace }` |

**Note:** Final names may be `workspace-kit run <module>.<command>` style — align with `AGENT-CLI-MAP.md` coverage check.

## Global response shape

All commands should include:

- `ok` (boolean)
- `code` (stable string)
- `data` (payload) when `ok`
- `schemaVersion` inside `data` where applicable

## Policy

Read-only commands: **no** `policyApproval` unless project policy classifies them otherwise.
