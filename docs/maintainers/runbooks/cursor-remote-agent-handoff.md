<!-- GENERATED FROM .ai/runbooks/cursor-remote-agent-handoff.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Cursor background-agent handoff (take-over-in-Cursor)

Operator runbook for **asynchronous remote execution** where Workflow Cannon owns task linkage and evidence, and **Cursor** owns the remote machine and agent runtime.

**Phase 1 (T100334):** metadata schema + `list-remote-runs` read spec/stub only. Launch/sync automation is **manual** until Phase 2 adapters ship.

## Prerequisites

- Task **`T###`** is `in_progress` with Tier A `run-transition` `start` evidence.
- Familiarity with maintainer delivery: `.ai/playbooks/task-to-phase-branch.md`.
- ADR: `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md`.
- Metadata schema: `schemas/remote-run-metadata.v1.json`.

## Roles

| Role | Tooling |
| --- | --- |
| **Control plane** | Workflow Cannon task engine, `list-remote-runs`, future launch/sync commands |
| **Execution host** | Cursor background agent (cloud/isolated remote) |
| **Operator** | Cursor UI for handoff, follow-ups, and local take-over |

Workflow Cannon **does not** spawn background agents from the CLI in Phase 1 — same boundary as subagent registry (record + handoff, host launches).

## Workflow (Phase 1 — manual bridge)

### 1. Prepare the task

```bash
pnpm exec wk run get-task '{"taskId":"T###"}'
pnpm exec wk run completion-preflight '{"taskId":"T###"}'
```

Confirm acceptance criteria, phase branch, and policy gates before delegating remote work.

### 2. Launch in Cursor (operator)

In Cursor, start a **background agent** against the target repo/branch (phase integration branch or task branch per delivery playbook). Record externally until Phase 2 `launch-remote-run`:

- Cursor run/agent id (future `hostRunId`)
- Branch and base ref
- Start time and operator identity

### 3. Discover runs (kit read stub)

```bash
pnpm exec wk run list-remote-runs '{"taskId":"T###"}'
```

Phase 1 returns `persistence: "none"` and `runs: []` — use this command to verify CLI wiring. After Phase 2 persistence, the same argv lists stored rows.

### 4. Monitor and follow up

While the remote agent runs:

- Track status out-of-band (Cursor UI) — map to schema states: `running`, `needs_input`, `failed`.
- On `needs_input`, respond in Cursor or prepare take-over (step 5).
- Attach validation evidence to the task delivery path (`pnpm run check`, PR checks) independent of remote sync.

### 5. Take over in Cursor (handoff)

When the operator must **resume in the local editor**:

1. Open the Cursor session/run from the background-agent UI (deep link when available).
2. Confirm branch/worktree matches the task branch expectation.
3. Mark handoff intent in operator notes (Phase 2: `handoffState.handedOffAt`, `status: handed_off`).
4. Continue implementation locally; do **not** skip `run-transition` or JSON `policyApproval` on kit mutations.

**Handoff checklist**

- [ ] Same `taskId` (`T###`) as kit queue head or assigned task
- [ ] Branch matches `release/phase-<N>` or `task/<id>-…` convention
- [ ] Remote agent stopped or explicitly abandoned to avoid duplicate writers
- [ ] Lease/coordination: `workspace-edit-status` / `claim-workspace-edit-lease` if visible checkout is shared

### 6. Evidence and completion

Remote completion **does not** complete the kit task.

```bash
pnpm exec wk run harvest-delivery-evidence '{"taskId":"T###"}'
pnpm exec wk run completion-preflight '{"taskId":"T###"}'
pnpm exec wk run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"…"}}'
```

Include in completion rationale when applicable:

- PR URL / commit SHA (future `evidenceRefs` kind `pr_url` / `commit_sha`)
- Cursor run id (future `hostRunId`)
- Handoff note if work finished locally after take-over

## Phase 2 automation (deferred)

When `launch-remote-run` and SQLite persistence land:

1. Launch via Tier B JSON `policyApproval` — kit writes `remoteRunId` + `taskId` row.
2. Poll via `sync-remote-run` or dashboard worker.
3. Attach evidence via `attach-remote-run-evidence`.
4. `list-remote-runs` returns `persistence: "sqlite"`.

Do not implement Phase 2 commands without ADR approval and Cursor API contract review.

## Related

- Subagent registry (provenance-only): `.ai/runbooks/subagent-registry.md`
- Task delivery loop: `.ai/playbooks/task-to-phase-branch.md`
- CLI map Tier C: `.ai/AGENT-CLI-MAP.extended.md` → *Remote runs (Cursor background agents)*
