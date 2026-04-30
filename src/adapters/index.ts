export type AdapterVersion = "0.1";

/**
 * Direction C (REF-009): kit planning SQLite lives in `core/state`; this barrel re-exports the
 * stable open/migrate surface so `adapters/` matches the layering story without a second runner.
 */
export {
  KIT_SQLITE_USER_VERSION,
  kitSqliteHasRelationalTaskDdl,
  prepareKitSqliteDatabase,
  readKitSqliteUserVersion
} from "../core/state/kit-sqlite/planning-sqlite-kernel.js";
