# AGENT_ORCHESTRATION_PROFILES.md

**Artifact:** A-PROFILES (orchestration profile catalog)  
**WBS:** WBS-AO-050 / task **T100628**  
**Requires:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md), [AGENT_ORCHESTRATION_POLICY.md](./AGENT_ORCHESTRATION_POLICY.md) (T100627), [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) (T100625)  
**Blocks:** TypeScript profile validators (T-AO-110), orchestration agent prompts (T-AO-510), WP-3 enforcement (T-AO-340), profile catalog docs (Phase 3)  
**Produced:** 2026-05-31  
**Status:** Approved for implementation  

---

## 1. Purpose

This document is the **reusable profile catalog** for Workflow Cannon agent orchestration v1. It materializes foundation decisions (§10–§14) into concrete profiles that **AgentDefinition** records reference via `accessProfileId`, `contextProfileId`, and `modelProfileId`.

It defines:

- **Access profiles** — `orchestrator_access_v1`, `task_worker_strict_v1` (mutation authority + command allowlists)
- **Context profiles** — `orchestrator_context_v1`, `task_worker_context_v1` (minimal sufficient context bundles)
- **Model profiles and tiers** — labels, cost posture, and an **Orchestration Agent routing rubric**
- **Host compatibility** — labels plus required/optional capability vocabulary
- **Resource ownership metadata** — assignment-scoped path rules and `lockScope` conventions

Normative authority rules live in **AGENT_ORCHESTRATION_POLICY.md** (A-POLICY). JSON field shapes live in **AGENT_ORCHESTRATION_CONTRACTS.md** (A-SCHEMA). Until WP-3 hardening, agents **must** follow these profiles; handlers may remain permissive.

---

## 2. Profile catalog overview

| Profile id | Kind | Bound `AgentDefinition.role` | Primary consumer |
| --- | --- | --- | --- |
| `orchestrator_access_v1` | access | `orchestrator` | Orchestration Agent |
| `task_worker_strict_v1` | access | `task_worker` | Task Work Agent |
| `orchestrator_context_v1` | context | `orchestrator` | Orchestration Agent prompts / context assembler |
| `task_worker_context_v1` | context | `task_worker` | Task Work Agent prompts / context assembler |
| `high_reasoning_or_balanced_v1` | model | `orchestrator` | Assignment `modelTier` default for planning/supervision |
| `balanced_or_cheaper_v1` | model | `task_worker` | Assignment `modelTier` default for implementation |

**Binding rule:** `AgentDefinition` **must** reference all three profile ids. Assignment metadata **may** override `modelTier`, `contextProfileId`, and `accessProfileId` for a single assignment; overrides **must not** widen worker authority beyond `task_worker_strict_v1`.

```json
{
  "accessProfileId": "task_worker_strict_v1",
  "contextProfileId": "task_worker_context_v1",
  "modelProfileId": "balanced_or_cheaper_v1"
}
```

Fixture references: `fixtures/agent-orchestration/agent-definition-orchestration-agent.v1.json`, `fixtures/agent-orchestration/agent-definition-task-worker.v1.json`, `fixtures/agent-orchestration/assignment-metadata-task-worker.v1.json`.

---

## 3. Access profile: `orchestrator_access_v1`

### 3.1 Intent

Supervisor authority: plan, assign, monitor, reconcile, and unblock — **without** default permission to edit implementation files or complete worker tasks without evidence.

### 3.2 Allowed mutations (summary)

| Category | Allowed |
| --- | --- |
| **Read** | Phase/task/assignment/activity/registry/orchestration status (`list-*`, `get-*`, `get-orchestration-status`, `completion-preflight`) |
| **Assignments** | `register-assignment`, `block-assignment`, `cancel-assignment`, `reconcile-assignment` (as `supervisorId`) |
| **Registry / sessions** | `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`, `update-subagent-session` |
| **Activity** | `set-agent-activity`, `clear-agent-activity` (any supervised agent when orchestrating) |
| **Tasks** | `create-task`, `report-defect`, `run-transition` on orchestration/planning/blocker tasks (Tier A with `policyApproval`) |
| **Profiles** | Choose `modelTier`, `contextProfileId`, `accessProfileId` on new assignments |

### 3.3 Denied by default

