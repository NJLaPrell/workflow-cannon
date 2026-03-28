import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";
import { getNextActions } from "../suggestions.js";
import { readWorkspaceStatusSnapshot } from "../dashboard-status.js";
import type { WishlistItem } from "../wishlist-types.js";

export async function handleDashboardSummary(
  _args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const suggestion = getNextActions(tasks);
  const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
  const readyTop = suggestion.readyQueue.slice(0, 15).map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority ?? null,
    phase: t.phase ?? null
  }));
  const blockedTop = suggestion.blockingAnalysis.slice(0, 15);

  let wishlistItems: WishlistItem[] = [];
  try {
    const wishlistStore = await planning.openWishlist();
    wishlistItems = wishlistStore.getAllItems();
  } catch {
    /* wishlist store optional */
  }
  const wishlistOpenCount = wishlistItems.filter((i) => i.status === "open").length;

  const data = {
    schemaVersion: 1 as const,
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    stateSummary: suggestion.stateSummary,
    readyQueueTop: readyTop,
    readyQueueCount: suggestion.readyQueue.length,
    executionPlanningScope: "tasks-only" as const,
    wishlist: {
      schemaVersion: 1 as const,
      openCount: wishlistOpenCount,
      totalCount: wishlistItems.length
    },
    blockedSummary: {
      count: suggestion.blockingAnalysis.length,
      top: blockedTop
    },
    suggestedNext: suggestion.suggestedNext
      ? {
          id: suggestion.suggestedNext.id,
          title: suggestion.suggestedNext.title,
          status: suggestion.suggestedNext.status,
          priority: suggestion.suggestedNext.priority ?? null,
          phase: suggestion.suggestedNext.phase ?? null
        }
      : null,
    blockingAnalysis: suggestion.blockingAnalysis
  } satisfies Record<string, unknown>;

  return {
    ok: true,
    code: "dashboard-summary",
    message: "Dashboard summary built from task store and maintainer status snapshot",
    data
  };
}
