# AGENT_ORCHESTRATION_TEST_STRATEGY.md

**Artifact:** A-TEST (orchestration test strategy and fixture matrix)  
**WBS:** WBS-AO-090 / task **T100632**  
**Requires:** [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) (A-SCHEMA), [AGENT_ORCHESTRATION_COMMANDS.md](./AGENT_ORCHESTRATION_COMMANDS.md) (A-COMMANDS), [AGENT_ORCHESTRATION_COMPAT.md](./AGENT_ORCHESTRATION_COMPAT.md) (A-COMPAT)  
**Blocks:** T-AO-110 (TypeScript contracts), T-AO-120 (validators), T-AO-130 (fixture gate), T-AO-610–730 (implementation + E2E)  
**Produced:** 2026-05-31  
**Status:** Draft for human approval — test authors and CI gates must not treat contested shapes as enforced until sign-off below.

---

## 1. Purpose

This document defines **test layers**, **fixture layout**, **fixture matrix** (happy, blocked, malformed, compatibility), **golden and blocked-path scenarios**, **dashboard-projection test scope**, an **E2E operator checklist**, and **required CI/test commands** for Workflow Cannon agent orchestration v1.

It is a **design-only** artifact: it may reference existing tests under `test/` and golden JSON under `fixtures/agent-orchestration/` without requiring new implementation in this task. Implementation tasks (T-AO-110+) own the files named here.

Normative shapes: **AGENT_ORCHESTRATION_CONTRACTS.md**. Command argv and codes: **AGENT_ORCHESTRATION_COMMANDS.md**. Permissive vs strict behavior: **AGENT_ORCHESTRATION_COMPAT.md**.

---

## 2. Test pyramid

| Layer | Scope | Runner (today / planned) | Primary signal |
| --- | --- | --- | --- |
| **Unit** | Pure validators, enum guards, handoff parser branches, projection merge helpers, normalizers | `pnpm run test` (`node:test`) | Fast regression on rules without SQLite |
| **Contract** | JSON Schema (AJV) vs `schemas/agent-orchestration/**`; golden fixtures pass/fail | `test/agent-orchestration/**` (T-AO-130) | Schema pack matches A-SCHEMA §3–7 |
| **Command** | Per-command argv schema, `policyApproval`, idempotency keys, dry-run envelope | `test/agent-orchestration-commands.test.mjs` (T-AO-210+) | Stable `code` per A-COMMANDS §3.5 |
| **Integration** | `pnpm exec wk run` with temp kit workspace; subagent + team-execution + activity stores | `test/agent-orchestration/**`, extend `test/subagents-store.test.mjs`, `test/team-execution-store.test.mjs` | Command → SQLite without hand-edits |
| **Dashboard projection** | `build-dashboard-agent-activity-summary` merge keys, precedence, stale/blocked derivation | `test/dashboard-agent-activity-summary.test.mjs` (T-AO-620) | Read-only projection; no dashboard mutation |
| **E2E CLI** | Full orchestrator + worker loops via subprocess `pnpm exec wk` | `test/agent-orchestration-happy-path.e2e.test.mjs`, `test/agent-orchestration-blocked-worker.e2e.test.mjs` (T-AO-720–730) | Operator loop fidelity |

**Not in v1:** Live Cursor/VS Code host launch E2E; cloud agent runs; browser automation against the extension.

---

## 3. Fixture layout

### 3.1 Committed golden fixtures (today)

```
fixtures/agent-orchestration/
  agent-definition-orchestration-agent.v1.json
  agent-definition-task-worker.v1.json
  agent-session-task-worker.v1.json
  assignment-metadata-task-worker.v1.json
  agent-activity-working-task.v1.json
  handoff-completed.v2.json
  handoff-blocked.v2.json
  handoff-partial.v2.json
  handoff-failed.v2.json
  handoff-needs-review.v2.json
  handoff-v2/
    handoff-completed.v2.json
    handoff-blocked.v2.json
    handoff-partial.v2.json
    handoff-failed.v2.json
    handoff-needs-review.v2.json

schemas/agent-orchestration/
  agent-definition.v1.json
  agent-session.v1.json
  assignment-metadata.v1.json
  agent-activity.v1.json
  handoff.v2.json
```

**Conventions (T-AO-130):**

