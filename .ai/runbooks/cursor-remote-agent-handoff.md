# Cursor background-agent handoff (take-over-in-Cursor)

Operator runbook for **asynchronous remote execution** where Workflow Cannon owns task linkage and evidence, and **Cursor** owns the remote machine and agent runtime via the **Cursor SDK**.

**Phase 1 (T100334):** metadata schema + `list-remote-runs` read spec/stub only. Launch/sync kit commands are **not** registered yet.

**Phase 2:** implement launch/sync against **`@cursor/sdk`** (TypeScript) or **`cursor-sdk`** (Python) per `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md`.

## Prerequisites

- Task **`T###`** is `in_progress` with Tier A `run-transition` `start` evidence.
- Familiarity with maintainer delivery: `.ai/playbooks/task-to-phase-branch.md`.
- ADR: `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md`.
- Metadata schema: `schemas/remote-run-metadata.v1.json`.
- Cursor SDK docs: [TypeScript](https://cursor.com/docs/sdk/typescript), [Python](https://cursor.com/docs/sdk/python).

## Roles

| Role | Tooling |
| --- | --- |
| **Control plane** | Workflow Cannon task engine, `list-remote-runs`, future launch/sync commands |
| **Execution host** | Cursor SDK (`Agent.create` / `Agent.prompt` / `Agent.resume`) — local or cloud runtime |
| **Operator** | Cursor UI for handoff, follow-ups, and local take-over |

Workflow Cannon **does not** spawn background agents from the CLI in Phase 1 — same boundary as subagent registry (record + handoff, host launches). Phase 2 kit commands will wrap SDK calls behind Tier B `policyApproval`.

## Cursor SDK quick reference

**Auth (never commit):**

```bash
export CURSOR_API_KEY="cursor_..."  # Dashboard → Integrations or team service account
```

**Cloud agent (typical for isolated remote / PR workflows):**

```typescript
import { Agent } from "@cursor/sdk";

await using agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2.5" },
  cloud: {
    repos: [{ url: "https://github.com/org/repo", ref: "release/phase-138" }],
  },
});

const run = await agent.send("Implement T### acceptance criteria …");
await run.wait();
// Record: agent.agentId → hostAgentId, run.id → hostRunId, sdkRuntime: cloud
```

**Resume after handoff:**

```typescript
await using agent = await Agent.resume(previousAgentId, {
  apiKey: process.env.CURSOR_API_KEY!,
});
const run = await agent.send("Continue from kit handoff …");
await run.wait();
```

**Trap:** `bc-…` agent ids are **cloud**; they are not run ids. Use `Agent.getRun(runId, { runtime: "cloud", agentId, apiKey })` to inspect a run you did not launch.

Map SDK fields into kit metadata per ADR **External integration surface** table.

## Workflow (Phase 1 — manual bridge)

### 1. Prepare the task

```bash
pnpm exec wk run get-task '{"taskId":"T###"}'
pnpm exec wk run completion-preflight '{"taskId":"T###"}'
```

Confirm acceptance criteria, phase branch, and policy gates before delegating remote work.

### 2. Launch via Cursor SDK or UI (operator)

Prefer SDK for reproducible orchestration (CI, extension host, maintainer scripts). UI launch is acceptable when you still record ids manually.

Record until Phase 2 `launch-remote-run` persists rows:

| Kit field | Source |
| --- | --- |
| `hostAgentId` | SDK `agent.agentId` |
| `hostRunId` | SDK `run.id` |
| `sdkRuntime` | `local` or `cloud` (set explicitly in SDK options) |
| `branch` / `baseBranch` | Repo ref passed to `cloud.repos` or local `cwd` |
| `launchedAt` / `launchedBy` | Operator audit |

### 3. Discover runs (kit read stub)

```bash
pnpm exec wk run list-remote-runs '{"taskId":"T###"}'
```

Phase 1 returns `persistence: "none"` and `runs: []` — use this command to verify CLI wiring. After Phase 2 persistence, the same argv lists stored rows.

### 4. Monitor and follow up

While the remote agent runs:

- Observe via SDK (`run.stream()` / `run.messages()`) or Cursor UI — map to schema states: `running`, `needs_input`, `failed`.
- On `needs_input`, respond with another `agent.send(...)` or prepare take-over (step 5).
- Distinguish startup failures (`CursorAgentError`) from run failures (`result.status === "error"`).
- Attach validation evidence to the task delivery path (`pnpm run check`, PR checks) independent of remote sync.

### 5. Take over in Cursor (handoff)

When the operator must **resume in the local editor**:

1. Open the Cursor session/run from the background-agent UI or `Agent.resume(hostAgentId, ...)`.
2. Confirm branch/worktree matches the task branch expectation.
3. Mark handoff intent in operator notes (Phase 2: `handoffState.handedOffAt`, `status: handed_off`).
4. Continue implementation locally; do **not** skip `run-transition` or JSON `policyApproval` on kit mutations.

**Handoff checklist**

- [ ] Same `taskId` (`T###`) as kit queue head or assigned task
- [ ] Branch matches `release/phase-<N>` or `task/<id>-…` convention
- [ ] Remote agent stopped or explicitly abandoned to avoid duplicate writers
- [ ] Lease/coordination: `workspace-edit-status` / `claim-workspace-edit-lease` if visible checkout is shared
- [ ] `hostAgentId` recorded for SDK resume

### 6. Evidence and completion

Remote completion **does not** complete the kit task.

```bash
pnpm exec wk run harvest-delivery-evidence '{"taskId":"T###"}'
pnpm exec wk run completion-preflight '{"taskId":"T###"}'
pnpm exec wk run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"…"}}'
```

Include in completion rationale when applicable:

- PR URL / commit SHA (`evidenceRefs` kind `pr_url` / `commit_sha`)
- `hostAgentId` and `hostRunId` from SDK
- Handoff note if work finished locally after take-over

## Phase 2 automation (SDK-backed; not shipped)

When `launch-remote-run` and SQLite persistence land:

1. Launch via Tier B JSON `policyApproval` — kit calls SDK, writes `remoteRunId` + `taskId` row with `hostAgentId` / `hostRunId`.
2. Poll via `sync-remote-run` (`Agent.getRun`, `run.wait`) or dashboard worker.
3. Attach evidence via `attach-remote-run-evidence`.
4. `list-remote-runs` returns `persistence: "sqlite"`.

Implement Phase 2 only via a scoped execution task; SDK availability does not waive Tier B gates or MCP launch exposure rules.

## Related

- Subagent registry (provenance-only): `.ai/runbooks/subagent-registry.md`
- Task delivery loop: `.ai/playbooks/task-to-phase-branch.md`
- CLI map Tier C: `.ai/AGENT-CLI-MAP.extended.md` → *Remote runs (Cursor background agents)*
