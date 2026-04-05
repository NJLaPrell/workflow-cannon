# ADR: CLI error codes and remediation metadata (agent ergonomics)

**Status:** Accepted (Phase 52)  
**Tasks:** T624 (contract), T625 (implementation)

## Context

Agents and operators consume `workspace-kit run` primarily as **JSON on stdout**. When `ok` is false, a bare `message` forces repo-wide searching. We need **stable `code` values** (already the norm) plus **optional additive `remediation`** that points to **repo-relative** instruction markdown and maintainer docs—never host paths or secrets.

## Decision

1. **`ModuleCommandResult.remediation`** (optional) may include:
   - `instructionPath` — repo-relative path to `src/modules/<module>/instructions/<command>.md`.
   - `docPath` — repo-relative path under `docs/maintainers/` (e.g. `POLICY-APPROVAL.md`, `adrs/ADR-planning-generation-optimistic-concurrency.md`).
   - `docAnchors` — short string hints for search (not URLs), optional.

2. **Stability:** Existing `code` strings remain the compatibility contract; new fields are **additive**. Consumers that ignore `remediation` keep working.

3. **Policy denials:** Keep legacy `remediationDoc` human title string; also set `remediation.docPath` to `docs/maintainers/POLICY-APPROVAL.md`.

4. **Doctor catalog:** `workspace-kit doctor --agent-instruction-surface` includes **`errorRemediationCatalog`** — a static index of high-traffic failure `code` → paths for machines that prefetch docs.

## T625 implementation checklist (command → failure class)

| Command / surface | Failure `code` | `remediation` |
| --- | --- | --- |
| **`run-transition`** | `invalid-run-args`, `planning-generation-required` (pilot), missing `taskId`/`action` in engine | `run-transition.md`; planning ADR when token policy |
| **`create-wishlist`** | `invalid-task-schema`, `duplicate-task-id`, `planning-generation-required` | `create-wishlist.md`; planning ADR when token policy |
| **`generate-recommendations`** | `generate-failed` | `generate-recommendations.md` |
| **Router** | `unknown-command`, `peer-module-disabled` | `AGENT-CLI-MAP.md`; instruction path for peer-disabled |
| **Policy gate (run)** | `policy-denied` | `POLICY-APPROVAL.md` |
| **Planning mutations** | `planning-generation-required` (create/update/archive/dependency) | Command-specific instruction + planning ADR |

## Non-goals

- Breaking changes to top-level JSON shape beyond optional `remediation`.
- Embedding full markdown bodies in JSON.
- Replacing `instructionPath` in `doctor` command rows (separate catalog).

## Related

- `docs/maintainers/adrs/ADR-runtime-run-args-validation-pilot.md` — pilot JSON Schema for `invalid-run-args`.
- `docs/maintainers/plans/phase-52-human-cli-affordances.md` — human `--schema-only` affordance (T627–T629).
