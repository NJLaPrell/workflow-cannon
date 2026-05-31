# AGENT_ORCHESTRATION_HANDOFF.md

**Artifact:** A-HANDOFF (Handoff v2 examples and validation rubric)  
**WBS:** WBS-AO-060 / task **T100629**  
**Requires:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) §9, [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) §7, `schemas/agent-orchestration/handoff.v2.json`  
**Blocks:** T-AO-410 (Handoff v2 command), T-AO-420 (reconcile consumes Handoff v2), T-AO-520 (Task Work Agent prompt)  
**Produced:** 2026-05-31  
**Status:** Draft for human approval — validator implementation (WP-3) remains out of scope until sign-off below.

---

## 1. Executive summary

Handoff v2 is the **worker → orchestrator evidence bundle** stored on `kit_team_assignments.handoff` when `schemaVersion === 2`. It must be **compact enough to scan in one pass** and **complete enough to reconcile** without rereading the worker transcript.

| Goal | v1 guarantee |
| --- | --- |
| **Transcript-free reconcile** | Orchestrator can choose reconcile, rework, blocker, review, cancel, or supersede from handoff fields alone |
| **Machine-readable examples** | Golden JSON under `fixtures/agent-orchestration/` and `fixtures/agent-orchestration/handoff-v2/` |
| **No transcript dumps** | Summary, evidence refs, and structured arrays replace chat replay |

```text
Worker finishes bounded assignment
        ↓
submit-assignment-handoff (Handoff v2 JSON)
        ↓
Orchestrator reads status + summary + evidenceRefs + nextRecommendedAction
        ↓
reconcile-assignment | block | cancel | assign follow-up — without opening transcript
```

**Normative shape:** foundation §9; field tables and enums: contracts §7; JSON Schema: `schemas/agent-orchestration/handoff.v2.json`.

---

## 2. Reconciliation without transcript

The orchestrator SHOULD treat the handoff as **sufficient** when all rubric rows in §4 pass for the declared `status`. Transcript reads are **optional depth**, not required for the default decision path.

| Minimum read set | Why it is enough |
| --- | --- |
| `status` | Terminal outcome class (§3) |
| `summary` | One-paragraph what happened |
| `evidenceRefs` | Pointers to checks, PRs, tests, logs |
| `nextRecommendedAction` | Explicit orchestrator or human next step |
| `blockers` (when `blocked`) | Actionable stall with optional `taskId` |
| `acceptanceCriteria` | Per-criterion pass/fail/partial with evidence strings |
| `commandsRun` | What was executed and pass/fail/skipped |
| `filesChanged` | Scope surface for review routing |

If any **required** rubric item for the status is missing or empty where forbidden, the orchestrator SHOULD **not** reconcile — request rework or mark assignment for fix-up.

---

## 3. Terminal statuses

Source: contracts §2.9; foundation §9.

| Status | Worker intent | Orchestrator default action |
| --- | --- | --- |
| **`completed`** | All in-scope acceptance criteria met; deliverable ready | **Reconcile** assignment; advance phase queue |
| **`blocked`** | External dependency or policy gate prevents progress | **Block** assignment; create/link blocker task; **do not** reconcile as success |
| **`partial`** | Meaningful progress; scope intentionally incomplete | Extend assignment, split follow-up task, or reconcile with documented gap |
| **`failed`** | Attempted work did not meet gates (e.g. check failed) | Assign fix-up, cancel, or supersede — **do not** reconcile as success |
| **`needs_review`** | Worker believes done but human/schema review required before reconcile | Route to maintainer review; hold reconcile until sign-off |

Assignment lifecycle statuses (`assigned`, `submitted`, `blocked`, `reconciled`, `cancelled`) remain on the **assignment row** — Handoff v2 `status` describes **worker outcome**, not the assignment state machine (contracts §3, architecture §4).

---

## 4. Validation rubric

Use this checklist **before** `reconcile-assignment` or when reviewing worker output in WP-4 commands. Future strict validation (contracts §8) will encode subsets of this rubric.

