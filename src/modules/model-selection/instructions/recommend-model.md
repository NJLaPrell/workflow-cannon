# recommend-model

Select the cheapest adequate model slug for a Cursor Task-tool subagent dispatch based on task scope signals.

## When to use

Call this before spawning a subagent with the Cursor `Task` tool whenever you want to pick the right `model` argument automatically. Pass the scope signals you know about (subagent type, task complexity, risk level, etc.) and receive a primary model slug plus one or two fallbacks.

## Input

All fields are optional. Provide as many signals as you know.

```json
{
  "subagentType": "generalPurpose",
  "taskTypeHints": ["large-refactor", "multi-file-planning"],
  "complexity": "high",
  "risk": "medium",
  "ambiguity": "low",
  "scopeBreadth": "high",
  "packetTier": "tier_2",
  "explicitModelTier": "high_reasoning",
  "mapPath": ".ai/cursor-model-selection-map.v1.json"
}
```

### Field reference

| Field | Values | Notes |
|---|---|---|
| `subagentType` | `explore`, `shell`, `generalPurpose`, `best-of-n-runner`, `bugbot`, `security-review`, `ci-investigator`, `cursor-guide` | Cursor Task-tool subagent type. Drives subagentTypeDefaults in the map. |
| `taskTypeHints` | string array | Free-form task keywords (e.g. `["security-audit", "large-refactor"]`). Matched against selection rules. |
| `complexity` | `low` \| `medium` \| `high` \| `critical` | Code/algorithmic complexity of the task. |
| `risk` | `low` \| `medium` \| `high` \| `critical` | Risk of breaking things, security impact, data loss. |
| `ambiguity` | `low` \| `medium` \| `high` \| `critical` | How unclear the requirements are. |
| `scopeBreadth` | `low` \| `medium` \| `high` \| `critical` | Number of files/modules touched. |
| `packetTier` | `tier_1` \| `tier_2` \| `tier_3` | Shorthand for a preset scope-level bundle. Explicit fields override the preset. |
| `explicitModelTier` | `cheap_fast` \| `balanced` \| `high_reasoning` \| `specialist` | Override: force a specific tier rather than inferring. |
| `mapPath` | string | Override path to the model-selection-map JSON (default: `.ai/cursor-model-selection-map.v1.json`). |

### Scope-level guide

| Level | complexity | risk | ambiguity | scopeBreadth |
|---|---|---|---|---|
| `low` | Trivial patch | Isolated file | Clear spec | 1–3 files |
| `medium` | Moderate logic | Shared utility | Some interpretation | One subsystem |
| `high` | Multi-layer design | Auth/data paths | Open-ended | Multiple subsystems |
| `critical` | Novel architecture | Security/migration | Discovery only | Repo-wide |

## Output

```json
{
  "ok": true,
  "code": "model-recommended",
  "data": {
    "modelSlug": "claude-4.6-sonnet-medium-thinking",
    "modelTier": "high_reasoning",
    "modelHint": "claude-4.6-sonnet-medium-thinking",
    "rationale": "High complexity or wide scope — high-reasoning model recommended.",
    "ruleId": "high_complexity_or_breadth",
    "escalationTriggers": ["complexity=high (>= high)"],
    "fallbackSlugs": ["composer-2.5-fast", "gpt-5.5-medium"],
    "primary": { "modelSlug": "claude-4.6-sonnet-medium-thinking", "modelTier": "high_reasoning" },
    "fallbackRecommendations": [
      { "modelSlug": "composer-2.5-fast", "modelTier": "high_reasoning", "costBand": "medium" }
    ]
  }
}
```

Use `data.modelSlug` as the `model` argument to the Cursor Task tool. If `modelSlug` is `null`, use `data.modelTier` to select via the tier default.

## Tier overview (Cursor host, June 2026)

| Tier | Default slug | Typical cost |
|---|---|---|
| `cheap_fast` | `composer-2.5` | $1.50/M avg |
| `balanced` | `composer-2.5` | $1.50/M avg |
| `high_reasoning` | `claude-4.6-sonnet-medium-thinking` | $9.00/M avg |
| `specialist` | `claude-opus-4-8-thinking-high` | $15.00/M avg |

## Selection rules (priority order)

1. **`critical_risk`** (P100) — Any `risk=critical` → `claude-opus-4-8-thinking-high` (specialist)
2. **`critical_complexity`** (P90) — Any `complexity=critical` → specialist
3. **`bugbot_security`** (P85) — subagentType in `[bugbot, security-review]` → specialist
4. **`high_complexity_and_risk`** (P70) — Both `complexity=high` AND `risk=high` → high_reasoning
5. **`high_complexity_or_breadth`** (P60) — `complexity=high` OR `scopeBreadth=high` → high_reasoning
6. **`explore_shell_cheap`** (P50) — subagentType in `[explore, shell, cursor-guide, ci-investigator]` → cheap_fast
7. **`creative_task`** (P45) — taskTypeHints contains `creative` etc → `claude-fable-5-thinking-high`
8. **`default`** (P10) — balanced tier

## Related commands

- `list-model-selection-map` — Show the full map (models, tiers, defaults) without running a selection.
