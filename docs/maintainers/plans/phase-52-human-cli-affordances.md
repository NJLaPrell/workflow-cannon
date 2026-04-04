# Phase 52 — Human CLI affordances (T627 contract)

**Tasks:** T627 (this doc), T628 (core CLI), T629 (extension + visual guide)

## JSON-first invariant

Default **`workspace-kit run`** output remains **JSON on stdout** for agents. Human-oriented affordances are **opt-in** or **discovery-only**; CI stays non-interactive.

## Chosen affordances (this phase)

1. **`workspace-kit run <pilot-command> --schema-only`**  
   - **Commands:** `run-transition`, `create-task`, `update-task`, `dashboard-summary` (matches `schemas/pilot-run-args.snapshot.json`).  
   - **Emits:** `ok: true`, `code: "run-args-schema"`, bundled JSON Schema fragment, **`sampleArgs`**, and `instructionPath` / `remediationContract` pointers.  
   - **Non-goal:** JSON Schema for every module command in Phase 52 (defer to follow-on tasks / OpenAPI-style manifest if needed).

2. **Command list hint** — `workspace-kit run` with no subcommand prints one line pointing at `--schema-only` for pilot commands.

## Explicitly out of scope (defer)

- Default TUI or paginated help.
- `--schema-only` for non-pilot commands (returns `schema-only-unsupported` with ADR pointer).
- Changing sensitive-command policy tiers.

## Acceptance mapping

| Task | Delivers |
| --- | --- |
| **T628** | `--schema-only` implementation + tests + `CHANGELOG` |
| **T629** | Extension README cross-link; `CLI-VISUAL-GUIDE.md` path; ship evidence note below |

## Ship evidence (T629)

**Human path:** Clone repo → `pnpm install` → `pnpm run build` → `pnpm run wk run run-transition --schema-only` → copy `sampleArgs`, add real `taskId` / `policyApproval`, run `pnpm run wk run run-transition '<json>'`.  
**Recorded:** Maintainer validation executed during Phase 52 closeout (no external ASCIInema host required for this drop).
