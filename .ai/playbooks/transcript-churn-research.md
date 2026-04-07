# Transcript churn research → proposed improvement

**Playbook id:** `transcript-churn-research`  
**Purpose:** Turn **`type: transcript_churn`**, **`status: research`** rows (usually from **`generate-recommendations`** / transcript friction) into real **`improvement`** problems in **`proposed`**, after you have read the evidence — not raw log dumps.

## Preconditions

- Inventory: `pnpm exec wk run list-tasks '{"status":"research","type":"transcript_churn"}'`
- Optional: `dashboard-summary` → **`transcriptChurnResearchSummary`**

## Steps

1. **Pick one row** (highest signal / operator priority). Open **`get-task`** for that **`T###`**; read **`metadata`**, transcript paths, and any **`metadata.issue`** forensics — treat forensics as a hint, not the final problem statement.
2. **Investigate** the underlying transcripts or code paths until you can state a concrete maintainer-facing problem (symptom, impact, scope) and how you would verify a fix.
3. **Promote** with **`synthesize-transcript-churn`**: supply **`synthesis.approach`**, non-empty **`technicalScope`** and **`acceptanceCriteria`**, and **`metadata.issue`** + **`metadata.supportingReasoning`** as your synthesized report. Pass **`policyApproval`** and **`expectedPlanningGeneration`** when policy **`require`** (see **`.ai/AGENT-CLI-MAP.md`**).
4. **After promotion**, the task is **`type: improvement`**, **`status: proposed`** — run normal **improvement triage** when you want it **`ready`**.

## Abandon

If the churn row is noise: **`run-transition`** with **`action":"reject"`** from **`research`** → **`cancelled`** (no type change).

## Do not

- Hand-edit SQLite / JSON task stores to flip type or status.
- Paste entire transcripts into **`metadata.issue`**; write a structured problem report instead.