| Suffix / path | Meaning |
| --- | --- |
| `*.v1.json` / `*.v2.json` in `fixtures/agent-orchestration/` | Golden — must pass JSON Schema when `schemaVersion` is set |
| `fixtures/agent-orchestration/malformed/**` (planned) | Negative contract tests — must fail validation in strict mode |
| `fixtures/agent-orchestration/compat/**` (planned) | Legacy rows — permissive mode; no `schemaVersion` |
| `handoff-v2/` | Canonical handoff status matrix (WBS-AO-060); root copies retained for backward test imports |

### 3.2 Fixture matrix (required quadrants)

| Quadrant | Intent | Primary fixtures / planned files | Primary test layer |
| --- | --- | --- | --- |
| **Happy** | Valid v1/v2 shapes; orchestrator + worker golden paths | All committed `fixtures/agent-orchestration/*.json` except `malformed/` | Contract + Integration + E2E |
| **Blocked** | Handoff/assignment/activity blocked semantics; worker blocker flow | `handoff-blocked.v2.json`, `handoff-needs-review.v2.json`; E2E blocked-worker script | Integration + E2E |
| **Malformed** | Strict-mode rejects; missing required fields; bad enums | Planned: `malformed/agent-definition-missing-role.v1.json`, `malformed/handoff-v2-empty-summary.v2.json`, `malformed/activity-invalid-kind.v1.json` | Contract + Unit + Command |
| **Compatibility** | Legacy subagent/assignment/handoff without orchestration metadata | Planned: `compat/register-subagent-legacy.json`, `compat/handoff-v1-minimal.json`, `compat/assignment-no-metadata.json` | Integration + WP-7 compat suite (T-AO-710) |

#### Happy-path fixture map

| Contract | Golden fixture | Schema |
| --- | --- | --- |
| AgentDefinition (orchestrator) | `agent-definition-orchestration-agent.v1.json` | `agent-definition.v1.json` |
| AgentDefinition (worker) | `agent-definition-task-worker.v1.json` | `agent-definition.v1.json` |
| AgentSession | `agent-session-task-worker.v1.json` | `agent-session.v1.json` |
| Assignment metadata | `assignment-metadata-task-worker.v1.json` | `assignment-metadata.v1.json` |
| AgentActivity | `agent-activity-working-task.v1.json` | `agent-activity.v1.json` |
| Handoff v2 `completed` | `handoff-v2/handoff-completed.v2.json` | `handoff.v2.json` |
| Handoff v2 `blocked` | `handoff-v2/handoff-blocked.v2.json` | `handoff.v2.json` |
| Handoff v2 `partial` | `handoff-v2/handoff-partial.v2.json` | `handoff.v2.json` |
| Handoff v2 `failed` | `handoff-v2/handoff-failed.v2.json` | `handoff.v2.json` |
| Handoff v2 `needs_review` | `handoff-v2/handoff-needs-review.v2.json` | `handoff.v2.json` |

#### Blocked-path fixture map

| Scenario | Fixture | Expected command / projection signal |
| --- | --- | --- |
| Handoff outcome blocked | `handoff-blocked.v2.json` | `submit-assignment-handoff` accepts payload; assignment → `blocked` via reconcile/block flow |
| Handoff needs human review | `handoff-needs-review.v2.json` | Handoff parser preserves `needs_review`; projection `needsAttention` |
| Worker self-report blocked (proposed) | E2E only (T-AO-730) | `report-assignment-blocked` → `assignment-blocked-reported` |
| Orchestrator blocks assignment | Integration | `block-assignment` (supervisor) unchanged; compat with new metadata |
| Activity stale / expired | Synthetic TTL in integration | Projection stale row; `agentStatus` falls back to derived |

#### Malformed-path fixture map (planned under `fixtures/agent-orchestration/malformed/`)

| # | Scenario | Planned fixture | Expected code (strict) |
| --- | --- | --- | --- |
| M1 | Non-object root | `malformed/not-object.json` | `invalid-orchestration-schema` |
| M2 | AgentDefinition missing `role` | `malformed/agent-definition-missing-role.v1.json` | `missing-required-orchestration-field` |
| M3 | Unknown top-level key (strict) | `malformed/agent-definition-unknown-field.v1.json` | `unknown-orchestration-field` |
| M4 | Handoff v2 empty `summary` | `malformed/handoff-v2-empty-summary.v2.json` | `handoff-v2-missing-field` |
| M5 | Invalid `handoff.schemaVersion` | `malformed/handoff-bad-version.v2.json` | `invalid-handoff-schema-version` |
| M6 | Activity unknown `kind` | `malformed/activity-invalid-kind.v1.json` | `invalid-run-args` (today) / `invalid-orchestration-schema` (target) |
| M7 | Invalid ISO timestamp on activity | `malformed/activity-bad-timestamp.v1.json` | `invalid-run-args` |
| M8 | Tier B without `policyApproval` | argv only | `policy-approval-required` |