### 4.1 Universal (all statuses)

| # | Rule | Pass when | Fail code (future) |
| --- | --- | --- | --- |
| U1 | `schemaVersion === 2` | Present and exactly `2` | `invalid-handoff-schema-version` |
| U2 | Required fields | `assignmentId`, `agentId`, `status`, `summary`, `evidenceRefs` present; `summary` non-empty | `handoff-v2-missing-field` |
| U3 | Unknown keys | No extra top-level keys (strict mode) | `handoff-v2-unknown-field` |
| U4 | `status` enum | One of §3 statuses | `handoff-v2-invalid-status` |
| U5 | Summary compactness | ≤ **500 characters**; no transcript paste; no multi-paragraph log dump | _(advisory — human rubric)_ |
| U6 | `nextRecommendedAction` | Non-empty string naming **one** concrete next step for orchestrator or human | _(advisory unless status-specific)_ |
| U7 | Identity consistency | `assignmentId` matches assignment row; `agentId` matches worker instance | _(orchestrator reconcile guard)_ |

### 4.2 Status-specific requirements

| Status | Required beyond §4.1 | Forbidden / warn |
| --- | --- | --- |
| **`completed`** | `acceptanceCriteria` covers task AC with majority `passed`; `commandsRun` includes primary gate (e.g. `pnpm run check`) with `passed` when code touched; `blockers` empty | Reconcile if any AC `failed` without documented waiver |
| **`blocked`** | `blockers` ≥ 1 with `summary`; `nextRecommendedAction` names unblock owner; failed `commandsRun` entry explains gate | Empty `blockers`; `status: completed` |
| **`partial`** | At least one `acceptanceCriteria` entry `partial` or `failed`; `nextRecommendedAction` names follow-up (extend vs new task) | Claiming all AC `passed` |
| **`failed`** | At least one `commandsRun` or AC with `failed`; `risks` or summary explains blast radius | `evidenceRefs` only success tokens |
| **`needs_review`** | `nextRecommendedAction` routes to human (§10 sign-off, schema review, etc.); optional `acceptanceCriteria` `partial` for sign-off pending | Orchestrator auto-reconcile without review |

### 4.3 Orchestrator decision matrix

| Handoff `status` | Allowed reconcile? | Typical follow-up |
| --- | --- | --- |
| `completed` | Yes | `reconcile-assignment`; queue next ready task |
| `blocked` | No | `block-assignment`; spawn blocker task; notify human |
| `partial` | Policy choice | Extend scope, new assignment, or reconcile with documented debt |
| `failed` | No | Fix-up assignment or `cancel-assignment` |
| `needs_review` | No until review | Maintainer approval; then worker resubmits `completed` or orchestrator reconciles |

---

## 5. Compactness rules

Foundation principle §5: handoffs are **useful, not bloated**.

### 5.1 Do

- Write `summary` as **one tight paragraph** (what changed, outcome, blockers if any).
- Use **`evidenceRefs`** as stable tokens: `check:pnpm-run-check`, `test:dashboard-agent-activity-summary`, `pr:org/repo#123`, `task-sync-publish:…`.
- List **`filesChanged`** with repo-relative paths and short `reason` (implementation intent, not diff narration).
- Report **`commandsRun`** as command + status + one-line `summary` (exit context, not full stdout).
- Map task acceptance criteria verbatim into **`acceptanceCriteria[].criterion`** with `status` + short `evidence` pointer.

### 5.2 Do not

- Paste chat turns, tool call logs, or stack traces into `summary`.
- Duplicate entire test output in handoff fields — reference via `evidenceRefs`.
- Use `summary` for step-by-step narration (“first I ran… then I edited…”).
- Exceed **20** `filesChanged` rows without collapsing to directory-level entries + PR link.
- Omit `nextRecommendedAction` (“done” is not an action — say **who does what next**).

### 5.3 Size guidance (advisory)

