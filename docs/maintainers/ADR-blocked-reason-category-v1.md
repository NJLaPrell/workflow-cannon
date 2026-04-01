# ADR: `metadata.blockedReasonCategory` (v1)

## Status

Accepted — documentation + filter surface in v0.36.0; optional metadata only.

## Context

Blocked tasks sometimes need lightweight taxonomy for dashboards and `list-tasks` filters without inventing a full workflow engine.

## Decision

Optional string **`metadata.blockedReasonCategory`** on task records. Initial documented values:

| Value | Meaning |
| --- | --- |
| `human_review` | Waiting on maintainer / human decision |
| `external_dependency` | Blocked on upstream system, vendor, or other repo |
| `scope_unclear` | Needs clarification before work can continue |

Unset values omit noise in JSON output; **`list-tasks`** accepts **`blockedReasonCategory`** in JSON args to filter.

## Consequences

- Enum validation on write is **not** enforced in v1 (operators may introduce new strings; document additions via TERMS/ADR follow-up).
- Extension and CLI consumers should treat unknown values as opaque.
