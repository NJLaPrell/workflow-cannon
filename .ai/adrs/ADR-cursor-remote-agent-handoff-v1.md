# ADR: Cursor background-agent remote execution handoff (v1)

**Status:** Accepted (Phase 137, T100334 — Phase 1 design)  
**Date:** 2026-06-23  
**Task:** T100334  
**Related:** `.ai/adrs/ADR-cursor3-task-flow-subagent-packaging.md`, `.ai/runbooks/subagent-registry.md`, `.ai/adrs/ADR-mcp-remote-transport-auth-non-goals-phase-134-v1.md`

## Context

Cursor background agents can run asynchronously on isolated remotes: clone a repository, execute commands, accept follow-ups, and return results outside the operator's visible checkout. Workflow Cannon already treats **subagent registry** rows as provenance for delegated work the **host** launches — it does not spawn Cursor subagents from the CLI.

Operators need a **control plane** that:

- links remote execution to **`T###`** task lifecycle and maintainer delivery evidence,
- records **approval gates** before any launch or write path,
- defines **evidence expectations** when a remote run completes or hands off,
- supports a **take-over-in-Cursor** workflow without forking kit policy.

Cursor now ships first-party SDKs for programmatic agents (**`@cursor/sdk`** TypeScript, **`cursor-sdk`** Python; public beta). The Cloud Agents REST API (`/v1/agents/*`) remains available for other languages. Phase 137 shipped **design + read contract only**; Phase 2 launch/sync adapters should target the **SDK Agent → Run model** (not ad-hoc HTTP) unless a maintainer documents a REST-only exception.

## Decision

### Integration boundary

| Layer | Owner | Responsibility |
| --- | --- | --- |
| **Task engine** | Workflow Cannon | `T###` linkage, run metadata schema, read command (`list-remote-runs`), evidence attachment hooks, completion semantics aligned with `run-transition` |
| **Launch / sync adapter** | Workflow Cannon (Phase 2+) | Thin wrapper over Cursor SDK (`Agent.create` / `Agent.prompt` / `Agent.resume`, `run.wait`, `run.stream`) — maps kit `remoteRunId` ↔ SDK `agentId` / `run.id` — **deferred implementation** |
| **Remote machine + agent runtime** | Cursor SDK + hosted executor | Local (`local.cwd`) or cloud (`cloud.repos`) runtime; editor handoff UX |
| **Policy / approval** | Workflow Cannon | JSON `policyApproval` on Tier B launch/write commands; chat approval never substitutes |

Workflow Cannon is the **system of record** for *which task* a remote run serves and *what evidence* satisfies delivery. Cursor is the **execution host** — analogous to subagent registry today (record + handoff, not spawn).

### Phase 1 scope (this ADR)

Shipped in T100334 Phase 1:

1. This ADR (boundary, gates, evidence, explicit deferrals).
2. **Remote run metadata schema** — `schemas/remote-run-metadata.v1.json` (documented before any persistence).
3. **`list-remote-runs` read command spec** — instruction markdown + manifest registration with a **read-only stub** that returns an empty projection until SQLite persistence lands in Phase 2.
4. **Handoff runbook** — `.ai/runbooks/cursor-remote-agent-handoff.md`.

### External integration surface (Cursor SDK)

Phase 2 adapters should use the **Cursor SDK** as the default launch/observe path:

| Surface | Package | When |
| --- | --- | --- |
| TypeScript | `@cursor/sdk` | Kit/extension scripts, Node orchestrators, CI |
| Python | `cursor-sdk` (`cursor_sdk`) | Python automation, bridges |
| REST | Cloud Agents API | Non-TS/Python only; document exception in instruction |

**Auth:** `CURSOR_API_KEY` env or explicit `apiKey` / `api_key` on `AgentOptions` — user or team service-account keys from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). **Never** commit keys; kit config must not store them.

**Invocation patterns (SDK):**

- **One-shot:** `Agent.prompt(...)` — fire-and-forget scripts; disposes automatically.
- **Durable + follow-ups:** `Agent.create(...)` + `agent.send(...)` + `run.wait()` — streaming, multi-turn.
- **Resume / handoff:** `Agent.resume(agentId, ...)` — cross-process; re-pass inline MCP servers on resume.

**ID mapping into `remote-run-metadata.v1`:**

| Kit field | SDK source |
| --- | --- |
| `hostAgentId` | `agent.agentId` / `agent.agent_id` (`bc-…` prefix ⇒ cloud runtime) |
| `hostRunId` | `run.id` after `send()` (not the agent id) |
| `sdkRuntime` | `local` when `local.cwd` set; `cloud` when `cloud.repos` set — always set explicitly |
| `status` | Map `RunResult.status` (`finished` → `completed`, `error` → `failed`, etc.) |

**Errors:** distinguish `CursorAgentError` (run never started) from `result.status === "error"` (run executed and failed). Kit sync should persist both classes for operator remediation.

