<!--
agentCapsule|v=1|command=phase-release-orchestration-state|module=task-engine|schema_only=pnpm exec wk run phase-release-orchestration-state --schema-only '{}'
-->

# phase-release-orchestration-state

Classify the current phase release path into one of six deterministic verdicts and return a bounded, reference-first packet.

## Usage

```bash
pnpm exec wk run phase-release-orchestration-state '{}'
```

No required args. The command reads phase/task state from the configured task store and git branch state from the workspace.

## Verdicts

- `ready-to-ship` — closeout/preflight are clean and the workspace is on `release/phase-<N>`
- `tasks-remaining` — non-terminal phase work remains
- `blocked` — one or more phase tasks are blocked
- `closeout-pending` — tasks are drained but closeout/evidence preflight still has findings
- `release-running` — closeout is clean but execution has moved off the phase branch (release in flight)
- `post-release` — workspace already rolled past the phase

## Response highlights (`data`)

- `phaseKey`, `workspace.currentKitPhase`, `workspace.releaseBranch`, `workspace.gitBranch`
- `counts` (`completedCount`, `nonTerminalCount`, `blockedCount`, `preflightViolationCount`, `readinessRemainingCount`)
- `verdict`, `nextAction`
- `nextActionRef` with exact `command`, `commandLine`, and `instructionPath`
- `readiness` with bounded `remainingTop[]` and `missingArtifactsTop[]` evidence refs
- `publishSafety` with `safeToPublish`, branch context, and blocking `reasons[]`
- bounded `readyUnblockedTop[]` and `blockedTop[]`
- `refs.commands[]` and `refs.instructions[]` for follow-on steps

## Related

- `phase-closeout-readiness`
- `phase-delivery-preflight`
- `phase-focus-dashboard`
- `release-status`
