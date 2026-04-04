# ADR: Agent & task lifecycle hooks (v1)

## Status

Accepted — Phase 56 (`T645`–`T648`), release **`v0.56.0`**.

Provenance: wishlist **`T563`**.

## Context

Operators and maintainers need **observable, ordered extension points** around **`workspace-kit run`** module commands and **task-engine transitions** without forking the CLI. Prior module guidance removed legacy **`WorkflowModule`** lifecycle hooks; this ADR reintroduces **kit-level, config-driven hooks** that are explicit about **trust boundaries**, **determinism**, and **audit evidence**.

## Decision

1. **Named events (v1)**  
   - **`before-task-transition`** / **`after-task-transition`** — around validated transitions (payload includes `taskId`, `action`, `fromState`/`toState` when known).  
   - **`before-module-command`** / **`after-module-command`** — around `ModuleCommandRouter.execute` (payload includes `command`, redacted `args` summary).  
   - **`before-task-store-persist`** / **`after-task-store-persist`** — immediately before/after persisting the task document (SQLite or JSON path).  
   - **`before-pr-mutation`** / **`after-pr-mutation`** — **reserved stubs** in v1; no central GitHub PR/file mutation path exists in the kit today. Emit only when handlers are registered; documented as **no-op** until a future phase wires a choke point.

2. **Handler kinds**  
   - **`node`** — workspace-relative path to an ES module exporting `handle(context)` (see maintainer runbook).  
   - **`shell`** — argv template with **no implicit shell** except a **single documented** `/bin/sh -c '<script>'` wrapper when `shellScript` is set; **timeout**, **max output bytes**, and **cwd = workspace root** are mandatory enforcement fields.

3. **Ordering**  
   Handlers declare **`order`** (integer, ascending). Tie-break by stable **`id`** lexicographic order.

4. **Semantics**  
   - **`observe`** — handlers run; **deny/modify verdicts are logged only** (traces + optional stderr); core behavior unchanged.  
   - **`enforce`** — first **`deny`** stops the operation and surfaces a **`hook-denied`** style error to the caller; **`modify`** merges allowed patches (transition action/taskId redaction rules below).  
   - **`off`** — no dispatch; no trace rows except optional startup marker (implementation may skip entirely).

5. **Modify rules (enforce)**  
   - **`before-task-transition`**: handlers may return **`modifyTransition`** with optional **`action`** override only (not `taskId`).  
   - **`before-module-command`**: handlers may return **`modifyCommandArgs`** as a shallow merge into JSON args (sensitive keys like **`policyApproval`** are not echoed in traces).

6. **Traces**  
   Append-only JSON lines under **`.workspace-kit/kit/lifecycle-hook-traces.jsonl`** (configurable relative path). Each record: `timestamp`, `event`, `handlerId`, `durationMs`, `verdict`, optional `error` message; **no secrets**, no full `policyApproval`, no raw transcript paths unless already public in args.

7. **Non-goals (v1)**  
   - HTTP webhook transport for hooks.  
   - Arbitrary unsigned remote code.  
   - Cross-workspace handler registration without repo config.

## Consequences

- Config surface: **`kit.lifecycleHooks.*`** (defaults + validation in **`workspace-kit`** config resolution).  
- Core dispatcher: **`src/core/kit-lifecycle-hooks.ts`**.  
- Integration: **`handleRunCommand`** (module commands), **`TransitionService`** + task-engine **`run-transition`** path (transitions + persist).  
- Maintainer catalog: **`docs/maintainers/runbooks/lifecycle-hooks.md`**.

## References

- **`.ai/PRINCIPLES.md`** — safety, determinism, operability ordering.  
- **`docs/maintainers/POLICY-APPROVAL.md`** — policy lanes vs hook deny.  
- **`docs/maintainers/ROADMAP.md`** — Phase 56 scope.
