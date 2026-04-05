<!-- GENERATED FROM .ai/runbooks/json-to-sqlite-one-shot-upgrade.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# One-shot upgrade: JSON task/wishlist stores → unified SQLite

Use this runbook when **legacy JSON** task/wishlist files exist (for example **`.workspace-kit/tasks/state.json`**) and you want data in the default **SQLite** layout under **`tasks.sqliteDatabaseRelativePath`** (default **`.workspace-kit/tasks/workspace-kit.db`**). **v0.40+** rejects **`tasks.persistenceBackend: "json"`** — migrate first, then rely on sqlite-only runtime.

## Preconditions

- **`workspace-kit doctor`** passes on the workspace (contracts + config), or you accept fixing config first.
- Back up JSON files if unsure: **`tasks.storeRelativePath`** (default **`.workspace-kit/tasks/state.json`**) and **`tasks.wishlistStoreRelativePath`** (default **`.workspace-kit/wishlist/state.json`**).

## Ordered steps

1. **Dry run migration** (optional but recommended):

   ```bash
   workspace-kit run migrate-task-persistence '{"direction":"json-to-sqlite","dryRun":true}'
   ```

   Or **`json-to-unified-sqlite`** if your kit version documents that direction (see **`migrate-task-persistence`** instruction).

2. **Execute migration** with policy JSON as required by your environment:

   ```bash
   workspace-kit run migrate-task-persistence '{"direction":"json-to-sqlite","policyApproval":{"confirmed":true,"rationale":"one-shot json to sqlite"}}'
   ```

3. **Wishlist intake** (when upgrading from legacy SQLite dual-column wishlist — follow **`migrate-wishlist-intake`** if applicable).

4. **Flip config** — Omit **`tasks.persistenceBackend`** or set **`sqlite`** (default). Remove any legacy **`json`** key (**v0.40+** will reject it if present).

5. **Verify**

   ```bash
   workspace-kit doctor
   workspace-kit run list-module-states '{}'
   workspace-kit run list-tasks '{}'
   ```

   Confirm **`kitSqliteUserVersion`** is present on **`list-module-states`** and **`PRAGMA user_version`** appears in **`doctor`** persistence lines.

6. **Optional blessed backup** before archiving JSON:

   ```bash
   workspace-kit run backup-planning-sqlite '{"outputPath":"artifacts/planning-pre-cleanup.db"}'
   ```

7. **Safe deletion** — Only after verification, remove obsolete JSON paths if you no longer need rollback copies. Keep copies until the next release slice is stable.

## Related

- [`task-persistence-operator.md`](./task-persistence-operator.md)
- [`native-sqlite-consumer-install.md`](./native-sqlite-consumer-install.md)
- ADR: [`ADR-json-persistence-deprecation.md`](../adrs/ADR-json-persistence-deprecation.md)
