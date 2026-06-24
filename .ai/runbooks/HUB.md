# Runbooks routing hub

Symptom → **one** `.ai/runbooks/*.md` target (agents: prefer this table over directory enumeration).

| Need | Runbook |
| --- | --- |
| Task DB / SQLite read contract for agents | [`agent-task-db-contract.md`](./agent-task-db-contract.md) |
| Task-engine ergonomics (`list-tasks`, queues) | [`agent-task-engine-ergonomics.md`](./agent-task-engine-ergonomics.md) |
| CAE debug / trace | [`cae-debug.md`](./cae-debug.md) |
| CAE enforcement readiness | [`cae-enforcement-readiness.md`](./cae-enforcement-readiness.md) |
| GitHub-native `workspace-kit` invocation | [`github-workflow-cannon-invocation.md`](./github-workflow-cannon-invocation.md) |
| Install / attach Workflow Cannon to a repository | [`install-attach-workflow-cannon.md`](./install-attach-workflow-cannon.md) |
| Workspace status + SQLite authority | [`workspace-status-sqlite.md`](./workspace-status-sqlite.md) |
| Phase kickoff readiness (before rollover / delivery) | [`phase-kickoff-readiness.md`](./phase-kickoff-readiness.md) |
| Phase journal retention / phase-close defaults | [`phase-journal-retention.md`](./phase-journal-retention.md) |
| Response templates | [`response-templates.md`](./response-templates.md) |
| Agent presentation policy | [`agent-presentation-policy.md`](./agent-presentation-policy.md) |
| PlanArtifact v1 (draft → review → accept → finalize) | [`plan-artifact-workflow.md`](./plan-artifact-workflow.md) |
| Legacy planning interview (`build-plan`) | [`planning-workflow.md`](./planning-workflow.md) |
| Subagent registry | [`subagent-registry.md`](./subagent-registry.md) |
| Cursor background-agent handoff / take-over-in-Cursor | [`cursor-remote-agent-handoff.md`](./cursor-remote-agent-handoff.md) |
| Principal architectural review themes (cold start) | [`principal-architectural-review-themes.md`](./principal-architectural-review-themes.md) |
| Task persistence operator | [`task-persistence-operator.md`](./task-persistence-operator.md) |
| `git pull` / dirty `workspace-kit.db` / task-state hydrate | [`task-state-git-operator.md`](./task-state-git-operator.md) |
| Phase closeout + task store on `main` | [`phase-closeout-and-release.md`](../playbooks/phase-closeout-and-release.md) § **3a** |
| Agent onboarding / guidance | [`agent-guidance-onboarding.md`](./agent-guidance-onboarding.md), [`agent-playbooks.md`](./agent-playbooks.md) |

For **playbooks** (ordered procedure docs), use [`.ai/playbooks/README.md`](../playbooks/README.md).
