# ADR: Task Engine and Wishlist SQLite persistence

## Status

Accepted (Phase 15).

## Context

Task Engine and Wishlist state lived in separate JSON files with atomic-per-file writes. Operators wanted optional SQLite storage for consistency (especially atomic wishlist conversion with task creation) and simpler backup of one file.

## Decision

1. **Driver**: Use `better-sqlite3` (native, synchronous API, prebuilt binaries for common platforms). CI enables `pnpm.onlyBuiltDependencies` so installs compile or fetch prebuilds.
2. **Schema**: Store the existing `TaskStoreDocument` and `WishlistStoreDocument` as JSON text in one row (`workspace_planning_state`) rather than normalizing every task field—preserves forward compatibility with `TaskEntity` evolution without frequent SQL migrations.
3. **Default**: `tasks.persistenceBackend` defaults to `json`; SQLite is opt-in after running `migrate-task-persistence` and setting config.
4. **Atomicity**: `convert-wishlist` uses a single SQLite transaction when the backend is `sqlite`; JSON mode keeps the prior two-file behavior.
5. **Migration**: `migrate-task-persistence` copies JSON → SQLite or SQLite → JSON using configured relative paths; it does not delete source files automatically.

## Consequences

- **Positive**: One-file backup for both tasks and wishlist under SQLite; atomic conversion; same behavior for JSON users by default.
- **Negative**: Native dependency and platform support tied to `better-sqlite3` prebuilds; consumers on unusual architectures may need build tooling.
