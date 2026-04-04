# Runbook: kit lifecycle hooks (Phase 56)

## When to use

You registered **`kit.lifecycleHooks.handlers`** and need the **event catalog**, **security posture**, or **trace location** for **`workspace-kit`** extensions.

## Canonical reference

- **ADR:** `docs/maintainers/ADR-agent-task-lifecycle-hooks-v1.md`  
- **Config keys:** **`kit.lifecycleHooks.*`** (see generated **`CONFIG.md`** after `pnpm run wk config generate-docs`)

## v1 events

| Event | Fires around |
| --- | --- |
| **`before-task-transition`** / **`after-task-transition`** | Task-engine transition apply + evidence (see **`run-transition`**) |
| **`before-module-command`** / **`after-module-command`** | **`workspace-kit run <cmd>`** router (`ModuleCommandRouter.execute`) |
| **`before-task-store-persist`** / **`after-task-store-persist`** | Task document persistence (`TaskStore.save` path inside **`TransitionService`**) |
| **`before-pr-mutation`** / **`after-pr-mutation`** | **Stub** — reserved; no central PR/file mutation choke point in the kit yet |

## Modes

- **`off`** — no dispatch.  
- **`observe`** — handlers run; **deny/modify** verdicts are **traced only** (no behavior change).  
- **`enforce`** — **deny** aborts with **`hook-denied`**; **modify** merges allowed patches (transition **`action`** or shallow command-arg merge).

## Traces

Default append-only log: **`.workspace-kit/kit/lifecycle-hook-traces.jsonl`** (workspace-relative, configurable). **Do not** log secrets, raw **`policyApproval`**, or tokens.

## Node handler contract

Workspace-relative **`modulePath`** to a **`.mjs` / `.cjs` / `.js`** file exporting:

```javascript
/** @param {{ event: string, payload: object, workspacePath: string }} ctx */
export async function handle(ctx) {
  return { verdict: "allow" };
  // or { verdict: "deny", reason: "..." }
  // or { verdict: "modifyTransition", action: "start" }
  // or { verdict: "modifyCommandArgs", patch: { dryRun: true } }
}
```

## Shell handler contract

Spawned with **workspace cwd**. Either **`argv`** (executable + args, no implicit shell) or **`shellScript`** (**`/bin/sh -c`** only — high risk). Stdin is one JSON line `{ event, payload }`. Print **one JSON line** stdout with the same **`verdict`** shape as node handlers. Non-zero exit = logged; **`observe`** does not treat that as deny unless you implement JSON line yourself.

## Performance

Handlers are **serial** in stable **`order`** then **`id`**. Keep work **O(1)** per invocation; external I/O must use **`timeoutMs`** (default capped). Budget: **≤ 50 ms** typical local work; anything heavier belongs outside the hot path.

## HTTP hooks

**Deferred** — webhook transport is an explicit non-goal for v1 (see ADR). Track as future wishlist / roadmap item.
