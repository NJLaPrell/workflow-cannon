# Workflow Cannon vs Claw Code (`src/`) — practical improvements, new features, and implementation plan

## Purpose

This memo compares **Workflow Cannon** against the public **Claw Code** `src/` surface and turns that comparison into an implementation plan for Workflow Cannon.

The goal is not to copy Claw wholesale.

The goal is to identify the parts of Claw that are genuinely useful to Workflow Cannon and adapt them in a way that preserves Workflow Cannon’s stronger qualities:

- deterministic CLI-first behavior
- policy-governed mutations
- explicit module contracts
- durable task state
- thin UI clients over authoritative CLI/state

## Repositories compared

### Workflow Cannon

Current architecture is already strong in these areas:

- **CLI-first entrypoint** with guided top-level commands and a strict `run` path
- **module registry** with explicit dependency validation, enable/disable support, instruction validation, and startup ordering
- **command router** built from module instruction contracts, with alias support and graceful disabled-peer handling
- **typed module contract** for commands, lifecycle context, registration, capabilities, and remediation hints
- **policy approval** built into sensitive flows
- **SQLite-backed task persistence** and thin Cursor extension that does not directly mutate state files

### Claw Code `src/`

Useful patterns visible in the public `src/` tree and Python port include:

- broad runtime surface: `route`, `bootstrap`, `turn-loop`, `flush-transcript`, `load-session`
- explicit **tool pool** assembly
- explicit **tool permission context** with deny lists and deny prefixes
- explicit **command/tool indexes** and inventory rendering
- **parity audit** and setup/bootstrap graph style diagnostics
- folder structure that strongly suggests a broader runtime surface: `plugins`, `hooks`, `server`, `skills`, `remote`, `state`, `voice`

## Executive thesis

**Workflow Cannon should borrow Claw’s runtime UX and extensibility patterns, while keeping Workflow Cannon’s stricter governance and persistence model.**

Claw has useful ideas around:

1. plugin and hook pipelines
2. intent routing over commands/tools
3. session and transcript-first runtime workflows
4. assembled tool pools and permission filtering
5. setup/bootstrap/runtime graph diagnostics
6. slash commands / skills style operator affordances
7. server / event-stream execution surfaces
8. parity auditing between surfaces

Workflow Cannon should **not** flatten itself into a general-purpose harness.
It should remain a **policy-aware workflow platform** whose runtime features are layered on top of its module registry and task engine.

---

## Part I — what Workflow Cannon already does better

Before talking about imports from Claw, it is worth being blunt about what Workflow Cannon already gets right.

### 1. Workflow Cannon has stronger structural contracts

Workflow Cannon has a clear `WorkflowModule` contract, a registration model, explicit instruction entries, explicit dependency validation, enablement rules, and instruction-file validation.

That is much stronger than a loosely-assembled runtime surface.

### 2. Workflow Cannon has stronger mutation governance

Workflow Cannon already separates:

- read-only diagnostics and discovery
- command execution
- env-lane approval for setup/config/init/upgrade style actions
- JSON `policyApproval` for sensitive `run` path actions

That is exactly the kind of discipline many runtimes are missing.

### 3. Workflow Cannon already has the right authority split

The Cursor extension is intentionally thin and routes through `workspace-kit` instead of editing state directly.

That is the correct design and should be preserved.

### 4. Workflow Cannon has the right base for extension

Because commands are already registered through a registry and router, Workflow Cannon is in a better place than Claw to add plugins, runtime hooks, diagnostics, and alternative transports in a principled way.

---

## Part II — what to borrow from Claw

## A. Borrow a plugin + hook execution pipeline

### What Claw suggests

Claw’s `src/` layout includes `plugins` and `hooks`, and the Python port exposes flags like `--no-plugin-commands` and `--no-skill-commands` on command listing.

That points to a system where commands are not the whole story. There is a second surface that can influence runtime behavior.

### What Workflow Cannon should add

Workflow Cannon should add a **first-class plugin and hook pipeline**.