| Category | Denied |
| --- | --- |
| **Implementation** | Edit files under worker `ownedPaths` without explicit orchestrator-as-worker assignment |
| **Worker completion** | `run-transition complete` on worker implementation tasks without handoff/reconcile evidence |
| **Bypass** | Manual SQLite/JSON task or assignment edits; chat-only `policyApproval` |
| **Worker paths** | `submit-assignment-handoff` as worker, `report-assignment-blocked` as self-report |

### 3.4 Command allowlist (`allowedCommands` superset)

Aligns with A-POLICY §3 and foundation §19.1:

```text
set-agent-activity
clear-agent-activity
register-assignment
block-assignment
cancel-assignment
reconcile-assignment
list-assignments
list-subagents
get-subagent
list-subagent-sessions
get-subagent-session
register-subagent
retire-subagent
spawn-subagent
message-subagent
close-subagent-session
update-subagent-session
create-task
report-defect
list-tasks
get-task
get-next-actions
get-orchestration-status
completion-preflight
run-transition
```

Tier A/B commands require JSON **`policyApproval`** per `.ai/POLICY-APPROVAL.md`.

### 3.5 Capability tokens (declarative v1)

| Capability | Orchestrator |
| --- | --- |
| `read_context` | yes |
| `receive_assignment` | yes (supervisor hat) |
| `submit_handoff` | yes (supervisor evidence paths) |
| `report_activity` | yes |
| `write_task_state` | yes (scoped tasks) |
| `record_subagent_session` | yes |
| `spawn_subagents` | yes |
| `open_pr` | optional |
| `edit_files` | **no** (default) |
| `run_commands` | read/validation only unless explicitly assigned as worker |

### 3.6 Future capability keys (WP-3)

Reserved granular keys from foundation §11 (not enforced in v1):

```text
assignment.register
assignment.reconcile
assignment.cancel
assignment.block
task.create_blocking_task
activity.set
activity.clear
command.run.allowed
```

---

## 4. Access profile: `task_worker_strict_v1`

### 4.1 Intent

**Strict least privilege** for a single active assignment. Workers deliver scoped implementation, report blockers, submit handoff — and **cannot** self-reconcile, self-unblock, or mutate phase-wide state.

### 4.2 Allowed mutations (summary)

| Category | Allowed |
| --- | --- |
| **Read** | Assigned context only: assignment row, execution task, owned/read-only paths, handoff rubric |
| **Files** | Modify paths in assignment `resources.ownedPaths` only |
| **Activity** | `set-agent-activity`, `clear-agent-activity` for **own** `agentId` |
| **Handoff** | `submit-assignment-handoff` for **own** assignment |
| **Block** | `report-assignment-blocked` (self-report); `report-assignment-blocker` / `report-assignment-defect` when `blockingPolicy` allows |
| **Session** | `spawn-subagent`, `close-subagent-session` for **own** session only |
| **Maintainer overlay** | `run-transition` `start` / `complete` on **assigned** `executionTaskId` only, with Tier A `policyApproval` and playbook evidence (A-POLICY §3.6, §6.2) |

### 4.3 Explicit denials (non-negotiable)

| Action | Why denied |
| --- | --- |
| `reconcile-assignment` | P-CMD-03 — supervisor only |
| `cancel-assignment` | P-CMD-03 |
| `block-assignment` with `supervisorId` | P-CMD-02 — use `report-assignment-blocked` |
| `register-assignment` | Orchestrator only |
| `update-subagent-session` | P-CMD-06 — prevents bypass of assignment registration |
| General `create-task` | P-CMD-04 — use scoped blocker/defect commands |
| `run-transition` `block` / `unblock` / `cancel` / `accept` | Strategic lifecycle — orchestrator |
| Edit `forbiddenPaths` / `sharedPaths` without approval | Resource rules §8 |
| `task-sync-hydrate` / `task-sync-publish` | Operator recovery only (A-POLICY §8) |
| Manual task DB edits | A-POLICY §9 |

### 4.4 Command allowlist (`allowedCommands`)

**Canonical v1 list** (strict; supersedes stale examples that include `block-assignment`):

```text
set-agent-activity
clear-agent-activity
submit-assignment-handoff
report-assignment-blocked
report-assignment-blocker
report-assignment-defect
spawn-subagent
close-subagent-session
list-assignments
get-task
list-tasks
completion-preflight
run-transition
```

