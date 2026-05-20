<!--
agentCapsule|v=1|command=propose-release-version|module=task-engine|schema_only=pnpm exec wk run propose-release-version --schema-only '{}'
-->

# propose-release-version

Read-only SemVer recommendation from `package.json` and completed tasks in a phase (or all completed tasks when `phaseKey` is omitted).

## Usage

```bash
pnpm exec wk run propose-release-version '{"phaseKey":"104"}'
pnpm exec wk run propose-release-version '{}'
```

## Arguments

| Field | Required | Notes |
| --- | --- | --- |
| `phaseKey` | no | Defaults to canonical workspace phase from `kit_workspace_status`. |

## Response

- **`currentVersion`** — from repo-root `package.json`.
- **`recommended`** — suggested next semver.
- **`bump`** — `major` \| `minor` \| `patch`.
- **`rationale`** — human-readable summary.
- **`breakingTaskIds`** — tasks that triggered a major recommendation.
- **`consideredTaskCount`** — completed tasks in scope.

## SemVer rules (v1)

1. Inspect **completed** tasks in scope (`phaseKey` when provided).
2. Prefer **`metadata.changeKind`** when set: `breaking`/`major` → major; `feature`/`minor` → minor; `fix`/`patch`/`chore` → patch.
3. Otherwise use task **type** heuristics: `feature` → minor; default → patch.
4. Take the **maximum** bump rank across considered tasks; default **patch** when none qualify.

See **`.ai/RELEASING.md`** workflow **W200** and **`.ai/playbooks/phase-closeout-and-release.md`**.
