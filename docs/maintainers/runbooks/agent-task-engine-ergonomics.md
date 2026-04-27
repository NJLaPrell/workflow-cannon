<!-- GENERATED FROM .ai/runbooks/agent-task-engine-ergonomics.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Agent task-engine ergonomics

Maintainer runbook for **agents and operators** who juggle Git, the Task Engine, planning output, and the Cursor extension. It consolidates guidance that repeatedly surfaced in Phase 27 transcript-backed **`imp-*`** work.

Canonical process remains: [`AGENTS.md`](../AGENTS.md), [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md), [`RELEASING.md`](../RELEASING.md).

## 0. Natural language → supported commands (exemplar map)

**Exemplar-only** — not an exhaustive catalog; maintainers trim stale rows. Full tiers and payloads: [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md). Feature slugs: generate **`FEATURE-TAXONOMY.md`** / registry via documented `export-feature-taxonomy-json` when needed.

| Operator says… | Start here |
| --- | --- |
| “What should I pick up next?” | `pnpm exec wk run get-next-actions '{}'` then `get-task` on the suggested id |
| “Is the ready queue consistent?” | `pnpm exec wk run queue-health '{}'`; optional `list-tasks` with `"includeQueueHints":true` |
| “Show me wishlist ideas” | `pnpm exec wk run list-wishlist '{}'` / `get-wishlist` — not default `get-next-actions` scope |
| “Team assignments / handoffs?” | `pnpm exec wk run list-assignments '{}'`; rollup: `dashboard-summary` |
| “Subagent sessions?” | `list-subagents`, `list-subagent-sessions`; rollup: `dashboard-summary` → `subagentRegistry` |
| “What phase are we on?” | `pnpm exec wk run phase-status '{}'`; add `{"includeTaskCounts":true,"includeDriftDetails":true}` for closeout audits |
| “Move the workspace phase?” | `pnpm exec wk run get-workspace-status '{}'`, then `set-current-phase` with `expectedWorkspaceRevision` |
| “Regenerate maintainer docs” | `generate-document` with `dryRun` first; batch: `document-project` — both Tier B for real writes |
| “Move task lifecycle” | `run-transition` with JSON `policyApproval` (+ `expectedPlanningGeneration` when policy `require`) |
| “SQLite / persistence broke” | `wk doctor`; consumer ladder: `docs/maintainers/runbooks/native-sqlite-consumer-install.md` |

## 1. Git merge is not task completion

**Problem:** A pull request can be merged while Task Engine rows still show **`ready`** or **`in_progress`**. Git history and task-engine state are independent sources of truth.

**Expectation:**

- After merged work satisfies a task’s acceptance criteria, run **`workspace-kit run run-transition`** with **`complete`** (Tier A, JSON **`policyApproval`**). See [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md).
- Do not infer **`completed`** from “PR merged” or from local **`git`** output alone.

**Transcript alignment:** `imp-5ba2f6a0c3bd4a` (`transcript:792c03b277fad3bdfd7fafbc0b5c079174f13b7b`).

## 1b. Incremental task hygiene (stay in sync while working)

**Problem:** Agents often leave tasks **`ready`** until merge, then only run **`complete`**. The queue and dashboards look idle while work is active.

**Expectation:**

- After **`get-task`** / **`list-tasks`**, if you are implementing this task and **`status`** is **`ready`**, run **`workspace-kit run run-transition`** with **`action":"start"`** before substantive edits or the **first implementation commit**. If already **`in_progress`**, continue.
- Pass **`expectedPlanningGeneration`** from the same JSON read when **`tasks.planningGenerationPolicy`** is **`require`** (see [`ADR-planning-generation-optimistic-concurrency.md`](../adrs/ADR-planning-generation-optimistic-concurrency.md)).
- Between **`start`** and **`complete`**, use **`workspace-kit run update-task`** for **`summary`**, **`description`**, **`approach`**, or **`metadata`** (e.g. PR link, milestone label) — the engine has no **`in_review`** status; mutable fields carry progress signals.
- If blocked on a human or external dependency, prefer **`run-transition`** **`block`** (then **`unblock`** when clear). To park work back on the queue, **`pause`** returns the task to **`ready`** per [`run-transition` instruction](../../../src/modules/task-engine/instructions/run-transition.md).

**Playbook:** ordered checklist in [`task-to-phase-branch.md`](../playbooks/task-to-phase-branch.md) (step **0b**).

## 2. Today’s code and task-engine state beat aspirational docs

**Problem:** Roadmaps, chat plans, and old phase labels can describe a *target* architecture that differs from the current tree or default persistence.

**Expectation:**

- For **what ships**, prefer **`workspace-kit doctor`**, **`workspace-kit run`** (no subcommand), module **`README`** files, and [`ARCHITECTURE.md`](../ARCHITECTURE.md) over narrative summaries.
- Default task persistence is **SQLite** when using kit defaults; JSON remains an explicit opt-out. See [`AGENTS.md`](../AGENTS.md) and task-engine **`config.md`**.
- When docs and code disagree, treat the discrepancy as a **doc bug** or a **tracked task**, not as permission to assume the older story.

