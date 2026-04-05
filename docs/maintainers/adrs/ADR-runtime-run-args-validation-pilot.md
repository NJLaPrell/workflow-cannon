# ADR: Runtime `run` JSON args validation (T600 pilot)

**Status:** Accepted (Phase 50 / v0.50.0 pilot)  
**Context:** Wishlist **[Arch] B / T600** — validate `workspace-kit run <cmd> <json>` at the CLI boundary before module dispatch, with stable machine-readable errors and CI alignment to `schemas/task-engine-run-contracts.schema.json`.

## Decision

1. **Representative validation:** Use **AJV** against JSON Schema fragments extracted from the canonical **`task-engine-run-contracts.schema.json`** `commands.*.args` shapes (merged `allOf` / `$ref`), not a parallel Zod layer, so a single schema edit drives both documentation contract and runtime shape for pilot commands.
2. **Pilot allowlist (v0.50.0):** `run-transition`, `dashboard-summary`, `create-task`, `update-task`. Other commands remain unchanged at the CLI boundary (module-level validation only).
3. **Snapshot + CI:** Committed **`schemas/pilot-run-args.snapshot.json`** holds the merged args schema per pilot command plus **`sourceSchemaPackageVersion`**. **`scripts/check-pilot-run-args-snapshot.mjs`** fails `pnpm run check` when the snapshot drifts from a fresh extract — run **`node scripts/refresh-pilot-run-args-snapshot.mjs`** after contract edits.
4. **Placement:** Validation lives in **`src/core/run-args-pilot-validation.ts`** (R102-safe — no imports from `src/modules/*`). **`src/cli/run-command.ts`** invokes it after config/registry resolution and before policy / router dispatch.
5. **Failure contract:** Structural issues → **`ok: false`**, **`code: "invalid-run-args"`**, **`details.errors`** with AJV **`instancePath`** / **`keyword`** / **`message`**. When **`tasks.planningGenerationPolicy`** is **`require`**, missing **`expectedPlanningGeneration`** on pilot mutators fails early with **`planning-generation-required`** (same code/message family as task-engine guards).
6. **Schema fixes bundled with pilot:** Run-contract **`args`** now allow real CLI shapes: **`taskId`** matches execution tasks **`T###`** and improvements **`imp-` + 14 hex**; optional **`expectedPlanningGeneration`** (integer ≥ 0 or numeric string, matching **`readOptionalExpectedPlanningGeneration`**); **`dashboard-summary`** allows optional top-level **`config`** and **`actor`** (in addition to `{}`).

## Non-goals (this ADR)

- Validating every `run` command or full response payloads.
- Replacing module-internal business rules (lifecycle, idempotency, strict task schema).
- **T614** / **T615** parent proposals (hooks, skill packs) — separate phases.

## Consequences

- Maintainers extending the pilot must: update **`task-engine-run-contracts.schema.json`**, bump **`packageVersion`** with **`package.json`**, refresh the snapshot, and extend **`validatePilotRunCommandArgs`** allowlists if adding commands.
- Consumers see **`invalid-run-args`** before sensitive policy prompts when JSON is structurally wrong — fewer misleading **`policy-denied`** outcomes for malformed payloads.

## References

- **`docs/maintainers/module-build-guide.md`** — pilot extension notes.
- **`schemas/pilot-run-args.snapshot.json`**, **`scripts/refresh-pilot-run-args-snapshot.mjs`**
- **`ADR-planning-generation-optimistic-concurrency.md`**
