# Side Quest Mode Plan

## Purpose

Side Quest Mode is Workflow Cannon's lightweight lane for operator-directed, unplanned work.

It is designed for the real way maintainers often work: sometimes the operator wants to sit in a chat window and direct an agent through useful random tasks without first building a full phase plan.

The goal is not to remove structure. The goal is to make the structure light enough that the operator can keep momentum while Workflow Cannon quietly preserves safety, traceability, release readiness, and task-engine discipline.

Tagline:

```text
Fast enough to feel casual.
Tracked enough to ship.
Guarded enough to trust.
```

## Core Doctrine

Side Quest Mode is a task-engine-backed work lane.

It is not chat memory. It is not an untracked scratch mode. It is not permission to bypass policy.

```text
Side Quest Mode = task-engine-backed, operator-directed, release-aware work lane.
```

Side quest work should be:

- fast to enter
- easy to direct from chat
- tracked as real task-engine work
- isolated from regular phase work
- release-aware from the beginning
- promotable into regular phase/release work
- protected by the same policy gates as any other work

The main product risk is making casual work too formal. To avoid that, Side Quest Mode uses graduated strictness: capture should be light, file mutation should be tracked, completion should be validated, release should be evidenced, and promotion should require full task quality.

## Work Mode Model

Workflow Cannon should maintain a first-class current work mode.

Recommended modes:

```text
idle
phase
sidequest
release
repair
```

The current mode should be available through a deterministic command:

```bash
wk run work-mode-status '{}'
```

Suggested state shape:

```json
{
  "currentWorkMode": "sidequest",
  "activeTaskId": "T100501",
  "activePhaseKey": null,
  "sideQuestBatchId": "SQB2026-05-17-001",
  "unreleasedSideQuestCount": 3,
  "recommendedBehavior": "sidequest-only",
  "blockingRules": [
    "do-not-mix-phase-and-sidequest",
    "destructive-actions-require-preview",
    "substantial-file-work-requires-task-or-sidequest"
  ]
}
```

## Default CAE / Chat Startup Behavior

Side Quest behavior must be active from the moment a chat window opens.

The agent should not wait for the user to remember a mode or a rule. Every new agent session should begin by activating Workflow Cannon context and reading the current work mode.

Initial startup commands should be:

```bash
wk run agent-bootstrap '{}'
wk run work-mode-status '{}'
wk run get-next-actions '{}'
```

Eventually this should become a single deterministic command:

```bash
wk run cae-session-start '{}'
```

The `cae-session-start` command should be compact and purpose-built. It should not dump the whole repository state into context. The goal is to give the agent only the information needed to behave correctly before acting.

The `cae-session-start` command should return:

```json
{
  "currentWorkMode": "idle | phase | sidequest | release | repair",
  "activeTaskId": "T...",
  "activePhaseKey": "96",
  "sideQuestBatchId": "SQB...",
  "unreleasedSideQuests": 3,
  "recommendedBehavior": "ask-before-file-modification",
  "blockingRules": [
    "do-not-mix-phase-and-sidequest",
    "destructive-actions-require-preview",
    "substantial-file-work-requires-task-or-sidequest"
  ]
}
```

### CAE Startup Directions

Add or update canonical startup guidance in:

```text
.ai/cae/session-start.md
.ai/WORKSPACE-KIT-SESSION.md
.cursor/rules/workflow-cannon-work-mode.mdc
.cursor/rules/workflow-cannon-sidequest.mdc
```

Default agent behavior at chat start:

```text
1. Activate Workflow Cannon context.
2. Read current work mode.
3. Identify active task, phase, sidequest, or release state.
4. Do not modify files until the request is classified.
5. If requested work is substantial and no matching task exists, ask whether to:
   - create a regular task
   - enter Side Quest Mode
   - keep discussion only
6. If in Phase Work Mode, do not enter Side Quest Mode until phase work is complete, paused, or handed off.
7. If in Side Quest Mode, do not complete regular phase tasks.
8. If cumulative side quest work becomes substantial, recommend formal tasks or release planning.
9. If user says "Release the Barbarians!", record the override but keep all safety gates.
```

## Request Classification Nuance

The agent should not ask for Side Quest Mode on every small message.