**Not allowed:** `block-assignment`, `reconcile-assignment`, `cancel-assignment`, `register-assignment`, `message-subagent`, `create-task`, `report-defect`, `update-subagent-session`.

### 4.5 Capability tokens

| Capability | Worker strict |
| --- | --- |
| `read_context` | yes |
| `edit_files` | **owned paths only** (prefer `edit_owned_files` in WP-3) |
| `run_commands` | validation/tests in scope |
| `submit_handoff` | own assignment |
| `report_activity` | own agent |
| `receive_assignment` | yes |
| `open_blocking_task` | conditional (`blockingPolicy`) |
| `open_bug_report` | assignment-scoped |
| `read_git_diff` | optional |
| `write_task_state` | **no** (use `run-transition` overlay only) |
| `spawn_subagents` | own session only |
| `record_subagent_session` | **no** |
| `open_pr` | optional via maintainer loop, not broad create |

### 4.6 Anti-patterns (over-permissioning)

Agents **must not** widen workers by:

- Adding `reconcile-assignment` or `cancel-assignment` to worker definitions
- Putting `block-assignment` on worker `allowedCommands` (supervisor block only)
- Omitting `resources.forbiddenPaths` on high-risk repos (`package.json`, lockfiles, extension policy)
- Setting `blockingPolicy` to allow blocker create without provenance fields
- Granting `write_task_state` on task-worker definitions

---

## 5. Context profile: `orchestrator_context_v1`

### 5.1 Required context slices

| Slice | Source | Notes |
| --- | --- | --- |
| Phase snapshot | `phase-status`, planning generation | `phaseKey`, ready/blocked/in-progress counts |
| Task queue | `get-next-actions`, `list-tasks` | Filtered to active phase; no full ROADMAP prose slurp |
| Assignments | `list-assignments` | All active assignments + handoff summaries |
| Agent registry | `list-subagents`, activity projection | Definitions + live activity |
| Blockers / dependencies | Task `dependsOn`, blocker tasks | Linked `blockerTaskId` from assignments |
| Recent handoffs | Assignment `handoff` v2 | Compact; no full transcripts |
| Plan artifact | Phase plan / WBS doc pointer | e.g. `AGENT_ORCHESTRATION_TASKS.md` section for phase |

### 5.2 Optional context slices

| Slice | When included |
| --- | --- |
| Dashboard summary | UX/debugging |
| Model tier table | §7 of this doc |
| Failed validations | Recent `pnpm run check` / CI failures on phase branch |
| Cost notes | Future telemetry placeholder |

### 5.3 Exclusions (orchestrator)

- Worker-owned file diffs unless reviewing handoff evidence
- Unrelated phase tasks outside supervision scope
- Raw `.workspace-kit/tasks/workspace-kit.db` bytes

---

## 6. Context profile: `task_worker_context_v1`

### 6.1 Required context slices

| Slice | Source |
| --- | --- |
| Assignment record | `list-assignments` / assignment id |
| Execution task | `get-task` for `executionTaskId` |
| Acceptance criteria | Task row + assignment metadata |
| Resource rules | `resources.*`, top-level `ownedPaths` / `forbiddenPaths` |
| Allowed commands | `AgentDefinition.allowedCommands` ∩ this profile allowlist |
| Handoff contract | `handoffContractId` → A-HANDOFF rubric |
| Activity rules | Heartbeat 30s, TTL 90s (foundation §8) |
| Machine canon pointers | `.ai/**` per agent-doc-routing; not `docs/maintainers` routine slurp |

### 6.2 Optional context slices

| Slice | When included |
| --- | --- |
| Narrow architecture note | Single A-ARCH section when task touches storage |
| Failing test output | Bounded log excerpt |
| Related blocker task | When `blockerTaskId` set |

### 6.3 Exclusions (worker)

- Full phase queue reprioritization data
- Other workers' assignments (unless read-only dependency note in handoff)
- Orchestrator-only policy traces

---

## 7. Model profiles, tiers, and routing rubric

### 7.1 Model tier enum (A-SCHEMA §2.5)

```text
cheap_fast
balanced
high_reasoning
specialist
human_review
```

Recorded on **AgentSession**, **AgentActivity**, and assignment metadata as `modelTier`.

### 7.2 Model profiles

