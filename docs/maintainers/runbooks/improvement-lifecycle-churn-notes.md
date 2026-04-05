<!-- GENERATED FROM .ai/runbooks/improvement-lifecycle-churn-notes.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Improvement lifecycle churn (queue-health follow-ups)

Queue-health heuristics flagged **frequent transitions** on several thin **`improvement`** tasks while they were open. This runbook records a **post-hoc closure** for the Phase **37** meta tasks that asked for root-cause notes tied to **`get-task-history`**.

## Pattern (all reviewed targets)

For each source improvement id below, **`workspace-kit run get-task-history`** shows a small number of rows (typically **7–8**). The mix is consistent:

- Several **`mutation`** entries — usually **`update-task`** (metadata / scope refinement) while the item was still **`proposed`** or **`ready`**.
- One each of **`accept`**, **`demote`**, **`start`**, and **`complete`** — normal triage and delivery.

**Root cause:** “Churn” was **not** primarily repeated **`policyApproval`** mistakes or undocumented transition rules. It was **expected iteration**: maintainers refined improvement rows (mutations) and exercised **`demote`** / **`accept`** during triage. Queue-health counts **every** persisted transition, so a handful of metadata edits plus the standard lifecycle looks like a spike compared to a **`T###`** that ships in one pass.

**Product change:** None required for this closure. Optional later work: tune queue-health “noisy history” scoring to treat **`mutation`** separately from **`run-transition`**, or raise thresholds for **`type: improvement`** — track as a separate **`T###`** if maintainers want it.

## Per-source notes (history-backed)

| Source improvement | Meta closure task | History snapshot (typical) |
| --- | --- | --- |
| `imp-df7ebd9967433c` | `imp-04ccc2dbb50f00` | ~7 rows · mutations + accept/demote/start/complete |
| `imp-d8ed5fa0b6c093` | `imp-448d97ea7ced70` | ~8 rows · same pattern |
| `imp-a7dcdec79a791b` | `imp-498bf46e454d41` | ~8 rows · same pattern |
| `imp-5ba2f6a0c3bd4a` | `imp-5150ddb0f43d69` | ~8 rows · same pattern |
| `imp-3bf93773a8c983` | `imp-708959f1fca355` | ~8 rows · same pattern |
| `imp-f39584e6613337` | `imp-9b16db156c6f40` | ~8 rows · same pattern |
| `imp-d3d2643f55fd43` | `imp-be8131b288ead5` | ~8 rows · same pattern |
| `imp-5dc1ffa28ccdc3` | `imp-c1492401b261ab` | ~7 rows · same pattern |
| `imp-c584f0e206c404` | `imp-dcc0e15118b0fe` | ~7 rows · same pattern |
| `imp-6a07b608c1b752` | `imp-df5d8dd545edc9` | ~8 rows · same pattern |
| `imp-4cf9c424e5bfb2` | `imp-f164c9c96da7f1` | ~8 rows · same pattern |
| `imp-190189d4b01bc1` | `imp-f56f4f5903b9ae` | ~8 rows · same pattern |

Re-verify anytime:

```bash
workspace-kit run get-task-history '{"taskId":"imp-<id>","limit":80}'
```

## Related docs

- **Policy / transitions:** [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md)
- **Shell parsing of JSON stdout:** [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → **Shell scripts and JSON stdout** (Phase **37**)