The classification must be nuanced enough to avoid annoying the operator while still preventing untracked repo changes.

### Decision tree

The agent should classify requests in this order:

```text
1. Is this read-only or discussion-only?
   - Yes: proceed without task/sidequest prompt.

2. Will this modify files, task state, branch state, release state, or external systems?
   - No: proceed.
   - Yes: continue.

3. Is there already an active task/mode that covers this work?
   - Yes: continue inside that mode.
   - No: ask regular task vs Side Quest Mode vs discussion only.

4. Is the work destructive, release-related, schema-related, policy-related, or broad?
   - Yes: recommend regular task or release/repair mode; Side Quest requires explicit acceptance.

5. Is the work small, local, and operator-directed?
   - Yes: Side Quest Mode is appropriate.
```

### No prompt needed

The agent may proceed without asking for task/sidequest classification when the user asks for read-only or discussion-only work:

```text
Explain this file.
Summarize the release plan.
What should we do next?
Search for task status.
Draft a possible plan without editing.
Review this output.
Tell me what you think.
```

### Prompt usually required

The agent should ask before beginning if the request will substantially modify repository state:

```text
Fix this.
Update the docs.
Change the command behavior.
Delete stale branches.
Refactor this module.
Add tests.
Publish this.
Create or modify task-engine state.
Move, archive, or delete files.
```

Suggested default prompt when idle:

```text
This looks like repo-changing work.

Do you want to:
1. Submit it as a regular task
2. Start Side Quest Mode for quick tracked work
3. Keep this as discussion only
```

### Substantial file-changing work

The phrase "substantial file-changing work" should be interpreted practically.

| Request type | Prompt? | Notes |
| --- | --- | --- |
| Read/explain/summarize | No | Safe read-only work. |
| Draft plan without committing | Usually no | Ask only if user wants it saved. |
| One tiny typo/copy edit | Maybe | If no active mode, ask lightly or batch into existing side quest. |
| Add/update source files | Yes | Requires task or sidequest. |
| Add/update tests | Yes | Requires task or sidequest. |
| Move/delete files | Yes | Also requires policy preview. |
| Modify release/version/tag/publish state | Yes | Usually release mode, not sidequest. |
| Modify task DB/state | Yes | Requires task-engine safety rules. |
| Change policy/rules/security behavior | Yes | Usually regular task or explicit sidequest with high-risk warning. |

### Always ask before these actions

Even if the user phrases the request casually, the agent should ask before proceeding when the work includes:

- source code changes
- test changes
- deleting, moving, or archiving files
- branch deletion or force operations
- task-state mutations
- release/version/tag/publish changes
- policy, rule, security, or approval changes
- schema or contract changes
- generated artifact regeneration that may touch many files
- broad refactors or multi-area changes

### Avoiding annoying prompts

To mitigate prompt fatigue:

- Read-only work should never trigger the sidequest prompt.
- Small edits inside an already-active sidequest should attach to that sidequest or sidequest batch.
- Tiny documentation edits can be captured as low-risk sidequest work with one concise confirmation.
- If the user has explicitly entered Side Quest Mode, do not ask again for every small file change inside that mode.
- If the request is ambiguous, ask the smallest useful question.
- If the request is clearly dangerous, require preview and approval regardless of mode.
- If the user chooses discussion-only, do not create tasks or edit files.

## Discussion-Only Mode

Discussion-only is not a persisted work mode, but it is a valid classification outcome.

When the user chooses discussion-only, the agent may:

- explain
- analyze
- draft possible plans
- suggest tasks
- inspect state if read-only access is allowed

The agent must not:

- edit files
- create task-engine rows
- enter Side Quest Mode
- start phase work
- run mutating commands

Suggested confirmation:

```text
Discussion only. I’ll keep this to analysis and suggestions, with no file or task-state changes.
```

## Side Quest Strictness Levels

Side Quest Mode should become stricter only as the work becomes more real.

