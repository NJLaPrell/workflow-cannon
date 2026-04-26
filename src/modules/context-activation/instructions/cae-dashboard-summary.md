# cae-dashboard-summary

Read-only aggregate payload for the Cursor **Guidance** tab.

```bash
workspace-kit run cae-dashboard-summary '{"schemaVersion":1}'
```

## Args

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1`. |

## Returns

`ok: true`, `code: "cae-dashboard-summary-ok"`, and `data.schemaVersion: 1`.

The `data` object includes:

- `product` — user-facing Guidance labels and CAE term mapping.
- `health` — same shape as `cae-health {"includeDetails":true}`.
- `validation` — registry validation summary.
- `recentTraces` — recent durable trace summaries when persistence is enabled.
- `acknowledgements` — latest acknowledgement rows and total count.
- `feedback` — shadow usefulness feedback summary and latest rows.

This command is Tier C / read-only and does not accept `policyApproval`.