Each malformed row gets at least one **contract** test and one **command** or **integration** test when validators ship (T-AO-120).

#### Compatibility-path fixture map (planned under `fixtures/agent-orchestration/compat/`)

| # | Scenario | Planned fixture / setup | Expected behavior (permissive default) |
| --- | --- | --- | --- |
| C1 | `register-subagent` without `metadata.schemaVersion` | `compat/register-subagent-legacy.json` | Same as today — `subagent-registered` |
| C2 | `register-assignment` without orchestration metadata | `compat/assignment-no-metadata.json` | Assignment row created; projection uses legacy heuristics |
| C3 | Handoff v1 shape only | `compat/handoff-v1-minimal.json` | v1 parser; no v2-only fields required |
| C4 | Dual-read: column + metadata bridge | Integration setup (T-AO-210) | Reader prefers column when non-null (A-SCHEMA §8.5) |
| C5 | `retired: true` definition + new assignment | Integration | Advisory only in v1; assignment allowed |
| C6 | Existing dashboard `agentStatus` without leases | Empty lease store | Derived status unchanged (A-ARCH §7.3) |

---

## 4. Coverage by work package

| WP / WBS | Unit | Contract | Command | Integration | Projection | E2E CLI |
| --- | --- | --- | --- | --- | --- | --- |
| **WP-1** T-AO-110–130 types + validators + fixtures | Enum/capability guards | All `schemas/agent-orchestration/*` | — | — | — | — |
| **WP-2** T-AO-210–220 registry + session | Session status guards | Definition + session fixtures | `register-subagent`, `spawn-subagent`, `update-subagent-session` | Temp DB round-trip | — | Step 1–2 happy E2E |
| **WP-3** T-AO-310–430 assignments + handoff | Handoff v1/v2 parser | Handoff matrix | `register-assignment`, `submit-assignment-handoff`, `report-assignment-blocked` | Handoff persist + replay | — | Step 3–5 happy E2E |
| **WP-4** T-AO-410 activity | TTL / kind normalization | Activity fixture | `set-agent-activity`, `clear-agent-activity` | Lease upsert + expiry | Stale lease row | Activity in E2E |
| **WP-5** T-AO-330 blocker/defect | Scope guards | — | `report-assignment-blocker`, `report-assignment-defect` | Linked task ids | Blocked projection | T-AO-730 blocked E2E |
| **WP-6** T-AO-610–620 projection | Merge precedence pure fn | Summary shape snapshot | `dashboard-summary` read-only | — | All A-PROJECTION cases | Dashboard checklist |
| **WP-7** T-AO-710–740 compat + E2E + checklist | — | Compat fixtures | Legacy argv unchanged | Subagent + team-execution regressions | No regression on `agentStatus` | T-AO-720–730 |

---

## 5. Golden path (happy) — automated E2E (T-AO-720)

**Scope:** Single `node:test` file with `mkdtemp` workspace, isolated kit SQLite, subprocess `pnpm exec wk`.

| Step | Command | Fixture / input | Assert |
| --- | --- | --- | --- |
| 1 | `register-subagent` ×2 | `agent-definition-orchestration-agent.v1.json`, `agent-definition-task-worker.v1.json` | `subagent-registered`; `policyApproval` present |
| 2 | `spawn-subagent` | `agent-session-task-worker.v1.json` bridge fields | `subagent-session-opened` |
| 3 | `register-assignment` | `assignment-metadata-task-worker.v1.json` | `assignment-registered`; metadata validated when strict on |
| 4 | `set-agent-activity` | `agent-activity-working-task.v1.json` | Lease row; `dashboard-summary` shows live activity when polled |
| 5 | `submit-assignment-handoff` | `handoff-v2/handoff-completed.v2.json` | Handoff v2 stored; `schemaVersion: 2` |
| 6 | `reconcile-assignment` | supervisor argv | `assignment-reconciled` |
| 7 | `dashboard-summary` | — | Projection includes assignment + session + activity sources (T-AO-620) |