| Level | Name | Meaning | Required structure |
| --- | --- | --- | --- |
| 0 | Discussion only | No repo/task mutation. | None beyond clear user intent. |
| 1 | Captured sidequest | Lightweight task record exists. | title, intent, risk, releaseIntent. |
| 2 | File-changing sidequest | Agent will modify files. | acceptance criteria and validation plan required. |
| 3 | Completed unreleased sidequest | Work is done but not released. | summary, changed areas, validation evidence, release impact. |
| 4 | Release-bound sidequest | Included in sidequest release plan. | changelog candidate, semver impact, evidence references. |
| 5 | Promoted formal task | Sidequest becomes regular task/phase work. | full task fields and implementation details. |

This model keeps capture lightweight while making completion, release, and promotion rigorous.

## Capture vs Completion Requirements

Sidequest task requirements should depend on lifecycle stage.

### Capture requirements

At creation time, require only:

- title
- intent or one-sentence summary
- risk: low / medium / high / unknown
- releaseIntent: none / patch / minor / major / unknown

### File mutation requirements

Before modifying files, require:

- sidequest task exists
- acceptance criteria or clear done condition
- affected area
- validation plan or affected-area test plan

### Completion requirements

Before completion, require:

- completion summary
- changed files or changed areas
- validation run or explicit validation waiver
- release impact
- risk confirmation

### Release requirements

Before release bundling, require:

- releaseIntent is not unknown
- changelog candidate
- validation evidence
- sidequest task included in release evidence

### Promotion requirements

Before promotion, require full regular task details:

- title
- summary
- technical scope
- acceptance criteria
- implementation details
- validation plan
- risk notes if needed
- dependencies or explicitly none

## Mode Separation Rules

Side Quest Mode and Phase Work Mode must not mix.

```text
An agent working on side quests must not complete regular phase tasks.
An agent working on phase tasks must not enter Side Quest Mode until the phase work is complete, paused, or handed off.
```

### Mode transition table

| From | To | Allowed? | Condition |
| --- | --- | --- | --- |
| idle | sidequest | Yes | User chooses or agent asks. |
| idle | phase | Yes | Task selected. |
| idle | release | Yes | Release work selected. |
| phase | sidequest | No by default | Complete, pause, or hand off phase task first. |
| sidequest | phase | No by default | Complete, pause, or hand off sidequest first. |
| sidequest | release | Yes | Releasing sidequest bundle. |
| phase | release | Yes | Phase closeout/release. |
| release | sidequest | No by default | Release must complete or pause first. |
| repair | any | No by default | Repair must complete or be exited safely first. |

### Phase work active prompt

If user asks for sidequest-like work while phase work is active:

```text
I’m currently in Phase Work Mode on T____.
I should not start Side Quest Mode until that work is complete, paused, or handed off.

Choose:
1. Continue the phase task
2. Pause it and enter Side Quest Mode
3. Capture this request as a task for later
```

### Side Quest active prompt

If user asks to complete regular phase work while Side Quest Mode is active:

```text
You are currently in Side Quest Mode.
I should not complete regular phase work from here.

Choose:
1. Finish the current side quest
2. Pause Side Quest Mode and switch to phase work
3. Promote this side quest into a phase task
```

## Side Quest Tasks in the Task Engine

Side quests should plug directly into the task engine.

They should not live only in a separate lightweight JSON file unless the task engine cannot support them yet.

Recommended representation:

```json
{
  "id": "T100501",
  "type": "sidequest",
  "status": "ready",
  "title": "Improve release warning copy",
  "phaseKey": null,
  "lane": "sidequest",
  "workMode": "sidequest",
  "releaseIntent": "patch",
  "risk": "low",
  "metadata": {
    "sideQuest": true,
    "sideQuestBatchId": "SQB2026-05-17-001",
    "createdFrom": "operator-chat",
    "barbarianOverride": false
  }
}
```

### Status model

Use existing task statuses where possible:

```text
proposed -> ready -> in_progress -> completed
```

Mode-specific enforcement:

| Task type | Allowed mode |
| --- | --- |
| sidequest | Side Quest Mode only |
| regular phase task | Phase Work Mode only |
| release task | Release Mode only |
| repair/recovery task | Repair Mode only |

### Required fields for sidequest tasks

Sidequest tasks can be lighter than regular phase tasks, but still need enough structure to be releasable.

Minimum capture fields:

- title
- summary or intent
- risk: low / medium / high / unknown
- releaseIntent: none / patch / minor / major / unknown

