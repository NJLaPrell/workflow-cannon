# User simulation agent orchestration profiles

Phase **132** — bounded roles for the user simulation harness. These profiles are **dry-run / test fixtures only**; they do not grant production publish, merge, or task-store mutation rights.

## `user-test-director`

**Purpose:** Plan and interpret simulation runs; route findings to improvement/defect payloads.

| Capability | Allowed |
| --- | --- |
| Run `scripts/agent-flow-harness.mjs` | yes |
| Read personas/scenarios under `test/harness/user-simulation/` | yes |
| Emit `simulationReport` JSON | yes |
| Merge branches / publish npm / `run-transition` on production tasks | **no** |
| `create-task` / `report-defect` without `dryRun` | **no** |

**Starts from:** scenario id + persona ids + context modes (CLI / MCP / MCP-fallback).

## `user-test-scout`

**Purpose:** Execute a single scenario path and surface persona-specific UX/efficiency findings.

| Capability | Allowed |
| --- | --- |
| Run one scenario in one context mode | yes |
| Read orchestration verdict + refs from harness trace | yes |
| Broad CLI discovery (`list-tasks`, `get-next-actions`, …) | **no** (efficiency evaluator flags) |
| Mutate workspace kit task store | **no** |

**Stops when:** scenario report `ok: false` or evaluator errors are recorded.

## Selection

| Situation | Profile |
| --- | --- |
| Compare CLI vs MCP vs fallback for a phase | `user-test-director` |
| Audit one persona experience (PM vs expert) | `user-test-scout` |

See **`AGENT_ORCHESTRATION_CONTRACTS.md`** for handoff and evidence boundaries.
