import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { TaskStore } from "./store.js";
import { WishlistStore } from "./wishlist-store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "./planning-config.js";

export type OpenedPlanningStores =
  | {
      kind: "json";
      taskStore: TaskStore;
      sqliteDual: null;
      openWishlist: () => Promise<WishlistStore>;
      close: () => void;
    }
  | {
      kind: "sqlite";
      taskStore: TaskStore;
      sqliteDual: SqliteDualPlanningStore;
      openWishlist: () => Promise<WishlistStore>;
      close: () => void;
    };

export async function openPlanningStores(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  if (getTaskPersistenceBackend(ctx.effectiveConfig) === "sqlite") {
    const dual = new SqliteDualPlanningStore(
      ctx.workspacePath,
      planningSqliteDatabaseRelativePath(ctx)
    );
    dual.loadFromDisk();
    const taskStore = TaskStore.forSqliteDual(dual);
    await taskStore.load(); // binds task document reference from dual
    return {
      kind: "sqlite",
      sqliteDual: dual,
      taskStore,
      openWishlist: async () => {
        const w = WishlistStore.forSqliteDual(dual);
        await w.load();
        return w;
      },
      close: () => dual.close()
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
    taskStore,
    openWishlist: async () => {
      const w = WishlistStore.forJsonFile(
        ctx.workspacePath,
        planningWishlistStoreRelativePath(ctx)
      );
      await w.load();
      return w;
    },
    close: () => { /* JSON stores have no handles to release */ }
  };
}