| `modelProfileId` | Default tier band | Typical role |
| --- | --- | --- |
| `high_reasoning_or_balanced_v1` | `high_reasoning` or `balanced` | Orchestration Agent — planning, reconciliation, ambiguous failures |
| `balanced_or_cheaper_v1` | `balanced` or `cheap_fast` | Task Work Agent — implementation within owned paths |

Profiles **do not** pin provider model strings in v1; optional `modelHint` on session/activity is host-specific telemetry.

### 7.3 Tier selection guidance (foundation §12)

| Tier | Use when |
| --- | --- |
| **cheap_fast** | Inventory, docs cleanup, mechanical edits, formatting, narrow low-risk fixes |
| **balanced** | Normal features, dashboard UI, moderate tests, bounded refactors |
| **high_reasoning** | Architecture, schema/DB, sync/concurrency, task-engine lifecycle, cross-module work |
| **specialist** | Domain specialists (UX, security review, validation depth) |
| **human_review** | Destructive, policy/security-sensitive, irreversible migrations, product ambiguity |

### 7.4 Orchestration Agent routing rubric

The Orchestration Agent **should** set assignment `modelTier` using weighted inputs (no automatic router in v1):

| Input | Weight | Escalates tier when |
| --- | --- | --- |
| **complexity** | high | Many modules, non-local reasoning |
| **risk** | high | Data loss, security, release gates |
| **ambiguity** | high | Unclear acceptance or conflicting specs |
| **file count** | medium | Large touch surface |
| **architecture impact** | high | A-ARCH boundaries, new stores |
| **schema/migration impact** | critical | → `high_reasoning` or `human_review` |
| **test difficulty** | medium | Flaky CI, integration gaps |
| **policy sensitivity** | critical | Tier A/B commands, approval model |
| **context size** | medium | Large context profile slice count |
| **reasoning depth** | high | Debugging unknown root cause |

**Decision procedure (v1):**

```text
1. Start at modelProfile default for role (orchestrator → high_reasoning_or_balanced_v1).
2. If any critical input fires → human_review or high_reasoning.
3. Else if two or more high-weight inputs fire → high_reasoning.
4. Else if implementation-only and ownedPaths narrow → balanced or cheap_fast for workers.
5. Record rationale in assignment metadata: metadata.modelTierRationale (string, one paragraph max).
6. Persist packet-layer guidance as metadata.modelTierRecommendation = { label: "tier_1" | "tier_2" | "tier_3", rationale }.
```

**Example metadata:**

```json
{
  "modelTier": "high_reasoning",
  "modelTierRationale": "Cross-module contract pack + schema enums; architecture impact.",
  "modelTierRecommendation": {
    "label": "tier_3",
    "rationale": "Cross-module contract pack + schema enums; architecture impact."
  }
}
```

### 7.5 Cost posture (documentation-only v1)

| Tier | Cost posture | Speed posture |
| --- | --- | --- |
| cheap_fast | minimize | maximize |
| balanced | default | default |
| high_reasoning | accept higher | accept slower |
| specialist | accept higher | depends on domain |
| human_review | N/A (human) | gate |

Telemetry and provider mapping are **future work** (foundation §12).

---

## 8. Host compatibility and capability vocabulary

### 8.1 Rule

```text
Host labels are hints.
Capabilities are what matter.
```

`AgentDefinition.hostCompatibility[]` uses labels from A-SCHEMA §2.3:

```text
cursor
vscode
cli
codex
mcp
service
manual
unknown
```

### 8.2 Required vs optional capabilities

**Orchestration Agent (recommended):**

| Required | Optional |
| --- | --- |
| `read_context` | `record_subagent_session` |
| `receive_assignment` | `spawn_subagents` |
| `submit_handoff` | `open_pr` |
| `report_activity` | |
| `write_task_state` | |

**Task Work Agent (recommended):**

| Required | Optional |
| --- | --- |
| `read_context` | `open_blocking_task` |
| `edit_files` | `open_bug_report` |
| `run_commands` | `read_git_diff` |
| `submit_handoff` | |
| `report_activity` | |
| `receive_assignment` | |

Full superset and validator behavior: **AGENT_ORCHESTRATION_CONTRACTS.md** §2.4. Unknown capability strings: advisory `unknown-capability` in strict mode.

### 8.3 Host × capability matrix (v1 documentation)

