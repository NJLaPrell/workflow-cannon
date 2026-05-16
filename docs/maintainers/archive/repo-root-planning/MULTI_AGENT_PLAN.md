# Multi-Agent Orchestration Plan

Goal: Workflow Cannon delivers entire phases autonomously by dispatching specialized agents (PM, coding, testing) that hand off work in parallel, each isolated in its own git worktree, with live dashboard visibility.

---

## Architecture Assessment

The current foundation is sound and should not change course:

- **SQLite as coordination bus** — local, fast, concurrent-reader-safe, planning generation handles write safety.
- **Separation of persistence from execution** — the kit records intent; the host (Cursor, VS Code, terminal) owns agent execution. `spawn-subagent` explicitly says "Does not launch Cursor; host executes separately." This is the right boundary.
- **Lease system** — single-writer safety per checkout, suspect-drift detection, stale recovery.
- **Workspace coordination status** — `authorityRole` (integration_authority vs worker) and `posture` classification already distinguish orchestrator checkouts from worker checkouts.
- **Team execution module** — supervisor/worker assignment lifecycle (register → handoff → reconcile/block/cancel) with validated contracts in SQLite.
- **Subagent registry** — definitions with `allowedCommands`, session tracking with `hostHint`.

**What must change:** The build order flips from bottom-up persistence (more tables, more schemas) to top-down prove-one-loop-first. The existing persistence is sufficient to run the first end-to-end multi-agent cycle.

---

## Existing Infrastructure

### Built and working

| Component | Location | What it does |
|-----------|----------|-------------|
| Team execution assignments | `src/modules/team-execution/` | Supervisor/worker assignment CRUD, handoff validation, block/cancel/reconcile lifecycle |
| Subagent registry | `src/modules/subagents/` | Definition registration, session spawn/close, `allowedCommands`, `hostHint` |
| Workspace edit leases | `src/modules/task-engine/coordination/workspace-edit-lease.ts` | Single-writer locking per checkout, expiry, heartbeat, suspect-drift flags |
| Workspace coordination status | `src/contracts/workspace-coordination-status.ts` | Read-only posture snapshot (safe, dirty, lease-held, stale), authority role classification |
| Dashboard agent status | `src/contracts/dashboard-summary-run.ts` | `DashboardAgentStatusSummary` with kind enum (planning, working_task, delegating_task, etc.) |
| Multi-agent status card | Extension (T100271, Phase 95) | Dashboard renders multiple concurrent agent rows |
| Planning generation | Task engine | Optimistic locking prevents last-writer-wins corruption from parallel writers |
| Task dependency graph | `depends_on_json` / `unblocks_json` columns | Dependency declarations exist; `queue-health` validates them |
| Technical scope | `technical_scope_json` column | Per-task file scope declarations exist (unused at runtime) |

### Planned (tasks exist, not implemented)

| Task | Status | What it covers |
|------|--------|---------------|
| T100193 — Isolated proposal mode | `ready` (ph:98) | Proposal branches/worktrees as explicit artifacts, state branch prep |
| T100191 — Task mutation intents for worker branches | `ready` (ph:98) | Clone-local intent queue so workers propose mutations without touching authority DB |
| T100192 — Lease-aware checkpoint guards | `ready` (ph:98) | Thread lease checks through auto-checkpoint, stash, branch helpers |
| T567 — Async remote execution with Cursor background-agent handoff | `ready` (ph:64) | Bridge to Cursor's background agent API |
| T100129 — Agent Work Start Orchestrator | `proposed` | No approach yet |
| T100122 — Supervisor workflow UX | `proposed` | No approach yet |
| T100135 — Work Session Lease Bundle | `proposed` | No approach yet |
| T100136 — Structured Handoff Package Generator | `proposed` | No approach yet |
| T100267/T100290 — Multi-agent telemetry | `proposed` | No approach yet |

---

## Gap Analysis (build order)

### Gap 1: Worktree Lifecycle Commands

**Blocks:** Everything else. Cannot run parallel agents without parallel checkouts.

**What's missing:**