**Assertions:** Stable `code` fields per A-COMMANDS; no hand-edited task store; `expectedPlanningGeneration` threaded when policy is `require`.

---

## 6. Blocked-path cases (required)

| # | Scenario | Command(s) | Expected code / state | WP / test owner |
| --- | --- | --- | --- | --- |
| B1 | Handoff blocked outcome | `submit-assignment-handoff` + `block-assignment` / worker report | Assignment `blocked`; handoff payload from `handoff-blocked.v2.json` | WP-3 |
| B2 | Handoff needs_review | `submit-assignment-handoff` | Parser preserves status; projection flags attention | WP-3, WP-6 |
| B3 | Worker discovers blocker | `report-assignment-blocker` (proposed) | Linked `T###`; `worker-scope-violation` if out of scope | T-AO-330 |
| B4 | Worker reports defect | `report-assignment-defect` (proposed) | Defect task created; assignment remains active/blocked per policy | T-AO-330 |
| B5 | Worker self-report blocked | `report-assignment-blocked` (proposed) | `assignment-blocked-reported` | T-AO-730 E2E |
| B6 | Illegal handoff replay | `submit-assignment-handoff` on `submitted` | `assignment-status-invalid` or informational `idempotent-replay` | WP-3 |
| B7 | Stale planning generation | Any Tier B mutator | `planning-generation-stale` | All |
| B8 | Policy denied | Tier B without `policyApproval` | `policy-approval-required` | All |
| B9 | Activity expired | TTL elapsed + `dashboard-summary` | Derived `agentStatus`; projection stale row | WP-4, WP-6 |
| B10 | Orchestrator resolves blocker | `run-transition` on blocker task + resume assignment | Task store evidence; assignment unblocked per playbook | T-AO-730 E2E |

---

## 7. Unit test focus areas

### 7.1 Schema validation (T-AO-120)

- All committed golden fixtures pass AJV against matching `schemas/agent-orchestration/*.json`.
- Planned `malformed/**` fixtures fail with codes in A-SCHEMA §8.2.
- `unknown-capability` is **advisory** in v1 (warning, not hard fail).

### 7.2 Handoff parser

- v2 when `handoff.schemaVersion === 2`; v1 fallback when absent or `1`.
- Status enum coverage: `completed`, `blocked`, `partial`, `failed`, `needs_review` (fixtures in §3.2).

### 7.3 Activity lifecycle

- `normalizeAgentActivityKind` rejects unknown kinds (align with `src/modules/task-engine/agent-activity-store.ts`).
- TTL extension on `set-agent-activity` idempotent `activityId`.
- Stale/expired derivation for projection (pure function tests).

### 7.4 Assignment metadata

- Required fields in strict mode (A-SCHEMA §5.3): `ownedPaths`, profile refs when `schemaVersion === 1`.
- Permissive: row stores without validation when `schemaVersion` absent.

### 7.5 Projection merge (T-AO-610)

- Precedence table from A-ARCH §7.2–7.3: lease > assignment status > session > definition defaults.
- Collapse duplicate source rows; `sourceConfidence` ordering.
- **Must not** write orchestration tables from projection builder.

---

## 8. Command and contract tests

| Area | Pattern | Notes |
| --- | --- | --- |
| argv schema | `pnpm exec wk run <cmd> --schema-only '{}'` | CI-friendly; matches `.ai/agent-cli-snippets/by-command/*.json` |
| policy surface | Table-driven Tier A/B per A-COMMANDS §3.1 | `run-transition`, `register-subagent`, `submit-assignment-handoff`, etc. |
| idempotency | Replay same `clientMutationId` / `assignmentId` | Expect `idempotent-replay` or stable row return |
| dry-run | `dryRun: true` on mutators (when implemented) | `dry-run-valid`; no SQLite writes |
| strict flag | Workspace `orchestration.strictMetadataValidation: true` | Flip permissive → fail closed for M1–M7 |

**Contract pack location (future):** `src/contracts/agent-orchestration.ts` must stay aligned with JSON Schema (T-AO-110).

---

## 9. Dashboard projection tests (T-AO-620)

