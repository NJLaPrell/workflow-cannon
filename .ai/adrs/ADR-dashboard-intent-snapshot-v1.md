# ADR: Dashboard intent snapshot (host authority)

**Status:** Accepted (Phase 113)  
**Scope:** Cursor extension dashboard sidebar (`extensions/cursor-workflow-cannon`)

## Context

Dashboard drawer and refresh UX previously mixed host flags, webview `postMessage` channels, and ad hoc `setUiInteraction` locks. That produced stuck Accept overlays, refresh starvation during kit mutations, and desync between host and webview busy state.

## Decision

Adopt **Option 1 — intent/snapshot** architecture:

1. **R1 — Mutation critical section:** All kit mutations for dashboard drawers run inside `DashboardCoordinator.runMutation` / `runDrawerMutation`. While active, `interaction.mutationActive` is true and refresh reads are paused.
2. **R2 — Side effects after mutation:** Toasts, `notifyKitStateChanged`, and refresh scheduling run only after the mutation `finally` block via `SideEffectBus` (microtask-scheduled), never `await` on `vscode.window` inside `runMutation`.
3. **R3 — Webview never gates submit:** The webview posts intents (`drawerSubmit`, `drawerCancel`, `refresh`) only. Submit is a no-op when `wcHostSnapshot` reports `drawer.busy` or `interaction.mutationActive`; the host does not rely on webview-local `drawerSubmitInFlight`.

## Host → webview contract

- **`wcHostSnapshot`** (`schemaVersion: 1`) is the primary host→webview channel for drawer overlay + interaction state.
- **`wcDrawerOpen`** remains for initial HTML injection only; an immediate snapshot follows.
- Legacy **`wcDrawerProgress`**, **`wcDrawerValidation`**, and **`wcDrawerClose`** are removed from the dashboard path.

## Consequences

- **Positive:** Single source of truth for busy/submit locks; back-to-back Accept on proposed tasks can proceed after each mutation completes.
- **Negative:** Guidance/Cae drawers on other surfaces may still use older message types until migrated.

## References

- Phase 113 tasks T100492–T100497
- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-coordinator.ts`
