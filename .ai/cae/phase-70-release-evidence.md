# Phase 70 CAE Release Evidence

## Status

Phase 70 implementation scope is complete in the task engine. Local release-readiness evidence is captured; remaining release work is human approval, merge/tag/publish, and post-publish evidence capture.

## Scope

Phase 70 ships the Context Activation Engine as a conservative v1 operator stack:

- SQLite is the default CAE runtime registry authority (`kit.cae.registryStore: sqlite`); `.ai/cae/registry/*.json` remains seed / fixture input.
- CAE registry health, validation, read-only inspection, evaluation, explain, trace retrieval, conflicts, acknowledgement inspection, and shadow feedback surfaces are wired through `workspace-kit run`.
- CAE governed mutation paths are explicit: Tier A/B `policyApproval` remains separate from CAE acknowledgement, and CAE registry admin mutation uses its own governance lane.
- The operator golden path lives at `.ai/cae/operator-golden-path.md` with happy-path and recovery commands.
- Golden smoke fixtures and tests cover the operator path and representative recovery behavior.

## Validation Evidence

Last local release-readiness pass in this workspace:

- `pnpm exec wk run agent-bootstrap '{}'` passed on 2026-04-26; canonical phase is `70`.
- `pnpm exec wk run list-tasks '{"phaseKey":"70","status":"ready"}'` showed only release-closeout rows before this cleanup.
- Release version metadata is `0.70.0`.
- `pnpm run build && pnpm run check && pnpm run test && pnpm run parity && node scripts/check-release-metadata.mjs && pnpm run pre-merge-gates` passed on 2026-04-26 after the `0.70.0` version bump.
- `artifacts/parity-evidence.json` recorded `overall: "pass"` at `2026-04-26T15:53:08.191Z`.
- Test summary from the final gate run: 555 tests, 13 suites, 555 pass, 0 fail.

Re-run the full gate chain if the release tip changes before publishing.

## Migration Review

Consumer-impacting migration risk is medium:

- Existing workspaces using the kit SQLite database will migrate through the normal SQLite migration ladder when current `workspace-kit` code opens the database.
- Runtime CAE registry authority is SQLite-first; JSON registry files are no longer runtime authority, but remain packaged as seed / fixture input.
- The release packages `.ai`, CAE golden fixtures, CAE instruction files, schemas, and the native SQLite installer path needed by packaged consumers.
- No broad live enforcement is enabled by default; shadow/advisory behavior remains opt-in unless configured.

No manual migration is required for consumers that do not enable CAE. Operators enabling CAE should start with `.ai/cae/operator-golden-path.md`.

## Security Review

Security-sensitive points reviewed for release:

- CAE context hydration is bounded and allowlisted; it does not dump raw task rows, env, paths, or arbitrary argv payloads into activation context.
- CAE acknowledgement is not a substitute for Tier A/B `policyApproval`; sensitive `workspace-kit run` operations still require JSON policy approval in the run args.
- Shadow feedback persistence is policy-sensitive and records only trace id, activation id, command name, signal, actor, timestamp, and an optional short note.
- Live enforcement remains narrow, reversible, and off by default.

No known secret-handling or irreversible-data-risk blocker remains from the Phase 70 CAE changes.

## Publish Boundary

Do not publish, tag, or run release automation until the maintainer explicitly approves the release action after reviewing scope, validation evidence, migration notes, and security notes.

Required post-publish evidence:

- Release version and tag.
- CI publish workflow run URL.
- npm package reference.
- Final validation command output or artifact references.
- Known risks or follow-up tasks, if any.
