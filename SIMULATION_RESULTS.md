# Simulation Results: Dashboard-Launched Phase Orchestration

**Status:** Analysis artifact  
**Scenario:** A brand-new AI agent session is launched from the Workflow Cannon dashboard using the Complete & Release Phase prompt.  
**Goal:** Identify what context the agent receives, what it does next, how the process evolves through phase closeout and delivery, and where Workflow Cannon provides too much or too little context.

## 1. Starting condition: brand-new session

The agent starts with:

- host/system instructions from the AI tool;
- the Workflow Cannon dashboard-generated Complete & Release prompt;
- attached playbooks, runbooks, rules, and machine command maps;
- whatever repository files the host auto-indexes or retrieves.

The agent does **not** start with actual phase state. It receives the target phase key and instructions to refresh Workflow Cannon state.

### Context available immediately

- Role: Workflow Cannon Phase Orchestrator.
- Intent: complete, release, and publish the target phase if gates pass.
- Phase key, label, workspace current/next, scope, and release branch.
- Dashboard authorization semantics.
- Attached authority list.
- High-level phase state machine.
- Team Assignment and subagent orchestration expectations.
- When to ask the user.
- Final report format.

### Too much context at this point

The agent receives broad procedural authority before it knows whether it needs it:

- phase closeout playbook;
- task-to-phase branch playbook;
- recovery runbook;
- machine playbooks;
- AGENT-CLI-MAP;
- Cursor rules;
- optional triage and wishlist playbooks.

If the phase is empty or completed-only, much of this may never be needed.

### Not enough context at this point

The agent lacks:

- actual phase task list;
- completed task count;
- non-terminal task count;
- ready task IDs;
- blocked task IDs;
- existing phase branch status;
- current git branch;
- release evidence state;
- package version state;
- CI status;
- task-state sync freshness.

## 2. First likely step: read attached authorities

A typical agent first inspects attached files such as:

- `.ai/playbooks/phase-closeout-and-release.md`
- `.ai/playbooks/task-to-phase-branch.md`
- `.ai/runbooks/phase-closeout-ordering-recovery.md`
- `.ai/MACHINE-PLAYBOOKS.md`
- `.ai/AGENT-CLI-MAP.md`
- `.cursor/rules/*`

### Context gained

The agent learns:

- canonical commands;
- transition rules;
- task-to-branch delivery procedure;
- closeout ordering;
- release and publish gates;
- policyApproval expectations.

### Too much context

The agent may read the full playbook set before it knows which phase path applies. For an empty phase, this is wasted. For a completed-only phase, worker delivery playbooks may be unnecessary.

### Not enough context

The files provide procedures, not a resolved execution plan. The agent must still decide:

- which commands to run first;
- what counts as terminal;
- which tasks belong to the phase;
- whether to spawn subagents;
- how many tasks are parallel-safe;
- which model tier/subagent to use.

## 3. Initial Workflow Cannon read pass

The agent then refreshes Workflow Cannon state using `wk run` commands from the runbooks and command maps. It will usually inspect:

- doctor/health state;
- phase status;
- next actions;
- maintainer delivery policy;
- closeout readiness;
- task list or task roster.

### Context gained

- Current workspace phase information.
- Ready queue overview.
- Phase closeout readiness.
- Task rows and statuses.
- Policy posture.
- Possible blockers.

### Too much context

A broad task list can force the agent to manually filter the whole task store. The agent only needs a bounded phase roster.

### Not enough context

The agent may not receive enough dependency and parallelization metadata. It needs a structure like:

```json
{
  "phaseKey": "128",
  "terminal": [],
  "readyUnblocked": [],
  "blocked": [],
  "inProgress": [],
  "proposed": [],
  "wishlistIntake": [],
  "dependencyGraph": {},
  "parallelizableGroups": []
}
```

## 4. Phase path classification

The agent chooses one of three paths.

### Path A — Empty phase

Condition:

- completed task count is zero;
- non-terminal task count is zero.

Action:

- stop;
- report that there is no phase work to release;
- do not merge, tag, release, or publish.

### Path B — Completed-only phase

Condition:

- completed task count is greater than zero;
- non-terminal task count is zero.

Action:

- verify completed work has evidence;
- run closeout/release gates;
- merge release branch to main;
- release, tag, publish, verify;
- clear or advance workspace phase;
- report evidence.

### Path C — Active phase work remains

Condition:

- any non-terminal phase task exists.

Action:

- drain phase first;
- triage remaining work;
- assign ready unblocked tasks to subagents in parallel;
- reconcile handoffs;
- complete tasks with evidence;
- repeat until Path B applies.

