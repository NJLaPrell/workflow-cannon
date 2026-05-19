<!--
agentCapsule|v=1|command=release-status|module=task-engine|schema_only=pnpm exec wk run release-status --schema-only '{}'
-->

# release-status

One-shot **read-only** snapshot: git branch/HEAD/tag, npm dist-tags, latest GitHub release URL, and kit phase fields from **`phase-status`**.

## Usage

```bash
pnpm exec wk run release-status '{}'
```

Optional passthrough flags match **`phase-status`** (e.g. `includeTaskCounts`, `includeDriftDetails`).

## Response (`data`)

| Field | Source |
| --- | --- |
| `branch`, `headSha`, `latestTag` | `git` |
| `npmDistTags` | `npm view <package> dist-tags --json` |
| `latestReleaseUrl` | `gh release view` / `gh release list` |
| `currentPhase`, `nextPhase` | `kit_workspace_status` via **`phase-status`** |
| `signalStatus` | `git` / `npm` / `github` availability |
| `degraded[]` | Human-readable missing signals |

When npm or GitHub tools are missing or unauthenticated, fields may be `null` and `degraded` lists remediation hints — the command still returns **`ok: true`**.

## Related

- `phase-status` — phase-only readout
- `phase-closeout-readiness` — task drain gate before release