This should not replace modules.
Modules remain the authoritative feature units.
Plugins become **runtime extenders**.

### Why this matters

This unlocks:

- repo-specific workflow behavior without forking core modules
- evidence enrichers
- branch/PR automation hooks
- notifications
- transcript processors
- task recommendation heuristics
- organization-specific approval decorators
- UI projection plugins

### Recommended design

Add a plugin contract with lifecycle hooks like:

- `beforeCommandResolve`
- `afterCommandResolve`
- `beforePolicyCheck`
- `afterPolicyCheck`
- `beforeCommandExecute`
- `afterCommandExecute`
- `beforePersist`
- `afterPersist`
- `beforeResponseRender`
- `afterResponseRender`

### Recommended new files

- `src/contracts/plugin-contract.ts`
- `src/core/plugin-registry.ts`
- `src/core/command-execution-pipeline.ts`
- `src/core/hook-context.ts`
- `src/core/hook-events.ts`
- `src/plugins/README.md`
- `src/plugins/builtin/response-telemetry-plugin.ts`
- `src/plugins/builtin/policy-trace-annotator-plugin.ts`
- `src/plugins/builtin/task-evidence-normalizer-plugin.ts`

### Recommended existing files to modify

- `src/cli.ts`
- `src/cli/run-command.ts`
- `src/contracts/module-contract.ts`
- `src/core/module-command-router.ts`
- `src/core/module-registry-resolve.ts`

### Guardrails

- plugins must **not** bypass `policyApproval`
- plugins must **not** mutate task state except through sanctioned APIs
- plugins must declare capabilities and trust boundaries
- plugin loading should be deterministic and inspectable

### Concrete CLI additions

- `wk plugins`
- `wk plugins --json`
- `wk doctor --plugin-surface`
- `wk explain-plugin <id>`

---

## B. Borrow natural-language routing over commands, tools, and playbooks

### What Claw suggests

Claw exposes commands like:

- `route`
- `bootstrap`
- `turn-loop`
- `show-command`
- `show-tool`
- `exec-command`
- `exec-tool`

That is a runtime that can map intent to capability instead of forcing the user to know exact command names.

### What Workflow Cannon should add

Workflow Cannon should add a **semantic resolver** above the existing command router.

### Why this matters

Today Workflow Cannon is command-driven.
That is fine for maintainers, but not enough for agents or casual operators.

Examples of what should work:

- `wk suggest "what should I do next?"`
- `wk route "turn this wishlist item into executable work"`
- `wk route "why is this task blocked?"`
- `wk route "show me the safest next command"`
- `wk explain-request "prepare a branch-ready task handoff"`

### Recommended design

Build an intent resolver that ranks:

- exact command matches
- alias matches
- instruction-description matches
- playbook matches
- module capability matches
- optional tool matches

The output should include:

- recommended command
- confidence
- required approvals
- module owner
- related playbooks/docs
- reasons for ranking

### Recommended new files

- `src/core/intent-router.ts`
- `src/core/intent-scorer.ts`
- `src/core/intent-result.ts`
- `src/core/playbook-registry.ts`
- `src/core/operator-skills.ts`
- `src/cli/route-command.ts`
- `src/cli/suggest-command.ts`
- `src/cli/explain-request-command.ts`

### Recommended CLI additions

- `wk route <prompt>`
- `wk suggest <prompt>`
- `wk explain-request <prompt>`
- `wk command-graph`
- `wk capability-graph`

### Important constraint

This layer should **recommend and explain**, not silently run sensitive actions.
The existing policy lane remains authoritative.

---

## C. Borrow an explicit tool-pool and permission surface

### What Claw suggests

Claw’s Python port has:

- `tool-pool`
- `ToolPermissionContext`
- `--deny-tool`
- `--deny-prefix`
- inclusion flags like `--no-mcp`

That is a valuable pattern because it treats tool availability as a first-class runtime concern.

### What Workflow Cannon should add

Workflow Cannon should add a **tool capability registry** and a **tool permission layer**.

### Why this matters

