# Friction → file (CAE advisory nudge)

**Advisory only.** This card is a next-step hint when Workflow Cannon CLI/MCP failures or agent-facing friction show up in session signals. It does **not** invent defects, widen assignment scope, promote improvements to `ready`, or perform release actions.

## When it applies

CAE matched an `agentFailureSignal` (for example `recentToolFailures >= 1` or a friction `lastFailureKind`). Treat that as “consider filing,” not “you must create a task.”

## Preferred next step (host-agnostic)

1. **Spawn** a cheap background bug-reporter child bound to skill **`wc-bug-report`** / subagent id **`wc-bug-reporter`** (Cursor Task `run_in_background`, CLI host adapter, or other host’s equivalent fire-and-forget spawn). Do **not** burn the parent session on filing.
2. Child files once via **`file-bug-report`** (`pnpm exec wk run file-bug-report '{…}'`) — Tier C, **`type: improvement`**, **`status: proposed` only**.
3. Optional provenance (non-blocking): `spawn-subagent` with `subagentId: "wc-bug-reporter"`.

Copy-ready child target (happy path):

```bash
pnpm exec wk run file-bug-report '{"title":"<short>","symptom":"<what broke or friction>","evidence":"<command/code/crumbs>","relatedTaskId":"T###","evidenceKey":"bug:<stable-key>","clientMutationId":"bug:<stable-key>"}'
```

## Hard stops (non-negotiable)

- Do **not** pass `status: "ready"` or non-`improvement` types through `file-bug-report` (command fail-closed).
- Do **not** treat this nudge as policy approval, ready-queue promotion, or release authority.
- Do **not** invent a defect when there is no observed failure/friction evidence.
- If CAE is disabled, activations are disabled, or registry load falls back empty: continue the original work — **do not** invent ready-task or release powers as a substitute.