## 5. Active phase drain: triage remaining tasks

The orchestrator inspects all non-terminal tasks:

- proposed;
- ready;
- in_progress;
- blocked;
- wishlist_intake;
- research;
- approval/human gate;
- other active statuses.

### Context gained

For each task, the agent typically retrieves:

- title;
- description;
- acceptance criteria;
- status;
- phase key;
- task type;
- dependencies;
- allowed transitions;
- recent transition history;
- possibly files or paths.

### Too much context

Repeated `get-task` calls can return long histories for many tasks. The agent may also reread the same runbooks for each task.

### Not enough context

The task object may not provide:

- owned paths;
- forbidden paths;
- expected branch name;
- model tier recommendation;
- parallelization safety;
- relevant runbook refs;
- validation commands;
- assignment prompt packet;
- handoff schema.

This forces the orchestrator to invent worker prompts and safety boundaries from scratch.

## 6. Accept proposed work

For proposed execution or improvement tasks that clearly belong in the phase, the agent accepts them. For ambiguous tasks, it may ask the user.

### Context gained

- transition result;
- updated task status;
- possibly updated task row.

### Too much context

If the agent refreshes the whole task queue after every transition, it burns unnecessary context.

### Not enough context

The agent needs a deterministic recommendation for proposed tasks:

- safe to accept;
- needs user decision;
- should defer;
- should cancel;
- should convert.

## 7. Register Team Assignments and subagents

For ready unblocked tasks, the orchestrator registers Team Assignments and assigns workers.

### Context the orchestrator must create

For each worker, the orchestrator has to assemble:

- task ID;
- task goal;
- acceptance criteria;
- branch instructions;
- base branch;
- owned scope;
- runbook references;
- validation expectations;
- handoff requirements;
- stop conditions;
- model/subagent choice.

### Too much context

If the orchestrator includes full runbook text, full task history, broad repo context, and all Workflow Cannon rules in every worker prompt, costs multiply quickly.

### Not enough context

If the orchestrator sends only a short task reference, the worker must rediscover:

- files to touch;
- commands to run;
- branch procedure;
- evidence requirements;
- forbidden scope;
- relevant tests.

### Missing ideal object

Workflow Cannon should provide an `agent-execution-packet` for a task, containing:

- task summary;
- acceptance criteria;
- owned paths;
- forbidden paths;
- base branch;
- suggested validation;
- relevant runbook refs;
- model tier;
- handoff schema;
- stop conditions.

## 8. Worker task execution

Each worker branches from the release phase branch, implements assigned work, validates, opens a PR back to the phase branch, and submits a handoff.

### Context gained by worker

- assignment prompt;
- task context;
- selected source files;
- test files;
- runbook snippets;
- command output;
- git diff;
- validation output;
- PR output;
- handoff content.

### Too much context

Workers often over-read:

- entire module directories;
- large docs;
- full task queues;
- full AGENT-CLI-MAP;
- full runbooks;
- old unrelated PRs;
- large test logs.

### Not enough context

Workers may lack:

- risky files;
- current phase branch state;
- expected test target;
- shared/locked files;
- sibling subagent ownership;
- partial-blocker reporting instructions.

## 9. Orchestrator monitoring and refresh

While workers run, the orchestrator monitors:

- Team Assignments;
- subagent activity;
- task statuses;
- PRs;
- branch merges;
- handoffs;
- blocked reports.

### Context gained

- worker handoff summaries;
- files changed;
- commands run;
- acceptance criteria status;
- PR links;
- blockers;
- risks.

### Too much context

Long prose handoffs, full diffs, and full logs become expensive.

### Not enough context

Thin handoffs force the orchestrator to inspect files and logs itself.

### Better pattern

Handoffs should be structured JSON-first with expandable details.

## 10. Reconcile each handoff

The orchestrator validates:

- scope respected;
- acceptance criteria met;
- commands run;
- PR targets the phase branch;
- no forbidden files changed;
- evidence sufficient.

Then it merges PRs into the phase branch, completes tasks, clears assignments, and refreshes task state.

### Too much context

The orchestrator may inspect full diffs and logs even for low-risk changes.

### Not enough context

Workflow Cannon needs a deterministic handoff reconciliation preflight that reports:

- scope ok/not ok;
- evidence present/missing;
- changed files ok/forbidden;
- commands ok/missing;
- recommended next action.

## 11. Repeat until phase drains

The orchestrator loops:

1. refresh phase state;
2. find newly ready tasks;
3. assign subagents;
4. reconcile handoffs;
5. complete tasks;
6. refresh again.

