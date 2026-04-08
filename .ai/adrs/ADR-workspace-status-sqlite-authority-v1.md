# ADR: Workspace status — SQLite as live authority (v1)

## Status

Accepted — Phase 67 (**T816**). Implementation follows in **T817** (schema), **T818** (CLI), **T819** (readers), **T820**–**T823** (doctor, config, agent canon, tests).

## Context

Today, workspace-level **phase snapshot** and related **cockpit** fields are split across **`docs/maintainers/data/workspace-kit-status.yaml`**, **`kit.currentPhaseNumber`** / **`kit.currentPhaseLabel`** in workspace config, and consumers (dashboard-summary, queue-health, doctor). Maintainers and agents get conflicting signals when those sources disagree, and file-based YAML encourages hand-editing that bypasses kit evidence.

We need a **single live authority** for machine-readable workspace status, **auditable** history, **CLI-gated** mutation, and **optimistic concurrency** that is **not** coupled to task-engine **`planningGeneration`**.

## Decision — authority (five bullets)

1. **SQLite in unified `workspace-kit.db` is the only live authority** for workspace-level phase snapshot and cockpit fields consumed by kit runtime, extension, and agent bootstrap paths (once migration is complete per **T819**).
2. **`docs/maintainers/data/workspace-kit-status.yaml` is not authoritative** after cutover. It may exist only as a **short-lived optional export** for human diffing and external tools (**T817** / **T818**), then **removed** when compatibility ends.
3. **`kit.currentPhaseNumber` is not runtime canonical phase** after **T821**. At most it is a **bootstrap/default seed** for empty workspaces or migration; readers must use DB-backed workspace status.
4. **Supported mutation path is `workspace-kit run`** (new command family in **T818** — e.g. get / update / export / history). No ad-hoc SQLite file edits from operators or extensions.
5. **Workspace status has its own monotonic revision** (or equivalent optimistic-lock field) for updates. It is **separate from** **`planningGeneration`** on `workspace_planning_state`; mutating workspace status does not substitute for task-store concurrency rules.

## Decision — product answers (three)

| Question | Answer |
| --- | --- |
| Temporary YAML on disk during transition? | **Yes** — optional **export** only, clearly non-authoritative, with a planned removal window (**T818** / **T822**). |
| Concurrency model? | **Dedicated workspace revision** (bump on successful update; conflict when stale revision presented). |
| Stable operator surface? | **New CLI command family** preferred over permanently entrenching “patch YAML” naming; **`update-workspace-phase-snapshot`** becomes an **alias or thin wrapper** over DB during transition (**T818**), then retires or stays as a documented compatibility shim. |

## Policy

- **Default `policyApproval` for routine workspace status updates:** **none** (Tier **C**-style command), **unless** future fields are classified sensitive via **`policy.extraSensitiveModuleCommands`** or equivalent — same pattern as today’s non-sensitive task-engine mutators.

## Non-goals

- **Dual live sources** (YAML + DB both “truth”) beyond an explicit, time-bounded migration.
- Storing workspace status as **task rows** or overloading **`planningGeneration`** for this domain.

## Consequences

- **T817**: tables **`kit_workspace_status`** (+ singleton current row) and **`kit_workspace_status_events`** (append-only audit); migrate from YAML where present; **fail closed** on **config vs YAML** disagreement at import (operator resolution path).
- **T818**–**T823**: CLI, reader cutover, doctor drift model, config demotion, agent canon (including **`.ai/agent-source-of-truth-order.md`** and **`.ai/WORKSPACE-KIT-SESSION.md`**), and regression tests.

## References

- **`.ai/agent-source-of-truth-order.md`** — precedence list; update in **T822** when YAML is demoted.
- **`.ai/WORKSPACE-KIT-SESSION.md`** — session protocol; align after DB is live (**T822**).
- **Task definitions:** **T816**–**T823** (Phase 67, `phaseKey` **67**).