Additional fields are required only when the sidequest reaches the relevant strictness level.

## Promotion to Regular Tasks

A sidequest task can be promoted into a regular phase/release task when it grows beyond casual scope or needs formal planning.

Command:

```bash
wk run promote-sidequest-task '{
  "taskId": "T100501",
  "targetPhaseKey": "98",
  "reason": "Scope expanded beyond patch side quest"
}'
```

Before promotion, Workflow Cannon validates:

| Field | Requirement |
| --- | --- |
| title | Clear and action-oriented. |
| summary | Present. |
| technical scope | Present. |
| acceptance criteria | Present and verifiable. |
| implementation details | Present enough for another agent. |
| validation plan | Present. |
| risk notes | Present if medium/high. |
| release impact | patch/minor/major/unknown. |
| dependencies | Known or explicitly none. |

If fields are missing:

```text
This side quest is not ready to promote.
Missing:
- acceptance criteria
- validation plan
- implementation details
```

### Promotion identity

Preferred long-term behavior: keep the same task ID and change the lane/type with transition history.

```json
{
  "id": "T100501",
  "type": "execution",
  "lane": "phase",
  "phaseKey": "98",
  "metadata": {
    "promotedFromSideQuest": true,
    "sideQuestBatchId": "SQB2026-05-17-001"
  }
}
```

Safer first implementation: create a linked regular task and close the sidequest as promoted.

```json
{
  "promotedTaskId": "T100777",
  "sourceSideQuestTaskId": "T100501"
}
```

The safer first implementation is recommended unless the task engine already handles type/lane changes cleanly in reports, guards, and release evidence.

## Branch Strategy

Side Quest Mode should not default to direct edits on `main`.

Recommended default:

```text
one sidequest batch branch per sidequest session
```

Branch name:

```text
sidequest/SQB2026-05-17-001
```

Multiple small sidequest tasks can live inside the same sidequest batch branch.

Task-level sidequest branches are optional and should be used when:

- the sidequest is medium/high risk
- the sidequest spans multiple areas
- the sidequest may be promoted
- the operator wants isolated review

Before entering Side Quest Mode, Workflow Cannon should check dirty tree state.

If the working tree is dirty:

```text
The working tree already has changes.

Choose:
1. Attach existing changes to a new sidequest
2. Stash changes and start clean
3. Continue discussion only
4. Abort Side Quest Mode
```

## Cumulative Side Quest Scope Management

Side Quest Mode should track when casual work is becoming a real campaign.

The system should monitor:

- number of active side quests
- number of completed unreleased side quests
- changed file count
- source file changes
- schema/contract changes
- docs-only vs code changes
- tests added/changed
- release intent accumulation
- risk level accumulation
- number of project areas touched
- days since sidequest batch started
- whether current branch has grown beyond patch scope

### Warning thresholds

Suggested initial thresholds:

| Trigger | Guidance |
| --- | --- |
| More than 3 completed unreleased side quests | Suggest release bundle. |
| More than 5 active side quests | Suggest planning or promotion. |
| More than 10 changed files | Suggest formal task/release plan. |
| More than 2 project areas touched | Suggest task grouping. |
| New command/API/schema added | Suggest regular task and likely minor release. |
| Destructive/policy/release logic touched | Suggest regular task or high-risk sidequest confirmation. |
| Tests failing or not run | Block completion/release. |
| Repeated related sidequests | Suggest promoting to a regular task set or phase. |

### Scope warning copy

```text
The side quests are becoming a real campaign.

Recommended: promote these into regular tasks and plan a release.
Override: say “Release the Barbarians!” to keep working in Side Quest Mode.
```

## “Release the Barbarians!” Override

`Release the Barbarians!` is the explicit user override that allows continued Side Quest Mode despite cumulative scope growing beyond normal sidequest size.

It is playful, but it must have strict boundaries.

It means:

```text
The user knowingly permits Side Quest Mode to continue despite scope growing beyond normal sidequest size.
```

It does not mean:

```text
Bypass policy gates.
Bypass destructive action preview.
Bypass tests.
Bypass release evidence.
Bypass schema compatibility.
Bypass publish approval.
Bypass task-engine safety.
```

