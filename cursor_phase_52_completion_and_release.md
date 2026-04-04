# Phase 52 completion and release
_Exported on 4/3/2026 at 22:23:51 MST from Cursor (3.0.12)_

---

**User**

Complete and release phase 52. You have my approval to push new builds.

---

**Cursor**


Completing and releasing phase 52: gathering workspace-kit state, roadmap context, and release procedures.




Listing phase-52 execution tasks and checking ROADMAP for phase 52 scope.




Implementing Phase 52 tasks T624–T629 (all `ready`, unstarted). Exploring the CLI error surface and doctor output, then executing the dependency chains.




Implementing the remediation contract, wiring it through the CLI, adding `--schema-only`, updating docs and tests, then running transitions and release gates.




Applying implementation edits.




Fixing the planning-consistency script: execution-evidence line `Phase 4 / v0.6.0 publish` was misclassified as "in progress".




Applying release metadata and regenerating the roadmap.




Phase 52 is **done and shipped**. Here’s the straight story.

### What shipped (`v0.52.0`, **T624–T629**)
- **Additive `remediation`** on `workspace-kit run` failures (`instructionPath`, `docPath`, optional `docAnchors`); **`policy-denied`** also sets **`remediation.docPath`** (keeps **`remediationDoc`**).
- **`unknown-command`** is now **JSON on stdout** with exit **1** (no more exit **3** + stderr blob) — scripts that assumed the old behavior need to parse stdout.
- **`doctor --agent-instruction-surface`** includes **`errorRemediationCatalog`** (stable `code` → paths). ADR: [`docs/maintainers/ADR-cli-error-remediation-contract.md`](docs/maintainers/ADR-cli-error-remediation-contract.md).
- **Pilot human affordance:** `pnpm run wk run run-transition --schema-only` (and `create-task`, `update-task`, `dashboard-summary`) → **`code: "run-args-schema"`** + schema + **`sampleArgs`**. Contract: [`docs/maintainers/plans/phase-52-human-cli-affordances.md`](docs/maintainers/plans/phase-52-human-cli-affordances.md).
- **Docs / extension:** [`AGENT-CLI-MAP.md`](docs/maintainers/AGENT-CLI-MAP.md) recovery section, [`CLI-VISUAL-GUIDE.md`](docs/maintainers/CLI-VISUAL-GUIDE.md), [`extensions/cursor-workflow-cannon/README.md`](extensions/cursor-workflow-cannon/README.md).
- **Planning guard:** [`scripts/check-planning-doc-consistency.mjs`](scripts/check-planning-doc-consistency.mjs) treats **Phase 4 / `v0.6.0` publish** lines in `ROADMAP.md` as **Completed** (so it stops fighting the archived narrative).
- **Task-engine** **0.14.1** in [`compatibility-matrix.json`](docs/maintainers/data/compatibility-matrix.json).

### Release / phase bookkeeping
- **Tasks** **T624–T629** → **`completed`** via **`run-transition`** (with **`expectedPlanningGeneration`**).
- **Phase snapshot** → **53**; **`.workspace-kit/config.json`** **`kit.currentPhaseNumber`** **53** (aligned with YAML so **`doctor`** stays happy).
- **Git:** `main` @ `9bfbb33` (evidence URLs), tag **`v0.52.0`** on the release commit.
- **GitHub release:** [v0.52.0](https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.52.0)
- **Publish NPM:** [run 23972102809](https://github.com/NJLaPrell/workflow-cannon/actions/runs/23972102809) — **green** (package should be **0.52.0** on **`latest`**).

### Left alone
- Untracked [`docs/maintainers/plans/ai-canonical-docs-mirror-pipeline.md`](docs/maintainers/plans/ai-canonical-docs-mirror-pipeline.md) was **not** part of this release.

If you want a quick sanity check: `npm view @workflow-cannon/workspace-kit version` should read **0.52.0**.