| Host label | Typical capabilities present |
| --- | --- |
| **cursor** | `read_context`, `edit_files`, `run_commands`, `submit_handoff`, `report_activity`, `spawn_subagents` |
| **vscode** | same as cursor |
| **cli** | `read_context`, `run_commands`, `submit_handoff`, `report_activity` |
| **manual** | `read_context`, `receive_assignment` (human operator) |
| **service** | `read_context`, `report_activity`, `stream_activity` |
| **mcp** / **codex** | host-specific; treat as `unknown` until adapter registry |

Assignment registration **should** verify `requiredCapabilities` ⊆ host-advertised capabilities before `assigned` (future WP-3).

---

## 9. Resource ownership metadata rules

### 9.1 Storage shape (assignment metadata v1)

Normative JSON under `resources` (A-SCHEMA assignment metadata):

```json
{
  "resources": {
    "ownedPaths": ["AGENT_ORCHESTRATION_PROFILES.md"],
    "readOnlyPaths": [".ai/**", "AGENT_ORCHESTRATION_FOUNDATION.md"],
    "sharedPaths": [],
    "forbiddenPaths": ["extensions/cursor-workflow-cannon/**", "package.json", "pnpm-lock.yaml"],
    "requiresApprovalPaths": ["src/contracts/**", "src/core/state/**"]
  },
  "lockScope": {
    "tasks": ["T100628"],
    "modules": [],
    "commands": []
  }
}
```

Top-level duplicates (`ownedPaths`, `forbiddenPaths`, …) **may** mirror `resources.*` for bridge readers; writers **should** keep them consistent.

### 9.2 Path rule semantics

| Field | Worker may |
| --- | --- |
| `ownedPaths` | Read and modify (glob semantics) |
| `readOnlyPaths` | Read only |
| `sharedPaths` | Modify only with orchestrator coordination |
| `forbiddenPaths` | Neither read-for-edit nor modify |
| `requiresApprovalPaths` | Stop and request orchestrator/human approval before edit |

### 9.3 Orchestrator defaults

- Orchestrator **without** worker hat: **no** default `ownedPaths`; reads assignment resources to review handoffs.
- Orchestrator **explicitly assigned as worker**: same rules as `task_worker_strict_v1` for that assignment only.

### 9.4 `lockScope` (collision metadata v1)

| Key | Purpose |
| --- | --- |
| `tasks[]` | Execution task ids owning this delivery |
| `modules[]` | Logical module ids (e.g. `task-engine.dashboard`) |
| `commands[]` | Reserved for future command-level locks |

No enforceable lease manager in v1 — metadata for dashboard projection and human operators only.

### 9.5 `blockingPolicy` (worker blocker create)

| Value | `report-assignment-blocker` |
| --- | --- |
| `worker_may_open_blocking_task_and_report` | Allowed with provenance |
| omitted / other | **Denied** (fail closed, A-POLICY §5.2) |

Provenance required: `metadata.provenance.kind === "assignment_blocker"` with `assignmentId`, `workerId`, `executionTaskId`.

### 9.6 Design-doc delivery pattern (T100628-style)

```json
{
  "ownedPaths": ["AGENT_ORCHESTRATION_PROFILES.md"],
  "readOnlyPaths": [
    ".ai/**",
    "AGENT_ORCHESTRATION_FOUNDATION.md",
    "AGENT_ORCHESTRATION_POLICY.md",
    "AGENT_ORCHESTRATION_CONTRACTS.md",
    "AGENT_ORCHESTRATION_COMMANDS.md"
  ],
  "forbiddenPaths": ["extensions/cursor-workflow-cannon/**"],
  "requiresApprovalPaths": ["src/contracts/**"],
  "blockingPolicy": "worker_may_open_blocking_task_and_report"
}
```

---

## 10. Binding profiles to AgentDefinition

### 10.1 Orchestration Agent (reference)

```json
{
  "agentDefinitionId": "orchestration-agent",
  "role": "orchestrator",
  "accessProfileId": "orchestrator_access_v1",
  "contextProfileId": "orchestrator_context_v1",
  "modelProfileId": "high_reasoning_or_balanced_v1",
  "hostCompatibility": ["cursor", "vscode", "cli", "manual"],
  "requiredCapabilities": [
    "read_context",
    "receive_assignment",
    "submit_handoff",
    "report_activity",
    "write_task_state"
  ],
  "optionalCapabilities": ["record_subagent_session", "spawn_subagents", "open_pr"]
}
```