| Case | Inputs | Expected projection |
| --- | --- | --- |
| P1 | Live activity + open assignment + open session | Single merged row; live kind visible |
| P2 | Subagent session fallback | Session row when activity lease missing |
| P3 | Active assignment, no activity | Assignment status drives attention |
| P4 | Stale activity lease | Stale flag; derived status fallback |
| P5 | Blocked assignment | `blocked` surfaced; handoff summary truncated safely |
| P6 | Completed handoff | `completed` / reconciled semantics |
| P7 | Malformed metadata in permissive mode | Row skipped or degraded with `sourceConfidence: low` |
| P8 | Legacy assignment (no `schemaVersion`) | Same as pre-orchestration dashboard behavior |

**Extension (optional):** `extensions/cursor-workflow-cannon/test/render-dashboard-orchestration.test.mjs` — fixture `dashboard-summary` JSON with `teamExecution` + future `agentActivityBoard` slice.

**Rule:** Dashboard tests **never** call mutating orchestration commands except via mocked `CommandClient`.

---

## 10. E2E operator checklist (human)

Use this checklist for **phase journal / release evidence** (T-AO-740). Steps mirror T-AO-720 happy path and T-AO-730 blocked path; CI green is not required for manual sign-off.

### 10.1 Happy path (orchestrator + worker)

- [ ] **Definitions:** Register Orchestration Agent and Task Work Agent via `register-subagent` (or confirm existing rows). Dashboard **Subagents** slice lists both.
- [ ] **Session:** `spawn-subagent` for worker; `list-subagent-sessions` shows `open` session linked to execution task when applicable.
- [ ] **Assignment:** `register-assignment` with metadata from `assignment-metadata-task-worker.v1.json`; `list-assignments` shows `assigned`.
- [ ] **Activity:** `set-agent-activity` with working-task fixture; `dashboard-summary` shows live activity (or lease row in DB export).
- [ ] **Handoff:** `submit-assignment-handoff` with `handoff-v2/handoff-completed.v2.json`; assignment moves to `submitted`.
- [ ] **Reconcile:** Supervisor `reconcile-assignment`; status `reconciled`.
- [ ] **Projection:** Refresh dashboard; confirm assignment + activity + session appear without dashboard mutating store (read-only).

### 10.2 Blocked worker path (T-AO-730)

- [ ] Worker starts assignment; activity shows **working**.
- [ ] Worker files blocker via `report-assignment-blocker` (or `create-task` only on orchestrator-approved path per A-COMMANDS §8).
- [ ] Worker calls `report-assignment-blocked` (when shipped) or supervisor `block-assignment`.
- [ ] Dashboard/projection shows **blocked**; original assignment stays blocked until orchestrator resumes.
- [ ] Orchestrator resolves blocker task (`run-transition` **complete** with evidence); documents resume/reassign decision.

### 10.3 Malformed / policy guards (spot check)

- [ ] Submit handoff with empty `summary` under **strict** validation → clear agent-readable error (`handoff-v2-missing-field`).
- [ ] Tier B command without `policyApproval` → `policy-approval-required` (no silent write).
- [ ] Toggle **permissive** (default): legacy `register-subagent` without orchestration metadata still succeeds.

### 10.4 Compatibility smoke

- [ ] Existing subagent flows: `message-subagent`, `close-subagent-session` unchanged.
- [ ] Legacy handoff v1 assignment still submits and reconciles.
- [ ] `pnpm run check` and `pnpm run test` green on phase branch after implementation lands.

---

## 11. CI and test commands

| Gate | When | Command | What it covers |
| --- | --- | --- | --- |
| **PR CI (default)** | Every PR to `release/phase-*` | `pnpm run test` | All `test/**/*.test.mjs` including `subagents-store`, `team-execution-store` |
| **Repo check** | Same | `pnpm run check` | Manifest, schema, agent-cli-map, doc governance |
| **Pre-merge** | Phase/task PR merge | `pnpm run pre-merge-gates` | `maintainer-gates` + PR history + `pnpm run test` |
| **Orchestration fixtures (proposed T-AO-130)** | After validators land | `pnpm run test:agent-orchestration-fixtures` | Validates `fixtures/agent-orchestration/**` + contract tests |
| **Parity / release** | Phase closeout / `main` | `pnpm run parity` | Must not regress; orchestration E2E included when added |
| **Extension** | Dashboard UI changes | `pnpm --filter cursor-workflow-cannon test` | Projection render tests when extension fixtures exist |

**Proposed package script (T-AO-130):**

```bash
pnpm run test:agent-orchestration-fixtures
```

Implementation:

