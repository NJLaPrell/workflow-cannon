# Workflow Cannon Roadmap

Long-range plan and decision log for the Workflow Cannon package and maintainer workflow.

## Scope

- This repository is the canonical home for Workflow Cannon package work.
- QuickTask is treated as an external consumer and parity fixture, not as the source of kit implementation.

## Current state

- Phase 0-6 extraction program is complete.
- First npm publish is complete: `@workflow-cannon/workspace-kit@0.1.0`.
- Next track is maintenance iteration 1 (`T178`-`T180`).

## Recorded decisions

| Decision | Choice |
| --- | --- |
| Project and repository name | Workflow Cannon (`workflow-cannon`) |
| Package name and scope | `@workflow-cannon/workspace-kit` |
| Extraction history strategy | `git subtree split` from `packages/workspace-kit` during cutover |
| Copilot vs Cursor directives model | Keep one profile and maintain both instruction surfaces |
| Upgrade merge strategy | Safe overwrite for kit-owned paths with backup + diff evidence |

## Execution evidence snapshot

- QuickTask freeze commit: `65797d888629d017f3538bd793c5e7cd781edf7d`
- Split commit: `5a1f7038255a2c83e0e51ace07ea0d95a327574c`
- First publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397`
- npm package: `https://www.npmjs.com/package/@workflow-cannon/workspace-kit`