Fixture: `fixtures/agent-orchestration/agent-definition-orchestration-agent.v1.json`.

### 10.2 Task Work Agent (reference)

```json
{
  "agentDefinitionId": "task-worker",
  "role": "task_worker",
  "accessProfileId": "task_worker_strict_v1",
  "contextProfileId": "task_worker_context_v1",
  "modelProfileId": "balanced_or_cheaper_v1",
  "allowedCommands": [
    "set-agent-activity",
    "clear-agent-activity",
    "submit-assignment-handoff",
    "report-assignment-blocked",
    "report-assignment-blocker",
    "report-assignment-defect"
  ]
}
```

Fixture: `fixtures/agent-orchestration/agent-definition-task-worker.v1.json` — **update `allowedCommands` in T-AO-110** to match §4.4 (remove `block-assignment`).

### 10.3 Assignment overrides

Orchestrator **may** set per assignment:

| Field | Override allowed |
| --- | --- |
| `modelTier` | yes (with `modelTierRationale`) |
| `modelTierRecommendation` | derived packet field using `tier_1` / `tier_2` / `tier_3` |
| `contextProfileId` | yes (must stay role-compatible) |
| `accessProfileId` | **no widening** — only `task_worker_strict_v1` or `orchestrator_access_v1` |
| `resources` | yes (narrower paths encouraged) |

---

## 11. Cross-artifact consistency

| Check | Foundation | A-POLICY | A-SCHEMA | A-PROFILES |
| --- | --- | --- | --- | --- |
| Profile ids | §10–§12, §19 | §2.3 | §2.1, §3 | §2 |
| Worker no self-reconcile | §6 | §4.2 | — | §4.3 |
| Model tiers | §12 | — | §2.5 | §7 |
| Resource rules | §14 | — | assignment §5 | §9 |
| Host labels | §13 | — | §2.3 | §8 |
| Worker `block-assignment` | §19.2 (stale example) | deny P-CMD-02 | stale in §3.6 example | §4.4 canonical |

---

## 12. Verification and human approval

### 12.1 Acceptance mapping (T100628 / A-PROFILES)

| Criterion | Section |
| --- | --- |
| Profiles match foundation decisions | §3–§9, §11 |
| Reusable by AgentDefinition records | §2, §10 |
| Workers not over-permissioned | §4, §4.6 |
| Model tier rubric usable by Orchestration Agent | §7.4 |
| Verification evidence + operator sign-off | §12.2–12.3 |

### 12.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-PROFILES / `AGENT_ORCHESTRATION_PROFILES.md` |
| Reviewer | Antigravity |
| Decision | ☑ Approve as written |
| Notes | Approved per user request. |
| Date | 2026-06-02 |

Dependent tasks (**T-AO-110**, **T-AO-510**, **T-AO-520**, **T-AO-340**) should treat profile enforcement as **draft** until the table above records approval.

### 12.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| Aligns with foundation §10–§14, §19 | §11 |
| Aligns with A-POLICY mutation matrix | §3–§4, §11 |
| Aligns with A-SCHEMA enums and profile id patterns | §2, §7.1, §8 |
| Worker deny list includes reconcile/cancel/supervisor-block | §4.3 |
| Resource metadata rules match foundation §14 | §9 |
| Phase 126 WBS manifest (`AGENT_ORCHESTRATION_TASKS.md`) | **Unmodified** — no conflict |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100628-orchestration-profiles) |

---

## 13. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative intent (§10–§14) |
| [AGENT_ORCHESTRATION_POLICY.md](./AGENT_ORCHESTRATION_POLICY.md) | Mutation authority (A-POLICY) |
| [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) | JSON shapes (A-SCHEMA) |
| [AGENT_ORCHESTRATION_COMMANDS.md](./AGENT_ORCHESTRATION_COMMANDS.md) | Command argv (A-COMMANDS) |
| [AGENT_ORCHESTRATION_TASKS.md](./AGENT_ORCHESTRATION_TASKS.md) | WBS-AO-050 scope |
| `fixtures/agent-orchestration/**` | Golden AgentDefinition / assignment examples |
| `.ai/POLICY-APPROVAL.md` | Tier A/B approval lanes |

---

## 14. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-PROFILES for Phase 126 / T100628 |
