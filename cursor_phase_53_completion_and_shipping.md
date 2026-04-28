# Phase 53 completion and shipping
_Exported on 4/3/2026 at 22:59:57 MST from Cursor (3.0.12)_

---

**User**

complete and ship phase 53

---

**Cursor**


Gathering phase 53 scope, task-engine state, and workspace-kit guidance so we can close and ship it correctly.




Checking whether relational feature registry code exists on main while tasks remain un-transitioned.




Here’s the honest state of the world.

## Phase 53 is not implemented or shippable yet

**Task engine:** `T630`–`T639` are all **`ready`**. None are **`in_progress`** or **`completed`**. `get-next-actions` is surfacing improvement tasks first because the ready queue is huge; your phase-53 execution chain has not been started in the store.

**Code:** There is no relational feature registry in the tree yet—no `task_engine_components` / `task_engine_task_features` usage in TypeScript/SQL, no **`ADR`** for Path A, no **`list-components`** / **`list-features`**. Only **`ROADMAP.md`** / **`roadmap-phase-sections.md`** describe the plan.

**Git:** You’re on **`main`**, clean, latest work is Phase **52** / **`v0.52.0`** (`45d9662` area). There is no **`release/phase-53`** integration branch with this feature set merged.

So **“complete and ship phase 53”** right now means: **deliver the whole scoped chain** (ADR → schema/migration/seed → persistence → task CRUD + junction → backfill + doctor → `list-tasks` filters → doc gen from DB → contracts + CLI map → extension → closeout/versioning/changelog/matrix/tests), **then** maintainer **phase closeout** (merge to `main` if using a phase branch, tag **`v0.53.0`**, GitHub release, publish per **`RELEASING.md`**).

Per repo policy, **cutting a real release** also needs **your explicit go-ahead** (release actions are approval-gated).

---

**What I can do next (you pick):**

1. **Start execution for real** — e.g. **`run-transition`** **`start`** on **`T630`**, land the ADR, then **`complete`** and walk **`T631`→…` in dependency order** (large, multi-PR/multi-commit effort).
2. **Re-scope** — if you only wanted doc/process updates or a subset, say what “done” means for you.

Reply with **(1)** to begin with **`T630`** (ADR), or **(2)** with the narrower outcome you actually want.

---

**User**

Complete phase 53 tasks, build and release phase 53 (I approve)

---

**Cursor**


Implementing Phase 53 (T630–T639): exploring the codebase and executing tasks in dependency order.




Implementing core pieces: adding the ADR and schema migration, then wiring persistence and commands.




Creating core migration and registry modules, then wiring the dual store and commands.




Implementing backfill/export runtimes and wiring task-engine-internal.




Using JSON-only taxonomy for CI drift checks; optional DB for local `generate-document` when env isn't set.




Building, regenerating maintainer docs with JSON-only taxonomy (matches CI drift check), then running the full check suite.




Phase 53 is **done** and **shipped**. Here is what landed.

### CI / doc drift (the thing that was still borked)
Committed **`ROADMAP.md`** / **`FEATURE-TAXONOMY.md`** must match the check script (JSON taxonomy only). Local **`generate-document`** was preferring the planning DB when present, so outputs diverged.

**Fix:** `WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY` gates DB reads in `generate-document` only — leave it unset for DB-backed local regen; set it when refreshing committed maintainer markdown:

```194:201:src/modules/documentation/runtime.ts
    const docTaxonomyJsonOnly =
      process.env.WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY === "1" ||
      process.env.WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY === "true";
    const planningDbAbs = resolve(ctx.workspacePath, ".workspace-kit/tasks/workspace-kit.db");
    const roadmapRenderOpts: RoadmapRenderOptions | undefined =
      !docTaxonomyJsonOnly && existsSync(planningDbAbs)
        ? { planningDatabaseAbsolutePath: planningDbAbs }
        : undefined;
```

Regen used:  
`WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY=1 pnpm exec wk run generate-document '…'`.

### Tasks + phase
- **`T630`–`T639`**: **`start`** + **`complete`** with **`expectedPlanningGeneration`** (policy **`require`**).
- Phase snapshot: **`current_kit_phase` / `next_kit_phase` → 54**; **`.workspace-kit/config.json`** **`kit.currentPhaseNumber` → 54**.

### Release
- **`pnpm run check`**, **`test`**, **`parity`**, **`pre-merge-gates`** all green.
- Commits on **`main`**, tag **`v0.53.0`**, [GitHub release](https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.53.0).
- **Publish NPM** workflow [23972690025](https://github.com/NJLaPrell/workflow-cannon/actions/runs/23972690025) completed successfully (**`latest`**).

### Docs / maintainer hygiene
- **`docs/maintainers/CHANGELOG.md`** **[0.53.0]**; root **`CHANGELOG.md`** pointer updated.
- **`ROADMAP-archive.md`** Phase 53 bullet; **`workspace-kit-status.yaml`** updated with release + npm run links.

**Operator note:** After opening a DB that has registry data, run **`workspace-kit run backfill-task-feature-links`** with the usual **`policyApproval`** if you still have tasks that only had **`features_json`** — that’s the one-shot linker, not automatic on every clone.

---

**User**

Do it

---

**Cursor**


Running `backfill-task-feature-links` with policy approval (per the prior operator note).




Dry run: 0 tasks with legacy `features_json` — junction is already authoritative. Running the live command once (idempotent) to finish the operator step.




**Done.** Ran **`backfill-task-feature-links`** with **`policyApproval`** (Tier B still wants that in the third JSON blob — even **`dryRun`**).

**Outcome:** **0** tasks still carrying legacy **`features_json`** worth migrating — **0** junction inserts, **0** clears, **no unknown slugs**. Your store was already on the junction path, so this was basically a glorified no-op with JSON receipts.

If you ever see non-zero on **`dryRun`**, run the same command without **`dryRun`** (same **`policyApproval`**) to apply.