| Field | Soft limit |
| --- | --- |
| `summary` | 500 characters |
| Each `blockers[].summary` | 200 characters |
| Each `risks[].risk` | 200 characters |
| `nextRecommendedAction` | 300 characters |
| Total serialized handoff | ~8 KB (orchestrator-friendly JSON) |

---

## 6. Evidence requirements

### 6.1 `evidenceRefs` vocabulary

Pipe-delimited or colon-separated **stable refs** the orchestrator and dashboard can grep:

| Prefix | Example | Meaning |
| --- | --- | --- |
| `check:` | `check:pnpm-run-check` | Repo gate passed |
| `check:` | `check:pnpm-run-check:failed` | Repo gate failed |
| `test:` | `test:dashboard-agent-activity-summary` | Named test target |
| `pr:` | `pr:workflow-cannon#601` | Pull request evidence |
| `pr:` | `pr:pending` | PR not yet opened |
| `task-sync-publish:` | `task-sync-publish:task.created-backfill` | Git-canonical task-state event |

`evidenceRefs` **may be empty** for early partial handoffs but SHOULD be populated before `completed` or `needs_review`.

### 6.2 `acceptanceCriteria[].evidence`

Short pointer to doc section, test file, PR, or command — not prose justification. Example: `"evidence": "AGENT_ORCHESTRATION_HANDOFF.md §7.1"`.

### 6.3 `commandsRun`

| `status` | When to use |
| --- | --- |
| `passed` | Command succeeded |
| `failed` | Command failed and contributed to blocked/failed handoff |
| `skipped` | Intentionally not run (document why in `summary`) |
| `not_run` | Out of scope or blocked before execution |

---

## 7. Examples by status (machine-readable)

Canonical JSON Schema: `schemas/agent-orchestration/handoff.v2.json`.

Fixtures exist at **two paths** (same content — `handoff-v2/` is the WBS-AO-060 layout):

| Status | Parent fixture | `handoff-v2/` copy |
| --- | --- | --- |
| `completed` | `fixtures/agent-orchestration/handoff-completed.v2.json` | `fixtures/agent-orchestration/handoff-v2/handoff-completed.v2.json` |
| `blocked` | `fixtures/agent-orchestration/handoff-blocked.v2.json` | `fixtures/agent-orchestration/handoff-v2/handoff-blocked.v2.json` |
| `partial` | `fixtures/agent-orchestration/handoff-partial.v2.json` | `fixtures/agent-orchestration/handoff-v2/handoff-partial.v2.json` |
| `failed` | `fixtures/agent-orchestration/handoff-failed.v2.json` | `fixtures/agent-orchestration/handoff-v2/handoff-failed.v2.json` |
| `needs_review` | `fixtures/agent-orchestration/handoff-needs-review.v2.json` | `fixtures/agent-orchestration/handoff-v2/handoff-needs-review.v2.json` |

Contract pack embeds the same payloads in [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) §7.5.

### 7.1 `completed` — reconcile-ready success

**Fixture:** `fixtures/agent-orchestration/handoff-v2/handoff-completed.v2.json`

Key signals: all AC `passed`, gate command `passed`, empty `blockers`, `nextRecommendedAction` advances queue.

### 7.2 `blocked` — external gate

**Fixture:** `fixtures/agent-orchestration/handoff-v2/handoff-blocked.v2.json`

Key signals: `blockers` with `taskId` + `severity`, failed transition command in `commandsRun`, explicit orchestrator unblock step.

### 7.3 `partial` — deliberate scope stop

**Fixture:** `fixtures/agent-orchestration/handoff-v2/handoff-partial.v2.json`

Key signals: mixed AC statuses, `nextRecommendedAction` names follow-up assignment.

### 7.4 `failed` — quality gate failure

**Fixture:** `fixtures/agent-orchestration/handoff-v2/handoff-failed.v2.json`

Key signals: failed check in `commandsRun`, AC `failed`, `risks` note downstream impact.

