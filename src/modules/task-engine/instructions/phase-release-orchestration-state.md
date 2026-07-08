<!--
agentCapsule|v=1|command=phase-release-orchestration-state|module=task-engine|schema_only=pnpm exec wk run phase-release-orchestration-state --schema-only '{}'
-->

# phase-release-orchestration-state

Classify the current phase release path into one of six deterministic verdicts and return a bounded, reference-first packet.

## Usage

```bash
pnpm exec wk run phase-release-orchestration-state '{}'
pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"130"}'
```

No required args. The command reads phase/task state from the configured task store and git branch state from the workspace.

## Arguments

- `phaseKey` — optional stable phase key to scope the packet. Defaults to the canonical workspace phase from `kit_workspace_status`, then config fallback.

## Verdicts

- `ready-to-ship` — closeout/preflight are clean and the workspace is on `release/phase-<N>`
- `tasks-remaining` — non-terminal phase work remains
- `blocked` — one or more phase tasks are blocked
- `closeout-pending` — tasks are drained but closeout/evidence preflight still has findings
- `release-running` — closeout is clean but execution has moved off the phase branch (release in flight)
- `post-release` — workspace already rolled past the phase, or closeout is complete and the workspace should be cleared (playbook **§6b**)

When publish is complete but **`workspace.currentKitPhase`** still matches the shipped phase, the final agent step is **`update-workspace-status`** with **`currentKitPhase: null`** — not another **`set-current-phase`** rollover.

## Response highlights (`data`)

- `phaseKey`, `workspace.currentKitPhase`, `workspace.releaseBranch`, `workspace.gitBranch`
- `phaseSelection` with `requestedPhaseKey`, selected `phaseKey`, canonical workspace phase, and mismatch warning when an explicit phase differs from the workspace phase
- `counts` (`completedCount`, `nonTerminalCount`, `blockedCount`, `preflightViolationCount`, `readinessRemainingCount`)
- `verdict`, `nextAction`
- `nextActionRef` with exact `command`, `commandLine`, and `instructionPath`
- `readiness` with bounded `remainingTop[]` and `missingArtifactsTop[]` evidence refs
- `publishSafety` with `safeToPublish`, branch context, and blocking `reasons[]`
- bounded `readyUnblockedTop[]` and `blockedTop[]`
- bounded `readyWorkPacketRefs[]` with task-first `agent-execution-packet` draft commands and `register-assignment` templates for ready unblocked work
- `refs.commands[]` and `refs.instructions[]` for follow-on steps

When `phaseKey` is supplied, the packet is scoped to that phase even if the workspace canonical phase differs. The mismatch remains visible in `phaseSelection` and `canonicalPhase`; follow-on command refs preserve the selected phase so callers do not silently refresh the wrong phase.

## Related

- `phase-closeout-readiness`
- `phase-delivery-preflight`
- `phase-focus-dashboard`
- `release-status`