Workflow Cannon is already strong on command governance.
The next step is to govern **capabilities** with the same discipline.

That would allow:

- safe agent execution profiles
- workspace-specific tool allow/deny lists
- debugging of missing capabilities
- runtime trust-boundary reporting
- future MCP integration without chaos

### Recommended design

Introduce:

- a `ToolDescriptor`
- `ToolPermissionContext`
- allow/deny evaluation
- tool categories (`read`, `write`, `network`, `shell`, `git`, `planning`, `diagnostic`)
- runtime assembly of the tool surface

### Recommended new files

- `src/contracts/tool-contract.ts`
- `src/core/tool-registry.ts`
- `src/core/tool-permissions.ts`
- `src/core/tool-pool.ts`
- `src/core/tool-surface-report.ts`
- `src/cli/tool-pool-command.ts`
- `src/cli/tools-command.ts`
- `src/cli/show-tool-command.ts`

### Recommended CLI additions

- `wk tools`
- `wk tools --query <q>`
- `wk tool-pool`
- `wk tool-pool --deny-tool <name>`
- `wk tool-pool --deny-prefix <prefix>`
- `wk explain-tool <name>`

### Strong recommendation

Tie this into your existing trust-boundary work instead of inventing a parallel system.
The outcome should be a single explainable story for:

- command permissions
- tool permissions
- mutation permissions
- extension permissions

---

## D. Borrow session and transcript-first runtime workflows

### What Claw suggests

Claw exposes:

- `flush-transcript`
- `load-session`
- `turn-loop`
- persisted session state

That indicates a runtime which treats interaction history as structured state.

### What Workflow Cannon should add

Workflow Cannon should promote transcripts and sessions into a first-class runtime feature.

### Why this matters

Workflow Cannon already has transcript scripts and an improvement module.
This is the natural next step.

Done well, this would let Workflow Cannon:

- resume active task conversations
- compact and summarize prior work
- derive improvement tasks from transcripts
- attach evidence bundles to execution state
- replay decision chains
- support richer extension UIs

### Recommended design

Introduce a **session store** that links:

- session id
- task id (optional)
- active prompt window
- summary / compacted context
- evidence references
- command executions
- policy events
- output snapshots

### Recommended new files

- `src/contracts/session-contract.ts`
- `src/core/session-store.ts`
- `src/core/session-compact.ts`
- `src/core/session-events.ts`
- `src/core/transcript-runtime.ts`
- `src/cli/session-command.ts`
- `src/cli/load-session-command.ts`
- `src/cli/flush-transcript-command.ts`

### Recommended persistence shape

Do **not** introduce a free-floating session store that competes with the task engine.

Instead:

- keep task state authoritative in the existing persistence layer
- store session metadata in a new SQLite-backed area or adjacent schema
- let transcripts be linked records, not primary execution state

### Recommended CLI additions

- `wk sessions`
- `wk load-session <id>`
- `wk flush-transcript <id|--current>`
- `wk explain-session <id>`
- `wk task-session <taskId>`

---

## E. Borrow setup/bootstrap/runtime graph diagnostics

### What Claw suggests

Claw exposes:

- `setup-report`
- `bootstrap-graph`
- `command-graph`
- `parity-audit`

These are excellent operator affordances.

### What Workflow Cannon should add

Workflow Cannon should expand `doctor` and add graph/explain commands that make startup, routing, and execution surfaces visible.

### Why this matters

Workflow Cannon already has enough moving parts that good introspection pays for itself.

You already have:

- module enablement
- optional peers
- startup order
- policy lanes
- dashboard contracts
- extension bridge behavior

Make that visible.

### Recommended new files

- `src/cli/setup-report-command.ts`
- `src/cli/bootstrap-graph-command.ts`
- `src/cli/command-graph-command.ts`
- `src/cli/parity-audit-command.ts`
- `src/core/runtime-graph.ts`
- `src/core/setup-report.ts`
- `src/core/parity-audit.ts`

### Recommended CLI additions

