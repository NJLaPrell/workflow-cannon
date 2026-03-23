# Workflow Cannon Tasks

Status markers:
- `[p]` ready-proposed
- `[ ]` not done
- `[~]` in progress
- `[!]` blocked
- `[x]` complete

## Current execution state

- Current phase in execution: _Workspace kit post-extraction maintenance iteration 1._
- Milestone target: _Close T178-T180 and harden release/consumer cadence._
- Ready queue: `T178`
- Next tasks: `T178`, `T179`, `T180`

## Extraction follow-through closeout

### [x] T175 [workspace-kit] Execute extraction kickoff and split evidence capture
- Priority: P1
- Goal: Run pre-split freeze and subtree split execution evidence.
- Validation evidence:
  - Freeze SHA captured: `65797d888629d017f3538bd793c5e7cd781edf7d`
  - Split SHA captured: `5a1f7038255a2c83e0e51ace07ea0d95a327574c`

### [x] T176 [workspace-kit] Bootstrap Workflow Cannon repository from split history
- Priority: P1
- Goal: Push split history and bootstrap package/release automation.
- Validation evidence:
  - Repository: `https://github.com/NJLaPrell/workflow-cannon`
  - Base automation bootstrapped (`ci`, `publish-npm`) and verified.

### [x] T177 [workspace-kit] Close extraction with first package publish
- Priority: P1
- Goal: Complete publish gate and verify public package availability.
- Validation evidence:
  - Package: `@workflow-cannon/workspace-kit@0.1.0`
  - Publish run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397`
  - Package URL: `https://www.npmjs.com/package/@workflow-cannon/workspace-kit`

## Maintenance iteration 1

### [p] T178 [workspace-kit] Kick off post-extraction maintenance iteration 1 task mapping
- Priority: P1
- Goal: Define iteration scope, risks, and evidence standards for post-extraction maintenance.

### [p] T179 [workspace-kit] Harden package release metadata and automation guardrails
- Priority: P1
- Goal: Improve release reliability via metadata hardening and publish workflow guardrails.

### [p] T180 [workspace-kit] Define and validate consumer update cadence
- Priority: P1
- Goal: Define how external consumers adopt package updates with reproducible validation.
