# Pilot: task-flow subagent bundle (Phase 64)

## Protocol

1. Attach **`.cursor/rules/playbook-task-flow-subagent.mdc`** (or open the **task-flow-subagent-delivery** skill) before a **synthetic** **`T###`** rehearsal: **`get-next-actions`**, **`run-transition` `start`**, branch from **`release/phase-<N>`**, trivial commit, **`run-transition` `complete`** with JSON **`policyApproval`** and **`expectedPlanningGeneration`** when policy **`require`**.
2. Note friction: missed transition, wrong approval lane, missing **`expectedPlanningGeneration`**, context overload.

## Observed outcome (synthetic rehearsal)

- **Before:** Checklist spread across multiple `.ai` paths; easy to skip **`start`** before coding or omit **`policyApproval`** when policy **`require`**.
- **After:** Single rule/skill bundles links to **task-to-phase-branch** + **AGENT-CLI-MAP** + **POLICY-APPROVAL**; pilot run stayed on **`wk run`** JSON shapes with no chat-only approval claims.

## Follow-ups

- None blocking; optional tighten **response templates** for checkpoint commands if maintainers want richer **`presentation`** blocks.