- `wk setup-report`
- `wk bootstrap-graph`
- `wk command-graph`
- `wk parity-audit`
- `wk explain-command <name>`
- `wk explain-disabled-command <name>`
- `wk explain-module <id>`

### Audit categories worth shipping

- docs vs instruction manifest parity
- module registry vs instruction file parity
- CLI vs extension contract parity
- schema vs actual JSON output parity
- dashboard contract parity
- playbook registry parity

---

## F. Borrow slash-command and skill style operator affordances

### What Claw suggests

Claw’s structure includes `skills`, and its Python port distinguishes plugin and skill commands.

### What Workflow Cannon should add

Workflow Cannon should formalize **operator skills** and optionally expose them as slash-like shortcuts in the extension.

### Why this matters

You already have many playbook-like workflows hiding in docs and extension prefills.
Bring them into the product as first-class runtime objects.

### Examples

- `/triage-improvements`
- `/wishlist-intake`
- `/task-to-branch`
- `/advance-task`
- `/explain-policy`
- `/next-safe-action`

### Recommended design

A skill should be:

- named
- discoverable
- explainable
- versioned
- mappable to one or more commands/playbooks
- able to specify required approvals

### Recommended new files

- `src/contracts/skill-contract.ts`
- `src/core/skill-registry.ts`
- `src/skills/README.md`
- `src/skills/builtin/*.ts`
- `extensions/cursor-workflow-cannon/src/skills/*`

### Recommended CLI additions

- `wk skills`
- `wk show-skill <name>`
- `wk run-skill <name> '<json>'`

---

## G. Borrow a local server / SSE mode

### What Claw suggests

Claw’s `src/` tree includes `server` and broader remote/runtime entry surfaces.

### What Workflow Cannon should add

Workflow Cannon should add a **local read-mostly API + SSE event stream**.

### Why this matters

This unlocks:

- live dashboard refreshes
- external automation integrations
- real-time task/session/event views
- richer extension UX without direct file access
- future multi-client support

### Hard rule

The server must **not** become the source of truth.

The authoritative layers remain:

- CLI
- policy checks
- persistence stores

The server is an **adapter and event stream**, not a second brain.

### Recommended new files

- `src/server/index.ts`
- `src/server/routes/tasks.ts`
- `src/server/routes/sessions.ts`
- `src/server/routes/commands.ts`
- `src/server/routes/health.ts`
- `src/server/sse.ts`
- `src/server/event-bus.ts`
- `src/server/contracts.ts`

### Recommended CLI additions

- `wk server`
- `wk server --port 0`
- `wk server --readonly`
- `wk server --emit-events`

### Extension follow-up

The Cursor extension can continue to use the CLI by default, but optionally subscribe to SSE when available for live views.

---

## H. Borrow remote/deep-link execution surfaces carefully

### What Claw suggests

Claw exposes runtime branches like:

- `remote-mode`
- `ssh-mode`
- `teleport-mode`
- `direct-connect-mode`
- `deep-link-mode`

### What Workflow Cannon should add

Workflow Cannon should eventually support multiple execution surfaces for the same core capabilities:

- local CLI
- Cursor extension
- local server/SSE
- CI/noninteractive mode
- deep-link prompt prefill mode
- remote worker mode later

### Why this matters

The underlying command model is good enough to support multiple transport layers.
Do that deliberately instead of letting ad hoc integrations grow wild.

### Recommendation

Do **not** build this first.
Get plugin hooks, tool permissions, and runtime sessions in place first.

---

## Part III — what Workflow Cannon should not copy from Claw

## 1. Do not weaken the module registry

The module registry is a major advantage. Keep it central.

## 2. Do not let plugins directly mutate authoritative state

All persistent changes still go through sanctioned services and policy checks.

## 3. Do not let tools become an ungoverned side-channel

If tools are introduced, they must have the same explainability as commands.

## 4. Do not let the extension or future server become authoritative

Thin clients and adapter servers are correct. Preserve that discipline.

## 5. Do not replace explicit commands with fuzzy routing

