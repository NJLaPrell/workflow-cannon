# CI tier policy

GitHub Actions workflow: **`.github/workflows/ci.yml`**.

## Fast tier (`pull_request`)

Required check for PRs to `main` and `release/*`:

| Job | Steps |
| --- | --- |
| **`test`** | `pnpm run build`, `pnpm check`, `pnpm run test:run`, plugin fixture smoke, Cursor extension check |

Does **not** run: `parity`, `pack:dry-run`, `maintainer-gates`, release metadata check.

## Full tier (`push` to `main` or `release/*`)

Runs fast tier **`test`** plus:

| Job | Steps |
| --- | --- |
| **`release-readiness`** | `check-release-metadata.mjs`, `check-release-diff-shape.mjs` (push `before..HEAD`), `pack:dry-run`, `maintainer-gates` |
| **`parity`** | `pnpm run parity` (+ evidence artifacts) |

Phase integration branches (`release/phase-<N>`) receive full tier on **push** after merge; task PRs only see fast tier until landed on the phase branch.

## Branch protection

- **PRs:** require **`test`** (fast tier only).
- **`main` / `release/*`:** require **`test`**, **`release-readiness`**, and **`parity`** before treating the branch as release-ready.

Do not add `parity` as a required check on `pull_request` — it duplicates full-tier cost on every task PR.

## Release diff allowlist

`scripts/check-release-diff-shape.mjs` compares `RELEASE_DIFF_BASE..HEAD` (CI sets `RELEASE_DIFF_BASE` to `github.event.before` on push; locally defaults to `HEAD~1` for the latest commit).

- **`main` / `release/phase-<N>` pushes:** diff allowlist is **not** auto-enforced on merge pushes (invalid or huge diffs). Set `RELEASE_DIFF_ENFORCE=true` when validating an intentional version-only closeout commit (local or workflow env).
- **Other `release/*` branches:** enforced on push when configured in workflow.

Default paths: `package.json`, `CHANGELOG.md`, `schemas/_generated-*`, `.workspace-kit/**`, plus `release.allowlist[]` in `workspace-kit.profile.json`.

## Related

- `.ai/RELEASING.md` — release validation commands
- `.ai/runbooks/first-run-validation.md` — local gate parity
