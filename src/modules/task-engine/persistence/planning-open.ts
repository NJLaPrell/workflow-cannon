import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { verifyRuntimeStampFile } from "../../../core/runtime-contract.js";
import {
  formatArchMismatchRemediation,
  formatNodeRuntimeIdentity
} from "../../../core/native-sqlite-diagnostics.js";
import { TaskEngineError } from "../transitions.js";
import { TaskStore } from "./store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";

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
  const remediation = formatArchMismatchRemediation(new Error(archIssue.message));
  throw new TaskEngineError(
    "native-binding-arch-mismatch",
    `${remediation.message} Remediation: ${remediation.remediationCommand} Runtime: ${formatNodeRuntimeIdentity()}.`
  );
}

import { cliPerfTracer } from "../../../core/cli-perf-trace.js";

export async function openPlanningStores(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  return openPlanningStoresFull(ctx);
}

export async function openPlanningStoresFull(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  return cliPerfTracer.spanAsync("openPlanningStoresFull", async () => {
    assertNativeBindingArchitecture(ctx.workspacePath);
    const dual = new SqliteDualPlanningStore(
      ctx.workspacePath,
      planningSqliteDatabaseRelativePath(ctx)
    );
    dual.loadFromDisk();
    const taskStore = TaskStore.forSqliteDual(dual);
    await taskStore.load();
    return { sqliteDual: dual, taskStore };
  });
}

export async function openPlanningStoresReadOnly(ctx: ModuleLifecycleContext): Promise<OpenedPlanningStores> {
  return cliPerfTracer.spanAsync("openPlanningStoresReadOnly", async () => {
    assertNativeBindingArchitecture(ctx.workspacePath);
    const dual = new SqliteDualPlanningStore(
      ctx.workspacePath,
      planningSqliteDatabaseRelativePath(ctx),
      true // readOnly = true
    );
    dual.loadFromDisk();
    const taskStore = TaskStore.forSqliteDual(dual);
    await taskStore.load();
    return { sqliteDual: dual, taskStore };
  });
}

export async function openPlanningStoresForDashboardSlice(
  ctx: ModuleLifecycleContext,
  sliceName: string
): Promise<OpenedPlanningStores> {
  return cliPerfTracer.spanAsync(`openPlanningStoresForDashboardSlice:${sliceName}`, async () => {
    assertNativeBindingArchitecture(ctx.workspacePath);
    
    // Choose skip flags based on what slices need
    // Slices like 'cae' do not need task store hydration at all
    const skipTasks = sliceName === "cae";
    // Slices like 'agentActivity', 'team', 'subagents', 'checkpoints', 'config', 'planArtifact'
    // only read minimal properties and do not need the full transition/mutation logs parsed in JS.
    const skipLogs = sliceName !== "queue" && sliceName !== "overview" && sliceName !== "status";

    const dual = new SqliteDualPlanningStore(
      ctx.workspacePath,
      planningSqliteDatabaseRelativePath(ctx),
      true, // readOnly = true
      { skipTasks, skipLogs }
    );
    dual.loadFromDisk();
    const taskStore = TaskStore.forSqliteDual(dual);
    if (!skipTasks) {
      await taskStore.load();
    }
    return { sqliteDual: dual, taskStore };
  });
}

