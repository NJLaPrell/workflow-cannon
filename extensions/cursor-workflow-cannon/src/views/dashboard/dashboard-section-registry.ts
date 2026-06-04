/** Dashboard lazy-loading section registry (T100395 foundation). */

/**
 * Section model (Phase 108):
 * - `eager` sections (overview, planning roster/ideas/plan cards) hydrate on the first overview `dashboard-summary` read.
 * - Queue rollups stay deferred until the Task Engine tab is visible, then upgrade from the overview stub via `ensureQueueRollupsHydrated`.
 * - `on-tab-activate` sections (status, config, cae, phase-journal) stay placeholders until tab open.
 * - Targeted invalidation after mutations: see `dashboard-section-invalidation.ts` (T100399).
 * - Manual Refresh runs explicit full reconciliation via `wcReplaceRoot`; light watcher refresh patches visible sections only.
 */

export type DashboardSectionId =
  | "overview"
  | "phase-roster"
  | "ideas"
  | "plan-artifact"
  | "planning-interview"
  | "queue"
  | "phase-journal"
  | "status"
  | "config"
  | "cae";

export type DashboardSectionLoadState = "loading" | "ready" | "stale" | "error";

export type DashboardSectionRefreshPolicy = "eager" | "on-tab-activate" | "manual";

export interface DashboardSectionDescriptor {
  readonly id: DashboardSectionId;
  /** Tab panel `data-wc-tab` hosting this section (`queue` + `phase-journal` share `task-engine`; planning tab groups roster/ideas/plan cards). */
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
    id: "phase-roster",
    tabId: "planning",
    renderTarget: '[data-wc-section="phase-roster"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "phase" }
  },
  {
    id: "ideas",
    tabId: "planning",
    renderTarget: '[data-wc-section="ideas"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "ideas" }
  },
  {
    id: "plan-artifact",
    tabId: "planning",
    renderTarget: '[data-wc-section="plan-artifact"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "planArtifact" }
  },
  {
    id: "planning-interview",
    tabId: "planning",
    renderTarget: '[data-wc-section="planning-interview"]',
    refreshPolicy: "eager",
    ttlMs: 45_000,
    commandArgs: { slice: "planningSession" }
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

export function isEagerDashboardSection(id: DashboardSectionId): boolean {
  return lookupDashboardSection(id)?.refreshPolicy === "eager";
}
