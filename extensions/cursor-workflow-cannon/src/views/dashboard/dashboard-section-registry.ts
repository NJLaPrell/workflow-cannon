/** Dashboard lazy-loading section registry (T100395 foundation). */

/**
 * Section model (Phase 108):
 * - `eager` sections (overview, queue) hydrate on first `dashboard-summary` read with `skipHeavyFetches`.
 * - Queue rollups upgrade from overview stub via `ensureQueueRollupsHydrated` (queue + overview stat pills) on tab open or post-overview paint.
 * - `on-tab-activate` sections (status, config, cae, phase-journal) stay placeholders until tab open.
 * - Targeted invalidation after mutations: see `dashboard-section-invalidation.ts` (T100399).
 * - Manual Refresh runs full reconciliation via `wcReplaceRoot`; light watcher refresh patches visible sections only.
 */

export type DashboardSectionId =
  | "overview"
  | "ideas"
  | "queue"
  | "phase-journal"
  | "status"
  | "config"
  | "cae";

export type DashboardSectionLoadState = "loading" | "ready" | "stale" | "error";

export type DashboardSectionRefreshPolicy = "eager" | "on-tab-activate" | "manual";

export interface DashboardSectionDescriptor {
  readonly id: DashboardSectionId;
  /** Tab panel `data-wc-tab` hosting this section (`queue` + `phase-journal` share `task-engine`). */
  readonly tabId: string;
  readonly renderTarget: string;
  readonly refreshPolicy: DashboardSectionRefreshPolicy;
  /** Suggested TTL for stale marking (T100399); null = no automatic stale. */
  readonly ttlMs: number | null;
  /** Kit command args for section slice reads (T100396). */
  readonly commandArgs: Readonly<Record<string, unknown>>;
}

export const DASHBOARD_SECTION_REGISTRY: readonly DashboardSectionDescriptor[] = [
  {
    id: "overview",
    tabId: "overview",
    renderTarget: '[data-wc-section="overview"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "overview" }
  },
  {
    id: "ideas",
    tabId: "overview",
    renderTarget: '[data-wc-section="ideas"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "ideas" }
  },
  {
    id: "queue",
    tabId: "task-engine",
    renderTarget: '[data-wc-section="queue"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "queue" }
  },
  {
    id: "phase-journal",
    tabId: "task-engine",
    renderTarget: '[data-wc-section="phase-journal"]',
    refreshPolicy: "on-tab-activate",
    ttlMs: 120_000,
    commandArgs: { slice: "phase-journal" }
  },
  {
    id: "status",
    tabId: "status",
    renderTarget: '[data-wc-section="status"]',
    refreshPolicy: "on-tab-activate",
    ttlMs: 60_000,
    commandArgs: { slice: "status" }
  },
  {
    id: "config",
    tabId: "config",
    renderTarget: '[data-wc-section="config"]',
    refreshPolicy: "on-tab-activate",
    ttlMs: null,
    commandArgs: { slice: "config" }
  },
  {
    id: "cae",
    tabId: "cae",
    renderTarget: '[data-wc-section="cae"]',
    refreshPolicy: "on-tab-activate",
    ttlMs: 120_000,
    commandArgs: { slice: "cae" }
  }
];

export function lookupDashboardSection(id: DashboardSectionId): DashboardSectionDescriptor | undefined {
  return DASHBOARD_SECTION_REGISTRY.find((section) => section.id === id);
}
