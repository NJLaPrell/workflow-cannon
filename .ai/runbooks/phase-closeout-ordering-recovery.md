# Phase closeout ordering recovery

**Use when:** Workspace **`currentKitPhase`** points at phase **N**, but git **`main`** (or the phase roster) already shows **later** phases shipped, or **`origin/release/phase-<N>`** never existed.

## Symptoms

- `phase-closeout-readiness` blocks with many **ready** tasks while **`main`** already includes **`release/phase-<N+1>`** merges.
- Dashboard **Complete & Release** for phase **N** while roster tags **N+1** / **N+2** as **Delivered**.
- Closeout agent created **`release/phase-<N>`** from current **`main`** as a catch-up branch (valid recovery).

## Recovery (catch-up closeout on `main` tip)

1. **Read-only:** `pnpm exec wk run phase-status '{}'` · `git fetch origin` · `git branch -a --list 'origin/release/phase-*'`.
2. **Drain or cancel** phase **N** tasks — `phase-closeout-readiness` must pass (terminal tasks only).
3. **Create** `release/phase-<N>` from **`origin/main`** if missing (policy approval for protected-branch push when required).
4. **Ship** closeout PR **`release/phase-<N>` → `main`** (version bump + changelog).
5. **Publish** per `.ai/RELEASING.md` (operator chat confirm before `pnpm run publish:npm`).
6. **Unset workspace phase** (same as playbook **§6b** — not recovery-only):

   ```bash
   pnpm exec wk run get-workspace-status '{}'
   pnpm exec wk run update-workspace-status '{"expectedWorkspaceRevision":<rev>,"currentKitPhase":null,"nextKitPhase":null,"activeFocus":"Phase <N> complete — no active workspace phase","blockers":[],"pendingDecisions":[],"nextAgentActions":["Pick the next phase from the Phase Roster when you are ready to deliver."],"command":"phase-closeout-complete"}'
   ```

7. **Bump** `kit.phaseDelivery.legacyDeliveredMaxOrdinal` to **N** in `.workspace-kit/config.json` so the roster marks phases **≤ N** delivered while workspace phase stays unset.
8. **Task sync:** `pnpm exec wk run task-sync-hydrate '{"fetch":true,"policyApproval":{"confirmed":true,"rationale":"reconcile after closeout"}}'` on each workstation.

## Do not

- Advance **`currentKitPhase`** to **N+1** when **N+1** is already on **`main`** unless you intentionally re-open that phase for more work.
- Commit **`.workspace-kit/tasks/workspace-kit.db`** as closeout evidence when **`tasks.canonicalAuthority`** is **`git-event-log`**.

## Dashboard guard

When ordering risk is detected, **Phase Progress** shows a failing check and **Complete & Release** stays disabled until the roster and git integration branch align (or tasks are explicitly cancelled).
