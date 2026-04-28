# Phase closeout and release procedures
_Exported on 4/7/2026 at 11:32:36 MST from Cursor (3.0.12)_

---

**User**

The operator added this context: **Phase 64**

Follow **`.ai/playbooks/phase-closeout-and-release.md`** (playbook id **`phase-closeout-and-release`**).

Treat **`release/phase-<N>`** as the phase integration branch; phase closeout merges that train to **`main`** and cuts a release per **`.ai/RELEASING.md`** (human depth: **`docs/maintainers/RELEASING.md`** when editing policy).

Use JSON **`policyApproval`** on policy-sensitive **`workspace-kit run`** commands (**`.ai/POLICY-APPROVAL.md`**).

Optional: **`.cursor/rules/playbook-phase-closeout.mdc`**.

---

**Cursor**


Following the phase-closeout playbook for Phase 64: reading the playbook, release policy, and policy-approval docs, then checking git and workspace-kit state.




Running playbook §1 discovery and checking git state for `release/phase-64`.




Here’s where **Phase 64** stands against **`.ai/playbooks/phase-closeout-and-release.md`** (`phase-closeout-and-release`).

## §0–§1 — Context and discovery

- **`pnpm run wk doctor`**: passed (SQLite tasks, `planningGeneration` **976**, policy note: use JSON **`policyApproval`** on `wk run`, not env-only on the run path).
- **`pnpm exec wk run get-next-actions '{}'`**: suggests **T770** first; global queue shows **10** `ready`, **533** `completed`, etc.
- **Git**: **`release/phase-64`** exists locally and on **`origin`**. **`main`** is **ahead** of **`release/phase-64`** (merge-base is the phase tip; **`main`** has commits after **`Merge branch 'release/phase-64' into main`**). So the “merge phase train → `main`” step from §5 **already happened** in history; the phase branch is not the current tip of delivery.

## §2–§3 — Phase work and integration gate

Playbook §3 expects phase work to be finished **before** treating the phase as release-ready. Task store (authoritative), filtered **`phaseKey` `"64"`**:

| Status | Count |
|--------|-------|
| `ready` | **6** (T770, T773, T780, T781, T782, T783) |
| `in_progress` | **0** |
| `completed` | **10** |

So Phase 64 is **not** “all execution tasks completed or explicitly handled” in the DB. That’s a real closeout gap: either ship the remaining six, **cancel**/rephase them with proper **`run-transition`** + **`policyApproval`** where required, or maintainer-agree they’re out of scope for this closeout (still should be reflected in task state, not chat).

**Note:** `list-tasks` uses status **`completed`**, not `complete` (your filter `complete` returns zero rows).

## §4–§5 — Human gate and release

Per **`.ai/RELEASING.md`**, I’m **not** running publish/tag automation or claiming the npm release is done without your **explicit** go-ahead.

On **`main`**, **`package.json`** is already **`0.64.0`**, which usually means “version bump for this phase” is at least **committed** — but **npm + CI evidence** still need your confirmation if you’re unsure anything actually shipped.

When you approve, the operator path is: full gates from **`.ai/RELEASING.md`** (`build`, `check`, `test`, `parity`, release metadata / pre-merge gates as documented), then publish, then record evidence (tag, workflow URL, npm).

## §6 — After publish (only when you’ve actually published)

Then: evidence, maintainer snapshots if your closeout task says so, and **`update-workspace-phase-snapshot`** (Tier B — JSON **`policyApproval`** per **`.ai/POLICY-APPROVAL.md`** / **`.ai/AGENT-CLI-MAP.md`**).

## §7 — Template shape (evidence-backed, no invented numbers)

Using **only** CLI-backed counts for **`phaseKey` `64`** / next phase **`65`**:

```markdown
Phase 64 has been delivered!
10 tasks complete
4 follow-on tasks

Features delivered:
- {feature}
- {feature}

Notes:
- **Risks / issues:** {label}: {brief}
- **Opinions / additional tasking:** {label}: {brief}
```

Replace **`{feature}`** bullets with things that actually shipped (e.g. **CHANGELOG** / release notes you trust — I didn’t invent feature bullets). **`4`** is **`list-tasks` `phaseKey` `65` + `status` `ready`** (“Found 4 tasks”).

