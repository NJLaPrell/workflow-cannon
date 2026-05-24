export type DashboardRefreshMode = "light" | "full";

export type DashboardRefreshRequest = {
  reason: string;
  mode?: DashboardRefreshMode;
};

export type DashboardRefreshControllerDeps = {
  /** Perform one dashboard refresh cycle; return when CLI reads + render post complete. */
  executeRefresh: (mode: DashboardRefreshMode, generation: number) => Promise<void>;
  /** True when UI locks or host suppression defer refresh. */
  isDeferred: () => boolean;
  /** Called when a mutation starts so pending refresh intents can be dropped. */
  onMutationStart?: () => void;
  log?: (message: string) => void;
  debounceMs?: number;
};

/**
 * Single owner for dashboard-summary refresh scheduling (T100488).
 * Coalesces rapid triggers, tracks generation for stale-result discard, and
 * defers work while interaction locks or mutation holds are active.
 */
export class DashboardRefreshController {
  private generation = 0;
  private inFlight: Promise<void> | undefined;
  private queued = false;
  private suppressed = false;
  private refreshAfterDeferred = false;
  private pendingMode: DashboardRefreshMode = "full";
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly debounceMs: number;

  constructor(private readonly deps: DashboardRefreshControllerDeps) {
    this.debounceMs = deps.debounceMs ?? 400;
  }

  /** Monotonic token — bump when mutations start so in-flight reads can be discarded. */
  bumpGeneration(): number {
    return ++this.generation;
  }

  currentGeneration(): number {
    return this.generation;
  }

  isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed) {
      this.bumpGeneration();
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }
    }
  }

  isSuppressed(): boolean {
    return this.suppressed;
  }

  /** Host mutation paths call this before kit drawer / roster mutators run. */
  notifyMutationStart(): void {
    this.deps.onMutationStart?.();
    this.setSuppressed(true);
  }

  notifyMutationEnd(): void {
    this.setSuppressed(false);
  }

  /** Schedule a refresh (debounced/coalesced). */
  request(req: DashboardRefreshRequest): void {
    if (this.suppressed) {
      this.refreshAfterDeferred = true;
      return;
    }
    if (req.mode === "light") {
      this.pendingMode = this.pendingMode === "full" ? "full" : "light";
    } else {
      this.pendingMode = "full";
    }
    this.deps.log?.(`refresh request reason=${req.reason} mode=${req.mode ?? "full"}`);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.pushNow();
    }, this.debounceMs);
  }

  /** Immediate refresh (no debounce) — visibility, poll, post-mutation light refresh. */
  async pushNow(options?: { light?: boolean }): Promise<void> {
    if (options?.light === true && this.pendingMode !== "full") {
      this.pendingMode = "light";
    } else if (options?.light !== true && this.pendingMode === "light") {
      // keep light if already requested
    } else if (options?.light === false) {
      this.pendingMode = "full";
    }
    if (this.suppressed) {
      this.refreshAfterDeferred = true;
      return;
    }
    if (this.deps.isDeferred()) {
      this.refreshAfterDeferred = true;
      return;
    }
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    const refresh = this.runLoop();
    this.inFlight = refresh;
    try {
      await refresh;
    } finally {
      if (this.inFlight === refresh) {
        this.inFlight = undefined;
      }
    }
  }

  /** Call when interaction locks clear to flush a deferred refresh. */
  onDeferredCleared(): void {
    if (this.refreshAfterDeferred && !this.deps.isDeferred() && !this.suppressed) {
      this.refreshAfterDeferred = false;
      void this.pushNow();
    }
  }

  markDeferredRefreshNeeded(): void {
    this.refreshAfterDeferred = true;
  }

  private async runLoop(): Promise<void> {
    do {
      this.queued = false;
      const mode = this.pendingMode;
      this.pendingMode = "full";
      const generation = this.currentGeneration();
      if (this.deps.isDeferred() || this.suppressed) {
        this.refreshAfterDeferred = true;
        return;
      }
      await this.deps.executeRefresh(mode, generation);
    } while (this.queued);
  }
}