The phrase should be case-insensitive and may have a UI equivalent:

```text
[Continue in Side Quest Mode anyway]
```

### Override record

When the user says `Release the Barbarians!`, record structured metadata:

```json
{
  "sideQuestOverride": {
    "overrideType": "sidequest-scope-guidance",
    "phrase": "Release the Barbarians!",
    "meaning": "User permits continued Side Quest Mode despite substantial cumulative change.",
    "timestamp": "...",
    "scope": "current-sidequest-bundle",
    "safetyGatesStillApply": true
  }
}
```

### Override response copy

```text
Barbarian override recorded.

You may continue Side Quest Mode despite growing scope.
Safety gates, tests, previews, and release evidence still apply.
```

## Release Impact Aggregation

Sidequest bundles may contain mixed work.

Workflow Cannon should use deterministic aggregation:

```text
highest release impact wins
major > minor > patch > none
```

Rules:

- Any `major` sidequest makes the bundle major or requires removal/promotion.
- Any `minor` sidequest makes the bundle at least minor.
- Patch-only sidequests can bundle into a patch release.
- Any `unknown` releaseIntent blocks release planning until classified.
- Docs-only sidequests may be `none` or `patch` depending project policy.
- Behavior/default changes should be at least minor unless explicitly classified otherwise.

`sidequest-release-plan` should explain the chosen release level and the sidequest that drove it.

Example:

```text
Recommended release: minor
Reason: T100612 adds a new command, which raises the bundle above patch.
```

## State Complexity Risks and Mitigations

The biggest implementation risk is added state.

Side Quest Mode adds mode state, sidequest tasks, sidequest batches, release intent, cumulative scope tracking, and promotion rules.

To keep this reliable, Workflow Cannon should use the following mitigations.

### Mitigation 1 — Single source of truth

The task engine should be the source of truth for sidequest tasks.

Do not store sidequest work only in chat memory.
Do not create a second independent sidequest task list unless it is clearly derived from task-engine state.

### Mitigation 2 — Explicit work mode status

Add one deterministic command that reports the current work mode and active work:

```bash
wk run work-mode-status '{}'
```

Every chat startup should read this command.

### Mitigation 3 — Mode transition commands

Mode changes should be explicit and logged:

```bash
wk run enter-sidequest-mode '{"reason":"Operator requested quick unplanned work"}'
wk run exit-sidequest-mode '{"reason":"Side quest batch complete"}'
wk run enter-phase-work-mode '{"taskId":"T100640"}'
wk run pause-work-mode '{"reason":"Switching contexts with user approval"}'
```

### Mitigation 4 — Recoverability

If mode state becomes inconsistent, Workflow Cannon should offer a repair path from the first implementation, not as late polish.

```bash
wk run work-mode-repair-preview '{}'
wk run work-mode-repair-apply '{"policyApproval":{"confirmed":true,"rationale":"repair stale work mode state"}}'
```

Repair should detect:

- active task missing
- active task completed but mode still active
- sidequest mode active with no sidequest batch
- phase mode active with no phase task
- release mode active after release closeout
- task type and mode mismatch
- sidequest batch has no active or completed unreleased tasks

### Mitigation 5 — Derived summaries

Sidequest batch state should be derivable from task-engine rows where possible.

Avoid storing duplicated fields that drift.

Examples:

- completed unreleased count can be derived from sidequest tasks with `releaseVersion == null`
- release impact can be aggregated from task metadata
- batch risk can be derived from included sidequest task risks

### Mitigation 6 — Clear default exits

The agent should always know how to leave a mode safely.

Examples:

```text
Finish current sidequest
Pause current sidequest
Promote sidequest to phase task
Release sidequest bundle
Exit Side Quest Mode with unfinished tasks left ready
```

### Mitigation 7 — Before/after risk classification

The agent may misclassify a request before work begins. Workflow Cannon should classify both the request and the resulting diff.

Recommended commands:

```bash
wk run classify-request-risk '{"request":"..."}'
wk run classify-diff-risk '{}'
```

Before work: classify the request.
After work: classify the diff and warn if actual scope exceeds the captured sidequest.

## Agent Behavior in Side Quest Mode

When Side Quest Mode is active, the agent should follow this pattern:

