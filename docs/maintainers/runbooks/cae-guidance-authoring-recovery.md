<!-- GENERATED FROM .ai/runbooks/cae-guidance-authoring-recovery.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# CAE Guidance authoring — recovery

Machine-oriented recovery when the dashboard Guidance panel or SQLite registry is in a bad state.

## Symptom: mutations fail with `cae-stale-state`

**Cause:** The active registry version or digest changed since the form was loaded.

**Fix:**

1. Click **Refresh** on the Guidance authoring panel (reloads `cae-authoring-summary`).
2. Retry the mutation. If you were activating a draft, re-run **Preview Draft** and copy fresh **Preview evidence** — `cae-activate-draft-activation` rejects stale evidence digests.

## Symptom: “Native SQLite is unavailable” in the panel

**Cause:** The editor’s Node binary cannot load `better-sqlite3` (common on arch mismatch).

**Fix:** Install or select a Node runtime that matches the compiled native add-on (see kit remediation in `wk doctor` output), then restart VS Code / Cursor.

## Symptom: export/import dry-run errors

**Export path:** `.workspace-kit/tmp/guidance-pack.json` (relative to workspace root). The Portability tab writes this when **Export pack to tmp** succeeds.

**Import dry-run:** Requires that file to exist. Run export first, or place a valid pack JSON there, then run:

`pnpm exec wk run cae-import-guidance-pack-dry-run '{"schemaVersion":1,"packRelativePath":".workspace-kit/tmp/guidance-pack.json"}'`

## Symptom: registry validation fails

Run:

`pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'`

Use the returned codes and paths to repair artifacts, then refresh authoring.

## Symptom: wrong guidance version active

Use **Versions** (refresh list) and the separate Guidance view’s checkpoint/rollback flows (`cae-list-registry-versions`, clone/activate commands per maintainer playbook). Do not hand-edit SQLite outside documented recovery.

## Related

- `.ai/playbooks/task-to-phase-branch.md` — PR + `run-transition` evidence for shipping changes.
- `src/modules/context-activation/instructions/cae-authoring-summary.md` — authoring payload shape.
