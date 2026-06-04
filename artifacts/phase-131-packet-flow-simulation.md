# Phase 131 Packet-Flow Simulation

Task: T100698
Phase: 131
Assignment: 1090ec8c-bea0-4be5-9d22-610dea327d3a
Purpose: deterministic regression evidence for the dashboard Complete & Release packet-first flow.

## Simulation Inputs

The dashboard Complete & Release seed supplies these fixed inputs:

```json
{
  "phaseKey": "131",
  "scope": "current",
  "integrationBranch": "release/phase-131",
  "dashboardAuthorization": "complete-and-release"
}
```

The first command in the prompt must be exactly phase scoped:

```sh
pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"131","scope":"current","integrationBranch":"release/phase-131","dashboardAuthorization":"complete-and-release"}'
```

## Happy Path Trace

| Step | Packet source | Required action | Expected result |
| --- | --- | --- | --- |
| 1 | dashboard prompt | Run `phase-release-orchestration-state` with the explicit phase args above. | `ok: true`; `data.verdict` present; `refs.commands` and `refs.instructions` present. |
| 2 | `data.verdict: tasks-remaining` | Drain only tasks returned in `readyUnblockedTop` / `readyWorkPacketRefs`. | No `list-tasks` or broad queue discovery is needed. |
| 3 | `readyWorkPacketRefs[].draftPacketRef` | Run `agent-execution-packet` for the returned task id and phase key. | Worker receives bounded owned/read-only/forbidden paths, validation commands, handoff refs, and stop conditions. |
| 4 | `agent-execution-packet` | Register the assignment with the packet metadata, then fetch the locked assignment packet. | Implementation begins only from `packetKind: "assignment"` and `packetLockStatus: "assignment_locked"`. |
| 5 | material task change | Validate, merge, store delivery evidence, run `completion-preflight`, and complete the task. | Refresh `phase-release-orchestration-state` once after the material state change. |
| 6 | `data.verdict: ready-to-ship`, `release-running`, or `post-release` | Follow returned closeout/release refs. | Release work uses packet refs, not manual runbook-first rediscovery. |

## Regression Assertions

1. Packet-first activation is proven when the first command returns:
   - `ok: true`
   - `data.verdict`
   - non-empty `refs.commands`
   - non-empty `refs.instructions`

2. Phase scoping is proven when `data.phaseSelection` reports:
   - `requestedPhaseKey: "131"`
   - `selectedPhaseKey: "131"`
   - `matchesCanonical: true`
   - `mismatch: false`

3. No broad discovery is permitted during task drain when:
   - remaining work is read from `readyUnblockedTop` or `readiness.remainingTop`
   - worker starts use `readyWorkPacketRefs[].draftPacketRef`
   - assignment registration uses the packet's recommended metadata
   - refresh happens only after task start, merge/evidence update, task completion, or release-state mutation

4. Completion evidence is sufficient when each drained task has:
   - GitHub PR or approved local delivery evidence
   - CI/check evidence
   - `completion-preflight` passed
   - terminal task status

## Mismatch And Fallback Cases

| Case | Trigger | Required response | Broad discovery allowed? |
| --- | --- | --- | --- |
| Missing packet command | `phase-release-orchestration-state` unavailable or returns `ok: false`. | Disable packet-first and run the full-refresh closeout path from the attached playbooks. | Only after packet-first is disabled. |
| Missing refs | Result omits `data.verdict`, `refs.commands`, or `refs.instructions`. | Disable packet-first; refresh with explicit `phaseKey` and closeout/preflight commands. | Only after packet-first is disabled. |
| Phase mismatch | `data.phaseSelection.mismatch: true`, branch mismatch, or canonical phase mismatch that cannot be reconciled. | Stop release work and report the concrete mismatch. | No. |
| Stale task evidence | Planning generation, task-state projection, or assignment packet audit is stale. | Refresh the relevant packet/state and retry from fresh evidence. | No. |
| Drain cursor issue | `phase-drain-delta` rejects, misses, stales its cursor, overflows bounded evidence, or asks for `full-refresh`. | Run full-refresh commands before acting. | Only for the named full-refresh refs. |
| Unsafe publish | `publishSafety.safeToPublish: false`. | Do not publish; fix the returned blockers first. | No. |

## Phase 131 Observed Replay

This run exercised the packet flow with the following concrete sequence:

| Task | Packet/ref source | Delivery result |
| --- | --- | --- |
| T100696 | `readyWorkPacketRefs[].draftPacketRef` from `phase-release-orchestration-state` | PR #655 merged into `release/phase-131`; CI `test` passed; completion preflight passed; task completed. |
| T100698 | `agent-execution-packet` draft, then assignment `1090ec8c-bea0-4be5-9d22-610dea327d3a` locked packet | This artifact records the deterministic packet-flow regression evidence. |

The replay demonstrates that Phase 131 closeout can drain packet-first from `phase-release-orchestration-state` and `agent-execution-packet` without using `list-tasks` or a broad runbook-first rediscovery pass.
