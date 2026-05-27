# PlanArtifact v1 — test strategy

**Artifact:** `PLANNER_TEST_STRATEGY.md` (repo root)  
**Status:** Draft for human review (**A-TEST**)  
**Contracts:** [`PLANNER_COMMANDS.md`](./PLANNER_COMMANDS.md) · **Rubric:** [`PLANNER_REVIEW_RUBRIC.md`](./PLANNER_REVIEW_RUBRIC.md) · **Schema:** [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md)

Test layers, fixture layout, golden paths, blocked-path cases, and CI hooks for the planner / PlanArtifact v1 work (WP-1–WP-8). Implementation tasks reference this file; **A-TEST** approval gates E2E investment (T-8.2).

---

## 1. Test pyramid

| Layer | Scope | Runner | Primary signal |
| --- | --- | --- | --- |
| **Unit** | Pure functions: schema validate, rubric rules, WBS normalizer, markdown render | `pnpm run test` (node:test) | Fast regression on rules and shapes |
| **Integration** | `wk run` handlers with temp workspace dirs; SQLite module-state; plan file round-trip | `pnpm run test` | Command argv → JSON codes without extension |
| **Extension** | Dashboard render + webview actions (mock CommandClient) | `pnpm run test` (extension package) | UI contracts, policy drawer payloads |
| **E2E CLI** | Full golden path + blocked path via subprocess `pnpm exec wk` | `test/plan-artifact-e2e-cli.test.mjs` (T-8.2) | Operator loop fidelity |

**Not in v1:** Browser E2E against live Cursor; cloud agent runs.

---

## 2. Fixture layout

```
fixtures/planning/
  plan-artifact-minimal.valid.v1.json      # passes schema + minimal profile
  plan-artifact-full-feature.valid.v1.json
  plan-artifact-review-blockers.v1.json    # RUBRIC-COV-GOAL, etc.
  plan-artifact-review-warnings.v1.json
  plan-artifact-not-accepted.v1.json      # for finalize blocked path
  plan-artifact-accepted.v1.json
  wbs-oversized-row.v1.json               # sizing fixtures
  wbs-vague-ac.v1.json

test/fixtures/planning/                   # optional mirror for tests that cwd from repo root
```

**Conventions:**

- Filename suffix `.valid.v1.json` = should pass schema validation.
- `.invalid.*.json` = negative tests (missing goals, bad WBS dep).
- Golden CLI transcripts: `test/fixtures/planning/golden/draft-persist.stdout.json` (optional, T-8.2).

**Reuse:** Extend patterns from `test/planning-module.test.mjs`, `test/planning-session-sqlite.test.mjs`.

---

## 3. Coverage by work package

| WP | Unit | Integration | Extension | E2E CLI |
| --- | --- | --- | --- | --- |
| **WP-1** schema/types/storage/render | JSON Schema + TS types; storage round-trip; markdown snapshot | — | — | — |
| **WP-3** draft | validator | `draft-plan-artifact` persist + idempotency | — | golden step 1 |
| **WP-4** review | each `RUBRIC-*` rule | `review-plan-artifact` profiles | — | golden step 2 |
| **WP-5** accept | approvalRecord guards | accept blocked vs ok | accept button disabled state | golden step 3 |
| **WP-6** finalize | normalizer | dry-run + persist delegate | finalize preview panel | golden step 4–5 |
| **WP-7** dashboard | summary projection shape | `dashboard-summary` includes `planArtifact` | render tests per panel | manual A-E2E checklist |
| **WP-8** hardening | compat shim | `build-plan` still passes | — | full golden + blocked |

---

## 4. Golden path (happy)

**Automated E2E (T-8.2)** — single test file, temp workspace:

1. `draft-plan-artifact` with `plan-artifact-minimal.valid.v1.json`, `persist: true`, `policyApproval`.
2. `review-plan-artifact` → assert `data.passed === true`.
3. `accept-plan-artifact` with matching `approvedVersion`.
4. `finalize-plan-to-phase` `dryRun: true` → task preview non-empty; `review` sub-object passed.
5. `finalize-plan-to-phase` `dryRun: false`, `targetPhaseKey` test phase → `plan-artifact-finalize-persisted` or idempotent replay.
6. `list-tasks` filter shows tasks with `metadata.planRef` matching plan.

**Assertions:** stable `code` fields per [`PLANNER_COMMANDS.md`](./PLANNER_COMMANDS.md); no hand-edited task store.

**Human checklist (A-E2E, T-8.2):** Operator runs same steps in Dashboard; record pass/fail in phase journal — not required for CI green.

### A-E2E human checklist draft

- [ ] Draft: create or import a PlanArtifact and confirm the Dashboard Plan Draft panel shows title, status, open questions, review findings, and WBS preview.
- [ ] Review: run `review-plan-artifact` or the equivalent dashboard flow and confirm blockers/warnings are visible before acceptance.
- [ ] Accept: approve a reviewed, blocker-free PlanArtifact and confirm the dashboard hides Accept and exposes Finalize.
- [ ] Blocked path: attempt finalize before accept and confirm `plan-artifact-not-accepted` is shown without creating tasks.
- [ ] Finalize preview: dry-run finalize and confirm task preview rows and review status are present.
- [ ] Finalize persist: persist finalize into a target phase and confirm ready Queue rows carry the PlanArtifact `planRef`.
- [ ] Refresh: refresh dashboard summary and confirm `planArtifact.status` is `finalized` and the Queue can be filtered to the target phase.

---

## 5. Blocked-path cases (required)

