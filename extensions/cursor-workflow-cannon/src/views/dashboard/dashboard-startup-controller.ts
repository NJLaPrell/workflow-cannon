/**
 * Sole owner of dashboard cold-start (T100843 / I012 WBS-1).
 *
 * State machine:
 *   idle → shell-painted → bootstrap-loading → hydrated → background-hydrating → ready
 *                                                                              ↘ error
 *
 * Inventoried startup entrypoints (must call {@link DashboardStartupController.request} only):
 * - extension resolveWebviewView shell paint + initial bootstrap (`resolve-webview`)
 * - webview `dashboardWebviewBoot` (`webview-boot`)
 * - webview `dashboardWebviewReady` (`webview-ready`)
 * - webview `dashboardStartupTimeout` (`startup-timeout`)
 * - webview `dashboardStartupRefresh` (`startup-refresh`)
 * - pushUpdate fallbacks when root is not yet hydrated (`push-update-fallback`)
 *
 * Post-ready refresh stays on {@link DashboardRefreshController}.
 */

export type DashboardStartupPhase =
  | "idle"
  | "shell-painted"
  | "bootstrap-loading"
  | "hydrated"
  | "background-hydrating"
  | "ready"
  | "error";

export type DashboardStartupTrigger =
  | "resolve-webview"
  | "webview-boot"
  | "webview-ready"
  | "startup-timeout"
  | "startup-refresh"
  | "push-update-fallback";

/** Documented inventory for regression gates — keep in sync with provider message handlers. */
export const DASHBOARD_STARTUP_ENTRYPOINT_INVENTORY = [
  "resolve-webview",
  "webview-boot",
  "webview-ready",
  "startup-timeout",
  "startup-refresh",
  "push-update-fallback"
] as const satisfies readonly DashboardStartupTrigger[];

/** Soft abort (stale webview / dispose) — do not enter error or hydrated. */
export class DashboardStartupAbortedError extends Error {
  readonly code = "dashboard-startup-aborted" as const;

  constructor(message: string) {
    super(message);
    this.name = "DashboardStartupAbortedError";
  }
}

export type DashboardStartupControllerDeps = {
  /** One overview bootstrap paint (summary + wcReplaceRoot). Must not start a parallel full render. */
  executeBootstrap: () => Promise<void>;
  /** Eager section upgrades after first hydrated paint; may no-op when nothing to upgrade. */
  executeBackgroundHydration?: () => Promise<void>;
  /** Fired once when bootstrap paint succeeds (before background hydration). */
  onHydrated?: () => void;
  /** Fired when startup reaches ready (background hydration finished or skipped). */
  onReady?: () => void;
  /** Fired when bootstrap fails after posting/recovering in the host. */
  onError?: (message: string) => void;
  log?: (message: string) => void;
};

/**
 * Single-flight startup owner. Concurrent {@link request} calls coalesce behind one promise.
 */
export class DashboardStartupController {
  private phase: DashboardStartupPhase = "idle";
  private bootstrapInFlight: Promise<void> | undefined;
  private backgroundInFlight: Promise<void> | undefined;
  private lastError: string | undefined;

  constructor(private readonly deps: DashboardStartupControllerDeps) {}

