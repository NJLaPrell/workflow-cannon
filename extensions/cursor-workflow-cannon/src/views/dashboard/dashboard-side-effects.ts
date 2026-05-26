export type SideEffectSeverity = "info" | "error";

export type SideEffectBusDeps = {
  /** Fire-and-forget toast — must not block mutation critical sections. */
  notify: (message: string, severity?: SideEffectSeverity) => void;
  scheduleRefresh: (mode: "light" | "full", reason: string) => void;
  notifyKitChanged: () => void;
};

/**
 * Non-blocking host side effects after dashboard mutations complete (T100492).
 * Callers must not invoke these from inside {@link DashboardCoordinator.runMutation}.
 */
export class SideEffectBus {
  constructor(private readonly deps: SideEffectBusDeps) {}

  notify(message: string, severity: SideEffectSeverity = "info"): void {
    queueMicrotask(() => {
      this.deps.notify(message, severity);
    });
  }

  scheduleRefresh(mode: "light" | "full", reason: string): void {
    queueMicrotask(() => {
      this.deps.scheduleRefresh(mode, reason);
    });
  }

  notifyKitChanged(): void {
    queueMicrotask(() => {
      this.deps.notifyKitChanged();
    });
  }
}
