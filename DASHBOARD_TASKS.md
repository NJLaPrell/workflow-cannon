# Dashboard — Queue phase header UX

**Artifact:** `DASHBOARD_TASKS.md` (repo root). **Scope:** Sidebar **Dashboard → Queue** task rollups only (`dash-card dashboard-tasks-block` in `render-dashboard.ts`). Overview / Status / Config / CAE webviews are out of scope unless a shared CSS token forces a trivial touch.

This document is the **implementation plan** for enriching **phase bucket** `<summary>` headers so operators see **role tags**, **phase identity**, **task counts as badges**, and an optional **short description** tail (including **kit-derived** futures text). It consolidates design decisions, file-level work, contracts, tests, acceptance criteria, and a work breakdown structure (§12).

**Canonical webview rules:** `.github/instructions/cursor-workflow-cannon-ui.instructions.md` (cite as `R#` in commits/PRs). **CAE pointer:** `.ai/cae/ui/webview-styleguide.md`.

## Contents

| § | Topic |
| --- | --- |
| [1](#1-problem-statement) | Problem statement |
| [2](#2-product-rules-locked) | Product rules (locked) |
| [3](#3-architecture-overview) | Architecture overview |
| [4](#4-data-model--contract-updates) | Data model / contract updates |
| [5](#5-documentation-updates-machine-oriented) | Documentation updates |
| [6](#6-testing-plan-exhaustive) | Testing plan |
| [7](#7-styleguide--security-checklist-must-not-regress) | Styleguide / security checklist |
| [8](#8-files-to-touch-checklist) | Files to touch |
| [9](#9-delivery-order-recommended) | Delivery order |
| [10](#10-acceptance-criteria-final-gate) | Acceptance criteria |
| [11](#11-references-read-order-for-implementers) | References |
| [12](#12-work-breakdown-structure-wbs) | Work breakdown structure (WBS) |

---

## 1. Problem statement

Today, each queue `phaseBucket` exposes a single string **`label`** produced by `phaseBucketLabel()` in `src/modules/task-engine/dashboard/dashboard-phase-buckets.ts` (for example `Phase 100 (future) (2)`). The extension prints that string inside each phase bucket’s `<summary>` in `extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts` (some stacks use `phase-bucket-summary` wrappers; **blocked**, **transcript churn**, and **terminal** stacks use a plainer `<summary>` + escaped `label` today).

**Gap:** Operators want a structured, scannable line:

- A **role tag** (e.g. `[Future]`, `[Current]`, `[Next]`, `[Not phased]`).
- **Phase title** (e.g. `Phase 100`); for unphased work, a clear neutral title consistent with today’s semantics.
- A **numeric count badge** (e.g. `(2)` rendered as a badge, not only parentheses in prose).
- An optional **tail** after ` - ` built from the **phase catalog** `shortDescription` (same field the dashboard phase roster edits under “deliverables”), including **derived** one-liners the kit already computes for future phases when the catalog row is empty.

When no description applies (null, empty after trim, and no derived fill), **omit the tail entirely** (no dangling ` - ` separator after the badge block).

---

## 2. Product rules (locked)

| Rule | Decision |
| --- | --- |
| **Derived descriptions** | **Show them.** If `enrichFuturePhaseCatalogWithTaskSummaries` (or equivalent catalog pipeline) populated `shortDescription`, treat it as “set” for the header tail — same as an explicit catalog line. |
| **Role tags** | **`[Current]`**, **`[Next]`**, **`[Future]`** when the bucket matches those roles (same numeric / key rules as today’s `phaseBucketLabel`). **Ordinary** phased buckets (not current, not next, not future under the existing definition) get **no** role tag. |
| **Not phased** | **`[Not phased]`** tag in the **new** structured header (pick one spelling and use it consistently; legacy string `label` may still say “Not Phased” until a follow-up). Same badge + optional tail pattern; tail will usually be empty. |
| **Accessibility** | Color is not the sole signal (**R13.1**). Tags must remain **text-readable**; badges expose count as text inside the badge element. |
| **Backward compatibility** | Older `dashboard-summary` payloads without new fields must still render via existing **`label`** (extension fallback in **§3.3**). |

---

## 3. Architecture overview

### 3.1 Single source of truth for “phase slot”

**Refactor** `dashboard-phase-buckets.ts` so **classification** is explicit and reusable:

1. **Export** a function, e.g. `classifyPhaseBucketSlot(phaseKey: string | null, current: string | null, next: string | null): PhaseBucketSlot`  
   where `PhaseBucketSlot` is a string union:

   - `"current"` — `phaseKey === current` (and `phaseKey` is non-null).
   - `"next"` — `phaseKey === next`, `phaseKey !== current`.
   - `"future"` — numeric `phaseKey` strictly greater than numeric `current`, `phaseKey !== next`, and `current` is set (same conditions as today’s `(future)` branch in `phaseBucketLabel`).
   - `"none"` — phased bucket that does not match the above (non-null `phaseKey`).
   - `"unphased"` — `phaseKey === null` (the “Not Phased” bucket).

2. **Implement** `phaseBucketLabel()` **in terms of** `classifyPhaseBucketSlot` + `count` so behavior stays **bit-for-bit aligned** with today unless you intentionally change copy (initial delivery: **preserve** the existing `label` string format for compatibility).

**Parsing note:** Reuse the same **`parseWorkspacePhaseKey`** / numeric comparison approach already in `dashboard-phase-buckets.ts`; do not introduce a second parsing strategy in the extension.

### 3.2 Enrich `phaseBuckets` after `systemStatus` is built

**Order constraint:** `runDashboardSummaryCommand` in `src/modules/task-engine/commands/task-engine-dashboard-on-command.ts` builds all `phaseBuckets` **before** `await buildDashboardSystemStatus(...)`. **Do not** reorder that sequence unless profiling proves necessary.

**Instead:** After `systemStatus` is assigned (see `buildDashboardSystemStatus` call in `task-engine-dashboard-on-command.ts`; line numbers drift—grep the call site), run a **pure enrichment pass** over every `phaseBuckets` array on the outgoing `data` object:

- Attach **`phaseSlot`**: `PhaseBucketSlot`.
- Attach **`phaseShortDescription`**: `string | null` — trimmed; `null` or `""` means no tail.

**Lookup table for descriptions:**

- When `systemStatus.phase.ok === true` and `systemStatus.phase.phaseCatalog?.phases` is present, build **`Map<phaseKey, shortDescription>`** from that array (use the same `phaseKey` string form as buckets, typically digit keys from `inferTaskPhaseKey` paths).
- For **`phaseKey === null`** (unphased), leave **`phaseShortDescription`** null (no catalog row).

**Fallback when phase system slice is unhealthy or catalog missing:**

- Still set **`phaseSlot`** using **`classifyPhaseBucketSlot`** with **`current` / `next`** parsed from **`data.workspaceStatus`** — this is the same **`WorkspaceStatusSnapshot | null`** returned by **`readWorkspaceStatusSnapshotFromDual`** and already passed into **`buildDashboardPhaseBucketsForTasks`** / **`buildDashboardPhaseBucketsForBlocking`**. Use **`currentKitPhase`** / **`nextKitPhase`** with the **same digit-prefix parsing** as `parseWorkspacePhaseKey` in `dashboard-phase-buckets.ts`. When **`data.workspaceStatus`** is **`null`** (SQLite workspace-status row unavailable), classify with **`current` / `next` both null**, matching bucket build behavior.
- Set **`phaseShortDescription`** to null (no second DB read required for v1).

**Arrays to enrich (exhaustive list — verify against `task-engine-dashboard-on-command.ts` when implementing):**

- `transcriptChurnResearchSummary.phaseBuckets`
- `proposedImprovementsSummary.phaseBuckets`
- `proposedExecutionSummary.phaseBuckets`
- `readyImprovementsSummary.phaseBuckets`
- `readyExecutionSummary.phaseBuckets`
- `blockedSummary.phaseBuckets`
- `completedSummary.phaseBuckets`
- `cancelledSummary.phaseBuckets`

**Implementation sketch:**

- New module **or** local function, e.g. `enrichDashboardPhaseBucketsInPlace(data, data.workspaceStatus)` — second argument must be the **same** snapshot already embedded on the payload (`readWorkspaceStatusSnapshotFromDual` result), not a re-read.
- Prefer **in-place mutation** of bucket objects already allocated, or **map** to new objects if immutability is cleaner for typing — either is fine; keep GC reasonable (enrichment runs once per summary).

### 3.3 Extension rendering

**Add** one helper in `render-dashboard.ts`, e.g. `renderPhaseBucketSummaryInnerHtml(bucket: unknown): string`, used by **all six** queue phase-stack renderer **functions** listed in **§8** (completed and cancelled share `renderTerminalTaskPhaseBuckets`).

- **Structured path:** when the bucket object **has own property** `phaseSlot` (use a safe check such as `Object.prototype.hasOwnProperty.call(bucket, "phaseSlot")` after narrowing—plain JSON may omit vs include the key), render from `phaseSlot`, `phaseShortDescription`, `phaseKey`, and `count`.
- **Legacy fallback:** when `phaseSlot` was **never sent** by the kit, render **only** `escapeHtml(String(bucket.label ?? ""))` inside the summary wrapper. **Do not** treat **`phaseSlot === "unphased"`** as legacy; that is a valid enriched value.
- Keep sibling controls (**Complete & Release**, **Accept All**) **outside** the inner summary label flex where they already live today so Tab order does not regress.

**Visual structure (logical, not prescriptive class names):**

1. Optional **role tag** — only for `current` | `next` | `future` | `unphased`; **omit** for `none`. Use **`.wc-tag`** (+ optional `--{intent}` if you want visual distinction; neutral intent is acceptable for all roles to minimize color-only signaling — **R13.1**).
2. **Phase title** — e.g. `Phase 100` or **Not phased** line per existing product vocabulary.
3. **Count badge** — use **`.wc-tab-badge`** (**R10.7**) showing the integer **`count`** (not parentheses-only typography).
4. **Optional tail** — if `phaseShortDescription` is non-empty after trim: ` - ` + escaped description.

**Transcript churn, blocked, and terminal (completed / cancelled):** `renderTranscriptChurnResearchPhaseBuckets`, `renderBlockedPhaseBuckets`, and `renderTerminalTaskPhaseBuckets` use bare `<summary>` or thinner wrappers than ready/proposed — **unify** them to the same `phase-bucket-summary` / `phase-bucket-summary-label` + helper pattern for visual and accessibility consistency.

**Do not break:**

- **`resolvePhasePhraseForCompleteRelease`** — it derives chat template text from **`phaseKey`** / `top[0].phase`, **not** from the visible summary HTML. Keep that function’s inputs/outputs stable unless you intentionally extend it (not required for this project).

---

## 4. Data model / contract updates

### 4.1 Bucket object shape (additive)

Each object in `phaseBuckets` arrays gains **optional** fields (for forward compatibility, treat as optional everywhere):

| Field | Type | Meaning |
| --- | --- | --- |
| `phaseSlot` | `"current" \| "next" \| "future" \| "none" \| "unphased"` | Role classification for header UI. |
| `phaseShortDescription` | `string \| null` | Single-line description (catalog or derived). |

**Convention:** Consumers detect “enriched bucket” by **presence of `phaseSlot`**, not by `schemaVersion` on the bucket (bucket `schemaVersion` stays **1** today).

**Preserve** existing fields: `schemaVersion`, `phaseKey`, `label`, `count`, `top`, `taskIds?`.

### 4.2 `dashboard-summary` schema version

**Do not bump** `DashboardSummaryData.schemaVersion` (currently **7**) **if** the extension gracefully handles missing `phaseSlot` / `phaseShortDescription`. Additive bucket keys are backward compatible.

If a future change **requires** consumers to distinguish “enrichment always present” versions, a bump can happen later — **out of scope** unless you discover a hard requirement.

### 4.3 TypeScript types

- **`src/modules/task-engine/dashboard/dashboard-phase-buckets.ts`:** extend exported `DashboardPhaseBucket<T>` with optional `phaseSlot` and `phaseShortDescription` (values are attached in the **dashboard-summary enrichment pass**, not inside `emitBucketsFromMap` / `buildDashboardPhaseBucketsForTasks` row construction).
- **`src/contracts/dashboard-summary-run.ts`:** today `DashboardPhaseBucket` is `Record<string, unknown>` — either document the new keys in **`src/modules/task-engine/instructions/dashboard-summary.md`** only, or tighten to an interface with optional fields + index signature for forward compatibility. Prefer **document + optional interface** if CI/typecheck benefits.

---

## 5. Documentation updates (machine-oriented)

| File | Update |
| --- | --- |
| `src/modules/task-engine/instructions/dashboard-summary.md` | Document `phaseSlot` and `phaseShortDescription` on each `phaseBuckets[]` element; note enrichment happens server-side; clarify interaction with `label` (legacy / compat). |
| `.github/instructions/cursor-workflow-cannon-ui.instructions.md` | **Only if** new component combinations or class names are introduced that are not already covered — otherwise **no change** (prefer existing `wc-tag`, `wc-tab-badge` rules). |

**Do not** duplicate the full rulebook in `.ai/cae/ui/webview-styleguide.md` — that file is a pointer only.

---

## 6. Testing plan (exhaustive)

### 6.1 Kit / workspace-kit unit tests

**File:** extend `test/dashboard-phase-buckets.test.mjs` (or add colocated test if pattern differs).

**Cases:**

- `classifyPhaseBucketSlot` matrix: unphased (`null` key); current; next; future (numeric edge: key > current, not next); none (past / other key); boundary when `current` or `next` unset.
- **Equivalence:** `phaseBucketLabel` output unchanged for representative fixtures vs pre-refactor behavior (golden strings).
- **Enrichment:** given a mock `DashboardSummaryData`-shaped object with `phaseCatalog.phases` containing mixed `shortDescription` (string, null, derived non-null), assert each bucket receives correct `phaseShortDescription` by `phaseKey`.
- **Enrichment without catalog:** `phaseSlot` still set from `workspaceStatus`; `phaseShortDescription` undefined or null.

### 6.2 Extension tests

**File:** `extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs`.

**Cases:**

- With **`phaseSlot` + `phaseShortDescription` + count**: expect tag markup, badge markup, escaped tail (include HTML metacharacters in description to assert escaping).
- **Future + derived**: description present though `inCatalog` might be false in catalog row — header still shows tail (per product rule).
- **No tail:** `phaseShortDescription` null / missing / whitespace-only — assert the **tail separator** is absent (e.g. no badge-adjacent ` - ` **introduced by the renderer**); do not use a naive “no ` - ` anywhere” assert if descriptions could legitimately contain that substring in the future.
- **Legacy payload:** bucket **without** `phaseSlot` (key absent on parsed JSON) — rendered HTML still contains escaped legacy `label` substring (fallback path).
- **Transcript churn, blocked, terminal:** assert `<summary>` uses the same **`phase-bucket-summary` / `phase-bucket-summary-label`** shell and the shared helper as ready/proposed when structured fields are present; terminal keeps **`terminal-phase-bucket`** on `<details>` if required for styling.

### 6.3 Fixture / CAE CLI contract (if applicable)

- **`fixtures/cae/cli-requests/valid/dashboard-summary.json`** (and any **`.ai/agent-cli-snippets/by-command/dashboard-summary.json`** that embeds representative shapes): extend with **`phaseSlot`** / **`phaseShortDescription`** on at least one bucket so snapshot/contract checks catch drift — **if** those fixtures assert full payload shape; if they are minimal, add only the minimum fields CI expects.

### 6.4 Manual smoke (operator)

- Run Extension Host, open **Workflow Cannon → Dashboard → Queue** tab.
- Verify **Current / Next / Future / none / Not phased** rows across **Ready**, **Proposed**, **Blocked**, **Completed** / **Cancelled** if visible in your workspace.
- Collapse/expand: **`data-wc-track`** / `#root` swap behavior unchanged (**R12**).
- **Refresh:** partial `#root` updates still preserve `<details>` state (**R12.1–R12.2**).

---

## 7. Styleguide / security checklist (must not regress)

- **R1:** New classes **`wc-`*** only; do not extend frozen `dash-` / `cfg-` / `gp-` families with new members.
- **R2:** Colors via `var(--vscode-*)` only; intent tokens per **R2.3** if tagging by intent.
- **R3.6:** All interpolated strings pass **`escapeHtml`** / **`escapeHtmlAttr`** as appropriate.
- **R8.4:** Any new `<button>` in the summary line (unlikely) must be `type="button"` — prefer **not** adding buttons inside the summary; keep **Complete & Release** / **Accept All** as today.
- **R12:** Do not change the dashboard refresh / `#root` swap contract in `DashboardViewProvider.ts` as part of this work unless a regression is found and fixed narrowly.

---

## 8. Files to touch (checklist)

| Area | File | Action |
| --- | --- | --- |
| Slot logic | `src/modules/task-engine/dashboard/dashboard-phase-buckets.ts` | Export `classifyPhaseBucketSlot`; refactor `phaseBucketLabel` to use it; extend `DashboardPhaseBucket` type. |
| Enrichment | `src/modules/task-engine/commands/task-engine-dashboard-on-command.ts` | Import helper + catalog map; after `buildDashboardSystemStatus`, enrich all `phaseBuckets` arrays on `data`. |
| Enrichment (optional split) | `src/modules/task-engine/dashboard/enrich-dashboard-phase-buckets.ts` (new) | If `task-engine-dashboard-on-command.ts` becomes too busy, move pure enrichment here and unit-test in isolation. |
| Contract | `src/contracts/dashboard-summary-run.ts` | Optional type tightening / comments for new bucket keys. |
| Instruction | `src/modules/task-engine/instructions/dashboard-summary.md` | Document new fields. |
| Renderer | `extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts` | Add `renderPhaseBucketSummaryInnerHtml`; wire **all six** `render*PhaseBuckets` functions (`renderReadyPhaseBuckets`, `renderProposedPhaseBuckets`, `renderProposedExecutionPhaseBuckets`, `renderTranscriptChurnResearchPhaseBuckets`, `renderBlockedPhaseBuckets`, `renderTerminalTaskPhaseBuckets` — last one covers both completed and cancelled call sites); CSS scoped to dashboard local styles or existing patterns. |
| Webview CSS | `extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts` | Only if new layout requires styles not covered by existing `wc-*` rules inlined there — prefer reusing **R10** patterns. |
| Kit tests | `test/dashboard-phase-buckets.test.mjs` | Classification + label equivalence + enrichment behavior. |
| Extension tests | `extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs` | New summary shapes + fallback + escaping. |
| Fixtures | `fixtures/cae/cli-requests/valid/dashboard-summary.json` etc. | Update if CI validates shapes (verify locally with `pnpm test` / targeted scripts). |

**Out of scope / explicit non-goals:**

- Repo-wide removal or rewrite of legacy **`label`** strings in the same change (can be a follow-up).
- Extracting shared CSS to `src/views/shared/wc-base-css.ts` (**R14**) — only if you already need large CSS dedup; not required for headers alone.
- Changing **`resolvePhasePhraseForCompleteRelease`** or phase closeout chat templates.
- GitHub Issues / roadmap prose — defects tracked via task engine per repo policy.

---

## 9. Delivery order (recommended)

1. **Refactor + tests** — `classifyPhaseBucketSlot` + `phaseBucketLabel` equivalence tests.
2. **Enrichment + instruction + contract notes** — post-`systemStatus` pass; document payload.
3. **Renderer + CSS** — summary helper; unify **transcript churn, blocked, and terminal** summaries with ready/proposed wrappers; fallback path.
4. **Extension tests** — escaping, legacy fallback, structural parity.
5. **Fixtures / CI** — if applicable.
6. **Manual smoke** in Extension Host.

---

## 10. Acceptance criteria (final gate)

- [ ] Queue tab phase headers show **tag + title + numeric badge + optional ` - description`**, matching product rules in §2.
- [ ] **Derived** futures descriptions appear in the tail when the kit supplies them.
- [ ] **Not phased** rows use the same visual grammar with **`[Not phased]`** (or chosen consistent copy) + badge + optional tail.
- [ ] **Ordinary** phased buckets show **no** role tag, only title + badge + optional tail.
- [ ] **Legacy** `dashboard-summary` JSON where buckets **omit `phaseSlot`** still renders via **`label`** fallback.
- [ ] **`phaseBucketLabel` semantics** preserved unless an intentional breaking change is documented and approved.
- [ ] **No** new `showInputBox` / `showQuickPick` paths in dashboard host for this work (existing **dashboard-prompt-surface** test must keep passing).
- [ ] **Styleguide** rules in §7 satisfied; cite touched rule IDs in PR description.
- [ ] **Tests** in §6 green: root **`pnpm run test`** (runs `build` + all `test/**/*.test.mjs`), then **`pnpm --filter cursor-workflow-cannon test`** (runs extension `compile` + extension tests; run after workspace-kit `build` whenever tests shell out to `dist/cli.js`—see extension `README.md`).

---

## 11. References (read order for implementers)

1. `src/modules/task-engine/dashboard/dashboard-phase-buckets.ts` — current ordering + `phaseBucketLabel`.
2. `src/modules/task-engine/commands/task-engine-dashboard-on-command.ts` — payload assembly order.
3. `src/modules/task-engine/dashboard/build-dashboard-system-status.ts` — `phaseCatalog.phases` population.
4. `src/modules/task-engine/persistence/phase-catalog-store.ts` — `enrichFuturePhaseCatalogWithTaskSummaries` behavior.
5. `extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts` — `render*PhaseBuckets`, `phaseBucketsNonEmpty`, `resolvePhasePhraseForCompleteRelease`.
6. `src/modules/task-engine/persistence/workspace-status-store.ts` — `readWorkspaceStatusSnapshotFromDual` / snapshot shape for enrichment fallback.
7. `.github/instructions/cursor-workflow-cannon-ui.instructions.md` — **R1–R16**.

---

## 12. Work breakdown structure (WBS)

Below is a **100% coverage** work breakdown: every implementation action implied by **§§1–10** maps to a work package (WP) and leaf task (T). **§11** is read-ahead only. Use checkboxes during delivery.

**Dependencies:** **WP-1** before **WP-2**. Kit tests (**WP-5**): classifier cases after **WP-1**; enrichment cases after **WP-2**. **WP-3** can trail **WP-2** slightly but should land before merge if reviewers expect instruction/type parity. **WP-4** before **WP-6**. **WP-4** may prototype against mocked buckets, but **WP-6** should assert the real merged HTML once **WP-4** is stable; fixture updates (**WP-7**) after **WP-2**. **WP-8–9** last.

---

### WP-0 — Preconditions and baseline (read-only)

| ID | Task | Done when |
| --- | --- | --- |
| T-0.1 | Read `dashboard-phase-buckets.ts`, `task-engine-dashboard-on-command.ts`, `render-dashboard.ts` (phase stack sections), `.github/instructions/cursor-workflow-cannon-ui.instructions.md` (R1, R3.6, R10.6–R10.7, R12, R13). | Notes / mental model captured. |
| T-0.2 | Confirm exhaustive `phaseBuckets` array locations in `task-engine-dashboard-on-command.ts` match §3.2 list (no drift). | List verified or plan text updated. |
| T-0.3 | Run existing tests for phase buckets + render-dashboard + dashboard-prompt-surface **before** edits; record green baseline. | Baseline log / CI green. |

---

### WP-1 — `PhaseBucketSlot` type + `classifyPhaseBucketSlot` + `phaseBucketLabel` refactor

| ID | Task | Done when |
| --- | --- | --- |
| T-1.1 | Define exported union type `PhaseBucketSlot` (`"current" \| "next" \| "future" \| "none" \| "unphased"`) in `dashboard-phase-buckets.ts` (or small adjacent types module if circular deps force it). | Type exported; used internally. |
| T-1.2 | Implement `classifyPhaseBucketSlot(phaseKey, current, next)` using **same** parsing as existing `parseWorkspacePhaseKey` / numeric compare rules; document invariants in a short file comment. | All five slots reachable; `null` phaseKey → `unphased`. |
| T-1.3 | Refactor `phaseBucketLabel` to call `classifyPhaseBucketSlot` + `count`; preserve existing string format for each slot (including “Not Phased”, “(current)”, “(next)”, “(future)”, plain `Phase N`). | Golden expectations documented for tests. |
| T-1.4 | Extend `DashboardPhaseBucket<T>` with **optional** `phaseSlot?` and `phaseShortDescription?` (types first; values attached in **WP-2** enrichment, not in `emitBucketsFromMap`). | `pnpm`/tsc clean for task-engine package. |

---

### WP-2 — Enrichment: catalog map + workspace fallback + all bucket arrays

| ID | Task | Done when |
| --- | --- | --- |
| T-2.1 | Implement `buildPhaseShortDescriptionLookup(phaseCatalogPhases): Map<string, string>` (or return both trimmed string and null); trim; skip empty strings. | Pure function; unit-testable. |
| T-2.2 | Implement `parseCurrentNextFromWorkspaceStatus(workspaceStatus): { current: string \| null; next: string \| null }` consistent with `emitBucketsFromMap` inputs (same digit extraction behavior). | Matches bucket builder semantics. |
| T-2.3 | Implement `enrichPhaseBucketArray(buckets, ctx)` where `ctx` includes slot inputs + description map + `phase.ok` flag; for each bucket set `phaseSlot` always; set `phaseShortDescription` only from map when catalog path valid; unphased → description null. | In-place or mapped arrays; no throw on empty arrays. |
| T-2.4 | Wire enrichment in `task-engine-dashboard-on-command.ts` **immediately after** `await buildDashboardSystemStatus(...)` and **before** returning the command result (mutate the `data` object that will be serialized to JSON). | Single call site OR delegated function. |
| T-2.5 | Enrich **all eight** arrays: transcript churn, proposed improvements, proposed execution, ready improvements, ready execution, blocked, completed, cancelled. | Grep confirms eight call sites or one helper iterating keys. |
| T-2.6 | **Fallback path:** when `systemStatus.phase.ok !== true` or `phaseCatalog` absent, `phaseShortDescription` unset/null; `phaseSlot` still from T-2.2. | Covered by test (WP-5). |
| T-2.7 | (Optional refactor) Extract enrichment to `src/modules/task-engine/dashboard/enrich-dashboard-phase-buckets.ts` if command file exceeds readability threshold; re-export or import from command. | Linter + team readability satisfied. |

---

### WP-3 — Contracts + machine instructions

| ID | Task | Done when |
| --- | --- | --- |
| T-3.1 | Update `src/modules/task-engine/instructions/dashboard-summary.md`: document `phaseSlot`, `phaseShortDescription` on each `phaseBuckets[]` item; server-side enrichment; `label` retained for compat. | Reviewed for accuracy vs code. |
| T-3.2 | Update `src/contracts/dashboard-summary-run.ts`: optional explicit bucket shape (index signature + optional keys) **or** JSDoc on `DashboardPhaseBucket` pointing to instruction; no spurious `schemaVersion` bump on `DashboardSummaryData`. | Types align with runtime. |
| T-3.3 | Audit `.github/instructions/cursor-workflow-cannon-ui.instructions.md`: edit **only** if new markup escapes **R10** vocabulary / token rules; optional one-line grep anchor (“phase bucket summaries compose `.wc-tag` + `.wc-tab-badge`”) otherwise. | Styleguide debt zero or documented. |

---

### WP-4 — Extension: summary HTML helper + wiring

| ID | Task | Done when |
| --- | --- | --- |
| T-4.1 | Add `renderPhaseBucketSummaryInnerHtml(bucket: unknown): string` (name per taste) in `render-dashboard.ts`: if **`phaseSlot`** is **absent** on the deserialized bucket (legacy payloads), render escaped `label` only; else structured path builds tag (current/next/future/unphased only) + title + `.wc-tab-badge` + optional ` - ` + escaped description. | Unit-testable HTML fragments. |
| T-4.2 | Define canonical **title strings**: `Phase ${key}` for numeric/string keys; **Not phased** (or chosen copy) for `unphased`; align spelling with product §2 / existing UI. | Copy consistent everywhere. |
| T-4.3 | Define canonical **tag labels**: `[Current]`, `[Next]`, `[Future]`, `[Not phased]` as visible text inside `.wc-tag` (brackets in text OK per product). | Matches §2. |
| T-4.4 | Replace `summaryLabel` construction in `renderReadyPhaseBuckets` with helper output inside existing `phase-bucket-summary` / `phase-bucket-summary-label` structure as appropriate. | Ready queues render new header. |
| T-4.5 | Same for `renderProposedPhaseBuckets`. | Proposed improvements headers done. |
| T-4.6 | Same for `renderProposedExecutionPhaseBuckets`. | Proposed execution headers done. |
| T-4.7 | Same for `renderTranscriptChurnResearchPhaseBuckets` **and** align `<summary>` markup/classes with other phase stacks (per §3.3). | Structural parity. |
| T-4.8 | Same for `renderBlockedPhaseBuckets` — replace bare `<summary>` + raw `label` with `phase-bucket-summary` / `phase-bucket-summary-label` pattern + helper (parity with ready/proposed). | Blocked queue headers match design system. |
| T-4.9 | Same for `renderTerminalTaskPhaseBuckets` (feeds **Completed** and **Cancelled** rollups) — replace bare `<summary>` + raw `label` with same summary wrapper + helper; preserve `terminal-phase-bucket` class on `<details>` if still needed for CSS. | Terminal sections match design system. |
| T-4.10 | Repo-wide grep in `render-dashboard.ts` for `phase-stack` / `String(b.label` / `escapeHtml(String(b.label` on bucket summaries; confirm **six** renderer **functions** all route through helper (`renderTerminalTaskPhaseBuckets` is shared by completed + cancelled — one implementation, two call sites). | No straggler using raw `label` only in a phase `<summary>`. |
| T-4.11 | Add minimal **layout CSS** (flex/gap from allowed spacing set **R4**) for summary inner row: tag + title + badge + tail wrap cleanly in sidebar width; only `wc-*` classes. | No forbidden spacing values; sidebar body font unchanged (**R3**). |
| T-4.12 | Verify `resolvePhasePhraseForCompleteRelease` call sites unchanged; run grep to ensure no accidental coupling to new HTML. | No regression. |
| T-4.13 | Run `extensions/cursor-workflow-cannon/test/dashboard-prompt-surface.test.mjs` (or full package test) after edits. | Still green. |

---

### WP-5 — Kit automated tests

| ID | Task | Done when |
| --- | --- | --- |
| T-5.1 | Extend `test/dashboard-phase-buckets.test.mjs`: matrix for `classifyPhaseBucketSlot` (all slots + edge: no current, next equals current, non-numeric keys, future boundary). | Assertions explicit. |
| T-5.2 | Golden / snapshot assertions: `phaseBucketLabel` for representative tuples **matches pre-change strings** (copy exact expected strings from current behavior). | Regression guard. |
| T-5.3 | Enrichment tests: mock `data` + `workspaceStatus`; catalog present → descriptions mapped by `phaseKey`; derived non-null appears on bucket; catalog absent → `phaseShortDescription` null, `phaseSlot` still set. | Covers T-2.6. |
| T-5.4 | If enrichment lives in separate module, colocate tests or import from `test/dashboard-phase-buckets.test.mjs` — no orphan logic. | CI discovers tests. |

---

### WP-6 — Extension automated tests

| ID | Task | Done when |
| --- | --- | --- |
| T-6.1 | `render-dashboard.test.mjs`: structured bucket → expect `.wc-tag`, `.wc-tab-badge`, tail text; HTML injection in description must not escape as raw HTML. | Escaping proven. |
| T-6.2 | `phaseShortDescription` with `& < >` etc. → literal entities / safe text in output (per renderer strategy). | Security case covered. |
| T-6.3 | No tail: null / missing / `"   "` — assert **no renderer-injected** tail after the badge (match §6.2; avoid naive global ` - ` substring if descriptions could contain it later). | Assert negative pattern. |
| T-6.4 | Legacy bucket: **`phaseSlot` absent** (`Object.hasOwn` / `hasOwnProperty` false after `null`/`object` guard) → escaped `label` substring preserved; enriched **`phaseSlot: "unphased"`** uses structured path (not legacy). | Backward compat + `unphased` guard. |
| T-6.5 | Transcript churn summary shares wrapper/class contract with another phase stack (pick one reference renderer). | Parity asserted. |
| T-6.6 | “Future + derived” case: bucket has description while catalog row could be `inCatalog: false` in real data — fabricate minimal payload reflecting kit output; tail renders. | Product rule §2. |
| T-6.7 | **Blocked** + **terminal** (completed/cancelled) bucket summaries: assert new wrapper + helper path (not bare `<summary>` with only escaped `label` when structured fields present); legacy fallback still works when fields absent. | All **six** renderer functions’ paths covered (terminal tested once or twice for both rollups). |

---

### WP-7 — Fixtures, snippets, and contract drift

| ID | Task | Done when |
| --- | --- | --- |
| T-7.1 | Inspect `fixtures/cae/cli-requests/valid/dashboard-summary.json` — if full-schema validated, add `phaseSlot` / `phaseShortDescription` to one bucket; if minimal, document “no change” in PR. | CAE / fixture CI green. |
| T-7.2 | Inspect `.ai/agent-cli-snippets/by-command/dashboard-summary.json` — update sample if it embeds `phaseBuckets` and CI compares hash/shape. | Snippet CI green. |
| T-7.3 | Grep for other `phaseBuckets` fixtures or snapshot tests under `test/` and `extensions/`. | No failing consumer. |

---

### WP-8 — Manual verification (operator)

| ID | Task | Done when |
| --- | --- | --- |
| T-8.1 | Extension Host: Queue tab — verify Current / Next / Future / none / Not phased rows with real or seeded workspace. | Signed off in PR or notes. |
| T-8.2 | Collapse/expand + refresh: `<details>` state survives partial `#root` refresh (**R12**). | No regression observed. |
| T-8.3 | Keyboard: Tab reaches interactive controls in summary row vicinity (Accept All / Complete & Release); focus ring visible (**R6.3**, **R13.3**). | No new trap regressions. |

---

### WP-9 — Closeout against acceptance criteria (§10)

| ID | Task | Done when |
| --- | --- | --- |
| T-9.1 | Map each §10 checkbox to a WP/T row; tick only when evidence exists (test name, screenshot, or PR note). | Traceability matrix complete. |
| T-9.2 | PR description lists touched styleguide rule IDs (**R#**). | Reviewer-ready. |
| T-9.3 | **Kit:** root **`pnpm run test`** (`build` + all `test/**/*.test.mjs`). **Extension:** **`pnpm --filter cursor-workflow-cannon test`** (`compile` + extension tests). If extension tests exercise the real CLI, ensure root **`pnpm run build`** ran recently so `dist/cli.js` matches sources (see extension `README.md`). | All green. |

---

### WBS summary table (work packages)

| WP | Name | Primary outputs |
| --- | --- | --- |
| WP-0 | Preconditions | Baseline tests, file inventory |
| WP-1 | Slot type + classifier + label refactor | `classifyPhaseBucketSlot`, stable `label`, extended types |
| WP-2 | Enrichment | All eight `phaseBuckets` arrays carry `phaseSlot` + optional description |
| WP-3 | Docs + contract | `dashboard-summary.md`, optional `dashboard-summary-run.ts` tighten |
| WP-4 | Extension UI | Summary helper, CSS, **six** phase-stack renderer functions (incl. blocked + terminal), transcript parity |
| WP-5 | Kit tests | Classification, label goldens, enrichment |
| WP-6 | Extension tests | Escaping, legacy, parity, derived tail |
| WP-7 | Fixtures / snippets | CAE + agent snippet drift resolved |
| WP-8 | Manual QA | Extension Host checklist |
| WP-9 | Acceptance closeout | §10 traceability + full test sweep |

---

*Plan: Queue phase header enrichment (sidebar Dashboard → Queue). Editing passes: reconciled with repo sources; clarified enrichment ordering, legacy `phaseSlot` detection, extension vs kit test commands, WBS scope wording, and “no tail” test guidance.*
