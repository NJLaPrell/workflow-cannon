<!--
agentCapsule|v=1|command=cae-recent-traces|module=context-activation|schema_only=pnpm exec wk run cae-recent-traces --schema-only '{}'
-->

# cae-recent-traces

List recent durable CAE trace summaries for the Guidance trace browser.

```bash
workspace-kit run cae-recent-traces '{"schemaVersion":1,"limit":10}'
```

## Args

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1`. |
| `limit` | no | Integer `1`-`200`; default `25`. |

## Returns

`ok: true`, `code: "cae-recent-traces-ok"`, and `data.rows[]` ordered newest first.

Each row includes `traceId`, `createdAt`, `storage`, `evalMode`, `familyCounts`,
`totalGuidanceCount`, `pendingAcknowledgementCount`, `conflictCount`, and
`bundleId`.

If `kit.cae.persistence` is not enabled, the command returns
`code: "cae-persistence-disabled"` because ephemeral in-process traces cannot be
listed across processes.

This command is Tier C / read-only and does not accept `policyApproval`.
