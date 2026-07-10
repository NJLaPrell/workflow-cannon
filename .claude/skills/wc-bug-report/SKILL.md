---
name: Workflow Cannon bug report
description: Fire-and-forget bug-reporter child — structured parent handoff, cheap composer-2.5 filing, rich evidence bounds, no refactor/investigation sprawl.
tags: workflow-cannon, bug-report, improvement, task-type:improvement, fire-and-forget
---

# wc-bug-report

Use when a coding agent hits Workflow Cannon / agent friction and should **file a proposed improvement** without burning the parent session. Parent stays tiny; child does bounded evidence enrichment and files once.

**Suggested skillIds:** `wc-bug-report`

## When to use

- CAE / operator nudge says spawn a bug-reporter (or you decide friction is worth a durable task).
- You have a short symptom + optional crumbs (`relatedTaskId`, command, exit code) — not a full investigation write-up.
- You must **not** await the child; parent continues immediately (file-and-forget).

## Parent vs child budgets

| Role | Workflow effort | AI usage | Allowed actions |
| --- | --- | --- | --- |
| **Parent** | Decide to file → fill handoff → one background spawn | Tiny incremental tokens on the (often expensive) parent model | Structured handoff + spawn only; **no** `file-bug-report` / `report-defect` on the happy path; **no** await/poll |
| **Child** | One short filing job | Default **`composer-2.5`** (`cheap_fast`); low thinking | Skill-bound; **≤3 tools**; prefer `file-bug-report` when shipped, else `report-defect`; optional `recommend-model` when handoff is thin |

**Success bar:** parent incremental tokens ≪ inline `report-defect` on the parent; child is a short cheap job; duplicate filings are replay-cheap via `clientMutationId` / `evidenceKey`.

## Parent handoff schema (required)

Do **not** hand the child a free-prose blob. Emit this structured handoff (JSON in the spawn prompt is fine):

```json
{
  "schemaVersion": 1,
  "skillId": "wc-bug-report",
  "symptom": "one-sentence what broke or friction felt",
  "command": "pnpm exec wk run <command> '{...}' (optional)",
  "code": "exit code or kit error code (optional)",
  "remediationHint": "what you already tried or suspect (optional, one line)",
  "relatedTaskId": "T### (optional)",
  "evidenceCrumbs": ["short quote or path — not a dump (optional)"],
  "clientMutationId": "stable idempotency key (recommended)"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `symptom` | yes | Becomes the problem statement / `summary` / `metadata.issue` |
| `command` | no | Exact CLI or host action that failed |
| `code` | no | Kit `code`, HTTP status, or process exit |
| `remediationHint` | no | One-line hint — not a redesign |
| `relatedTaskId` | no | Links filing to an in-flight task |
| `evidenceCrumbs` | no | ≤5 short strings; no secrets; no multi-KB logs |
| `clientMutationId` | recommended | Stable hash/key so retries are idempotent |

**Thin / ambiguous handoff:** missing `symptom`, only vague prose, or no actionable crumbs → child must call `recommend-model` to escalate before filing (see Model).

## Fire-and-forget spawn contract (platform-agnostic)

Host executes the child. Kit `spawn-subagent` only records provenance — it does **not** wait for completion.

### Happy path (any host with background agents)

1. Build the handoff schema above.
2. Optionally record provenance: `pnpm exec wk run spawn-subagent '{"subagentId":"wc-bug-reporter","promptSummary":"<symptom>","hostHint":"<cursor|cli|other>","policyApproval":{"confirmed":true,"rationale":"bug-report spawn provenance"}}'` (recommended, not blocking for v1).
3. Spawn a **background** child with this skill applied (`wc-bug-report`), default model **`composer-2.5`**, prompt = handoff JSON.
4. **Do not** await, poll, or `AwaitShell` the child. Continue parent work.

### Host adapters (v1)

| Host | Spawn shape | Notes |
| --- | --- | --- |
| **Cursor** | Task tool: `run_in_background: true`, `subagent_type: "generalPurpose"`, `model: "composer-2.5"`, prompt = handoff | Full path |
| **CLI / headless** | Run the child filing command directly (see CLI fallback) when no background Task exists | Full path |
| **Antigravity / VS Code Copilot** | Same contract: background agent + handoff JSON when the host supports it; otherwise CLI fallback | Documented stub — do not hard-code host APIs in module core |

### CLI fallback (when background spawn is unavailable)

Parent (or a thin wrapper) runs filing directly — still **proposed-only**, still structured evidence:

```bash
# Prefer when T100856 has shipped file-bug-report:
pnpm exec wk run file-bug-report '{"title":"<short>","summary":"<symptom>","evidence":"<crumbs>","relatedTaskId":"T###","clientMutationId":"<key>","policyApproval":{"confirmed":true,"rationale":"file bug from wc-bug-report fallback"}}'

