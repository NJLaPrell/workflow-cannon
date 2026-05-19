# Dashboard phase closeout and release
_Exported on 5/19/2026 at 09:13:47 MST from Cursor (3.3.27)_

---

**User**

## Complete & Release

**Intent:** Dashboard Complete & Release → drain target phase → closeout → publish. Operator authorizes ship; confirm once in chat before `pnpm run publish:npm`. Tier A/B `wk run` still needs JSON `policyApproval` (`.ai/POLICY-APPROVAL.md`).

**Context**
- target phaseKey: 101
- label: Phase 101
- workspace current / next: 101 / 102
- scope: current
- integration branch: `release/phase-101`
- seeded ready ids (preview): none (refresh via list-tasks)

**Attach:** `@.ai/playbooks/phase-closeout-and-release.md` `@.ai/playbooks/task-to-phase-branch.md` `@.ai/MACHINE-PLAYBOOKS.md` `@.ai/AGENT-CLI-MAP.md`
**Rules:** `@.cursor/rules/maintainer-delivery-loop.mdc` `@.cursor/rules/playbook-task-to-phase-branch.mdc` `@.cursor/rules/playbook-phase-closeout.mdc`
**If needed:** `@.ai/playbooks/improvement-triage-top-three.md` `@.ai/playbooks/wishlist-intake-to-execution.md`

### 0 — Inventory (read-only; task store wins)
`pnpm exec wk doctor` · `pnpm exec wk run phase-status '{}'` · `pnpm exec wk run get-next-actions '{}'` · `pnpm exec wk run resolve-maintainer-delivery-policy '{}'`
`pnpm exec wk run phase-closeout-readiness '{"phaseKey":"101"}'`
`pnpm exec wk run list-tasks` — filter by phaseKey for **all non-terminal** statuses and types (not execution-only).

### 1 — Drain phase (closeout §2)
**Gate:** `phase-closeout-readiness` passed OR every remainder explicitly handled (defer/cancel/waiver needs operator confirm).

| status / type | action |
| --- | --- |
| proposed (execution / improvement) | accept → deliver |
| ready | branch from `release/phase-101` → `run-transition` start → implement → PR base=phase branch → merge → complete + delivery evidence |
| in_progress | finish → complete |
| blocked | unblock, cancel, or documented waiver |
| wishlist_intake | `convert-wishlist` or defer to next phase (operator confirm) |

One `T###` per delivery loop unless operator approves batch. Playbook: `task-to-phase-branch`.

### 2 — Closeout & release (closeout §3–§7, `.ai/RELEASING.md`)
1. `phase-delivery-preflight` with `baseRef=origin/release/phase-101`
2. `pnpm run build` · `check` · `test` · `parity` · `pre-merge-gates`
3. CHANGELOG + `package.json` version; sync `schemas/task-engine-run-contracts.schema.json` + `schemas/pilot-run-args.snapshot.json` `packageVersion`
4. `release-evidence-manifest` with validation records
5. `release/phase-101` → `main` PR merge
6. Chat confirm → `pnpm run publish:npm` → `gh run watch`
7. `set-current-phase` rollover · `phase-status` verify
8. Playbook §7 summary — expand all tokens from CLI evidence (no placeholders)

**Handoff if blocked:** remaining `T###` ids · branch names · last CLI JSON · next step (0, 1, or 2).

---

**Cursor**

Starting Phase 101 closeout: reading the playbooks, then running the inventory CLI commands.


Doctor failed on a missing runtime stamp — fixing that, then continuing inventory.


Closeout readiness failed: seven ready tasks remain and `release/phase-101` is missing. Digging into git state and completed work.


Noting duplicate-looking tasks: five completed (T100139…) and seven ready (T100305…). Comparing them and checking what's on `main`.


**Phase 101 closeout — blocked on 7 ready tasks**

> **phase-closeout-readiness FAILED: 7 ready tasks block closeout. There is no release/phase-101 branch yet (main is v0.95.0 / Phase 100). Five wishlist_intake tasks (T100139…) are completed only because they converted to execution children T100335–T100339 (still ready; features not on main). How should we drain Phase 101?**
> - Defer/cancel all 7 ready tasks to Phase 102 (empty-phase closeout; I will confirm each cancel transition with policyApproval)
> - Deliver one task now via task-to-phase-branch (default: T100305), then reassess
> - Deliver all 7 sequentially before closeout (large scope; multiple PRs) ✔
> - Stop — I will handle task queue manually first

Delivering all seven tasks sequentially. Creating `release/phase-101`, then starting the delivery loop with T100305.


Stash hosed the task DB — popping it to restore tasks.


