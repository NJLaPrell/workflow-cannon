import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TaskStore } from "./store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { collapseLegacyWishlistSqliteIfNeeded } from "./legacy-wishlist-sqlite-cleanup.js";

export type OpenedPlanningStores = {
  taskStore: TaskStore;
  sqliteDual: SqliteDualPlanningStore;
};

export async function openPlanningStores(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  const dual = new SqliteDualPlanningStore(
    ctx.workspacePath,
    planningSqliteDatabaseRelativePath(ctx)
  );
  dual.loadFromDisk();
  const taskStore = TaskStore.forSqliteDual(dual);
  await taskStore.load();
  collapseLegacyWishlistSqliteIfNeeded(dual, taskStore);
  await taskStore.load();
  return { sqliteDual: dual, taskStore };
}