Routing is an affordance layer.
Exact commands remain the stable contract.

---

## Part IV — proposed architecture changes for Workflow Cannon

## New core layers to introduce

### 1. Execution pipeline layer

Purpose:

- normalize command resolution, policy checks, hooks, persistence side-effects, and response shaping into one inspectable flow

Suggested files:

- `src/core/command-execution-pipeline.ts`
- `src/core/execution-trace.ts`
- `src/core/execution-stage.ts`

### 2. Plugin registry layer

Purpose:

- discover, validate, enable, order, and execute runtime plugins

Suggested files:

- `src/core/plugin-registry.ts`
- `src/contracts/plugin-contract.ts`
- `src/core/plugin-resolution.ts`

### 3. Tool capability layer

Purpose:

- represent and filter tools as first-class capabilities

Suggested files:

- `src/core/tool-registry.ts`
- `src/core/tool-permissions.ts`
- `src/core/tool-pool.ts`
- `src/contracts/tool-contract.ts`

### 4. Intent / skills layer

Purpose:

- route natural language to commands, playbooks, and skills without changing the stability of the explicit CLI

Suggested files:

- `src/core/intent-router.ts`
- `src/core/skill-registry.ts`
- `src/contracts/skill-contract.ts`

### 5. Session runtime layer

Purpose:

- persist and explain interactive execution context linked to tasks and transcripts

Suggested files:

- `src/core/session-store.ts`
- `src/core/session-compact.ts`
- `src/contracts/session-contract.ts`

### 6. Event / projection layer

Purpose:

- emit structured runtime events for extensions, dashboards, and the future server

Suggested files:

- `src/core/runtime-events.ts`
- `src/core/event-bus.ts`
- `src/server/sse.ts`

---

## Part V — specific commands Workflow Cannon should add

## High-value commands

### Discovery and explainability

- `wk route <prompt>`
- `wk suggest <prompt>`
- `wk explain-request <prompt>`
- `wk explain-command <name>`
- `wk explain-disabled-command <name>`
- `wk explain-module <id>`
- `wk explain-plugin <id>`
- `wk explain-tool <name>`

### Runtime inventories

- `wk tools`
- `wk tool-pool`
- `wk plugins`
- `wk skills`
- `wk sessions`

### Diagnostics

- `wk setup-report`
- `wk bootstrap-graph`
- `wk command-graph`
- `wk capability-graph`
- `wk parity-audit`

### Session operations

- `wk load-session <id>`
- `wk flush-transcript <id|--current>`
- `wk task-session <taskId>`

### Server

- `wk server`

---

## Part VI — phased implementation roadmap

## Phase 1 — plugin and execution pipeline foundation

### Outcome

Workflow Cannon gains a runtime hook model without changing its command contract.

### Scope

- add plugin contract
- add plugin registry
- add command execution pipeline
- wire pipeline into `run`
- add builtin no-op / telemetry plugins
- add plugin doctor surface

### Deliverables

- `plugin-contract.ts`
- `plugin-registry.ts`
- `command-execution-pipeline.ts`
- `wk plugins`
- `wk doctor --plugin-surface`

### Why first

This is the highest-leverage enabling layer for later features.

---

## Phase 2 — tool capability and permission surface

### Outcome

Workflow Cannon can expose, filter, and explain tools the same way it handles commands.

### Scope

- add tool descriptors
- add tool pool assembly
- add allow/deny filtering
- add tool explanation commands
- add trust-boundary reporting integration

### Deliverables

- `tool-contract.ts`
- `tool-registry.ts`
- `tool-permissions.ts`
- `tool-pool.ts`
- `wk tools`
- `wk tool-pool`

### Why second

This becomes the capability substrate for routing and future agent runtimes.

---

## Phase 3 — intent routing and skills

### Outcome

Workflow Cannon gains a semantic access layer above explicit commands.

### Scope

- add intent router
- add ranked matches with reasons
- add skill registry
- add command/playbook/skill graph views

### Deliverables

