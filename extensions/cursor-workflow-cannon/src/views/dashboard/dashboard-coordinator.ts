import type { CommandClient } from "../../runtime/command-client.js";
import type {
  DashboardIntent,
  DrawerSubmitHandlerResult,
  DrawerSubmitIntent
} from "./drawer-intents.js";
import { isDrawerCancelIntent, isDrawerSubmitIntent } from "./drawer-intents.js";
import type { DashboardRefreshController } from "./dashboard-refresh-controller.js";
import type { DrawerSessionController, WcDrawerStateSnapshot } from "./drawer-session.js";
import type { SideEffectBus } from "./dashboard-side-effects.js";

export type { DashboardIntent, DrawerSubmitHandlerResult } from "./drawer-intents.js";

export type DashboardHostSnapshot = {
  schemaVersion: 1;
  drawer: WcDrawerStateSnapshot;
  interaction: {
    mutationActive: boolean;
    refreshBusy: boolean;
  };
};

export type DashboardCoordinatorDeps = {
  drawerSession: DrawerSessionController;
  refreshController: DashboardRefreshController;
  client: CommandClient;
  beginMutationHold: () => void;
  endMutationHold: () => void;
  beginDrawerMutationHold: () => void;
  endDrawerMutationHold: () => void;
  emitToWebview: (snapshot: DashboardHostSnapshot) => void;
  sideEffects: SideEffectBus;
  onDrawerSubmit: (values: Record<string, string>) => Promise<DrawerSubmitHandlerResult>;
  onDrawerCancel: () => Promise<void>;
  hasActiveDrawerSession: () => boolean;
  closeDrawer: () => Promise<void>;
  resetDrawerSubmitPendingEffects: () => void;
  flushDrawerSubmitPendingEffects: (bus: SideEffectBus) => void;
  /** Host refresh button busy state for snapshot.interaction.refreshBusy (T100494). */
  isRefreshBusy: () => boolean;
};

/**
 * Host-side dashboard intent coordinator.
 * Owns drawer mutation critical sections; side effects run after {@link runMutation}.
 */
export class DashboardCoordinator {
  private mutationActive = false;
  private readonly registeredDrawerWorkflows = new Set<string>();

  constructor(private readonly deps: DashboardCoordinatorDeps) {}

  /** Marks a drawer workflow as coordinator-owned (accept-proposed, etc.). */
  registerDrawerWorkflow(workflowId: string): void {
    this.registeredDrawerWorkflows.add(workflowId);
  }

  isDrawerWorkflowRegistered(workflowId: string): boolean {
    return this.registeredDrawerWorkflows.has(workflowId);
  }

  get sideEffects(): SideEffectBus {
    return this.deps.sideEffects;
  }

  snapshot(): DashboardHostSnapshot {
    return {
      schemaVersion: 1,
      drawer: this.deps.drawerSession.snapshot(),
      interaction: {
        mutationActive: this.mutationActive,
        refreshBusy: this.deps.isRefreshBusy()
      }
    };
  }

  emitSnapshot(): void {
    this.deps.emitToWebview(this.snapshot());
  }

  async dispatch(intent: DashboardIntent): Promise<void> {
    if (isDrawerSubmitIntent(intent)) {
      await this.handleDrawerSubmitIntent(intent);
      return;
    }
    if (isDrawerCancelIntent(intent)) {
      await this.handleDrawerCancelIntent();
    }
  }

  isMutationActive(): boolean {
    return this.mutationActive;
  }

  /**
   * Runs kit work inside refresh/mutation holds. Always releases holds in `finally`.
   * Do not call {@link SideEffectBus} methods from `fn` — schedule them after this resolves.
   */
  async runMutation<T>(submitLabel: string, fn: () => Promise<T>): Promise<T> {
    this.mutationActive = true;
    this.deps.drawerSession.setSubmitting(submitLabel);
    this.deps.beginMutationHold();
    this.emitSnapshot();
    try {
      return await fn();
    } finally {
      this.mutationActive = false;
      this.deps.endMutationHold();
      this.emitSnapshot();
    }
  }

  private async handleDrawerSubmitIntent(intent: DrawerSubmitIntent): Promise<void> {
    this.deps.resetDrawerSubmitPendingEffects();
    const result = await this.runDrawerMutation(intent.sessionLabel, () =>
      this.deps.onDrawerSubmit(intent.values)
    );
    this.deps.flushDrawerSubmitPendingEffects(this.deps.sideEffects);
    if (!this.deps.hasActiveDrawerSession()) {
      await this.deps.closeDrawer();
    }
    if (result.refreshed) {
      this.deps.sideEffects.scheduleRefresh("light", "drawer-submit");
    }
  }

  private async handleDrawerCancelIntent(): Promise<void> {
    await this.deps.onDrawerCancel();
    this.emitSnapshot();
  }

  private async runDrawerMutation<T>(submitLabel: string, fn: () => Promise<T>): Promise<T> {
    this.deps.beginDrawerMutationHold();
    try {
      return await this.runMutation(submitLabel, fn);
    } finally {
      this.deps.endDrawerMutationHold();
    }
  }
}