```text
1. Restate the side quest in one sentence.
2. Classify risk: low / medium / high.
3. Create or update sidequest task record.
4. Work directly unless risk requires preview.
5. Run affected-area checks.
6. Complete sidequest with summary and release impact.
7. Ask whether to continue, promote, or bundle for release.
```

Example:

```text
Side Quest captured: improve branch cleanup warning.
Risk: medium, because it touches destructive operation UX.
Release intent: patch.
I’ll update the preview/apply messaging and add tests before marking it complete.
```

For tiny work:

```text
Side Quest captured as T100524. Low risk. I’ll make the doc copy change and run the docs check.
```

## Patch vs Minor Guidance

Side Quest Mode should help determine release type.

| Change | Release |
| --- | --- |
| Typo/docs/copy | patch or none |
| Bug fix | patch |
| Warning/error message improvement | patch |
| Small dashboard polish | patch |
| New command | minor |
| New workflow mode | minor |
| New config surface | minor |
| Changed behavior/default | minor or major depending risk |
| Breaking command/schema change | major or explicit compatibility path |

Initial implementation of Side Quest Mode itself should likely be a minor release because it introduces a new workflow surface.

## Suggested Commands

### `cae-session-start`

Compact startup command that returns current work mode, active task, phase, sidequest batch, blocking rules, and recommended behavior.

```bash
wk run cae-session-start '{}'
```

### `work-mode-status`

Reports current mode, active task, active phase, active sidequest batch, release state, and blocking rules.

```bash
wk run work-mode-status '{}'
```

### `enter-sidequest-mode`

Enters Side Quest Mode, optionally creating a sidequest batch.

```bash
wk run enter-sidequest-mode '{"reason":"Operator requested quick unplanned work"}'
```

### `create-sidequest-task`

Creates a task-engine sidequest task.

```bash
wk run create-sidequest-task '{
  "title": "Improve branch cleanup warning",
  "releaseIntent": "patch",
  "area": "branch-management"
}'
```

### `sidequest-status`

Shows active, completed unreleased, promoted, and released sidequest tasks.

```bash
wk run sidequest-status '{}'
```

### `complete-sidequest-task`

Completes a sidequest task with summary, validation, and release impact.

```bash
wk run complete-sidequest-task '{
  "taskId": "T100501",
  "summary": "Release branches are now caution-labeled in branch cleanup preview.",
  "releaseImpact": "patch",
  "validation": ["pnpm run build", "pnpm run test:run"]
}'
```

### `promote-sidequest-task`

Validates and promotes a sidequest task to regular phase/release work.

```bash
wk run promote-sidequest-task '{
  "taskId": "T100501",
  "targetPhaseKey": "98",
  "reason": "Scope expanded beyond patch side quest"
}'
```

### `sidequest-release-plan`

Plans a patch/minor release from completed sidequest tasks.

```bash
wk run sidequest-release-plan '{}'
```

### `sidequest-release-closeout`

Runs or delegates to normal release closeout for a sidequest bundle.

```bash
wk run sidequest-release-closeout '{
  "version": "0.91.2",
  "sideQuestTaskIds": ["T100501", "T100502", "T100503"]
}'
```

### `work-mode-repair-preview` / `work-mode-repair-apply`

Detects and repairs inconsistent mode state.

```bash
wk run work-mode-repair-preview '{}'
wk run work-mode-repair-apply '{"policyApproval":{"confirmed":true,"rationale":"repair stale work mode state"}}'
```

### `classify-request-risk` / `classify-diff-risk`

Classifies request and actual diff risk.

```bash
wk run classify-request-risk '{"request":"fix that release warning"}'
wk run classify-diff-risk '{}'
```

## Dashboard Support

Add a Side Quest Mode card to the dashboard.

The card should stay compact. Avoid turning it into a second giant dashboard.

Suggested panel:

```text
Side Quest Mode

Current mode: sidequest
Active sidequest: T100501 Improve branch cleanup warning
Batch: SQB2026-05-17-001
Completed, unreleased: 3
Suggested release: patch
Scope warning: none

[New Side Quest]
[Complete Side Quest]
[Promote to Phase Task]
[Plan Release]
[Exit Side Quest Mode]
```