  getPhase(): DashboardStartupPhase {
    return this.phase;
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  /** True while the overview bootstrap promise is in flight (poller deferral). */
  isBootstrapInFlight(): boolean {
    return this.bootstrapInFlight !== undefined;
  }

  isShellPainted(): boolean {
    return this.phase !== "idle";
  }

  /** True once overview root has been painted (hydrated / background / ready). */
  isHydrated(): boolean {
    return (
      this.phase === "hydrated" ||
      this.phase === "background-hydrating" ||
      this.phase === "ready"
    );
  }

  isReady(): boolean {
    return this.phase === "ready";
  }

  isError(): boolean {
    return this.phase === "error";
  }

  /** Synchronous shell HTML paint — never awaits dashboard-summary. */
  markShellPainted(): void {
    if (this.phase === "idle" || this.phase === "error") {
      this.setPhase("shell-painted");
    }
  }

  /**
   * Request bootstrap, retry, or post-hydrate background work through the sole owner.
   * Concurrent bootstrap requests reuse the in-flight promise.
   */
  request(trigger: DashboardStartupTrigger): Promise<void> {
    const forceBootstrap = trigger === "startup-refresh";

    if (this.isHydrated() && !forceBootstrap) {
      if (trigger === "webview-ready") {
        this.deps.log?.(`startup request trigger=${trigger} → background hydration`);
        return this.ensureBackgroundHydration();
      }
      this.deps.log?.(`startup request trigger=${trigger} ignored (already hydrated phase=${this.phase})`);
      return Promise.resolve();
    }

    if (this.bootstrapInFlight) {
      this.deps.log?.(
        `startup request trigger=${trigger} coalesced with in-flight dashboard-summary`
      );
      return this.bootstrapInFlight;
    }

    this.deps.log?.(`startup request trigger=${trigger} phase=${this.phase}`);
    const run = this.runBootstrap(trigger).finally(() => {
      if (this.bootstrapInFlight === run) {
        this.bootstrapInFlight = undefined;
      }
    });
    this.bootstrapInFlight = run;
    return run;
  }

  /** Dispose / webview teardown — return to idle and drop in-flight tracking. */
  reset(): void {
    this.bootstrapInFlight = undefined;
    this.backgroundInFlight = undefined;
    this.lastError = undefined;
    this.phase = "idle";
  }

  private async runBootstrap(trigger: DashboardStartupTrigger): Promise<void> {
    if (this.phase === "idle") {
      // Shell should already be painted; tolerate resolve races.
      this.setPhase("shell-painted");
    }
    this.lastError = undefined;
    this.setPhase("bootstrap-loading");
    try {
      await this.deps.executeBootstrap();
      this.setPhase("hydrated");
      this.deps.onHydrated?.();
      await this.ensureBackgroundHydration();
    } catch (error) {
      if (error instanceof DashboardStartupAbortedError) {
        this.deps.log?.(`startup bootstrap aborted trigger=${trigger}: ${error.message}`);
        this.setPhase(this.phase === "idle" ? "idle" : "shell-painted");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.setPhase("error");
      this.deps.onError?.(message);
      this.deps.log?.(`startup bootstrap failed trigger=${trigger}: ${message}`);
      // Soft-fail for callers that await without try/catch (webview message handlers).
    }
  }

  private ensureBackgroundHydration(): Promise<void> {
    if (this.phase === "ready") {
      return Promise.resolve();
    }
    if (this.backgroundInFlight) {
      this.deps.log?.("startup background hydration coalesced with in-flight work");
      return this.backgroundInFlight;
    }
    // Only after bootstrap success (hydrated) or while already background-hydrating.
    if (this.phase !== "hydrated" && this.phase !== "background-hydrating") {
      return Promise.resolve();
    }

    const run = this.runBackgroundHydration().finally(() => {
      if (this.backgroundInFlight === run) {
        this.backgroundInFlight = undefined;
      }
    });
    this.backgroundInFlight = run;
    return run;
  }

  private async runBackgroundHydration(): Promise<void> {
    if (!this.deps.executeBackgroundHydration) {
      this.setPhase("ready");
      this.deps.onReady?.();
      return;
    }
    this.setPhase("background-hydrating");
    try {
      await this.deps.executeBackgroundHydration();
    } catch (error) {
      // Overview is already usable; background failure must not restart bootstrap.
      const message = error instanceof Error ? error.message : String(error);
      this.deps.log?.(`startup background hydration failed (keeping hydrated overview): ${message}`);
    }
    this.setPhase("ready");
    this.deps.onReady?.();
  }

  private setPhase(next: DashboardStartupPhase): void {
    if (this.phase === next) {
      return;
    }
    this.deps.log?.(`startup phase ${this.phase} → ${next}`);
    this.phase = next;
  }
}
