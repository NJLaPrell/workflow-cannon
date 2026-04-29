<!--
agentCapsule|v=1|command=set-current-phase|module=task-engine|schema_only=pnpm exec wk run set-current-phase --schema-only '{}'
-->

# set-current-phase

Set the workspace current phase through **`kit_workspace_status`** first, then align compatibility / UX surfaces.

## Usage

```bash
workspace-kit run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","expectedWorkspaceRevision":1,"clientMutationId":"phase-72-rollover"}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| **`currentKitPhase`** | Yes | Non-empty single-line string beginning with the phase number, for example **`72`** or **`72 — Phase-control ergonomics`**. |
| **`nextKitPhase`** | No | String or JSON **`null`**. Omit to preserve the existing next phase. |
| **`expectedWorkspaceRevision`** | Live writes | Must match current **`workspaceRevision`** unless this is an idempotent replay with the same **`clientMutationId`**. |
| **`currentPhaseLabel`** | No | Optional config UX label. Omit to write **`Phase <N>`**; use JSON **`null`** to clear the label hint. |
| **`activeFocus`** | No | Optional workspace status focus text; JSON **`null`** clears it. |
| **`blockers`** | No | String array replacing workspace-status blockers. Pass **`[]`** during rollover to clear previous-phase blockers. |
| **`pendingDecisions`** | No | String array replacing workspace-status pending decisions. Pass **`[]`** during rollover to clear previous-phase decisions. |
| **`nextAgentActions`** | No | String array replacing workspace-status next actions. Pass **`[]`** or the new phase actions during rollover. |
| **`lastUpdated`** | No | Optional timestamp/string for the workspace status row; defaults to the run time. |
| **`clientMutationId`** | No | Idempotency key. Same key + same payload replays without a second workspace-status audit event. |
| **`actor`** | No | Recorded on the workspace-status audit event. |
| **`dryRun`** | No | When **`true`**, returns the exact before/after plan without writing SQLite, config, or export files. |

## Behavior

The live command writes **`kit_workspace_status`** first and treats it as canonical runtime truth. Use it as the phase rollover aggregate: update the phase/focus and replace or clear **`blockers`**, **`pendingDecisions`**, and **`nextAgentActions`** in the same call. After SQLite succeeds, it updates project config hints (**`kit.currentPhaseNumber`** and **`kit.currentPhaseLabel`**) for operator UX and writes the non-authoritative DB export at **`docs/maintainers/data/workspace-kit-status.db-export.yaml`**.

It does **not** modify task **`phaseKey`** values. Workspace current phase and per-task phase buckets are separate.

## Response

Returns authoritative domain result data: before/after workspace status rows, before/after config hints, canonical phase verification, export status, revisions, and a **`suggestedFollowUpCommand`** when verification detects remaining drift.

For agent summaries, read **`data.presentation.phaseRollover`**. It is the stable summarizer contract (**`kind: "phase_rollover_v1"`**) and is present for dry runs, live writes, and idempotent replays. It contains the compact before/after phase, workspace revision, config hint, export status, optional task counts, and follow-up command fields derived from the raw domain result. Do not retry a mutation just because summary rendering fails; use this projection to summarize the already-returned result.

## Examples

Dry run:

```bash
workspace-kit run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","dryRun":true}'
```

Apply:

```bash
workspace-kit run get-workspace-status '{}'
workspace-kit run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","activeFocus":"Phase 72 delivery","pendingDecisions":[],"nextAgentActions":["Start Phase 72 delivery"],"blockers":[],"expectedWorkspaceRevision":1,"clientMutationId":"phase-72-rollover"}'
```
