# Consumer Update Cadence

Defines update cadence states for `@workflow-cannon/workspace-kit` consumers and the validation contract for each state transition.

AI-canonical companion: `.ai/runbooks/consumer-cadence.md`.

**Maintainer task templates** under `tasks/*.md` are not part of this cadence: they do not run **`workspace-kit`** or satisfy policy. Use **`docs/maintainers/AGENT-CLI-MAP.md`** for real mutations.

## Cadence States

| State | Meaning | npm dist-tag | Consumer action |
| --- | --- | --- | --- |
| `candidate` | Pre-release under validation; not yet recommended for production | `next` | Install with `@next`; run parity fixture; report issues |
| `stable` | Validated release; recommended for production consumers | `latest` | Normal install/update via `@latest` |
| `patch` | Follow-up fix for a `stable` release; fast-tracked validation | `latest` | Normal update; review changelog for specific fix |

## State Transitions

```
candidate ─── validation pass ───► stable
candidate ─── validation fail ───► (remain candidate; fix and re-candidate)
stable ─────── regression ────────► patch candidate ──► patch (stable)
```

## Required Validation Per Transition

### candidate → stable

1. All CI gates pass (see `docs/maintainers/release-gate-matrix.md`).
2. Parity validation passes against packaged artifact:
   - `pnpm run pack:dry-run`
   - `node scripts/run-parity.mjs` (exits 0 with evidence artifact)
3. Consumer fixture install succeeds:
   - `cd test/fixtures/parity && npm install <tarball>` exits 0
   - Fixture smoke commands exit 0
4. No open P1 issues against the candidate version.
5. Maintainer signs off on changelog and migration notes (if any).

### candidate → candidate (re-candidate after fix)

1. Fix is merged and CI passes.
2. New candidate version is published with `--tag next`.
3. Restart `candidate → stable` validation from step 1.

### stable → patch

1. Regression is confirmed and tracked in task-engine state (`.workspace-kit/tasks/state.json`).
2. Fix is implemented and passes all CI gates.
3. Parity validation passes (same as candidate → stable steps 2-3).
4. Patch is published with `--tag latest`.
5. Evidence is captured per `docs/maintainers/RELEASING.md`.

## Fixture and Command Contract

Repeatable cadence validation uses these commands in order:

| Step | Command | Expected exit | Artifact |
| --- | --- | --- | --- |
| 1 | `pnpm run build` | 0 | `dist/` populated |
| 2 | `pnpm run check` | 0 | No type errors |
| 3 | `pnpm run test` | 0 | All tests pass |
| 4 | `pnpm run pack:dry-run` | 0 | Tarball in `artifacts/workspace-kit-pack/` |
| 5 | `node scripts/check-release-metadata.mjs` | 0 | Metadata validated |
| 6 | `node scripts/run-parity.mjs` | 0 | `artifacts/parity-evidence.json` |

Any non-zero exit blocks the transition and must be resolved before re-attempting.

## Related documents

- `docs/maintainers/RELEASING.md` — release procedure and evidence
- `docs/maintainers/release-gate-matrix.md` — gate inventory and ownership
- `docs/maintainers/runbooks/task-persistence-operator.md` — effective SQLite vs JSON backend and paths (operator map)
- `.workspace-kit/tasks/state.json` — regression and blocker tracking