- `intent-router.ts`
- `skill-registry.ts`
- `wk route`
- `wk suggest`
- `wk skills`
- `wk command-graph`

### Why third

After plugin and tool surfaces exist, routing can reason over real runtime objects instead of hacks.

---

## Phase 4 — session runtime and transcript-first execution

### Outcome

Workflow Cannon can persist and resume active operator/agent execution state.

### Scope

- session schema
- session storage
- transcript linking
- task-linked runtime sessions
- compact/resume support

### Deliverables

- `session-contract.ts`
- `session-store.ts`
- `wk sessions`
- `wk load-session`
- `wk flush-transcript`

### Why fourth

This makes the system feel like a real workflow runtime, not just a workflow CLI.

---

## Phase 5 — local server and live extension projection

### Outcome

Workflow Cannon can stream runtime events to UI clients while preserving CLI/state authority.

### Scope

- local server
- SSE event stream
- read-mostly endpoints
- optional extension subscription path

### Deliverables

- `src/server/*`
- `wk server`
- extension live updates

### Why fifth

This should come only after the runtime event model is solid.

---

## Part VII — best first three pull requests

## PR 1 — plugin + execution pipeline

Create the runtime hook foundation.

### File targets

- `src/contracts/plugin-contract.ts`
- `src/core/plugin-registry.ts`
- `src/core/command-execution-pipeline.ts`
- `src/cli/run-command.ts`
- `src/cli.ts`
- `src/plugins/builtin/*`

### Success criteria

- existing commands still behave the same
- execution goes through the new pipeline
- plugin loading and hook order are explainable

## PR 2 — tools + tool permissions

Create a first-class capability surface.

### File targets

- `src/contracts/tool-contract.ts`
- `src/core/tool-registry.ts`
- `src/core/tool-permissions.ts`
- `src/core/tool-pool.ts`
- `src/cli/tool-pool-command.ts`
- `src/cli/tools-command.ts`

### Success criteria

- tool surface is listed and explainable
- allow/deny filtering works
- no tool bypasses policy or task-store discipline

## PR 3 — route + suggest + explain-request

Add the semantic resolver.

### File targets

- `src/core/intent-router.ts`
- `src/core/intent-scorer.ts`
- `src/cli/route-command.ts`
- `src/cli/suggest-command.ts`
- `src/cli/explain-request-command.ts`

### Success criteria

- prompts are mapped to commands/playbooks/skills with reasons
- confidence and approval requirements are shown
- explicit command execution remains unchanged

---

## Part VIII — strongest opinionated recommendations

### 1. Build plugins before server

The plugin/hook system gives you leverage everywhere else.
The server without that foundation will become an ad hoc pile of callbacks.

### 2. Build a tool-permission model before broad agent runtime features

You need a capability trust story before you need a bigger agent runtime.

### 3. Treat routing as advisory first

Do not auto-execute mutable actions from natural language until the routing surface is mature and auditable.

### 4. Keep the CLI authoritative forever

That is one of the best design choices already present in Workflow Cannon.
Do not give it away.

### 5. Make every new runtime surface explainable

If you add plugins, tools, routing, sessions, or server events, each one should have:

- list surface
- show one
- explain why enabled/disabled
- machine-readable output

That principle will save a huge amount of debugging time.

---

## Final conclusion

The most valuable patterns Workflow Cannon can borrow from Claw are:

1. **plugin/hook pipeline**
2. **tool-pool + tool permission context**
3. **intent routing and skill surfaces**
4. **session/transcript-first runtime workflows**
5. **setup/bootstrap/graph diagnostics**
6. **local server + SSE projection layer**

But Workflow Cannon should import them **as layers on top of its current module registry, policy engine, and task persistence model**.

That preserves Workflow Cannon’s strongest qualities while giving it the next-generation runtime ergonomics that Claw hints at.

## Recommended next move

Start with:

- **PR 1:** plugin + command execution pipeline
- **PR 2:** tool capability + permission surface
- **PR 3:** route/suggest/explain-request

That sequence gives the best leverage with the least architectural regret.
