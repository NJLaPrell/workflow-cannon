import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { TaskStore } from "./store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath
} from "./planning-config.js";

export type OpenedPlanningStores = {
  kind: "json" | "sqlite";
  taskStore: TaskStore;
  sqliteDual: SqliteDualPlanningStore | null;
};

export async function openPlanningStores(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  if (getTaskPersistenceBackend(ctx.effectiveConfig) === "sqlite") {
    const dual = new SqliteDualPlanningStore(
      ctx.workspacePath,
      planningSqliteDatabaseRelativePath(ctx)
    );
    dual.loadFromDisk();
    const taskStore = TaskStore.forSqliteDual(dual);
    await taskStore.load();
    return {
      kind: "sqlite",
      sqliteDual: dual,
      taskStore
    };
  }

  const taskStore = TaskStore.forJsonFile(
    ctx.workspacePath,
    planningTaskStoreRelativePath(ctx)
  );
  await taskStore.load();

  return {
    kind: "json",
    sqliteDual: null,
    taskStore
  };
}
