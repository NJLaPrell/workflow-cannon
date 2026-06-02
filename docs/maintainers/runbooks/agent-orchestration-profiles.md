<!-- GENERATED FROM .ai/runbooks/agent-orchestration-profiles.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Agent orchestration profile catalog runbook

**Artifact:** A-PROFILES-OPS
**Use when:** Choosing or reviewing access, context, and model profiles for Workflow Cannon orchestration.

This runbook is the operational companion to [AGENT_ORCHESTRATION_PROFILES.md](../../AGENT_ORCHESTRATION_PROFILES.md). Use it to keep profile selection explicit, narrow, and reviewable.

## What to select

- **Access profile** controls what the agent may mutate.
- **Context profile** controls what the agent may read to do the job.
- **Model profile** controls the cost and reasoning posture for the assignment.

## Standard v1 examples

```json
{
  "accessProfileId": "orchestrator_access_v1",
  "contextProfileId": "orchestrator_context_v1",
  "modelProfileId": "high_reasoning_or_balanced_v1"
}
```

```json
{
  "accessProfileId": "task_worker_strict_v1",
  "contextProfileId": "task_worker_context_v1",
  "modelProfileId": "balanced_or_cheaper_v1"
}
```

## Operational rules

- Never widen worker authority beyond `task_worker_strict_v1` without a documented policy change.
- Keep orchestration prompts explicit about role separation: orchestrators delegate, workers implement.
- Use host compatibility and capability metadata to prevent over-allocating sessions.
- Treat assignment metadata as a review surface, not a hidden implementation detail.

## Review checklist

- [ ] The selected profile ids exist in [AGENT_ORCHESTRATION_PROFILES.md](../../AGENT_ORCHESTRATION_PROFILES.md).
- [ ] The assignment metadata does not widen the worker surface.
- [ ] Host and capability expectations are consistent with the task scope.
- [ ] The model tier is the cheapest capable choice for the work.

## Sign-off

- [ ] Profile selection reviewed against the current task scope.
- [ ] Any override is documented in the assignment record.
