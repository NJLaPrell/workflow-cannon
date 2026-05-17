# Workflow Cannon Onboarding Plan

## Purpose

Workflow Cannon currently has several useful setup and onboarding capabilities, but they are scattered across commands, chat playbooks, dashboard surfaces, and advanced configuration paths. The goal of this plan is to turn those capabilities into one coherent user-facing setup experience.

The product should have one obvious front door:

```bash
pnpm exec wk setup
```

And one equivalent dashboard entrypoint:

```text
Setup Workflow Cannon
```

The setup experience should feel warm and lightly tavern-themed, while still being technically explicit about repository writes, task-store changes, generated files, approvals, and repair actions.

The guiding principle:

> Workflow Cannon Setup is the tavern door. It checks the room, sets your table, asks how your agent should travel with you, and helps you choose the first quest. Nothing gets overwritten without showing you first. If you come back later, your old seat is still there.

## Product Direction

The best shape is not one giant linear wizard and not several disconnected commands. The best shape is a single setup dashboard with multiple wizard cards.

The user starts from one place, then sees the current setup state of each area.

Example:

```text
Workflow Cannon Setup

✅ Core Setup              Complete
⚠️ Collaboration Style     2 of 3 recommended settings complete
⚠️ Project Intelligence    Project scan has not run
○ First Quests             Optional, not started
○ Advanced Controls        Optional
```

Each card should provide:

- current status
- missing or stale items
- recommended next action
- preview before writes
- safe keep-current default on rerun
- expandable advanced detail

## Recommended Wizard Groups

### 1. Core Setup

Core Setup answers:

> Can Workflow Cannon safely operate in this repository?

This is the only required wizard.

It should be direct, safe, and explicit. Use a warm tone, but do not hide technical changes behind metaphor.

Core Setup includes:

| Item | Required | What it checks or sets |
| --- | --- | --- |
| Package installed | Yes | Confirms `@workflow-cannon/workspace-kit` is available. |
| Workspace attached | Yes | Confirms kit baseline files exist. |
| Runtime healthy | Yes | Confirms runtime stamp and launcher work. |
| Task store initialized | Yes | Confirms SQLite task DB is ready. |
| Owned paths policy | Yes | Confirms kit-owned file boundaries are known. |
| Doctor passes | Yes | Confirms there are no blocking health errors. |
| Starter task preference | Optional | Creates or skips the initial onboarding task. |

Suggested tone:

```text
The tavern door is built. I checked the lock, the ledger, and the task board.
```

But for actual writes, use plain language:

```text
I am ready to add these kit-owned files:
+ .workspace-kit/
+ workspace-kit.profile.json
+ .cursor/rules/workspace-kit-project-context.mdc
+ SQLite task store

No existing user files will be deleted.
```

### 2. Collaboration Style

Collaboration Style answers:

> How should the agent work with me?

This replaces the need for users to separately discover `/onboarding`, `set-agent-guidance`, behavior profiles, and the long behavior interview during first setup.

The first-run path should present simple combined presets:

| Preset | Meaning |
| --- | --- |
| Wary Scout | Careful, small steps, more check-ins. |
| Steady Adventurer | Balanced default. Moves when intent is clear, asks when scope is fuzzy. |
| Battle Tactician | More tradeoff analysis and evidence before acting. |
| Bold Experimenter | More proactive exploration where safe. |

Advanced users can still access the deeper RPG role tier:

- NPC
- Adventurer
- Bard
- Wizard
- BBEG

The long behavior interview should remain available as an optional advanced branch, not a required first-run step.

Suggested tone:

```text
Choose who sits beside you at the table.
```

Changes made by this wizard:

- saves agent guidance tier
- saves active behavior profile
- optionally creates and applies a custom behavior profile
- optionally syncs effective Cursor behavior rule

It must never replace policy gates, principles, or required `policyApproval`.

### 3. Project Intelligence

Project Intelligence answers:

> What does Workflow Cannon know about this repository?

This should happen before creating first tasks when possible. The user attaching Workflow Cannon needs confidence that the system understands the project before it recommends work.

Project Intelligence includes:

| Item | Required | What it does |
| --- | --- | --- |
| Project context generated | Recommended | Creates or refreshes generated project context. |
| Repo scan complete | Recommended | Detects docs, tests, package structure, TODOs, scripts, and project shape. |
| Documentation health checked | Recommended | Finds missing, weak, or stale docs. |
| Risk or weakness scan | Optional | Recommends improvement areas. |
| Existing task source detected | Optional | Finds TODO files, markdown task lists, issue exports, or similar sources. |

Changes made by this wizard:

- refreshes generated project context when approved
- may create analysis artifacts
- may identify candidate tasks without persisting them yet
- may prepare recommendations for First Quests

The default path should be read-only until the user approves persistence.

### 4. First Quests

First Quests answers:

> What should Workflow Cannon put on the task board first?

This is optional but strongly encouraged. It should replace the vague idea of a generic starter task with useful first actions.

Options should include:

| Option | What it does |
| --- | --- |
| Set up project documentation | Creates documentation tasks or doc scaffolding recommendations. |
| Convert an existing task list | Turns pasted text, markdown tasks, TODO files, or issue exports into task-engine tasks. |
| Analyze project and recommend next steps | Creates proposed improvement tasks based on project analysis. |
| Find weaknesses | Creates risk, quality, security, test, or documentation improvement candidates. |
| Start a new feature idea | Launches the planning interview and creates a wishlist item or planning artifact. |
| Skip for now | Completes setup without creating work. |

Suggested tone:

```text
What should go on the board first?
```

Changes made by this wizard:

- optionally creates wishlist items
- optionally creates proposed or ready task-engine tasks
- optionally persists project analysis recommendations
- should not duplicate existing first-work tasks on rerun

### 5. Advanced Controls

Advanced Controls answers:

> What power-user settings should be tuned?

This wizard should be optional and clearly separated from the first-run path.

Advanced Controls may include:

| Item | Required | What it changes |
| --- | --- | --- |
| Policy approval behavior | Optional | Approval lanes and strictness. |
| Planning generation policy | Optional | Mutation conflict and concurrency behavior. |
| Dashboard/status behavior | Optional | Dashboard summary and agent status behavior. |
| Documentation generation settings | Optional | Generated doc sync behavior. |
| Experimental capabilities | Optional | Opt-in or preview features. |
| Custom behavior profile | Optional | Detailed custom agent style. |

Advanced Controls should never make the overall setup look broken merely because the user skipped it.

## Status and Progress Model

Setup should be status-based, not just percent-based.

Percent can be useful, but status is more trustworthy.

Suggested status icons:

| Icon | Meaning |
| --- | --- |
| ✅ | Complete / healthy |
| ⚠️ | Recommended missing, stale, or incomplete |
| ❌ | Blocking problem |
| ○ | Optional / not configured |
| 🔄 | In progress / resumable |
| 🛡️ | Requires approval |
| 🧪 | Experimental |

Suggested colors:

| Color | Use for |
| --- | --- |
| Green | Complete, healthy |
| Yellow | Recommended missing, stale, incomplete |
| Red | Blocking error |
| Gray | Optional not started |
| Blue | Informational or currently selected |
| Purple / amber | Advanced or policy-gated |

Use separate readiness concepts:

```text
Core readiness: 100%
Recommended setup: 70%
Optional depth: 20%
```

This prevents optional advanced settings from making the user feel incomplete.

## Rerun Behavior

Rerunning setup must be safe, conservative, and non-destructive.

Default behavior on rerun:

| Existing state | Default action |
| --- | --- |
| Healthy existing value | Keep |
| Missing required value | Configure |
| Stale generated file | Preview refresh |
| Changed kit-owned file | Backup and confirm before overwrite |
| Existing behavior profile | Keep selected |
| Existing task DB | Keep |
| Existing first tasks | Do not duplicate |
| Previous wizard interrupted | Resume |

The default button should almost always be one of:

```text
Keep current
Continue from here
Preview repair
```

It should almost never be:

```text
Reset
Overwrite
Start over
```

Any reset behavior belongs under Advanced and should require explicit confirmation.

## First-Run Experience

Suggested first-run flow:

```text
Welcome to the tavern.

I’ll help set up Workflow Cannon in four short passes:
1. Core Setup
2. Collaboration Style
3. Project Intelligence
4. First Quests

Advanced Controls are available after that.
```

Initial Core Setup example:

```text
Core Setup
❌ Workspace not attached
○ Runtime not checked
○ Task board not created

Action:
[Preview setup]
```

After preview:

```text
I’m ready to add:
+ .workspace-kit/
+ workspace-kit.profile.json
+ .cursor/rules/workspace-kit-project-context.mdc
+ SQLite task store

No existing user files will be deleted.

[Attach Workflow Cannon]
```

Collaboration Style example:

```text
Collaboration Style
Choose your companion:

1. Wary Scout
2. Steady Adventurer
3. Battle Tactician
4. Bold Experimenter

Current: Steady Adventurer

[Keep current] [Change]
```

Project Intelligence example:

```text
Project Intelligence
I can inspect the project and prepare context.

[Analyze project structure]
[Check documentation health]
[Look for existing task lists]
[Skip]
```

First Quests example:

```text
First Quests
What should go on the board first?

1. Set up project documentation
2. Convert an existing task list
3. Analyze weaknesses and recommend tasks
4. Start a new feature idea
5. Skip for now
```

Final state example:

```text
The tavern is open.

Repo: attached
Runtime: healthy
Agent style: Steady Adventurer
Task store: ready
First work: Analyze this project
Next action: Review recommended tasks
```

## Modes

The setup entrypoint should support multiple modes based on detected state.

| Mode | Trigger | Behavior |
| --- | --- | --- |
| First run | No `.workspace-kit` | Attach, configure, choose first work. |
| Resume setup | Partial state | Continue from the last safe checkpoint. |
| Rerun | Already configured | Show current settings as defaults and offer repair, preferences, or first-work options. |
| Repair | Broken or stale state | Preview repair actions and require confirmation. |
| Advanced | User asks | Expose raw init, doctor, profile, behavior interview, refresh-context, and policy/config options. |

## UX Rules

1. One primary user-facing entrypoint: `wk setup`.
2. Dashboard and CLI should use the same conceptual model.
3. Core Setup is required; all other wizards are recommended or optional.
4. Rerunning setup must not reset or duplicate existing state.
5. Existing settings must appear as defaults.
6. All writes must be previewable or clearly summarized before execution.
7. Kit-owned file refreshes must preserve backups when replacing changed content.
8. Task creation must be explicit and should not silently duplicate starter or first-work tasks.
9. The tavern tone should make setup feel friendly, not obscure what is happening.
10. Policy gates, approvals, and potentially destructive operations must use plain technical language.

## Implementation Notes

Existing capabilities should become internal building blocks rather than separate first-run user concepts.

Likely mappings:

| Current capability | Future setup role |
| --- | --- |
| `wk init` | Core Setup attach / repair primitive |
| `wk init --dry-run` | Core Setup preview |
| `wk init --force` | Core Setup repair action |
| `wk start` | Core Setup runtime validation |
| `wk doctor` | Core Setup health check |
| `agent-bootstrap` | Final readiness / serious agent session bootstrap |
| `/onboarding` | Collaboration Style wizard shortcut |
| `set-agent-guidance` | Collaboration Style persistence primitive |
| `set-active-behavior-profile` | Collaboration Style persistence primitive |
| `/behavior-interview` | Advanced Collaboration Style branch |
| `refresh-context` | Project Intelligence context refresh primitive |
| planning interview / `build-plan` | First Quests new feature idea path |
| wishlist/task conversion commands | First Quests conversion path |

## Recommendation

This is the preferred product direction.

Workflow Cannon should keep the existing lower-level commands for power users and automation, but the main product experience should be one safe setup dashboard with wizard cards.

The final shape:

```text
Workflow Cannon Tavern Setup

✅ Core Setup
⚠️ Collaboration Style
⚠️ Project Intelligence
○ First Quests
○ Advanced Controls
```

The user should not need to know whether they need `init`, `start`, `doctor`, `/onboarding`, `set-agent-guidance`, `behavior-interview`, `refresh-context`, `agent-bootstrap`, `build-plan`, or task conversion commands.

That is Workflow Cannon’s job.