| # | Scenario | Command | Expected code | WP test |
| --- | --- | --- | --- | --- |
| B1 | Schema invalid (empty goals) | `draft-plan-artifact` | `plan-artifact-schema-invalid` | WP-3 |
| B2 | Review blockers present | `review-plan-artifact` | `plan-artifact-review-blocked`, `passed: false` | WP-4 |
| B3 | Accept with blockers (`strict: true`) | `accept-plan-artifact` | `plan-artifact-accept-blocked` | WP-5 |
| B4 | Finalize without accept | `finalize-plan-to-phase` | `plan-artifact-not-accepted` | WP-6 |
| B5 | Finalize persist with task review fail | `finalize-plan-to-phase` | `plan-artifact-finalize-review-failed` | WP-6 |
| B6 | Stale planning generation | any Tier B mutator | `planning-generation-mismatch` | all |
| B7 | Policy denied | Tier B without `policyApproval` | `policy-denied` | all |
| B8 | Version mismatch on accept | `accept-plan-artifact` wrong version | `plan-artifact-version-mismatch` | WP-5 |

Each blocker gets at least one dedicated fixture + integration test.

---

## 6. Unit test focus areas

### 6.1 Schema (`schemas/planning/plan-artifact.v1.schema.json`)

- Valid minimal + full-feature fixtures pass AJV.
- Reject: empty `wbs`, missing `identity`, wrong `schemaVersion`.

### 6.2 Review rubric (`reviewPlanArtifact`)

- One test file per **blocker** code in [`PLANNER_REVIEW_RUBRIC.md`](./PLANNER_REVIEW_RUBRIC.md) §4–§5 (table-driven).
- Coverage map snapshot for `plan-artifact-review-blockers.v1.json`.

### 6.3 WBS normalizer (`normalizeWbsItemToTaskDraft`)

- Output matches `persist-planning-execution-drafts` row shape.
- Provenance fields attached at finalize (integration).

### 6.4 Markdown render

- Snapshot: minimal plan → markdown omits empty optional sections.

---

## 7. Extension tests (`extensions/cursor-workflow-cannon`)

| Area | File pattern | Notes |
| --- | --- | --- |
| Plan panel render | `test/render-dashboard-plan-artifact.test.mjs` | Fixture `dashboard-summary` JSON with `planArtifact` |
| Accept / finalize actions | extend `dashboard-ui-interaction-locks` or dedicated | Mock `CommandClient.run` argv includes `policyApproval` |
| Planning wizard coexistence | `test/render-dashboard.test.mjs` | `planningSession` + `planArtifact` both present |

Follow existing extension test style (`render-dashboard.test.mjs`, `command-client.test.mjs`).

---

## 8. CI targets

| Gate | When | What |
| --- | --- | --- |
| **PR CI** (`pnpm run test`) | Every PR to `release/phase-*` | All unit + integration + extension tests; includes existing `planning-module.test.mjs`. |
| **`pnpm run check`** | Same | Schema/manifest consistency; no plan-specific stage until WP-1.2 lands — then add `check-plan-artifact-schema` script (T-8.4). |
| **T-8.4 release gate** | Phase closeout | `pnpm run test:plan-artifact-fixtures` validates `fixtures/planning/*.json` and runs PlanArtifact fixture/E2E tests in CI. |
| **Parity / release-readiness** | `main` / phase merge | Unchanged; planner must not break parity smoke. |

**Proposed check script (T-8.4):**

```bash
pnpm run test:plan-artifact-fixtures
```

Fails if any committed fixture under `fixtures/planning/` violates its filename convention (`*.valid.*`/default must pass, `*.invalid.*` must fail) or if the PlanArtifact fixture/E2E tests regress.

---

## 9. Test data and workspace hygiene

- Use `mkdtemp` workspace roots under `os.tmpdir()` for integration tests.
- Plan files under `.workspace-kit/planning/plan-artifacts/` — delete in `after()` hooks.
- Do **not** commit real operator plans; only sanitized fixtures.
- Task store: use isolated SQLite path or in-memory dual store patterns from existing task-engine tests.

---

## 10. Policy and planning generation in tests

- Integration tests that persist must pass `policyApproval` in argv (see `.ai/POLICY-APPROVAL.md`).
- Read `planningGeneration` from first successful mutating call; thread `expectedPlanningGeneration` on subsequent calls when policy is `require`.
- Never use `WORKSPACE_KIT_POLICY_APPROVAL` env alone for `wk run` tests.

---

## 11. Relationship to existing tests

| Existing test | Planner v1 relation |
| --- | --- |
| `test/planning-module.test.mjs` | Keep green; extend for `build-plan` compat only (T-8.1). |
| `test/planning-session-sqlite.test.mjs` | Pattern for plan index module-state rows. |
| `extensions/.../parse-build-plan-resume-cli.test.mjs` | Unchanged; session ≠ PlanArtifact. |
| Task-engine draft review tests | `review-planning-execution-drafts` stays separate; finalize integration mocks it. |

---

## 12. Exit criteria (A-TEST)

**A-TEST** is satisfied for implementation when:

- [ ] This document approved by maintainer.
- [ ] Fixture directory convention agreed (`fixtures/planning/`).
- [ ] Golden + blocked tables accepted for T-8.2 / WP-4–6 test authors.
- [ ] CI hook owner assigned (T-8.4).

---

## 13. References

| Resource | Purpose |
| --- | --- |
| [`PLANNER_TASKS.md`](./PLANNER_TASKS.md) | WP-8 T-8.2, T-8.4 |
| [`PLANNER_COMMANDS.md`](./PLANNER_COMMANDS.md) | Response codes to assert |
| [`PLANNER_REVIEW_RUBRIC.md`](./PLANNER_REVIEW_RUBRIC.md) | Rule codes for table-driven tests |
| `test/planning-module.test.mjs` | Existing planning tests |