### Too much context

Repeated broad refreshes waste tokens:

- full task list;
- dashboard summary;
- `get-task` for each task;
- runbook rereads;
- rebuilt mental model.

### Not enough context

The orchestrator needs a delta:

- what changed since last generation;
- newly ready tasks;
- completed assignments;
- remaining blockers.

## 12. Completed-only state reached

Once all non-terminal phase work is terminal, the agent proceeds to closeout.

### Context needed

- phase branch status;
- completed task evidence;
- release readiness;
- validation requirements;
- package version state;
- changelog state;
- schema/packageVersion mirrors;
- release evidence manifest state;
- main PR state;
- publish status;
- workspace phase state.

### Too much context

The agent may read entire changelogs, schema files, package files, task histories, and release playbooks.

### Not enough context

The agent needs a single `phase-release-state` packet:

- ready to close out or not;
- missing evidence;
- version recommendation;
- release artifact state;
- branch/PR state;
- next commands.

## 13. Release validation

The agent runs release gates such as build, check, test, parity, pre-merge gates, phase-delivery preflight, and release evidence generation.

### Context gained

- command success/failure;
- test output;
- lint/type errors;
- release evidence records.

### Too much context

Full logs are too expensive when commands pass or fail with a small actionable error.

### Not enough context

When a command fails, the agent needs:

- failure owner;
- likely task/regression;
- affected module;
- safe recovery path;
- whether to summon a specialist such as The Wolf.

## 14. Version, changelog, and schema updates

The agent updates release artifacts:

- changelogs;
- package version;
- package version mirrors;
- schema packageVersion mirrors;
- release evidence manifest.

### Too much context

Full changelog and schema contents are often unnecessary.

### Not enough context

A deterministic release artifact updater would reduce manual editing and context loading.

## 15. Merge, publish, verify

The agent merges the phase branch to main, publishes, watches CI, updates workspace phase state, and verifies status.

### Context gained

- PR number;
- merge status;
- CI status;
- commit SHA;
- tag;
- npm publish result;
- workspace phase state.

### Too much context

Full PR diff, full publish logs, or full dashboard summary are often excessive.

### Not enough context

The agent needs compact checks for:

- already published status;
- release/tag consistency;
- workspace phase clear/advance state;
- final release result.

## 16. Final response

The agent reports:

- phase;
- path taken;
- released version;
- published package;
- main merge PR;
- tag;
- tasks completed during orchestration;
- tasks already completed before release;
- Team Assignments used;
- validation evidence;
- release evidence;
- workspace phase result;
- remaining follow-ups.

## 17. Main findings

### Workflow Cannon provides too much context when:

- it attaches all runbooks before phase path classification;
- it returns broad task/dashboard summaries instead of phase-specific packets;
- workers receive full runbooks instead of scoped task execution packets;
- handoffs/logs are prose-heavy instead of structured evidence;
- release closeout requires reading broad changelogs/schemas instead of release-state packets.

### Workflow Cannon provides too little context when:

- the orchestrator must infer phase path from broad task output;
- workers lack owned/forbidden paths and validation commands;
- no deterministic model-tier recommendation exists per task;
- no closeout-state packet gives release readiness, version, branch, artifact, and publish state;
- no delta-based refresh exists for long orchestration sessions.

## 18. Ideal orchestration flow

A better low-token flow would be:

1. small dashboard prompt;
2. `agent-bootstrap` lean or phase-focused context;
3. `phase-release-orchestration-state`;
4. choose Path A/B/C;
5. if active work remains, fetch `phase-drain-plan`;
6. for each ready task, fetch `agent-execution-packet`;
7. subagents execute from bounded packets;
8. run `assignment-reconciliation-preflight`;
9. repeat with `phase-drain-delta`;
10. fetch `phase-release-state`;
11. prepare release artifacts deterministically;
12. run closeout gates;
13. publish;
14. fetch `release-closeout-result`;
15. report evidence.

## 19. Practical conclusion

Current process:

```text
read prompt
read runbooks
discover phase state
infer path
discover tasks
infer assignments
write subagent prompts
monitor manually
reconcile manually
discover release state
run closeout
summarize manually
```

Better process:

```text
read small prompt
fetch phase orchestration packet
execute state machine
fetch task execution packets
reconcile with preflight commands
fetch release packet
publish
report evidence
```

The project already has the right direction with `agent-bootstrap`, which reduces separate cold-start discovery. The missing layer is to extend that same idea into phase execution, assignment execution, and release closeout.