# Until file-bug-report ships, use report-defect:
pnpm exec wk run report-defect '{"title":"<short>","summary":"<symptom>","evidence":"<crumbs>","relatedTaskId":"T###","clientMutationId":"<key>","policyApproval":{"confirmed":true,"rationale":"file bug from wc-bug-report fallback"}}'
```

Pass `expectedPlanningGeneration` when `tasks.planningGenerationPolicy` is `require` (read it first, or use a one-shot command that auto-reads when available).

## Child: rich-evidence steps (bounded)

Child may enrich evidence **only** within these bounds — then file once and stop.

1. **Parse handoff** — require `symptom`; map fields into title / summary / evidence.
2. **Thin-handoff gate** — if handoff is thin/ambiguous, run:
   ```bash
   pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","ambiguity":"high","scopeBreadth":"low","taskTypeHints":["bug-report","thin-handoff"]}'
   ```
   Use the returned primary slug (escalate off bare `composer-2.5` only for this run). Do **not** turn into a research agent.
3. **Enrich (≤3 tool calls total, including recommend-model + file)** — optional crumbs only:
   - Re-read a **named** log/path from `evidenceCrumbs` (small excerpt).
   - `get-task` when `relatedTaskId` is set (status/title only).
   - Do **not** search the repo, open PRs, or “just check one more thing.”
4. **File once** — `file-bug-report` when available, else `report-defect`:
   - `type` / outcome: **improvement @ `proposed` only** (never `ready`, never execution `workspace-kit` delivery).
   - Map rich fields: symptom → `summary` / `metadata.issue`; crumbs + code/command → `evidence` / `metadata.supportingReasoning`.
   - Include `clientMutationId` / evidence key when provided.
5. **Stop** — return a one-line receipt (`taskId` or idempotent replay). No follow-up investigation.

## Model

- **Default child model:** `composer-2.5` (`cheap_fast` / low complexity+risk+scope).
- **Escalate-on-thin-handoff:** when handoff lacks `symptom` structure or is ambiguous, call **`recommend-model`** (see step 2) and use its primary slug for that child run only.
- Pin low thinking; do not self-upgrade to high-reasoning for curiosity.

## Hard bans

- **No refactor** of product or kit code from this skill.
- **No unrelated investigation** (no broad codebase search, no “while I’m here”).
- **No await** of the child from the parent (breaks file-and-forget).
- **No filing as `ready`** or non-improvement types.
- **No secrets** in handoff, evidence, or task bodies.
- **No** treating chat approval as `policyApproval` on `wk run`.

## Kit commands

- Discover: `pnpm exec wk run list-skills '{}'`
- Apply body: `pnpm exec wk run apply-skill '{"skillId":"wc-bug-report"}'` (preview default)
- Model tier: `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` when handoff is rich
- Provenance (optional): `pnpm exec wk run spawn-subagent '{...}'`
- File: `file-bug-report` (module command when shipped) or `report-defect`

## Dual-install / discovery

- **Module source (authoritative copy):** `src/modules/agent-bug-reporting/skills/wc-bug-report/`
- **Claude / kit discovery mirror:** `.claude/skills/wc-bug-report/` (default `skills.discoveryRoots`)
- Keep mirrors in sync; do **not** add the module skills directory to `skills.discoveryRoots` while the `.claude` mirror exists (duplicate id fails closed).

## Verify checklist

- [ ] `list-skills` includes `wc-bug-report`
- [ ] Parent handoff schema + budgets documented above
- [ ] Default `composer-2.5` + escalate via `recommend-model` on thin handoff
- [ ] Platform-agnostic spawn + CLI fallback documented
- [ ] Hard bans on refactor / unrelated investigation present
