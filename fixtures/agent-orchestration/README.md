# Agent orchestration golden fixtures (T100639)

Canonical JSON examples for **AgentDefinition**, **AgentSession**, **assignment metadata**, **AgentActivity**, and **Handoff v2**. Each file is validated by `test/agent-orchestration/validators.test.mjs` using the runtime validators in `src/core/validation/agent-orchestration/`.

## Layout

| Path | Contract | Role |
| --- | --- | --- |
| `agent-definition-orchestration-agent.v1.json` | AgentDefinition v1 | Orchestration Agent |
| `agent-definition-task-worker.v1.json` | AgentDefinition v1 | Task Work Agent |
| `agent-session-orchestration-agent.v1.json` | AgentSession v1 | Orchestrator session (phase delivery) |
| `agent-session-task-worker.v1.json` | AgentSession v1 | Worker session on an assignment |
| `assignment-metadata-orchestration-agent.v1.json` | Assignment metadata v1 | Orchestrator assignment scope |
| `assignment-metadata-task-worker.v1.json` | Assignment metadata v1 | Worker strict scope |
| `agent-activity-working-task.v1.json` | AgentActivity v1 | Worker actively implementing |
| `agent-activity-blocked-worker.v1.json` | AgentActivity v1 | Worker blocked on dependency |
| `handoff-v2/*.v2.json` | Handoff v2 | Status variants (`completed`, `blocked`, `partial`, `failed`, `needs_review`) |
| `handoff-*.v2.json` (repo root of this folder) | Handoff v2 | Same golden payloads as `handoff-v2/` for doc paths that cite the flat names |

## Handoff v2 status map

| Status | Fixture |
| --- | --- |
| `completed` | `handoff-v2/handoff-completed.v2.json` |
| `blocked` | `handoff-v2/handoff-blocked.v2.json` |
| `partial` | `handoff-v2/handoff-partial.v2.json` |
| `failed` | `handoff-v2/handoff-failed.v2.json` |
| `needs_review` | `handoff-v2/handoff-needs-review.v2.json` |

## References

- Schemas: `schemas/agent-orchestration/`
- Human contracts: `AGENT_ORCHESTRATION_CONTRACTS.md`, `AGENT_ORCHESTRATION_HANDOFF.md`, `AGENT_ORCHESTRATION_ACTIVITY.md`, `AGENT_ORCHESTRATION_PROFILES.md`
- Tests: `test/agent-orchestration/validators.test.mjs`