T100305 shipped (PR #379). Starting T100306 — implementing the `report-defect` command.


Implementing `report-defect` on `release/phase-101` (post–T100305 merge).


## Phase 101 closeout — handoff (step **1**, not step **2**)

You picked **deliver all 7**; we’re **2/7 shipped** on `release/phase-101`. Closeout and `pnpm run publish:npm` are still blocked.

### Inventory (CLI evidence)

| Check | Result |
|--------|--------|
| `phase-closeout-readiness` | **`passed: false`** — **6** `ready` (was 7; **T100306** completed) |
| Integration branch | **`release/phase-101`** exists on origin |
| `main` | **v0.95.0** (Phase 100) |
| Delivery profile | **`github-pr`** → PRs base **`release/phase-101`** |

**`wk doctor`:** `runtime-stamp-missing` in this checkout (commands still ran).

### Delivered (merged)

| Task | PR | Merge SHA |
|------|-----|-----------|
| **T100305** — CAE improvement-discovery activation | [#379](https://github.com/NJLaPrell/workflow-cannon/pull/379) | `66d0778` |
| **T100306** — `wk run report-defect` | [#380](https://github.com/NJLaPrell/workflow-cannon/pull/380) | `e72ff0a` |

**Note:** Task store on disk may still show **T100305** as `ready` if your local DB diverged from transition evidence after the merge commit; reconcile with `get-task` / `run-transition complete` if needed.

### Still ready (must drain before closeout)

| ID | Title |
|----|--------|
| T100305 | CAE improvement-discovery (may need re-`complete` if store drifted) |
| T100335 | Package transcript + improvement automation workflow |
| T100336 | Task Intent Wrapper Commands |
| T100337 | Validation Recommendation Engine |
| T100338 | Improvement Dedupe Explainer |
| T100339 | Batch Transition Dry Run |

These are **full features** (wishlist conversions T100139→T100339, etc.) — each needs its own `feature/T###-…` branch → PR → merge → `complete` with delivery evidence.

### Not started (step **2**)

- `phase-delivery-preflight` with `baseRef=origin/release/phase-101`
- Full validation on phase tip, CHANGELOG/version bump, `release-evidence-manifest`
- **`release/phase-101` → `main`** PR
- **Your explicit chat OK** before `pnpm run publish:npm`
- `set-current-phase` rollover (101 → 102)

### Suggested next command (resume drain)

```bash
pnpm exec wk run get-next-actions '{}'
pnpm exec wk run get-task '{"taskId":"T100335"}'
# Then: branch from release/phase-101 → start → implement → PR #381+ …
```

Want me to **continue with T100335** (or re-close **T100305** in the task store first) in this thread? The remaining five are a multi-PR slog, not a single closeout pass.

---

**User**

reclose and continue

---

**Cursor**

Re-closing T100305 if the store drifted, then continuing the phase-101 delivery queue.


Re-closing T100305 (code's already on the branch), then tackling the remaining tasks—starting with T100336 intent wrappers as the foundation.


T100305 re-closed. Implementing T100336 intent wrappers.


## Progress since “reclose and continue”

### Re-closed / completed in task store

| Task | Status | PR |
|------|--------|-----|
| **T100305** | `completed` (re-closed with PR #379 evidence) | [#379](https://github.com/NJLaPrell/workflow-cannon/pull/379) |
| **T100306** | `completed` | [#380](https://github.com/NJLaPrell/workflow-cannon/pull/380) |
| **T100336** | `completed` | [#381](https://github.com/NJLaPrell/workflow-cannon/pull/381) |
| **T100339** | `completed` | [#382](https://github.com/NJLaPrell/workflow-cannon/pull/382) |

`release/phase-101` now includes:
- CAE improvement-discovery activation  
- `report-defect`  
- Lifecycle intent wrappers (`block-task`, `pause-task`, `unblock-task`, `demote-task`, `accept-improvement`, `reject-improvement`)  
- `batch-transition` (dry-run + `apply`)

### Still blocking closeout (3 ready)

| Task | Scope (short) |
|------|----------------|
| **T100335** | Dashboard/chat “improvement automation” product workflow |
| **T100337** | `recommend-validation` engine |
| **T100338** | `improvement-dedupe-explain` |

`phase-closeout-readiness` → **`passed: false`**, **`remainingCount: 3`**.

### Not started yet

- Step **2** closeout: preflight, version/CHANGELOG, `release-evidence-manifest`, `release/phase-101` → `main`, publish gate.

---

**Delivery evidence note:** `update-task` needs `checks[].conclusion` and `validationCommands[].result` (not `exitCode`) — that’s why the first T100336 complete attempt blew up.

Want me to keep going on **T100337** next (validation recommender — smaller than the dashboard workflow), or jump to **T100335**?

---

**User**

Keep going

---

**Cursor**

Continuing with the remaining three tasks — starting with T100337, then T100338, then T100335.


Picking up phase 101 delivery: implementing the three remaining tasks, starting with T100337 (`recommend-validation`).


Wiring the command through manifests, schemas, dispatch, and tests.


T100337 is merged. Starting T100338 (`improvement-dedupe-explain`).


**Phase 101 task drain: done.** All seven ready tasks are merged into `release/phase-101` and marked `completed` in the task store.

### Shipped this session (5/7 were already done; finished the last 3)

| Task | PR | Command / capability |
|------|-----|----------------------|
| **T100337** | [#383](https://github.com/NJLaPrell/workflow-cannon/pull/383) | `recommend-validation` — prioritized checks + delivery-evidence hints from features/paths |
| **T100338** | [#384](https://github.com/NJLaPrell/workflow-cannon/pull/384) | `improvement-dedupe-explain` — similarity clusters, lineage, accept/reject/merge-review |
| **T100335** | [#385](https://github.com/NJLaPrell/workflow-cannon/pull/385) | `improvement-workflow-summary` — transcript pipeline, entry points, churn/proposals, next steps |

Earlier in the phase (from prior work): T100305, T100306, T100336, T100339.

### Closeout gates (CLI evidence)

- **`phase-closeout-readiness`** `phaseKey: 101` → **passed** (`remainingCount: 0`, `terminalCount: 7`)
- **`phase-delivery-preflight`** with `baseRef=origin/release/phase-101` → **passed** (0 evidence violations, stranded work clean)

Phase tip is at merge `d9df86f` on `release/phase-101`.

### Still on you before release (needs explicit go-ahead)

Per playbook / **`.ai/RELEASING.md`**, I did **not** run:

1. Full tip validation (`pre-merge-gates` on `release/phase-101`)
2. Version bump + CHANGELOG + `release-evidence-manifest`
3. PR **`release/phase-101` → `main`**
4. **`pnpm run publish:npm`** (policy: your chat confirmation)
5. **`set-current-phase`** rollover 101 → 102

Say how you want to proceed:

- **A)** Run validation + open the phase PR (no npm publish yet)  
- **B)** Full closeout including publish (confirm version target, e.g. `0.96.0`)  
- **C)** Stop here — tasks are done, you’ll handle release manually

---

**User**

<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: success
task_id: 435268
title: Regenerate snippets and run recommend-validation tests
output_path: /Users/nicklaprell/.cursor/projects/Users-nicklaprell-Workspace-workflow-cannon/terminals/435268.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed). If there's no follow-ups needed, don't explicitly say that.</user_query>

---

**Cursor**

The background run finished cleanly: agent CLI snippets were regenerated (including `recommend-validation`), and the task-engine tests passed (including the new `recommend-validation` cases). That work is already on `release/phase-101` via PR #383.

Phase 101’s seven tasks are done; closeout readiness and `phase-delivery-preflight` both passed. Next step is release prep (validation on the phase branch, version/CHANGELOG, PR to `main`, then npm publish if you want that).

---

**User**

B. I approve

---

**Cursor**

Full phase 101 closeout with publish — pulling release canon and current repo state, then executing the playbook steps.


**Phase 101 is shipped** — you approved full closeout (option B) and it’s done.

### Release
| Step | Result |
|------|--------|
| **Version** | **v0.96.0** on `main` (`5bd27d3`) |
| **PR** | [#386](https://github.com/NJLaPrell/workflow-cannon/pull/386) `release/phase-101` → `main` (CI green) |
| **npm** | [@workflow-cannon/workspace-kit@0.96.0](https://www.npmjs.com/package/@workflow-cannon/workspace-kit) via [publish workflow](https://github.com/NJLaPrell/workflow-cannon/actions/runs/26105091432) |
| **Phase rollover** | `set-current-phase` → **current 102**, **next 103** (workspace revision 48) |

### Validation (tip of `release/phase-101` before merge)
- `pre-merge-gates`, `phase-closeout-readiness`, `phase-delivery-preflight` — all passed  
- `release-evidence-manifest` recorded for phase 101 with your publish approval

---

Phase 101 has been delivered!  
**7** tasks complete  
**none** follow-on tasks  

**Features delivered:**
- `report-defect`, task intent wrappers (`accept-improvement`, `reject-improvement`, `block-task`, etc.), and `batch-transition` (dry-run + apply)
- `recommend-validation`, `improvement-dedupe-explain`, and `improvement-workflow-summary` for the improvement loop
- CAE activation for improvement-discovery review (`cae.activation.review.run-transition-improvement-discovery`)

**Notes:**
- Local task DB was stashed before switching to `main` (`git stash list` if you need it back on a branch).

---

**User**

<system_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: success
task_id: 306861
title: Check publish-npm workflow run status
output_path: /Users/nicklaprell/.cursor/projects/Users-nicklaprell-Workspace-workflow-cannon/terminals/306861.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed). If there's no follow-ups needed, don't explicitly say that.</user_query>

---

**Cursor**

The publish-npm check finished: workflow run [26105091432](https://github.com/NJLaPrell/workflow-cannon/actions/runs/26105091432) completed successfully and **@workflow-cannon/workspace-kit@0.96.0** is on npm. That was already part of the Phase 101 closeout — nothing else to do on publish from here.

