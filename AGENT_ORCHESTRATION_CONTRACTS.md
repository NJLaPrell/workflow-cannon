# User simulation agent orchestration contracts

Companion to **`AGENT_ORCHESTRATION_PROFILES.md`**. Defines evidence and mutation boundaries for Phase **132** user-testing agents.

## Contract: simulation report (`buildSimulationReport`)

| Field | Requirement |
| --- | --- |
| `findings[]` | Each row includes `scenarioId`, optional `personaId`, `contextMode`, `step`, `code`, `message` |
| `improvementPayloads[]` | `dryRun: true` always — templates only, not live `create-task` |
| `metrics` | Per-mode `contextBytes`, `packetBytes`, `transportEventBytes` when trace ran |

## Contract: state evaluator

Must detect (when scenario `stateExpectations` require it):

- wrong phase operation (`wrong-phase-operation`)
- incorrect task counts (`incorrect-task-state`)
- missing orchestration refs (`missing-orchestration-refs`)
- missing assignment packet digest (`missing-assignment-packet-digest`)
- missing release evidence on ready-to-ship (`missing-release-evidence`)

## Contract: efficiency evaluator

- Compare `efficiency.expectedCommands[mode]` to `trace.commandsRun`
- Record `trace.metrics` byte counts on every non-dry-run trace
- Emit `broad-discovery-fallback` when broad commands run in MCP mode

## Contract: UX evaluator

- **PM persona:** flag forbidden technical terms; require clear verdict in MCP mode
- **Expert persona:** require orchestration refs and correct MCP tool recommendation

## Forbidden (all profiles)

1. Publishing packages or merging to `main` / `release/phase-*` from harness runs
2. Tier A/B `wk run` mutations without JSON `policyApproval` outside documented dry-run fixtures
3. Silent `create-task` / `report-defect` — improvement payloads must stay `dryRun: true` until a human promotes them

## Harness entrypoints

```bash
node scripts/agent-flow-harness.mjs --scenario complete-release-completed-only
node scripts/agent-flow-harness.mjs --scenario complete-release-active-work --report
```

Dashboard prompt adapter: `extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts` (`buildPhaseCompleteReleaseChatPrompt`) — packet-first, MCP-before-CLI.