- `wk run create-task-worktree` — wraps `git worktree add ../wc-<taskId> -b <taskBranch> <baseBranch>`, bootstraps `node_modules` (pnpm `--frozen-lockfile` or shared workspace lockfile), ensures built CLI is available.
- `wk run teardown-task-worktree` — after merge/PR, runs `git worktree remove`, cleans up lease files.
- Wire worktree path into the lease system so each worktree gets its own lease file under `gitCommonDir`.
- Skip sparse checkout for v1 — full worktrees are simpler. Scope enforcement via `technical_scope_json` can be advisory (lint what the agent touched vs. what the task declared).

**Practical bootstrap problem (Phase 93 lesson):** New worktrees lack `node_modules` and `dist/`. The `create-task-worktree` command must handle this or agents fail immediately. Options: (a) `pnpm install --frozen-lockfile` in each worktree, (b) symlink shared `node_modules`, (c) use the authority checkout's built `dist/cli.js` via absolute path from workers.

**Related existing tasks:** T100193 (design), T100191 (mutation intents), T100192 (lease-aware guards).

### Gap 2: Host Dispatch Bridge

**Blocks:** Parallel agent execution. Worktrees exist but nothing starts an agent in one.

**What's missing:**

- A **dispatch contract** — a JSON row or file that says "start an agent of role X in worktree Y, working on task Z, with this system prompt." The kit writes this; the host reads and acts.
- **Host adapters** — thin integrations per execution environment:
  - Cursor: Background agent API (T567)
  - VS Code / Copilot: `runSubagent` or terminal sessions
  - Claude Code: `claude --worktree-dir` with task prompt
  - Terminal fallback: spawn shell with bootstrap command
- **Completion signaling** — the adapter detects agent session end (terminal exit, background agent callback) and writes a completion/failure record to the subagent session.
- A **poll-or-watch loop** in the extension (or CLI watcher) that reads pending dispatch intents and acts on them. This is the single highest-value piece of new code.

**Key principle:** `spawn-subagent` already records provenance with `hostHint`. The subagent registry has definitions with `allowedCommands`. These are the right shapes — they just don't trigger anything yet. The gap is the void between "record spawn intent" and "host executes."

**Related existing tasks:** T567 (Cursor bridge), T100129 (orchestrator), T100135 (session bundle).

### Gap 3: Role-Based Agent Profiles

**Blocks:** Agent specialization. Without distinct roles, you have N copies of the same agent.

**What's missing:**

- **Role definitions** (PM, coder, tester, reviewer) as subagent definitions with:
  - System prompt template (what the agent is told it is and what tools it can use)
  - Allowed `wk run` commands (`allowedCommands` field already exists)
  - Handoff expectations (what a coder must include when handing to tester)
- **Prompt composition** — given a task + role + worktree, produce the agent's full system prompt:
  - PM agent: "Plan this phase, read the task graph, dispatch coding tasks"
  - Coder agent: "Implement this task in this worktree, run tests, submit handoff when done"
  - Tester agent: "Validate these changes, run the test suite, report pass/fail with structured results"
- **Role-to-command restrictions** — a tester agent should not run `run-transition complete`; a coder should not run `set-current-phase`.

**Existing work:** `register-subagent` already stores definitions with `allowedCommands`. The `agent-behavior` module has behavior profiles. The extension already composes prompts for playbooks. This is mostly a content/configuration problem.

### Gap 4: Orchestration Loop

**Blocks:** Autonomous phase delivery. A human can manually orchestrate the first runs; the automated loop is an optimization.

**What's missing:**

- **Parallel task selection** — `get-next-actions` returns one `suggestedNext`. Need `get-dispatchable-tasks`: all tasks whose dependencies are satisfied, grouped by parallelism potential.
  - Core query: `SELECT tasks WHERE status='ready' AND all depends_on are 'completed'`
  - Conflict detection: two tasks with overlapping `technical_scope_json` should not run simultaneously.
- **Dependency completion watcher** — when a task completes, re-evaluate the graph and dispatch newly-unblocked tasks.
- **The PM agent loop:**
  1. Read phase task graph
  2. Get dispatchable tasks
  3. Create worktrees for each
  4. Dispatch coder agents in parallel
  5. Watch for handoffs (poll subagent sessions / assignment status)
  6. Dispatch tester agents for submitted work
  7. Route test failures back to coders or complete successful tasks
  8. Repeat until phase is done