### 7.5 `needs_review` — human gate before reconcile

**Fixture:** `fixtures/agent-orchestration/handoff-v2/handoff-needs-review.v2.json`

Key signals: `needs_review` status, AC `partial` for pending sign-off, route to maintainer in `nextRecommendedAction`.

---

## 8. Next-action requirements

Every handoff MUST include **`nextRecommendedAction`** — a single imperative sentence:

| Status | Pattern |
| --- | --- |
| `completed` | “Proceed to **&lt;next task/artifact&gt;**” or “Human sign-off on **&lt;artifact&gt;**; then **&lt;task id&gt;**.” |
| `blocked` | “Orchestrator: **&lt;unblock step&gt;**, then resume worker.” |
| `partial` | “Assign **&lt;follow-up&gt;** or extend this assignment for **&lt;remaining scope&gt;**.” |
| `failed` | “Orchestrator: assign fix-up or cancel assignment — **&lt;reason&gt;**.” |
| `needs_review` | “Route to maintainer for **&lt;review type&gt;** (§10.2).” |

Avoid vague actions: “let me know”, “done”, “see above”.

---

## 9. Worker submission notes (v1 design)

Implementation is **T-AO-410** — this section records design intent only.

- Workers call **`submit-assignment-handoff`** with Handoff v2 body; v1 `{ schemaVersion: 1, summary, evidenceRefs? }` remains valid (A-COMPAT §3.1).
- Workers MUST NOT self-**`reconcile-assignment`** or self-unblock.
- On blocker: prefer **`status: blocked`** + `blockers[]` over silent stall; create linked blocker task per A-POLICY when policy allows.
- Activity lease (`AgentActivity`) is **live state**, not a substitute for handoff — handoff is terminal evidence.

---

## 10. Verification and human approval

### 10.1 Acceptance mapping (T100629 / A-HANDOFF)

| Criterion | Section |
| --- | --- |
| Orchestrator can reconcile using handoff without reading full transcript | §2, §4.3 |
| Handoff examples are machine-readable JSON | §7, fixtures |
| Compactness guidance prevents transcript dumps | §5 |

### 10.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-HANDOFF / `AGENT_ORCHESTRATION_HANDOFF.md` |
| Reviewer | _pending_ |
| Decision | ☐ Approve as written &nbsp; ☐ Approve with notes &nbsp; ☐ Reject — revise |
| Notes | |
| Date | |

Dependent tasks (**T-AO-410**, **T-AO-420**, **T-AO-520**) should treat Handoff v2 validators and reconcile surfacing as **draft** until the table above records approval.

### 10.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| Aligns with foundation §9 shape and statuses | §3, §7 |
| Aligns with contracts §7 required/optional fields | §4, §6 |
| JSON Schema at `schemas/agent-orchestration/handoff.v2.json` referenced | §1, §7 |
| All five status fixtures present under `handoff-v2/` | Yes |
| Parent fixtures preserved for contracts §7.5 | Yes |
| Validation rubric covers each status | §4.2 |
| Compactness and evidence rules documented | §5, §6 |
| Next-action requirements documented | §8 |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100629-orchestration-handoff) |

---

## 11. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product intent (§9 Handoff v2) |
| [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) | Field tables, enums, embedded examples (§7) |
| [AGENT_ORCHESTRATION_COMPAT.md](./AGENT_ORCHESTRATION_COMPAT.md) | Handoff v1 fallback (§3.1) |
| [AGENT_ORCHESTRATION_TASKS.md](./AGENT_ORCHESTRATION_TASKS.md) | WBS T-AO-060 and downstream tasks |
| `schemas/agent-orchestration/handoff.v2.json` | JSON Schema |
| `fixtures/agent-orchestration/handoff-v2/**` | WBS-AO-060 golden JSON |
| `src/modules/team-execution/assignment-store.ts` | Handoff v1 validator (today) |

---

## 12. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-HANDOFF for Phase 126 / T100629 |
