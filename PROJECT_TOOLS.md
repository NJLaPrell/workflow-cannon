# Project Tools for Workflow Cannon

Yes — there are several “agent-control surfaces” besides skills/rules/plugins. The important distinction is:

> Some things **shape the agent’s behavior**, some things **give it tools**, some things **feed it context**, and some things **govern/verify what it did**.

For Workflow Cannon, we should use all four layers.

## The landscape

| Thing | What it is | Used for | How Workflow Cannon should use it |
|---|---|---|---|
| **Project Rules** | Version-controlled Cursor instructions in `.cursor/rules`. | Persistent repo-specific behavior guidance. | Core Workflow Cannon operating rules: source-of-truth order, policy gates, task-engine usage, docs rules, release rules. Cursor documents project rules as repo-scoped, reusable instructions. |
| **User Rules** | Global Cursor settings for one user. | Personal preferences across all projects. | Keep minimal: tone, verbosity, maybe “prefer safe previews.” Do not put Workflow Cannon repo law here. User rules apply globally. |
| **AGENTS.md** | Markdown agent instruction file. | Cross-tool agent instructions, not just Cursor. | High-level agent constitution: “read `.ai/agent-source-of-truth-order.md` first,” task-engine policy, no hand-edit stores. Cursor supports AGENTS.md as an agent-instruction format. |
| **Skills** | Reusable task-specific instruction packages, usually with `SKILL.md`. | On-demand capabilities: release captain, PR review, task authoring, doc writer. | Build a first-party Workflow Cannon skill pack. Use for repeatable procedures, not core law. Community reports suggest skills need strong names/descriptions to be selected reliably. |
| **MCP Servers** | External tool/data adapters exposed to the agent. | Give Cursor access to tools, APIs, databases, GitHub, task systems. | Expose Workflow Cannon as an MCP server: task state, phase status, release preflight, branch triage, evidence commands. Cursor supports MCP via stdio, SSE, and Streamable HTTP transports. |
| **Cursor Extension** | VS Code/Cursor extension UI + commands. | Dashboard, buttons, panels, command palette, status bar. | Your existing Workflow Cannon dashboard belongs here: setup wizard, phase board, first quests, PR/release panels. |
| **CLI Commands** | Deterministic local commands like `wk run ...`. | Stable operations and machine-readable outputs. | The core of Workflow Cannon. Anything repeated twice by an agent should probably become a CLI command. |
| **Playbooks** | Step-by-step operational docs. | Complex workflows that still need judgment. | Phase delivery, stale merge recovery, release closeout, branch cleanup, PR review. Playbooks should point to CLI commands. |
| **Runbooks** | Troubleshooting / recovery docs. | Fixing known failure modes. | Native SQLite recovery, doctor failures, merge conflicts, release failures. |
| **Templates** | Reusable output structures. | Docs, tasks, PR reviews, release notes, bug reports. | Task templates, release summary templates, evidence templates, PR review templates. |
| **Schemas / Contracts** | JSON schemas and command contracts. | Validate machine-readable outputs. | Setup status, release evidence, task evidence, branch triage output, PR preflight output. |
| **Hooks / Git hooks / CI gates** | Automated checks before commit/merge/publish. | Prevent bad state from landing. | Orphan docs, generated docs drift, deletion-register guard, release metadata, task-state rules. |
| **Prompt libraries** | Reusable prompts for chat prefill. | Start agent workflows with the right context. | Cursor dashboard buttons: “Run release closeout,” “Analyze branch,” “Create task from transcript.” |
| **Memories** | Cursor-generated remembered context from chats. | Lightweight remembered preferences. | Do not rely on these for Workflow Cannon law. Cursor memories are generated from chat and scoped to repos, but they are less controlled than rules/docs. |
| **Scratchpads / session notes** | Temporary working notes. | Local reasoning and handoff. | Let agents keep temporary investigation notes, but require durable outputs to become tasks/docs/evidence. |
| **Dashboards / status panels** | Human-facing state views. | Make workflow state visible. | Show setup readiness, phase progress, task queues, release readiness, policy warnings. |
| **Checklists** | Explicit done-definition lists. | Prevent skipped steps. | Release done checklist, destructive operation checklist, PR review checklist. |
| **ADR / Decision records** | Durable decision history. | Explain why architecture/process choices exist. | Record major Workflow Cannon product/process decisions: setup wizard, task DB policy, release evidence policy. |

## How I’d divide responsibility

### Rules are for “always true” repo law

Use `.cursor/rules` for things that should apply repeatedly and quietly.

Examples:

```text
- Do not hand-edit `.workspace-kit/tasks/workspace-kit.db`.
- Use Workflow Cannon task-engine commands for task state.
- Destructive operations require preview and explicit approval.
- Root docs are intentionally minimal.
- Generated docs should not be hand-edited.
- Release work requires release evidence.
```

Rules should be short and scoped. Cursor’s docs explicitly say project rules are version-controlled and scoped to the codebase, and can be always-on, auto-attached, agent-requested, or manually referenced depending on rule type.

### Skills are for “how to do this kind of work well”

Use skills for procedures that the agent should opt into.

Examples:

```text
workflow-cannon-release-captain
workflow-cannon-pr-review
workflow-cannon-branch-triage
workflow-cannon-merge-conflict-triage
workflow-cannon-task-author
workflow-cannon-retrospective-analyst
human-document-writer
technical-document-formatter
```

Skills should not be the only place policy lives. Skills can be missed or not selected. Community reports around Cursor skills suggest selection depends heavily on names/descriptions and whether the task clearly matches the skill.

### MCP is for external and structured tool access

MCP should expose Workflow Cannon operations directly to agents.

Ideal MCP tools:

```text
workflowCannon.getNextPhaseTask
workflowCannon.getSetupStatus
workflowCannon.previewBranchCleanup
workflowCannon.checkMergeability
workflowCannon.triageAbandonedBranches
workflowCannon.prepareRelease
workflowCannon.generateReleaseEvidence
workflowCannon.createTask
workflowCannon.getTask
workflowCannon.runPreflight
```

Cursor’s MCP support is exactly meant for connecting agents to external tools and data sources, with local `stdio` or remote HTTP/SSE style transports.

My strong take: **Workflow Cannon should become its own MCP server eventually.** The CLI is great for deterministic local use; MCP makes those commands first-class agent tools.

### CLI commands are the real source of determinism

Anything the agent currently “figures out” repeatedly should become a command.

Examples from the transcript:

```bash
wk run branch-mergeability-check
wk run abandoned-branch-triage
wk run stale-phase-merge-plan
wk run release-strategy
wk run release-closeout
wk run affected-area-tests
wk run remote-branch-cleanup-preview
wk run phase-next
```

This is where Workflow Cannon becomes powerful: fewer tokens, fewer guesses, more structured outputs.

### Playbooks are for workflows that still need judgment

A command can say “these files conflict.” A playbook says “when the conflict is a stale phase branch, use this policy.”

Good playbooks:

```text
stale-phase-recovery.md
release-closeout.md
remote-branch-cleanup.md
pr-review.md
phase-delivery.md
documentation-governance.md
dashboard-ui-smoke.md
```

### Templates are for consistent output

Templates keep writing quality consistent without putting a huge burden on the model.

Examples:

```text
bug-report.template.md
task-candidate.template.md
release-summary.template.md
pr-review.template.md
retrospective-task.template.md
human-doc.template.md
```

Use templates when the output structure matters more than creativity.

### Schemas/contracts are for machine trust

Every important Workflow Cannon command should have a schema.

Examples:

```text
setup-status.schema.json
branch-triage.schema.json
release-evidence.schema.json
delivery-summary.schema.json
scope-gap.schema.json
```

If agents are going to rely on outputs, the outputs should be validated.

### Hooks/CI gates are for “never let this land”

Use gates for things the agent should not be trusted to remember.

Examples:

```text
- orphan .ai docs
- generated docs drift
- deletion-register resurrection
- release metadata mismatch
- schema snapshot mismatch
- forbidden root artifacts
- task evidence missing
- scope gap without disposition
```

If the rule is important enough, it should be a check, not a suggestion.

## What Workflow Cannon should add specifically

### 1. Workflow Cannon Skill Pack

Directory:

```text
.cursor/skills/workflow-cannon/
  task-author/SKILL.md
  bug-report-writer/SKILL.md
  release-captain/SKILL.md
  pr-review/SKILL.md
  merge-conflict-triage/SKILL.md
  policy-gate/SKILL.md
  branch-archaeology/SKILL.md
  retrospective-analyst/SKILL.md
  cli-command-designer/SKILL.md
```

Purpose: make the agent better at Workflow Cannon work.

### 2. Cursor Rules Pack

Directory:

```text
.cursor/rules/
  workflow-cannon-core.mdc
  workflow-cannon-policy.mdc
  workflow-cannon-task-engine.mdc
  workflow-cannon-doc-governance.mdc
  workflow-cannon-release.mdc
  workflow-cannon-dashboard.mdc
```

Purpose: persistent repo law.

### 3. MCP Server

