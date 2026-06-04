<!--
agentCapsule|v=1|command=assignment-reconciliation-preflight|module=team-execution|schema_only=pnpm exec wk run assignment-reconciliation-preflight --schema-only '{}'
-->

# assignment-reconciliation-preflight

```bash
workspace-kit run assignment-reconciliation-preflight '{"assignmentId":"<id>","supervisorId":"alice"}'
```

Read-only supervisor preflight for a submitted worker handoff JSON. Returns a bounded verdict packet so the orchestrator can decide whether reconciliation is safe without expanding raw diffs, full logs, or long-form handoff prose by default.

Preflight treats Handoff v2 JSON as the source of truth: **`filesChanged`** drives path safety, **`commandsRun`** drives validation coverage, **`acceptanceCriteria`** drives task acceptance coverage, and **`status`** / **`blockers`** / **`risks`** drive follow-up verdicts. Handoff **`summary`** is returned as compact prose context and checkpoint seed only.

Verdicts:

- `ready_to_reconcile`
- `needs_worker_followup`
- `needs_orchestrator_review`
- `needs_user_decision`
- `unsafe`

Key response fields:

- `reasons` — compact machine-readable classification reasons.
- `compactEvidence.refs` — bounded evidence refs from the stored handoff.
- `compactEvidence.fileChangeSummary` — touched-path counts and categorized samples.
- `compactEvidence.validationSummary` — required, missing, and failed validation commands.
- `compactEvidence.acceptanceSummary` — missing or unresolved task acceptance criteria.
- `reconciliation.checkpointDraft` — checkpoint seed for a clean follow-on `reconcile-assignment` call.

Stable read-path errors: `assignment-not-found`, `assignment-authority-denied`, `task-not-found`.
