/**
 * Stable import surface for kit planning SQLite (tests, modules, package exports).
 * Canonical implementation and `user_version` ladder: `kit-sqlite/planning-sqlite-kernel.ts`.
 */
export {
  KIT_SQLITE_USER_VERSION,
  TASK_ENGINE_TASKS_TABLE,
  TASK_ENGINE_DEPENDENCIES_TABLE,
  TASK_ENGINE_TRANSITION_LOG_TABLE,
  TASK_ENGINE_MUTATION_LOG_TABLE,
  prepareKitSqliteDatabase,
  kitSqliteHasRelationalTaskDdl,
  readKitSqliteUserVersion
} from "./kit-sqlite/planning-sqlite-kernel.js";
