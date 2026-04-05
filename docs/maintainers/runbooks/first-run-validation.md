<!-- GENERATED FROM .ai/runbooks/first-run-validation.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# First-run validation (contributors)

Use this page when a clone “almost works” or **tests / parity** fail on first try.

## Green path (local)

From repository root, in order:

1. **`pnpm install`** (or your lockfile-respecting install).
2. **`pnpm run build`** — compiles `dist/`; **`pnpm test`** depends on it.
3. **`pnpm run check`** — typecheck without emit.
4. **`pnpm test`** — build + Node test runner.
5. **`pnpm run parity`** — packaged-artifact parity (release-style confidence).

Planning consistency (roadmap / feature matrix / Phase 4 alignment):

- **`pnpm run check-planning-consistency`**

Full release-style gate bundle:

- **`pnpm run phase5-gates`** — includes phase4-gates + tests (does not replace `parity`).

## Common first failures

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Tests import **`dist/`** failures | Build missing | Run **`pnpm run build`** before **`pnpm test`**. |
| Parity / pack errors | Stale or missing artifacts | Run **`pnpm run build`**, then **`pnpm run parity`**. |
| Policy-denied in transcript scripts | Approval not set for ingest | For **`pnpm run transcript:ingest`**, set `WORKSPACE_KIT_POLICY_APPROVAL` (see **`docs/maintainers/POLICY-APPROVAL.md`**). |
| Wrong Node major | Supported version mismatch | Use Node **22** in CI; match **`.github/workflows/ci.yml`** locally if possible. |

## Where to go next

- Parity evidence contract: **`docs/maintainers/runbooks/parity-validation-flow.md`**
- Release gates: **`docs/maintainers/release-gate-matrix.md`**
- Release process: **`docs/maintainers/RELEASING.md`**