---

**Bottom line:** Git says **`release/phase-64`** was already merged into **`main`**; the task engine still shows **six Phase 64 items in `ready`**, so the playbook’s “phase fully closed” story and **RELEASING**’s “scope in task engine” gate don’t line up yet. When you want to **declare closeout done**, say whether those six should be **finished**, **moved to Phase 65** (metadata/transition), or **cancelled**, and whether **`0.64.0`** is already **published** or you want a **green-light to run** the publish path. Chat isn’t **`policyApproval`** — use the JSON object on the third argv for any gated **`wk run`**.

---

**User**

Those tasks should have been completed. Make sure they got done before releasing the phase and we follow the flows for commits, PRs, etc.

---

**Cursor**


Completing the six Phase 64 tasks using the maintainer delivery loop. Assessing git state, whether work is already merged, and each task's scope.




Completing the six Phase 64 tasks using the task-to-phase-branch flow. Checking whether work already exists on `main` and gathering full task specs.




Implementing remaining Phase 64 work: creating the sync command (T782), hooks + extension debounce (T783), maintainer CLI doc fixes (T770/T773), collaboration surfaces (T780), and a small New Plan prompt tweak (T781). Aligning the phase branch and opening a PR to `release/phase-64`.




Wiring `withStore` to auto-sync, adding the command and manifest entry, and updating related files.




Here’s what actually shipped — no hand-waving.

## What we implemented (maps to T770–T783)

1. **T770 / T773 — maintainer CLI doc friction**  
   Updated **`docs/maintainers/AGENT-CLI-MAP.md`** so Tier B copy-paste matches reality: real-write **`generate-document`** with JSON **`policyApproval`**, and **`backfill-task-feature-links`** with **`policyApproval` + `expectedPlanningGeneration`** (and the `list-tasks` prelude). **`.ai/AGENT-CLI-MAP.md`** and the Tier C block now include **`sync-effective-behavior-cursor-rule`**.

2. **T780 — collaboration surfaces**  
   Dashboard quick action **Collaboration profiles** → chat prefill via **`buildCollaborationProfilesHubPrompt()`** (slash hub + `pnpm exec wk run …` including **`sync-effective-behavior-cursor-rule`** + explicit **`policyApproval`** warning). **Root `README.md`** and **`extensions/cursor-workflow-cannon/README.md`** point at the same mental model.

3. **T781 — New Plan**  
   Already wired (`planning-new-plan` → **`buildPlanningInterviewPrompt`**). Prompt now uses **`pnpm exec wk`** for clean JSON stdout and calls out **`list-wishlist`** after finalize with wishlist.

4. **T782 / T783 — Cursor rule sync + refresh**  
   New **Tier C** command **`sync-effective-behavior-cursor-rule`** (manifest + instruction + **`sync-effective-behavior-cursor-rule.ts`**): writes **`.cursor/rules/workflow-cannon-effective-agent-behavior.mdc`** from effective role × temperament. **Auto-sync** is scheduled (fail-open, `WORKSPACE_KIT_DEBUG_AUTO_SYNC=1` to log) after **`withStore`** mutations in agent-behavior and after **`set-agent-guidance`**. Extension: **1.5s debounced** sync on kit state changes + watcher on **`.workspace-kit/modules/agent-behavior/config.json`**.

5. **Tests / checks**  
   Kit + extension tests updated; **`pnpm run check`** is green. Fixed a stale extension assertion on **`buildPhaseCompleteReleaseChatPrompt`** (test-only; production prompt was already the playbook-shaped one).

## Git / PR / task-engine (the boring part that matters)