Potential command:

```bash
wk mcp
```

or package binary:

```bash
workflow-cannon-mcp
```

Expose read-mostly tools first. Avoid giving MCP destructive tools until policy handling is excellent.

Phase 1 MCP tools:

```text
get_setup_status
get_next_actions
get_task
list_tasks
phase_status
release_strategy
branch_mergeability_check
affected_area_tests
```

Phase 2 mutating tools:

```text
create_task
run_transition
prepare_release_version
remote_branch_cleanup_apply
```

Mutators must require explicit policy approval.

### 4. Prompt/Chat Prefill Library

This already exists somewhat in your extension. Expand it.

Buttons:

```text
Run PR Preflight
Start Release Closeout
Analyze Abandoned Branches
Create Retrospective Tasks
Convert Existing Task List
Run Dashboard Smoke
```

The prompt should instruct the agent to use deterministic `wk` commands first.

### 5. Workflow Cannon Setup Wizard

This is the thing we already planned.

It should configure:

- rules present
- skills installed
- MCP available
- dashboard enabled
- project context generated
- first quests
- advanced controls

In other words, the setup wizard should not only attach Workflow Cannon — it should make the agent workspace powerful.

## The most important “things” by value

| Rank | Thing | Why |
|---:|---|---|
| 1 | **CLI commands** | Deterministic, testable, low-token. |
| 2 | **Rules** | Always-on repo law. |
| 3 | **CI gates/hooks** | Enforce what agents forget. |
| 4 | **MCP server** | Makes Workflow Cannon a real agent tool system. |
| 5 | **Skills** | Improves specialized task behavior. |
| 6 | **Playbooks** | Handles complex judgment workflows. |
| 7 | **Schemas/contracts** | Makes outputs machine-trustworthy. |
| 8 | **Dashboard/extension** | Makes state visible and clickable. |
| 9 | **Templates** | Improves consistency of docs/tasks/reviews. |
| 10 | **Memories** | Useful but least trustworthy; do not depend on them. |

## The architecture I’d use

```text
Workflow Cannon Agent Layer

1. Rules
   Always-on behavior constraints.

2. Skills
   Task-specific expert procedures.

3. Playbooks
   Longer operational workflows.

4. CLI / wk run
   Deterministic execution and reports.

5. MCP
   Tool bridge for Cursor/agents.

6. Dashboard
   Human-visible state and action buttons.

7. CI gates
   Final enforcement before merge/release.
```

## Practical example

User says:

> “Clean up stale branches.”

The system should work like this:

1. **Rule triggers:** destructive branch operations require preview.
2. **Skill selected:** branch archaeology + policy gate.
3. **CLI command runs:** `wk run remote-branch-cleanup-preview`.
4. **Dashboard shows:** safe/caution/protected branches.
5. **User approves exact list.**
6. **CLI applies:** `remote-branch-cleanup-apply`.
7. **Evidence recorded.**

That is the Workflow Cannon philosophy.

Not:

> Agent runs `git branch -r --merged` and deletes everything.

## Another example

User says:

> “Release this.”

Workflow should be:

1. **Rule:** release requires evidence.
2. **Skill:** Release Captain.
3. **CLI:** `release-strategy`.
4. **CLI:** `release-preflight`.
5. **CLI:** `prepare-release-version` if needed.
6. **CI/gates:** build/check/test/parity.
7. **CLI:** `release-closeout`.
8. **Evidence:** persisted manifest.

No multi-prompt “oh yeah, do the bookkeeping too.”

## Security warning

Be cautious with third-party skills/plugins. Recent research on public skill ecosystems found redundancy and safety risks, including skills that enable state-changing/system-level actions. Another recent paper specifically warns that `SKILL.md` metadata/instructions can shape skill discovery and selection in adversarial ways.

For Workflow Cannon, third-party skills should be treated like dependencies:

```text
reviewed
versioned
pinned
scoped
no hidden scripts
no destructive authority
```

## My final recommendation

Workflow Cannon should use:

```text
Rules for law.
Skills for craft.
CLI for truth.
MCP for tools.
Playbooks for judgment.
Schemas for trust.
CI gates for enforcement.
Dashboard for humans.
Templates for consistency.
```

And the priority build order should be:

1. `.cursor/rules` cleanup and router rule
2. first-party Workflow Cannon skill pack
3. deterministic CLI commands from the retrospective
4. MCP server exposing read-only Workflow Cannon state
5. dashboard buttons for those commands
6. CI gates for any rule that must never be forgotten

That combination makes Cursor dramatically more powerful without turning the repo into a pile of prompts.
