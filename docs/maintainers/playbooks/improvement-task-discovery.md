<!-- GENERATED FROM .ai/playbooks/improvement-task-discovery.md — edit that file; do not hand-edit this render (see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Playbook: improvement task discovery

**Playbook id:** `improvement-task-discovery`  
**Use when:** Researching friction and **logging** work as **`type: "improvement"`** tasks (or running the recommendation pipeline) — not shipping a feature slice.

Compose by reference; do **not** duplicate full improvement-module or transcript contracts.

## 0) Scope and evidence

- **Goal:** Named themes, concrete symptoms, and **evidence refs** (paths, command output snippets, transcript ids, PR links) — not vague complaints.
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

## 6) Log the outcome

- Prefer **`workspace-kit`** to create or refresh improvement work: e.g. **`create-task`** with `type: "improvement"` and structured acceptance criteria, and/or **`generate-recommendations`** with **`policyApproval`** per map — not chat-only “we should fix X.”
- Tie items to **evidence keys** / provenance when using the improvement pipeline ([`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → Tier **B** improvement commands).

## Related

- **Requestable Cursor rule:** `.cursor/rules/playbook-improvement-task-discovery.mdc`
- **Promote backlog to `ready`:** [`improvement-triage-top-three.md`](./improvement-triage-top-three.md)
- **Enhancement direction (high level):** `.ai/PRINCIPLES.md` trade-off order