```bash
node scripts/check-agent-orchestration-fixtures.mjs && node --test test/agent-orchestration/**/*.test.mjs
```

Fails if any golden fixture under `fixtures/agent-orchestration/` (excluding `malformed/**` and `compat/**` rules) violates JSON Schema, or if any `malformed/**` fixture incorrectly passes in strict mode.

**Agent delivery verification (this document only):**

```bash
pnpm run check
```

---

## 12. Test data and workspace hygiene

- Use `fs.mkdtempSync` under `os.tmpdir()` for integration/E2E; never commit operator SQLite DBs.
- Kit path: isolated `.workspace-kit/` per test via env or temp project root patterns from `test/task-engine.test.mjs`.
- **Do not** hand-edit `.workspace-kit/tasks/workspace-kit.db` for assertions — use `list-tasks`, `get-task`, `list-assignments`.
- **Do not** run `task-sync-hydrate` in tests unless recovering from an intentional conflict fixture.
- Golden JSON only — no secrets, tokens, or live PR URLs in fixtures (use placeholders like `https://example.invalid/...`).

---

## 13. Policy and planning generation in tests

- Integration tests that persist must include JSON **`policyApproval`** on argv (`.ai/POLICY-APPROVAL.md`).
- Read `planningGeneration` from first successful `list-tasks` / mutating response; pass **`expectedPlanningGeneration`** on subsequent Tier B commands when policy is `require`.
- Never rely on `WORKSPACE_KIT_POLICY_APPROVAL` env alone for `wk run` tests.
- `run-transition` **complete** in E2E must use Tier A approval and real transition evidence (maintainer delivery loop).

---

## 14. Relationship to existing tests

| Existing test | Orchestration v1 relation |
| --- | --- |
| `test/subagents-store.test.mjs` | Keep green; extend for `metadata.agentDefinition` bridge inserts |
| `test/team-execution-store.test.mjs` | Keep green; extend for handoff v2 + metadata validation hooks |
| `test/task-engine.test.mjs` | Activity lease patterns; blocker task linkage |
| `test/dashboard-service-poll-groups.test.mjs` | Unchanged polling; projection tests are separate file |
| `test/plan-artifact-*.test.mjs` | Orthogonal; do not conflate PlanArtifact with orchestration fixtures |

---

## 15. Verification and human approval

### 15.1 Acceptance mapping (T100632 / A-TEST)

| Criterion | Section |
| --- | --- |
| Fixture matrix covers happy, blocked, malformed, compatibility | §3.2 |
| E2E operator checklist exists | §10 |
| Required CI/test commands identified | §11 |
| Layers: unit, contract, command, integration, projection, E2E | §2, §4–9 |
| References A-SCHEMA + A-COMMANDS + existing fixtures | §1, §3.1 |

### 15.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-TEST / `AGENT_ORCHESTRATION_TEST_STRATEGY.md` |
| Reviewer | _pending_ |
| Decision | ☐ Approve as written &nbsp; ☐ Approve with notes &nbsp; ☐ Reject — revise |
| Notes | |
| Date | |

Dependent tasks (**T-AO-110+**, **T-AO-720–740**) should treat fixture and CI conventions as **draft** until the table above records approval.

### 15.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| Document references `fixtures/agent-orchestration/**` | Yes — §3.1 |
| Document references `schemas/agent-orchestration/**` | Yes — §3.1 |
| Malformed + compat quadrants defined | Yes — §3.2 |
| `pnpm run check` (repo gate) | Pending — run on task branch before merge |

---

## 16. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product intent |
| [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) | Storage + projection boundary (A-ARCH) |
| [AGENT_ORCHESTRATION_HANDOFF.md](./AGENT_ORCHESTRATION_HANDOFF.md) | Handoff v2 operator depth |
| [AGENT_ORCHESTRATION_TASKS.md](./AGENT_ORCHESTRATION_TASKS.md) | WBS-AO-090 scope and downstream owners |
| `.ai/AGENT-CLI-MAP.md` | Tier table and `policyApproval` copy-paste |
| `.ai/POLICY-APPROVAL.md` | Approval lanes |
| `src/modules/subagents/subagent-store.ts` | Registry implementation |
| `src/modules/team-execution/assignment-store.ts` | Handoff v1 validator (today) |
| `src/modules/task-engine/agent-activity-store.ts` | Activity kinds + TTL |

---

## 17. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-TEST for Phase 126 / T100632 |
