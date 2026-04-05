# Playbook: improvement task discovery

**Playbook id:** `improvement-task-discovery`  
**Use when:** Researching friction and **logging** work as **`type: "improvement"`** tasks (or running the recommendation pipeline) — not shipping a feature slice.

Compose by reference; do **not** duplicate full improvement-module or transcript contracts.

## 0) Scope and evidence

- **Goal:** A **problem report** (clear symptom + impact), **supporting reasoning** (why you believe this is the issue—not a raw chat dump), and **evidence refs** (paths, command output snippets, transcript paths, PR links).
- **Do not** paste entire transcripts, thread logs, or tool traces into the task body or `metadata` as the “improvement.” **Research first**, then **synthesize**: state the interpreted problem, who it hurts, and what change class would address it.
- **Policy:** Tier **B** `workspace-kit run` commands (**`generate-recommendations`**, **`ingest-transcripts`**, etc.) need JSON **`policyApproval`** on the **third** argument — see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) and [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).
- **Terms:** [`TERMS.md`](../TERMS.md) → **Improvement Task** vs execution tasks; improvement **operational** state vs normal task rows where applicable.

## 1) Agent sessions and transcripts

- **Cursor / agent transcripts** (if available in workspace): retries, abandoned paths, **policy-denied** or approval confusion, wrong CLI, user corrections (“actually run X”), long detours, missing `@` context.
- **Runbooks:** [`runbooks/cursor-long-session.md`](../runbooks/cursor-long-session.md), [`runbooks/cursor-transcript-automation.md`](../runbooks/cursor-transcript-automation.md) — alignment with how transcripts feed **`ingest-transcripts`** / recommendations.

## 2) Documentation and discoverability

- Drift: **README** vs **ROADMAP** vs **AGENTS** vs **task-engine** behavior; broken or stale links; **FEATURE-MATRIX** vs shipped reality.
- **AGENT-CLI-MAP** / **CLI-VISUAL-GUIDE** gaps for real **`operationId`** flows; instructions under `src/modules/*/instructions/` missing or misleading.
- **`.cursor/rules/`** vs `docs/maintainers/` policy contradictions; requestable vs always-on bloat.

## 3) Architecture and code quality

- Module boundaries (`module-build`, **ARCHITECTURE**), router/policy surfaces, error messages operators see, deterministic vs flaky tests.
- **Consumer parity** pain: [`runbooks/parity-validation-flow.md`](../runbooks/parity-validation-flow.md), fixture smoke, native deps (**`better-sqlite3`**) on CI.

## 4) Configuration, policy, and task engine UX

- Layered config surprises, **`doctor`** failures, SQLite vs JSON persistence operator stories.
- **`run-transition`** ergonomics, dependency guards, queue summaries — anything that makes maintainers hand-edit or bypass CLI.

## 5) Release and operations

- [`RELEASING.md`](../RELEASING.md) gate friction, changelog/process gaps, npm/GitHub Actions evidence capture (see **Post-release** / follow-up bullets there).

## 6) Log the outcome (problem report, not raw research)

When you **persist**, the task must read like an **improvement request** / **problem report**, not a research scratchpad.

**Manual logging (`create-task`):**

- Use a normal **`T###`** id (same pattern as execution tasks). Pick the next free id from **`list-tasks`** / your planning source of truth.
- Set **`type`: `"improvement"`**, non-empty **`technicalScope`** and **`acceptanceCriteria`**, plus:
  - **`metadata.issue`** — concise problem statement (symptom + impact).
  - **`metadata.supportingReasoning`** — why this is the right framing; cite evidence refs (paths, commands, transcript file paths)—**not** pasted raw logs.
- Optional: **`approach`**, **`metadata.proposedSolutions`** (string array) for candidate fixes.

**Pipeline (`generate-recommendations` / `ingest-transcripts`):**

- Allocates the next **`T###`** for each new improvement row, dedupes by **`metadata.evidenceKey`**, and fills **`metadata.issue`**, **`metadata.supportingReasoning`** (heuristic + provenance summary), **`metadata.proposedSolutions`**, **`approach`**, **`technicalScope`**, **`acceptanceCriteria`**.

**Operational habit (log regularly):**

- Run **`ingest-transcripts`** (with **`policyApproval`**) on a **cadence** that fits the team—e.g. end of maintainer sessions, daily CI, or after heavy agent work—so signals are not only in chat. Set **`improvement.cadence.skipIfNoNewTranscripts`** to **`false`** if you want **`ingest-transcripts`** to still run recommendation scoring when policy/diff/task-transition evidence exists even though no new transcript files synced. Use **`improvement.hooks.afterTaskCompleted`**: **`sync`** or **`ingest`** to tie transcript sync to completed execution tasks (see **`docs/maintainers/runbooks/cursor-transcript-automation.md`**).

## Related

- **Requestable Cursor rule:** `.cursor/rules/playbook-improvement-task-discovery.mdc`
- **Promote backlog to `ready`:** [`improvement-triage-top-three.md`](./improvement-triage-top-three.md)
- **Which id / type to create:** [`runbooks/wishlist-workflow.md`](../runbooks/wishlist-workflow.md)
- **Enhancement direction (high level):** `.ai/PRINCIPLES.md` trade-off order