If thresholds are crossed:

```text
The side quests are becoming a real campaign.

Recommended: promote to regular tasks or plan a release.
Override: Release the Barbarians!
```

## Cursor Rules / Skills

Add a Cursor rule:

```text
If requested work will substantially modify files and no matching active task exists, ask whether to submit as a regular task or enter Side Quest Mode.
Do not ask for read-only or discussion-only work.
Do not mix Phase Work Mode and Side Quest Mode.
Do not enter Side Quest Mode while phase work is active unless the phase task is complete, paused, or handed off.
Do not complete regular phase tasks while in Side Quest Mode.
If sidequest scope accumulates beyond normal thresholds, recommend promotion or release planning. If the user says "Release the Barbarians!", record the override but keep all safety gates.
```

Add a skill:

```text
workflow-cannon-sidequest-operator
```

Skill responsibilities:

- classify random work requests
- create sidequest task records
- maintain sidequest batch awareness
- recommend promotion when scope grows
- recommend patch/minor release when sidequests accumulate
- enforce no mixing with phase work
- preserve Workflow Cannon policy gates

## MVP Cut

The plan is intentionally broad. Implementation should start with a minimal, useful cut to avoid building a complicated mode before the foundations are stable.

### MVP

```text
1. work-mode-status
2. enter/exit Side Quest Mode
3. create/complete sidequest task
4. no-mixing enforcement
5. CAE startup rule
6. sidequest-status
7. basic threshold warning
8. work-mode-repair-preview for stale state detection
```

### Not MVP

```text
dashboard card
release closeout integration
same-ID promotion
barbarian override metadata beyond basic recording
work-mode-repair-apply automation
advanced diff classification
full release bundling automation
```

These should follow after the basic mode is proven reliable.

## Implementation Tasks

### SQ001 — Add work mode state

Track current mode:

```text
idle | phase | sidequest | release | repair
```

Acceptance criteria:

- workspace status reports current mode
- active task/batch tracked
- mode changes logged
- work mode appears in `agent-bootstrap` / CAE startup output

### SQ002 — Add sidequest task type/lane

Acceptance criteria:

- sidequest tasks live in the task engine
- sidequest tasks include sidequest metadata and release intent
- capture requirements are lightweight
- completion requirements are stricter than capture requirements
- sidequest tasks only start/complete in Side Quest Mode
- regular tasks cannot complete in Side Quest Mode

### SQ003 — Add request classification / default CAE behavior

Acceptance criteria:

- chat startup reads work mode
- agent asks whether to create task or enter Side Quest Mode before substantial file changes
- read-only work does not trigger annoying prompts
- discussion-only is respected as no-mutation mode
- active phase/release context is respected

### SQ004 — Add Side Quest Mode commands

Commands:

```bash
wk run enter-sidequest-mode
wk run exit-sidequest-mode
wk run sidequest-status
wk run create-sidequest-task
wk run complete-sidequest-task
```

Acceptance criteria:

- commands use task-engine state
- commands return JSON
- mutating commands require appropriate policy approval where needed

### SQ005 — Add sidequest promotion command

Command:

```bash
wk run promote-sidequest-task
```

Acceptance criteria:

- validates required fields
- initial implementation may create a linked regular task rather than changing type in place
- preserves history
- reports missing fields clearly

### SQ006 — Add cumulative scope threshold warning

Acceptance criteria:

- tracks completed unreleased sidequests
- tracks changed-file and release-impact accumulation where practical
- warns when thresholds are crossed
- supports `Release the Barbarians!` override
- override does not bypass safety gates

### SQ007 — Add sidequest release plan

Command:

```bash
wk run sidequest-release-plan
```

Acceptance criteria:

- lists unreleased sidequest tasks
- blocks if any releaseIntent is unknown
- recommends patch/minor/major using highest-impact-wins aggregation
- produces changelog candidate
- links to release closeout

### SQ008 — Add sidequest release closeout integration

Command:

```bash
wk run sidequest-release-closeout
```

Acceptance criteria:

- delegates to normal release closeout
- includes sidequest tasks in release evidence
- marks sidequest tasks released with version
- preserves release artifact URLs

### SQ009 — Add dashboard card

Acceptance criteria:

- dashboard shows current work mode
- dashboard shows active sidequest and unreleased sidequests
- dashboard shows threshold warnings
- dashboard provides actions for create/complete/promote/release/exit
- dashboard card remains compact

### SQ010 — Add Cursor rules and skill

Acceptance criteria:

- default Cursor rules enforce mode classification
- skill documents sidequest operator behavior
- skill does not replace policy gates

### SQ011 — Add repair / consistency checks

Acceptance criteria:

- `work-mode-status` detects inconsistent state
- repair preview exists in MVP
- repair apply command exists before broader rollout
- stale active mode can be cleared safely
- tests cover inconsistent state cases

### SQ012 — Add tests

Acceptance criteria:

- sidequest task lifecycle tests
- mode transition enforcement tests
- promotion validation tests
- threshold warning tests
- barbarian override tests
- release plan tests
- CAE startup status tests
- work-mode repair status tests

### SQ013 — Add branch strategy support

Acceptance criteria:

- sidequest batch branch naming is documented and implemented where practical
- dirty working tree is detected before entering Side Quest Mode
- user can attach existing changes, stash, continue discussion-only, or abort

### SQ014 — Add risk classifiers

Acceptance criteria:

- request classifier exists before full rollout
- diff classifier exists before release bundling automation
- classifiers report when actual changes exceed captured scope

## Non-Goals

Side Quest Mode should not:

- bypass policy gates
- bypass task-engine tracking
- replace phase planning
- allow phase work and sidequest work to mix silently
- create hidden release changes
- rely on chat memory as source of truth
- force full phase ceremony for every small fix
- prompt for every read-only or discussion-only request
- default to direct edits on `main`

## Strengths of the Plan

### 1. Speed without losing governance

The operator can direct random useful work without a full planning ceremony, but Workflow Cannon still records tasks, validation, release impact, and evidence.

### 2. Clean boundary between planned and unplanned work

Mode separation prevents accidental mixing of sidequest changes into phase work and prevents phase task completion from sidequest context.

### 3. Consistent behavior across chats

CAE startup makes the behavior default every time a chat window opens. The agent does not need to remember the policy from a prior conversation.

## Risks and Mitigations

### Risk 1 — Prompt fatigue

If the agent asks too often, Side Quest Mode will feel annoying.

Mitigation:

- only prompt for substantial repo-changing work
- do not prompt for read-only work
- define discussion-only as a valid no-mutation outcome
- batch small edits inside active sidequest mode
- use concise prompts
- implement a decision tree before broad rollout

### Risk 2 — State complexity

Work modes, batches, task types, promotion, release intent, and overrides add state.

Mitigation:

- task engine is source of truth
- add deterministic `work-mode-status`
- add explicit mode transition commands
- derive summaries where possible
- add repair commands for inconsistent state early
- begin with a minimal MVP rather than the full mode

### Risk 3 — Override misuse

`Release the Barbarians!` could be misunderstood as bypassing safety.

Mitigation:

- define it as scope-guidance override only
- record structured override metadata
- explicitly state safety gates still apply
- never bypass tests, previews, policy approval, release evidence, or task-engine safety

### Risk 4 — Casual work becomes too formal

If capture requires too many fields, Side Quest Mode becomes regular task mode with a funny hat.

Mitigation:

- use strictness levels
- keep capture requirements minimal
- require richer detail only before mutation, completion, release, or promotion

### Risk 5 — Release bundling becomes ambiguous

Mixed sidequest bundles can contain docs, bug fixes, new commands, and behavior changes.

Mitigation:

- use highest-impact-wins aggregation
- block release planning when releaseIntent is unknown
- explain which sidequest drove the release recommendation

## Final Shape

```text
CAE starts every chat.
CAE checks Work Mode.
Work Mode governs what kind of task can be worked.
Read-only and discussion-only work can proceed without ceremony.
Substantial repo changes require a regular task or Side Quest Mode.
Side Quest Mode uses real task-engine tasks with graduated strictness.
Side Quest work can be promoted to phase work.
Large sidequest bundles trigger release guidance.
"Release the Barbarians!" lets the user override the warning, not the gates.
```

This is the right balance: playful, flexible, and still Workflow Cannon-grade.
