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

Upstream **`@cursor/sdk`** and Cursor Cloud APIs evolve independently. Phase 137 ships **design + read contract only**; launch/write adapters remain blocked until an external API contract is approved.

## Decision

### Integration boundary

| Layer | Owner | Responsibility |
| --- | --- | --- |
| **Task engine** | Workflow Cannon | `T###` linkage, run metadata schema, read command (`list-remote-runs`), evidence attachment hooks, completion semantics aligned with `run-transition` |
| **Launch / sync adapter** | Workflow Cannon (Phase 2+) | Idempotent launch, status polling, evidence ingest — **deferred** |
| **Remote machine + agent runtime** | Cursor | Isolated compute, repo clone, tool execution, editor handoff UX |
| **Policy / approval** | Workflow Cannon | JSON `policyApproval` on Tier B launch/write commands; chat approval never substitutes |

Workflow Cannon is the **system of record** for *which task* a remote run serves and *what evidence* satisfies delivery. Cursor is the **execution host** — analogous to subagent registry today (record + handoff, not spawn).

### Phase 1 scope (this ADR)

Shipped in T100334 Phase 1:

1. This ADR (boundary, gates, evidence, explicit deferrals).
2. **Remote run metadata schema** — `schemas/remote-run-metadata.v1.json` (documented before any persistence).
3. **`list-remote-runs` read command spec** — instruction markdown + manifest registration with a **read-only stub** that returns an empty projection until SQLite persistence lands in Phase 2.
4. **Handoff runbook** — `.ai/runbooks/cursor-remote-agent-handoff.md`.

### Phase 2 scope (explicitly deferred)

**Not in Phase 1.** Requires a new task, maintainer approval, and a stable Cursor background-agent API/SDK contract:

| Deferred capability | Gate |
| --- | --- |
| `launch-remote-run` (or equivalent) | Tier B + JSON `policyApproval` + documented launch criteria |
| `sync-remote-run` / `attach-remote-run-evidence` | Tier B where writes touch kit SQLite or git artifacts |
| SQLite `remote_runs` table + migrations | Schema version bump after metadata schema is frozen |
| Automated bidirectional status sync | Stable Cursor API; manual evidence sync acceptable for MVP bridge |
| MCP exposure of launch/write | Out of scope per MCP adapter boundary + Phase 134 transport non-goals |

Phase 1 **must not** add HTTP listeners, Cursor API keys in repo config, or silent background launches.

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
4. **Handoff record** — `handoffState` captures take-over eligibility, last sync time, and optional Cursor deep link (manual until API exists).
5. **Completion** — task `complete` still requires Tier A `run-transition` with CLI evidence; remote completion alone is **not** sufficient.

### Persistence (Phase 2 preview)

Canonical schema: `schemas/remote-run-metadata.v1.json`. Planned store: kit SQLite table keyed by `remoteRunId`, indexed by `taskId` and `status`. Phase 1 documents the schema only; the read stub returns `persistence: "none"`.

## Non-goals (Phase 1)

- Implementing launch, cancel, sync, or write paths.
- Replacing subagent registry — remote runs complement assignment/subagent flows for long-running background work.
- Remote MCP transport (see Phase 134 ADR).
- Promising automated bidirectional sync before Cursor API contract approval.

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