Docs: [TypeScript SDK](https://cursor.com/docs/sdk/typescript), [Python SDK](https://cursor.com/docs/sdk/python).

### Phase 2 scope (implementation deferred)

**Not in Phase 1.** Requires a new execution task, maintainer approval, and SDK-backed adapter implementation:

| Deferred capability | Gate |
| --- | --- |
| `launch-remote-run` (or equivalent) | Tier B + JSON `policyApproval` + documented launch criteria; SDK `Agent.create` or `Agent.prompt` under the hood |
| `sync-remote-run` / `attach-remote-run-evidence` | Tier B where writes touch kit SQLite or git artifacts; poll via `Agent.getRun` / `run.wait` |
| SQLite `remote_runs` table + migrations | Schema version bump after metadata schema is frozen |
| Automated bidirectional status sync | SDK observation (`run.stream`, `run.messages`, `Agent.get`); manual bridge acceptable for MVP |
| MCP exposure of launch/write | Out of scope per MCP adapter boundary + Phase 134 transport non-goals |

Phase 1 **must not** add HTTP listeners, Cursor API keys in repo config, or silent background launches. Phase 2 **may** invoke the SDK from maintainer-approved orchestration only (extension host, `wk run` handler, or documented operator script) — not from chat-only approval.

### Approval gates

| Action | Tier | Approval | Preconditions |
| --- | --- | --- | --- |
| `list-remote-runs` | C | None | Read-only stub / future SQLite read |
| `launch-remote-run` (Phase 2) | B | JSON `policyApproval` | Task `in_progress`; `completion-preflight` clean or waived; launch criteria documented in instruction |
| `cancel-remote-run` (Phase 2) | B | JSON `policyApproval` | Run not terminal |
| `attach-remote-run-evidence` (Phase 2) | B | JSON `policyApproval` when persisting | Run linked to `T###` |
| `run-transition` `complete` after remote delivery | A | JSON `policyApproval` | Delivery evidence includes remote-run refs per runbook |

Launch criteria (Phase 2 instruction) will require at minimum: `taskId`, `baseBranch`, `policyApproval`, optional `worktreePath` / `branch` hints, and `expectedPlanningGeneration` when the workspace prelude applies.

### Evidence expectations

When a remote run supports maintainer delivery for **`T###`**:

1. **Linkage** — every run row carries `taskId` (`T###`); list/read commands must filter by task.
2. **Status trail** — state machine: `queued` → `running` → (`needs_input` \| `completed` \| `failed` \| `cancelled`); `handed_off` when operator takes over in Cursor.
3. **Attachments** — `evidenceRefs[]` pointing to harvestable artifacts (PR URL, commit SHA, validation command exit codes, handoff transcript path). Align with `harvest-delivery-evidence` and `completion-preflight`.
4. **Handoff record** — `handoffState` captures take-over eligibility, last sync time, and optional Cursor deep link; resume the same logical agent via SDK `Agent.resume(hostAgentId, ...)` when orchestration continues out-of-band.
5. **Completion** — task `complete` still requires Tier A `run-transition` with CLI evidence; remote completion alone is **not** sufficient.

### Persistence (Phase 2 preview)

Canonical schema: `schemas/remote-run-metadata.v1.json`. Planned store: kit SQLite table keyed by `remoteRunId`, indexed by `taskId` and `status`. Phase 1 documents the schema only; the read stub returns `persistence: "none"`.

## Non-goals (Phase 1)

- Implementing launch, cancel, sync, or write paths.
- Replacing subagent registry — remote runs complement assignment/subagent flows for long-running background work.
- Remote MCP transport (see Phase 134 ADR).
- Promising automated bidirectional sync before SDK adapter implementation lands (SDK availability ≠ kit launch/write shipped).

## Consequences

- Agents and operators have a stable read contract and metadata schema before persistence.
- Phase 2 can add handlers without revisiting boundary or evidence rules.
- Dashboard/extension cards can target `list-remote-runs` once persistence exists.
- Manual handoff + evidence attach remains valid when APIs are immature.

## Acceptance mapping (T100334 Phase 1)

| Criterion | Artifact |
| --- | --- |
| Integration boundary, approval gates, evidence | This ADR — Integration boundary, Approval gates, Evidence expectations |
| `list-remote-runs` spec + `T###` linkage | `src/modules/task-engine/instructions/list-remote-runs.md` |
| Metadata schema before launch/write | `schemas/remote-run-metadata.v1.json` |
| Take-over-in-Cursor runbook | `.ai/runbooks/cursor-remote-agent-handoff.md` |
| Launch/write deferred | Phase 2 scope table; Non-goals |
| CLI map wiring | `.ai/AGENT-CLI-MAP.md`, `.ai/AGENT-CLI-MAP.extended.md` Tier C block |
