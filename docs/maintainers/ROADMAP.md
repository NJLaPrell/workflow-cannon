# Workflow Cannon Roadmap

Long-range plan and decision log for the Workflow Cannon package and maintainer workflow.

## Scope

- This repository is the canonical home for Workflow Cannon package work.
- The legacy source repository is treated as an external consumer and parity fixture, not as the source of kit implementation.

## Current state

- Project tracking has been reset for the split repository baseline.
- Current execution phase is **Phase 0 (foundation)**.
- Completed foundational slices in this phase: `T178`, `T206`, `T207`, `T208`, `T209`, `T210`, `T211`, `T212`.
- Active Phase 0 queue now proceeds with release and parity hardening tasks `T179`-`T183`.
- Historical extraction and first-publish milestones remain recorded below as provenance.

## Phase plan and release cadence

Each phase ends with a GitHub release. Phases are sequential unless explicitly re-planned.

### Phase 0 - Foundation hardening -> GitHub release `v0.2.0`

- Primary scope: `T178` to `T183`, plus completed foundation slices `T206` to `T212` and hardening follow-up `T213`.
- Outcome: reliable release gates, consumer parity confidence, and machine-readable parity evidence.
- Exit signals:
  - Release/readiness gates and parity checks are reproducible.
  - Consumer regression checks are release-blocking in CI.
  - Parity evidence artifacts are generated and retained.

### Phase 1 - Task Engine core -> GitHub release `v0.3.0`

- Primary scope: `T184` to `T186` (Task Engine core delivery).
- Outcome: canonical task runtime contract that later modules build on.
- Exit signals:
  - Core task schema/lifecycle stable and documented.
  - Execution state transitions are deterministic and test-covered.

### Phase 2 - Configuration and policy base -> GitHub release `v0.4.0`

- Primary scope: `T187`, `T188`, and `T189`.
- Outcome: deterministic config behavior + policy-governed automation + safe migration path.
- Exit signals:
  - Layered config precedence is explicit and explainable.
  - Policy and approval gates are enforceable on sensitive actions.
  - Migration plan/checkpoint mechanics are operational.

### Phase 3 - Enhancement loop MVP -> GitHub release `v0.5.0`

- Primary scope: `T190` to `T192`.
- Outcome: human-governed recommendation loop with traceable provenance.
- Exit signals:
  - Recommendations are generated with evidence and confidence.
  - Human decisions are recorded and replayable.
  - Provenance is traceable recommendation -> decision -> applied change.

### Phase 4 - Runtime scale and ecosystem -> GitHub release `v0.6.0`

- Primary scope: `T193` to `T195`, then subsequent post-`v0.6.0` expansion tasks.
- Outcome: extension-ready and operationally robust platform.
- Exit signals:
  - Extension/module compatibility controls are enforced.
  - Operational SLO/supportability controls are active.
  - Upgrade compatibility guarantees are documented and tested.

## Recorded decisions

| Decision | Choice |
| --- | --- |
| Project and repository name | Workflow Cannon (`workflow-cannon`) |
| Package name and scope | `@workflow-cannon/workspace-kit` |
| Extraction history strategy | `git subtree split` from `packages/workspace-kit` during cutover |
| Copilot vs Cursor directives model | Keep one profile and maintain both instruction surfaces |
| Upgrade merge strategy | Safe overwrite for kit-owned paths with backup + diff evidence |

## Execution evidence snapshot

- Source-repo freeze commit: `65797d888629d017f3538bd793c5e7cd781edf7d`
- Split commit: `5a1f7038255a2c83e0e51ace07ea0d95a327574c`
- First publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397`
- npm package: `https://www.npmjs.com/package/@workflow-cannon/workspace-kit`
