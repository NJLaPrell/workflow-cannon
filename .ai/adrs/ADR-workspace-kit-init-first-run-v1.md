# ADR: Workspace Kit — first-run init UX contract (v1)

## Status

Accepted — Phase **85** (**T100152**). Behavior implementation tracks subsequent tasks (**T153**–**T161**).

## Context

Operators attach Workflow Cannon to existing repos with **`pnpm add -D @workflow-cannon/workspace-kit`** and expect a **predictable, safe, idempotent** path to a working kit (config, SQLite planning store, generated editor context, **`doctor`** green, **`get-next-actions`** / **`dashboard-summary`** usable). Today multiple verbs (**init**, **upgrade**, **doctor**, generated files) overlap in naming and risk — without a single contract, agents and humans ship incompatible assumptions.

## Decision — command semantics

| Command | Role | Writes | Typical cadence |
| --- | --- | --- | --- |
| **`wk init`** | **Attach / bootstrap** a workspace: detect repo metadata, write **kit-owned** baseline (schemas, manifest hints, **SQLite** planning DB init when configured), merge **default config**, optionally emit **starter task** via task-engine APIs, then recommend **`wk doctor`**. | Yes (kit-owned paths only; see File safety) | Once per repo (or after deliberate detach) |
| **`wk refresh-context`** | **Regenerate** `.workspace-kit/generated/project-context.json` and **`.cursor/rules/workspace-kit-project-context.mdc`** from the active **`workspace-kit.profile.json`** (or equivalent profile contract). Requires an **existing valid profile** — not a substitute for first attach. | Yes — generated surfaces only | After profile edits or when context drift is detected |
| **`wk upgrade`** | **Refresh kit-owned baseline** after **package version** bumps (templates, schema defaults compatible with the installed kit version). **Not** the operator’s first-run onboarding command. | Yes — kit-owned paths | After **`pnpm update`** / semver bumps |
| **`wk doctor`** | **Read-only validation** + advisory remediation text. **Never** silently repairs production stores. If the workspace is **unattached**, doctor **directs** to **`wk init`** (or documented attach flow). | No | Any time |

## Decision — approvals

- **Interactive TTY:** prompts may ask for confirmation when a mutation would overwrite **kit-owned** files (after backup).
- **Non-interactive / CI / agents:** mutating commands that require policy lanes must pass **`--yes`** with **`--approval-rationale`** **or** env **`WORKSPACE_KIT_POLICY_APPROVAL`** per **`.ai/POLICY-APPROVAL.md`** — **never** chat-only approval as substitute for JSON/env gates on Tier **A/B** commands.

## Decision — file safety

1. **Never overwrite `workspace-kit.profile.json`** (or successor profile root) **by default** if it contains user edits — detection uses checksum / marker strategy in implementation tasks.
2. **Never silently overwrite unknown user-owned paths** outside the kit manifest’s **owned-path** registry.
3. **Backup before overwrite** for kit-owned templates when **`--force`** / explicit repair flags are not used (exact backup naming is implementation detail; must be documented in maintainer runbooks).
4. **`wk init --dry-run`** performs **detection + plan only** — **no writes** to disk or SQLite.

## Decision — starter task

- Optional **`wk init`** flag **`--no-starter-task`** skips creation.
- Default **on** only when policy allows automated **`create-task`** without violating **`tasks.intakePolicy`** — starter rows should land **`proposed`** or satisfy **`create-ready`** profiles when opted in.
- Creation uses **`workspace-kit run create-task`** (or **`allocateId: true`**) — **no raw SQLite**.

## Decision — legacy flows

- Historical **`init`** scripts or docs that conflated **profile**, **context**, and **SQLite** are superseded by this ADR. **`wk refresh-context`** replaces “regenerate profile context only” flows without re-running full attach.

## Whole-plan success criteria (program-level)

1. **README happy path:** **`pnpm add -D @workflow-cannon/workspace-kit`** → **`pnpm exec wk init`** → **`pnpm exec wk doctor`** succeeds on **empty** and **existing package** repos.
2. **Detection + baseline + SQLite + doctor + `get-next-actions` + `dashboard-summary`** operate without hand-editing **`workspace-kit.db`**.
3. **Idempotent init:** second **`wk init`** does not duplicate starter tasks or corrupt planning generation.
4. **Dry-run** never writes; **backups** exist before destructive kit-owned overwrites.
5. **`wk upgrade`** is documented as **post-package** maintenance — not marketed as day-one setup.

## Non-goals (v1 ADR)

- Replacing maintainer YAML narrative under **`docs/`** — human docs update in parallel tasks.
- Choosing exact CLI spellings for every flag — implementation tasks finalize argv surfaces while respecting this contract.

## Consequences

- **T153**+ implement detection, writers, **`refresh-context`**, **`upgrade`** deltas, and tests **against** this ADR.
- Agent canon (**.ai**) references this ADR as the **intent** source; **`docs/maintainers`** may mirror for humans.

## References

- **`.ai/POLICY-APPROVAL.md`** — approval lanes.
- **`INIT_PLAN.md`** — historical program backlog (**T001** family); the ADR and task engine are canonical for current behavior and execution state.
- **`src/modules/task-engine/instructions/create-task.md`** — task intake when starter tasks are enabled.
