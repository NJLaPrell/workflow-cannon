# Bug-reporter host spawn (operators / agents)

## Purpose

Spawn a fire-and-forget **bug-reporter** child that files a proposed improvement via `file-bug-report`. Kit `spawn-subagent` only records provenance — hosts (or the CLI) execute.

## Seed the definition

```bash
# Preview seed payload (no write)
pnpm exec wk run seed-wc-bug-reporter '{}'

# Persist wc-bug-reporter (Tier B)
pnpm exec wk run seed-wc-bug-reporter '{"apply":true,"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"seed wc-bug-reporter definition"}}'
```

Equivalent: pass `registerArgs` from the preview into `register-subagent`. Seed pins:

- `subagentId`: `wc-bug-reporter`
- `allowedCommands`: `file-bug-report`, `recommend-model`, `get-task`
- `metadata.preferredModel`: `composer-2.5`

## Spawn interface (platform-agnostic)

Parent builds a **BugReportHandoffV1** object (see skill `wc-bug-report`), then resolves a host plan. Library entry: `resolveBugReporterSpawnPlan(hostId, { handoff, recordProvenance? })` under `src/modules/agent-bug-reporting/adapters/`.

### Contract every host must honor

1. Prefer **background** child (do not await).
2. Prompt = handoff JSON (`schemaVersion: 1`, `skillId: wc-bug-report`, required `symptom`).
3. Default child model pin: `composer-2.5` (host may map to a local cheap model).
4. When background spawn is unavailable → **CLI fallback** (`file-bug-report`).
5. Optional kit provenance: `spawn-subagent` with `hostHint` + `promptSummary`.

## Implemented hosts

### Cursor

Background Task tool:

- `run_in_background: true`
- `subagent_type: "generalPurpose"`
- `model: "composer-2.5"` (or seed override)
- `prompt`: stringified handoff JSON

### CLI (direct filing — works without any IDE)

Maps handoff → `file-bug-report` args and an argv example. This is the **core filing path** that never depends on Cursor/Antigravity/Copilot.

```bash
pnpm exec wk run file-bug-report '{"title":"<short>","symptom":"<symptom>","clientMutationId":"<key>",...}'
```

## Stub hosts (documented contracts only in v1)

| Host | Adapter id | Behavior |
| --- | --- | --- |
| Antigravity IDE | `antigravity` | Stub maturity; same contract; `fallback` = CLI plan |
| VS Code / GitHub Copilot | `vscode-copilot` | Stub maturity; same contract; `fallback` = CLI plan |

Do **not** hard-code host-specific APIs into module core. Stubs exist so the spawn interface stays portable without shipping full host implementations in v1.

## Related

- Skill: `src/modules/agent-bug-reporting/skills/wc-bug-report/SKILL.md` (and `.claude/skills/wc-bug-report/`)
- Subagent registry: [`subagent-registry.md`](./subagent-registry.md)
- Filing command: `src/modules/agent-bug-reporting/instructions/file-bug-report.md`