**Transcript alignment:** `imp-6a07b608c1b752` (`transcript:17404c335f324980e3353bb3601f3ca92d8b9268`).

## 3. Read-only inspection of `.workspace-kit`

**Problem:** Agents sometimes mutate kit state by hand or skip discovery commands.

**Expectation:**

- **Read-only discovery:** `workspace-kit doctor`, `workspace-kit run list-tasks`, `workspace-kit run get-next-actions`, `workspace-kit run get-task`, `workspace-kit run explain-task-engine-model` (Tier C unless otherwise documented).
- **Phase snapshot:** `workspace-kit run phase-status '{}'` reads the canonical workspace phase, config drift, export freshness, and optional task counts. `workspace-kit run set-current-phase ...` is the happy-path phase mutation; it patches **`kit_workspace_status`** first, then aligns config hints and the non-authoritative export. Per-task **`phaseKey`** remains separate execution metadata.
- **Queue consistency (ready tasks):** `workspace-kit run queue-health '{}'` — one JSON payload for phase alignment vs canonical phase (**`kit_workspace_status`** when SQLite v10+, else **`kit.currentPhaseNumber`** fallback) plus **`ready`** rows whose **`dependsOn`** are not yet **`completed`**. Optional: `workspace-kit run list-tasks` with **`"includeQueueHints":true`** for per-row hints. See [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → **Queue health and ready-queue consistency**.
- **Merge ≠ done (heuristic):** `workspace-kit run queue-git-alignment '{}'` — read-only JSON comparing git HEAD commit time to the latest task transition plus stale **`in_progress`** hints. Independent of network; does not fix state. See [`ADR-task-queue-namespace.md`](../adrs/ADR-task-queue-namespace.md) for optional **`queueNamespace`** filters on **`get-next-actions`** / **`get-ready-queue`**.
- **Lifecycle changes:** only **`run-transition`** (and other documented mutators) with correct **`policyApproval`** tiering — not hand-edited `state.json` except documented recovery.

**Transcript alignment:** `imp-3bf93773a8c983` (`transcript:ae9aedbeb39d77297a12fc0b697ac6918a06bbaf`).

## 4. Planning engine → workable tasks

**Problem:** Operators confuse wishlist artifacts, planning sessions, and execution tasks.

**Expectation:**

- Use the planning module runbook: [`planning-workflow.md`](./planning-workflow.md) — especially **`build-plan`** with explicit **`finalize`** / wishlist flags when capturing decomposition.
- Convert wishlist-style outputs to execution work with **`convert-wishlist`** (or the current intake path for **`T###`** wishlist tasks, per [`ADR-unified-task-store-wishlist-and-improvement-state.md`](../adrs/ADR-unified-task-store-wishlist-and-improvement-state.md)).
- **`get-next-actions`** lists **execution** queue candidates; wishlist / intake items are governed by their own commands and filters.

**Transcript alignment:** `imp-a7dcdec79a791b` (`transcript:d298f9c6e0fee583eccc4a72da2cd9f05fbe216e`).

## 5. Improvement queue at a glance

**Problem:** Long lists of **`imp-*`** titles are hard to scan; agents re-derive context from chat.

**Expectation:**

- Run **`workspace-kit run get-next-actions '{}'`** for the prioritized head and full **`readyQueue`** payload.
- Filter improvements: **`workspace-kit run list-tasks`** with `{"type":"improvement",...}` (phase / status filters as needed). Examples in [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md).
- Promotion from **`proposed`** → **`ready`** follows [`improvement-triage-top-three.md`](../playbooks/improvement-triage-top-three.md) (at most three per triage pass).

**Transcript alignment:** `imp-190189d4b01bc1` (`transcript:41f6d2ae104f1f751a5a8effb70dab3d2ad5c606`).

## 6. Product language vs implementation map

**Problem:** Stakeholders ask for a “feature map” while engineers need task IDs and module boundaries.

**Expectation:**

- Product-oriented milestone table: [`FEATURE-MATRIX.md`](../FEATURE-MATRIX.md) (phase → capability → task coverage).
- Implementation and layering detail: [`ARCHITECTURE.md`](../ARCHITECTURE.md), module READMEs under `src/modules/*/README.md`.
- Keep FEATURE-MATRIX and [`ROADMAP.md`](../ROADMAP.md) phase/release wording aligned when closing a phase.

**Transcript alignment:** `imp-d3d2643f55fd43` (`transcript:a6877694cdfb1762abc19b7319b14ad86e450239`).

## 7a. Synthetic load harness (maintainers, opt-in)

**Script:** `node scripts/task-engine-synthetic-load.mjs [taskCount]` from repo root after `pnpm run build`. Not part of **`pnpm test`** — use locally or in optional CI to catch **`list-tasks`** regressions on large JSON stores. Exits non-zero if a single filtered list pass exceeds 30s.

## 7. Task-engine package surface vs large internal modules

**Problem:** `task-engine-internal.ts` is large; consumers need a stable import story.

**Expectation:**

- **Public integration surface:** `src/modules/task-engine/index.ts` — typed exports for **`TaskStore`**, **`TransitionService`**, **`getNextActions`**, wishlist helpers, planning store openers, and the **`taskEngineModule`** registration object.
- **Dispatch and command wiring** live in **`task-engine-internal.ts`** (and related files). Prefer importing from **`index.ts`** in other packages or tests unless you are editing the module implementation.

**Transcript alignment:** `imp-4cf9c424e5bfb2` (`transcript:5295b907609739616ee735747472151630762939`).

## 8. “Soft” collaboration layer vs policy and principles

**Problem:** Design chats mix **interaction style** (tone, depth, exploration) with **governance** (policy, approvals, release gates).

**Expectation:**

- **Hard layer:** `.ai/PRINCIPLES.md`, policy tiers, task acceptance criteria, [`RELEASING.md`](../RELEASING.md).
- **Soft layer:** **`agent-behavior`** profiles — advisory only, subordinate to principles. Canonical spec: [`plans/agent-behavior-module.md`](../plans/agent-behavior-module.md).
- On conflict, follow **PRINCIPLES** rule **R011** (soft-gate: state the conflict, confirm with the human).

**Transcript alignment:** `imp-f39584e6613337` (`transcript:552bf255395db672a565e13eccb5f6834690bd0a`).

## 9. Extension dashboard vs maintainer CLI

**Problem:** The Cursor extension shows aggregates; maintainers still need JSON contracts and playbooks.

**Expectation:**

- Extension is a **thin client** over **`workspace-kit run`** JSON (e.g. **`dashboard-summary`**). It does not replace [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) or instruction files under `src/modules/*/instructions/`.
- Deeper parity and roadmap for UI vs CLI: [`plans/extension-dashboard-parity-plan.md`](../plans/extension-dashboard-parity-plan.md).

**Transcript alignment:** `imp-d8ed5fa0b6c093` (`transcript:f5bc615dd46b727a8c7f95f709415ce5c10e143e`).

### Chat prefill (Cursor Composer)

**Intent:** Seed Composer with the same maintainer playbook text the docs describe, without retyping long **`@`** paths or CLI reminders.

**Surfaces:** Command palette (**Workflow Cannon: Prefill Chat — …** for wishlist intake, improvement triage, task-to-phase-branch). Dashboard **Chat** on open wishlist rows; **Accept** / **Chat** on **Proposed · improvements** and **Proposed · execution** rows (**Accept** → **`run-transition`** with modal rationale + **`expectedPlanningGeneration`** when required — same hygiene as Tasks DnD). Tasks tree context menu on an open wishlist row → same prefill as Dashboard **Chat** for that id.

**Mechanism:** Primary **`deeplink.prompt.prefill`** `{ text }`; fallback URI then clipboard + toast. Very long prompts may exceed URI limits. Non-Cursor VS Code may lack the deeplink command — clipboard fallback is expected.

**Playbooks:** [`wishlist-intake-to-execution.md`](../playbooks/wishlist-intake-to-execution.md), [`improvement-triage-top-three.md`](../playbooks/improvement-triage-top-three.md), [`task-to-phase-branch.md`](../playbooks/task-to-phase-branch.md). Source: `extensions/cursor-workflow-cannon/src/cursor-chat-prefill.ts`, `wishlist-chat-prompt.ts`, `playbook-chat-prompts.ts`.

## Optional: `suggestedNext` vs `get-task`

`get-next-actions` returns **`suggestedNext`** as a **full task record** for the queue head. Use **`get-task`** when you need a specific id after other mutations, historical context, or when **`suggestedNext`** is not the task you intend to implement. See [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → **Optional session opener**.

## Phase 27 evidence index

| Task id | evidenceKey (transcript hash) |
| --- | --- |
| `imp-5ba2f6a0c3bd4a` | `transcript:792c03b277fad3bdfd7fafbc0b5c079174f13b7b` |
| `imp-6a07b608c1b752` | `transcript:17404c335f324980e3353bb3601f3ca92d8b9268` |
| `imp-3bf93773a8c983` | `transcript:ae9aedbeb39d77297a12fc0b697ac6918a06bbaf` |
| `imp-a7dcdec79a791b` | `transcript:d298f9c6e0fee583eccc4a72da2cd9f05fbe216e` |
| `imp-190189d4b01bc1` | `transcript:41f6d2ae104f1f751a5a8effb70dab3d2ad5c606` |
| `imp-d3d2643f55fd43` | `transcript:a6877694cdfb1762abc19b7319b14ad86e450239` |
| `imp-4cf9c424e5bfb2` | `transcript:5295b907609739616ee735747472151630762939` |
| `imp-f39584e6613337` | `transcript:552bf255395db672a565e13eccb5f6834690bd0a` |
| `imp-d8ed5fa0b6c093` | `transcript:f5bc615dd46b727a8c7f95f709415ce5c10e143e` |

Verifiers can open the cited transcript paths from task metadata (`workspace-kit run get-task '{"taskId":"<imp-id>"}'`) and confirm this runbook addresses the same themes.
