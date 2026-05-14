import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { verifyRuntimeStampFile } from "../../../core/runtime-contract.js";
import { formatNodeRuntimeIdentity } from "../../../core/native-sqlite-diagnostics.js";
import { TaskEngineError } from "../transitions.js";
import { TaskStore } from "./store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { collapseLegacyWishlistSqliteIfNeeded } from "./legacy-wishlist-sqlite-cleanup.js";

export type OpenedPlanningStores = {
  taskStore: TaskStore;
  sqliteDual: SqliteDualPlanningStore;
};

function assertNativeBindingArchitecture(workspacePath: string): void {
  const verified = verifyRuntimeStampFile(workspacePath, { checkNativeSqlite: false });
  const archIssue = verified.issues.find(
    (issue) => issue.code === "runtime-arch-mismatch" || issue.code === "runtime-host-arch-mismatch"
  );
  if (!archIssue) {
    return;
  }
  throw new TaskEngineError(
    "native-binding-arch-mismatch",
    `${archIssue.message}. Remediation: run \"pnpm rebuild better-sqlite3\" under the active architecture (${process.arch}). Runtime: ${formatNodeRuntimeIdentity()}.`
  );
}

export async function openPlanningStores(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  assertNativeBindingArchitecture(ctx.workspacePath);
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