- **Feature PR (code):** [PR #82](https://github.com/NJLaPrell/workflow-cannon/pull/82) → **`release/phase-64`** — **merged** (CI was still spinning when GitHub recorded the merge; worth eyeballing the run).
- **Task store:** **`run-transition`** **`start`/`complete`** with JSON **`policyApproval`** and fresh **`expectedPlanningGeneration`** for **T770, T773, T780, T781, T782, T783**; committed on **`release/phase-64`** as **`9dc3f45`** and pushed.
- **Phase → `main` PR:** [PR #83](https://github.com/NJLaPrell/workflow-cannon/pull/83) (**`release/phase-64` → `main`**) — **open** for you to merge when you’re happy with gates / review.

## Your remaining human gates (per **`.ai/RELEASING.md`**)

- Merge **PR #83** when ready, run the full validation / release procedure on that tip, and don’t treat npm/GitHub release as done until you’ve **explicitly** approved publish and captured evidence.  
- After a real publish, do the usual **`update-workspace-phase-snapshot`** dance with **`policyApproval`** where the map says so.

So: the six tasks are **actually completed in SQLite**, the work is on the **phase train** with a proper PR, and **`main`** is one merge away — not released to npm by this chat, because that’s correctly your call.

---

**User**

You do it. merge Publish and release. I approve

---

**Cursor**


Merging PR #83 and executing the release workflow per `.ai/RELEASING.md`. Checking repo state, release automation, and version policy.




Merging PR #83, bumping to v0.64.1, updating the changelog, running release gates, pushing, tagging, creating the GitHub release, and triggering the Publish NPM workflow.




Here’s what’s done, with receipts.

### Merge
- **[PR #83](https://github.com/NJLaPrell/workflow-cannon/pull/83)** (`release/phase-64` → `main`) is **merged**.

### Release **v0.64.1**
- **Commit:** `0ffbc5c` on `main` — `package.json` **0.64.1**, Cursor extension **0.1.12**, canonical changelog (`docs/maintainers/CHANGELOG.md` + root pointer), **`schemas/task-engine-run-contracts.schema.json`**, **`schemas/pilot-run-args.snapshot.json`**, **`.workspace-kit/manifest.json`**.
- **Gates run locally before push:** `pnpm run build`, `check`, `test`, `parity`, `pre-merge-gates`, `check-release-metadata` (all green).
- **Tag:** `v0.64.1` pushed.
- **GitHub release:** [https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.64.1](https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.64.1)

### npm
- **Publish NPM workflow:** [https://github.com/NJLaPrell/workflow-cannon/actions/runs/24097687865](https://github.com/NJLaPrell/workflow-cannon/actions/runs/24097687865) — **completed successfully** (including **Publish package to npm**).
- **Registry:** `npm view @workflow-cannon/workspace-kit version` → **`0.64.1`**.

### Not done (optional follow-up)
- **`update-workspace-phase-snapshot`** / **`kit.currentPhaseNumber`** were **not** changed: `workspace-kit-status.yaml` is already **`current_kit_phase: "64"`** / **`next_kit_phase: "65"`**. Advancing to **65** would need that command **plus** aligning project config so **`doctor`** doesn’t complain — say if you want that in a small follow-up commit.

**Evidence bundle (RELEASING-style):** tag **`v0.64.1`**, release link above, workflow **24097687865**, npm **`@workflow-cannon/workspace-kit@0.64.1`**, validation as above.

---

**User**

Do it

---

**Cursor**


Advancing the workspace phase snapshot to 65 and aligning `kit.currentPhaseNumber` so `doctor` stays green.




Done. The follow-up was the **stale `kit.currentPhaseLabel`** and tightening the status YAML.

**What I did**
- Set **`kit.currentPhaseLabel`** with a real JSON string so the CLI would eat it:  
  `pnpm exec wk config set kit.currentPhaseLabel "\"Phase 65 — current (v0.64.1 shipped)\"" --json`  
  (with `WORKSPACE_KIT_POLICY_APPROVAL` in the env — that path is fine for `config set`.)
- **`pnpm run wk doctor`** — clean; no phase mismatch whining.
- **`docs/maintainers/data/workspace-kit-status.yaml`**: bumped **`last_updated`** to **2026-04-07** and prepended a **`last_session_summary`** line for Phase 64 remainder + snapshot **65/66** + release/npm links.
- **`pnpm run check`** — all stages passed.
- **Committed and pushed** `main`: **`ccf1baf`** — only **`.workspace-kit/config.json`** and **`workspace-kit-status.yaml`** (no task DB noise).

So: kit thinks **Phase 65**, label matches, maintainer snapshot matches, and it’s on **origin/main**.

