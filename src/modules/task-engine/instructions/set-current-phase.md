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
| **`lastUpdated`** | No | Optional timestamp/string for the workspace status row; defaults to the run time. |
| **`clientMutationId`** | No | Idempotency key. Same key + same payload replays without a second workspace-status audit event. |
| **`actor`** | No | Recorded on the workspace-status audit event. |
| **`dryRun`** | No | When **`true`**, returns the exact before/after plan without writing SQLite, config, or export files. |

## Behavior

The live command writes **`kit_workspace_status`** first and treats it as canonical runtime truth. After that succeeds, it updates project config hints (**`kit.currentPhaseNumber`** and **`kit.currentPhaseLabel`**) for operator UX and writes the non-authoritative DB export at **`docs/maintainers/data/workspace-kit-status.db-export.yaml`**.

It does **not** modify task **`phaseKey`** values. Workspace current phase and per-task phase buckets are separate.

## Response

Returns before/after workspace status rows, before/after config hints, canonical phase verification, export status, revisions, and a **`suggestedFollowUpCommand`** when verification detects remaining drift.

## Examples

Dry run:

```bash
workspace-kit run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","dryRun":true}'
```

Apply:

```bash
workspace-kit run get-workspace-status '{}'
workspace-kit run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","expectedWorkspaceRevision":1,"clientMutationId":"phase-72-rollover"}'
```