**Related existing tasks:** T100129 (Agent Work Start Orchestrator, `proposed`, needs approach).

### Gap 5: Agent-to-Agent Handoff Protocol

**Blocks:** The coder↔tester feedback loop. The current handoff contract is too thin for structured iteration.

**What's missing:**

- **Typed handoff payloads** by role transition:
  - Coder→Tester: `{ kind: "implementation-complete", changedFiles: [...], testCommands: [...], branch: "...", sha: "..." }`
  - Tester→Coder: `{ kind: "test-results", passed: boolean, results: [{ test, status, error }], suggestedFixes: [...] }`
  - Coder→PM: `{ kind: "task-complete", summary: "...", filesChanged: [...], testsPassing: true }`
- **Round-trip support** — current model: one handoff per assignment. The coder↔tester loop needs either:
  - (a) Multiple handoffs on one assignment with a `round` counter
  - (b) A `reassign` command that flips `submitted` → `assigned` with new/same worker, incrementing a round
- **Handoff-triggered dispatch** — when a tester submits "tests failed," the orchestrator automatically re-dispatches to the coder.

**Existing work:** T100136 (Structured Handoff Package Generator, `proposed`). The handoff contract v1 is extensible (JSON object with `schemaVersion`); typed extensions can be additive.

### Gap 6: Dashboard Live Multi-Agent Status

**Blocks:** Operator visibility. Agents can run without this; operators just can't observe them well.

**What's missing:**

- **Per-agent heartbeat from worktrees** — a `wk run update-agent-status` command that worker agents call periodically, writing to shared SQLite via `gitCommonDir`. Each agent reports its role, task, current activity, and progress.
- **Agent activity feed** — scrolling log: "Agent-coder-1 started T100191", "Agent-tester-1 running tests", "Agent-coder-1 received test failures."
- **Aggregate phase progress** — "Phase 98: 3/7 tasks dispatched, 2 coding, 1 testing, 4 remaining."
- **Dashboard polling** — `dashboard-summary` already includes `teamExecution` and `subagentRegistry` rollups and the extension already polls. The data source just needs richer multi-agent content.

**Related existing tasks:** T100267/T100290 (multi-agent telemetry, `proposed`).

---

## Build Sequence

| Step | Deliverable | Proves | Depends on |
|------|------------|--------|------------|
| **1** | `create-task-worktree` + `teardown-task-worktree` with pnpm bootstrap | Parallel checkouts work, agents can run in them | — |
| **2** | Dispatch adapter for one host (Cursor or terminal) | An agent can be spawned in a worktree from a kit signal | Step 1 |
| **3** | End-to-end smoke: assign → worktree → agent → handoff → teardown | The full loop works once, manually orchestrated | Steps 1–2 |
| **4** | Role profiles (PM, coder, tester) with prompt templates | Agents behave differently by role | Step 3 |
| **5** | `get-dispatchable-tasks` + dependency-aware parallel dispatch | Multiple tasks run in parallel | Steps 3–4 |
| **6** | Typed handoff payloads + reassign for round-trips | Coder↔tester feedback loop works | Steps 3–5 |
| **7** | PM agent orchestration loop | Full autonomous phase delivery | Steps 4–6 |
| **8** | Dashboard multi-agent telemetry | Operators watch it all happen | Steps 1–7 |

Steps 1–3 are the **proof of concept**. Everything after is iteration on a proven loop.

---

## Principles

- **Prove the loop before polishing the parts.** Do not add more persistence schemas until one agent has run in a worktree, handed off, and been torn down.
- **Host-agnostic core, thin host adapters.** The kit writes dispatch intents; host adapters (Cursor, terminal, Copilot) translate them into actual agent launches. Each adapter is <200 lines.
- **SQLite stays the coordination bus.** No daemons, no IPC, no message queues. Agents read/write the shared DB via `gitCommonDir`. Poll-based coordination is good enough for v1.
- **Advisory scope enforcement first.** Full worktrees, not sparse checkouts. Lint what agents touched against `technical_scope_json` after the fact. Hard enforcement comes later.
- **The PM agent is an agent, not a daemon.** It uses the same `wk run` commands as any other agent. It just has a different role profile and prompt.
