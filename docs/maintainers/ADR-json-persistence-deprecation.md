# ADR: JSON task persistence opt-out — deprecation direction and semver

## Status

Accepted (**v0.39.0** — planning / documentation; **no runtime removal** in this release).

## Context

`tasks.persistenceBackend` still supports **`json`** as an explicit opt-out from the default SQLite planning database. Maintainers want a **single long-term persistence story** (unified `workspace-kit.db` with `PRAGMA user_version` migrations, module state, and online backup) while honoring **R003/R008** (compatibility and documented migration before breaking changes).

## Decision

1. **Current release (0.39.x)** — JSON opt-out **remains supported**; this ADR records **intent** to remove it in a **future major** semver once adoption and migration evidence are sufficient.
2. **Future major (when executed)** — Dropping `tasks.persistenceBackend: "json"` will be a **semver-major** bump for `@workflow-cannon/workspace-kit`; consumers must migrate via **`migrate-task-persistence`** (`json-to-sqlite` / `json-to-unified-sqlite` per runbook) or pin the previous major.
3. **Migration contract** — Canonical operator paths: **`docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`**, **`docs/maintainers/runbooks/task-persistence-operator.md`**, and **`migrate-task-persistence`** / **`migrate-wishlist-intake`** instructions.
4. **Governance** — Execution of the actual code removal requires **explicit maintainer approval** (PRINCIPLES **R007/R008**) and CHANGELOG / RELEASING notes before publish.

## Consequences

- **Positive:** Clear semver and migration story before any breaking removal; aligns with centralized SQLite DDL + **`user_version`** introduced in **v0.39.0**.
- **Negative:** Dual-backend tests and docs remain until JSON is removed.
- **Related:** [`ADR-sqlite-default-persistence.md`](./ADR-sqlite-default-persistence.md), [`ADR-task-sqlite-persistence.md`](./ADR-task-sqlite-persistence.md), [`runbooks/task-persistence-operator.md`](./runbooks/task-persistence-operator.md).
