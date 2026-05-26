import type { CommandClient } from "../../runtime/command-client.js";
import type { DashboardRefreshController } from "./dashboard-refresh-controller.js";
import type { DrawerSessionController, WcDrawerStateSnapshot } from "./drawer-session.js";
import type { SideEffectBus } from "./dashboard-side-effects.js";

export type DashboardHostSnapshot = {
  schemaVersion: 1;
  drawer: WcDrawerStateSnapshot;
  interaction: {
    mutationActive: boolean;
  };
};

export type DashboardCoordinatorDeps = {
  drawerSession: DrawerSessionController;
  refreshController: DashboardRefreshController;
  client: CommandClient;
  beginMutationHold: () => void;
  endMutationHold: () => void;
  emitToWebview: (snapshot: DashboardHostSnapshot) => void;
  sideEffects: SideEffectBus;
};

export type DashboardIntent = {
  type: string;
  [key: string]: unknown;
};

/**
 * Host-side dashboard intent coordinator (T100492 scaffold).
 * Owns the kit mutation critical section; side effects run via {@link SideEffectBus} after runMutation.
 */
export class DashboardCoordinator {
  private mutationActive = false;

  constructor(private readonly deps: DashboardCoordinatorDeps) {}

  get sideEffects(): SideEffectBus {
    return this.deps.sideEffects;
  }

  snapshot(): DashboardHostSnapshot {
    return {
      schemaVersion: 1,
      drawer: this.deps.drawerSession.snapshot(),
      interaction: {
        mutationActive: this.mutationActive
      }
    };
  }

  emitSnapshot(): void {
    this.deps.emitToWebview(this.snapshot());
  }

  /** Intent entry point — extended in follow-on tasks (T100493+). */
  dispatch(_intent: DashboardIntent): void {
    // Scaffold: no routed intents until drawer flows migrate.
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
}
