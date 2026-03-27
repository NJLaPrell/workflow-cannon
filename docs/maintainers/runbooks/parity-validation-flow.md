# Parity Validation Flow

Canonical ordered command chain for validating packaged-artifact parity in `@workflow-cannon/workspace-kit`.

AI-canonical companion: `.ai/runbooks/parity-validation-flow.md`.

## Purpose

Parity validation confirms that the **packaged artifact** (what consumers install) behaves identically to the source-repo state. Every release candidate must pass this flow before promotion to `stable`.

For contributor **first clone** ordering (build → test → parity), see **`docs/maintainers/runbooks/first-run-validation.md`**.

## Canonical Command Chain

Commands are executed in this exact order. Any non-zero exit halts the chain.

| Step | Command | Expected exit | Output artifact | Machine-parseable |
| --- | --- | --- | --- | --- |
| 1 | `pnpm run build` | 0 | `dist/` directory populated | No |
| 2 | `pnpm run check` | 0 | — (typecheck only) | No |
| 3 | `pnpm run test` | 0 | — (test runner output) | No |
| 4 | `pnpm run pack:dry-run` | 0 | `artifacts/workspace-kit-pack/*.tgz` | No |
| 5 | `node scripts/check-release-metadata.mjs` | 0 | — (stdout pass/fail) | No |
| 6 | Fixture install: `npm install <tarball>` in `test/fixtures/parity/` | 0 | `node_modules/` in fixture | No |
| 7 | Fixture smoke: `npm run smoke` in `test/fixtures/parity/` | 0 | — (stdout pass/fail) | No |

The full chain is automated by `scripts/run-parity.mjs` (`pnpm run parity`).

## Non-Zero Exit Behavior

- Any step that exits non-zero is a **hard failure**.
- The runner stops immediately — later steps are not executed.
- The failing step name and stderr (first 500 chars) are captured in the evidence artifact.
- The evidence `overall` field is set to `"fail"`.

## Evidence Output Contract

On completion (pass or fail), `scripts/run-parity.mjs` writes:

- **Location:** `artifacts/parity-evidence.json`
- **Schema:** see `schemas/parity-evidence.schema.json`
- **Key fields:**
  - `schemaVersion`: integer, currently `1`
  - `runner`: string, path to runner script
  - `timestamp`: ISO 8601 string
  - `overall`: `"pass"` or `"fail"`
  - `steps`: array of step results, each with `name`, `status`, `durationMs`, and optional `error`

## Fixture Requirements

### Fixture directory

`test/fixtures/parity/`

### Fixture contents

- `package.json` — minimal consumer package with `"smoke"` script
- `smoke.mjs` — verifies package exports resolve and CLI bin entry is present

### Fixture bootstrap

Before running fixture steps, the parity runner:

1. Locates the tarball produced by `pack:dry-run` in `artifacts/workspace-kit-pack/`.
2. Installs it into the fixture directory with `npm install --no-save <tarball>`.
3. Runs `npm run smoke` in the fixture directory.

No manual fixture setup is required — the runner handles bootstrap from the packed artifact.

### Artifact output paths

| Artifact | Path | Retention |
| --- | --- | --- |
| Packed tarball | `artifacts/workspace-kit-pack/*.tgz` | Kept until next pack run |
| Parity evidence | `artifacts/parity-evidence.json` | Kept until next parity run; should be captured by CI as workflow artifact |
| Fixture `node_modules/` | `test/fixtures/parity/node_modules/` | Ephemeral; gitignored |

## Running Locally

```bash
pnpm run parity
```

This executes the full chain and writes evidence to `artifacts/parity-evidence.json`.

## Running in CI

The CI workflow (`.github/workflows/ci.yml`) runs parity as a dedicated job. See `docs/maintainers/release-gate-matrix.md` gate G8.

## Related documents

- `docs/maintainers/runbooks/consumer-cadence.md` — cadence states and transition validation
- `docs/maintainers/release-gate-matrix.md` — gate inventory
- `docs/maintainers/RELEASING.md` — release procedure
- `schemas/parity-evidence.schema.json` — evidence schema
