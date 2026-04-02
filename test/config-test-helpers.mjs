/** Merge `tasks.persistenceBackend: sqlite` (and default db path) for tests that use the planning SQLite store. */
export function withSqliteTaskPersistence(effective) {
  const base = effective && typeof effective === "object" && !Array.isArray(effective) ? effective : {};
  const tasks =
    base.tasks && typeof base.tasks === "object" && !Array.isArray(base.tasks) ? base.tasks : {};
  return {
    ...base,
    tasks: {
      ...tasks,
      persistenceBackend: "sqlite",
      sqliteDatabaseRelativePath:
        tasks.sqliteDatabaseRelativePath ?? ".workspace-kit/tasks/workspace-kit.db"
    }
  };
}
