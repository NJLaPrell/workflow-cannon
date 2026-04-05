# Playbook: improvement triage — top 3 to ready queue

**Playbook id:** `improvement-triage-top-three`  
**Use when:** Reviewing **`type: "improvement"`** backlog items and promoting **at most three** into the **`ready`** queue (so they appear in **`get-next-actions`** / planning surfaces alongside other **`ready`** work).

Does **not** replace human judgment on release or policy — it structures **selection** and **Tier A** transitions.

## 0) Inventory (read-only)

1. List improvement candidates (adjust filters as needed):

```bash
workspace-kit run list-tasks '{"type":"improvement","status":"proposed"}'
```

2. Optionally widen the lens (e.g. **`ready`** improvement tasks you are **re-ranking**, or **`blocked`** with clear unblock paths):

```bash
workspace-kit run list-tasks '{"type":"improvement"}'
```

3. `workspace-kit run get-next-actions '{}'` — see current **`ready`** queue mix; avoid flooding it.

Use **`get-task`** for any id you might promote to confirm **`dependsOn`**, metadata, and acceptance text.

## 1) Shortlist with a consistent rubric

Score **mentally or in notes** (no required schema). Prefer items that:

1. **Principles** — Advance [`.ai/PRINCIPLES.md`](../../../.ai/PRINCIPLES.md) order: safety/trustworthiness and correctness before convenience; flag anything that weakens policy or approval posture unless explicitly accepted risk.
2. **Evidence** — Strong `metadata` / provenance (transcript, CI log, doc path); deprioritize vague titles with no repro or reference.
3. **Impact** — Operator or agent time saved, fewer foot-guns, clearer governance, or measurable reliability.
4. **Cost / risk** — Small, reversible changes beat speculative rewrites unless risk is explicitly owned.
5. **Dedupe** — Skip or merge if a **`ready`** / **`in_progress`** task already covers the same fix (check titles + `metadata.evidenceKey` when present).
6. **Phase / roadmap** — Favor alignment with [`ROADMAP.md`](../ROADMAP.md) and [`workspace-kit-status.yaml`](../data/workspace-kit-status.yaml) focus; note explicit conflicts for maintainers.

Pick **up to three** ids. It is valid to pick **zero** if nothing clears the bar.

## 2) Document the decision

Before mutating lifecycle, write a short **triage summary** (PR comment, issue, session log, or maintainer note): the three (or fewer) ids, **one line why each**, and **explicit passes** (what you considered but did not promote).

## 3) Promote to **`ready`** (Tier A)

For each selected task that is still **`proposed`**, **`accept`** → **`ready`** with JSON **`policyApproval`** ([`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md)):

```bash
workspace-kit run run-transition '{"taskId":"imp-xxxxxxxx","action":"accept","policyApproval":{"confirmed":true,"rationale":"Top-3 improvement triage — evidence/impact per playbook rubric"}}'
```

Replace **`imp-xxxxxxxx`** with the real id. **Do not** hand-edit the task store for lifecycle.

If a candidate is already **`ready`**, no transition — optionally **`update-task`** for **`priority`** / notes only if your workflow uses that.

## 3.5) Normalize **`ready`** improvements before **`start`** (hygiene)

If a **`ready`** improvement still reads like ingest noise (trace title, missing **`phaseKey`**, generic acceptance), use **`update-task`** before **`start`** to add **`phaseKey`** (or explicit human **`phase`**), a single-string **`approach`**, non-empty **`technicalScope`** / **`acceptanceCriteria`**, and structured **`metadata.issue`** / **`metadata.supportingReasoning`**. In relational SQLite, **`approach`** is **TEXT** — pass **one string**, not an array (use **`technicalScope`** or **`description`** for bullets).

Worked example (session transcript): **`agent-transcripts/e74c4ba0-83e7-41d8-9e5d-3620929354a6/**`.

## 4) Verify

1. `workspace-kit run list-tasks '{"type":"improvement","status":"ready"}'` — confirm promoted items.
2. `workspace-kit run get-next-actions '{}'` — new **`ready`** improvement tasks appear in **`readyQueue`** (wishlist intake excluded by engine rules).

## Related

- **Discovery / intake (where items come from):** [`improvement-task-discovery.md`](./improvement-task-discovery.md)
- **Requestable Cursor rule:** `.cursor/rules/playbook-improvement-triage-top-three.mdc`
- **Lifecycle contract:** `src/modules/task-engine/instructions/run-transition.md`
