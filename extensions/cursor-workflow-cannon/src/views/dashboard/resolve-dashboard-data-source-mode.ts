/**
 * Vendored from `src/services/dashboard-service/resolve-data-source-config.ts`.
 * The VSIX ships without `@workflow-cannon/workspace-kit` node_modules — keep this
 * mirror aligned with kit `dashboard.dataSource` semantics.
 */

/** Effective dashboard read path for Option 2 (`dashboard.dataSource` in `.workspace-kit/config.json`). */
export type DashboardDataSourceMode = "cli-polling" | "service" | "auto";

export const DASHBOARD_DATA_SOURCE_MODES: readonly DashboardDataSourceMode[] = [
  "cli-polling",
  "service",
  "auto"
] as const;

export const DASHBOARD_DATA_SOURCE_CONFIG_KEY = "dashboard.dataSource";

function getAtPath(root: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isDashboardDataSourceMode(value: unknown): value is DashboardDataSourceMode {
  return (
    typeof value === "string" &&
    (DASHBOARD_DATA_SOURCE_MODES as readonly string[]).includes(value)
  );
}

/** Resolve `dashboard.dataSource` from merged workspace config; missing key → `auto`. */
export function resolveDashboardDataSource(
  effectiveConfig: Record<string, unknown> | undefined
): DashboardDataSourceMode {
  const raw = getAtPath(effectiveConfig ?? {}, DASHBOARD_DATA_SOURCE_CONFIG_KEY);
  if (raw === undefined || raw === null) {
    return "auto";
  }
  if (!isDashboardDataSourceMode(raw)) {
    throw new Error(
      `${DASHBOARD_DATA_SOURCE_CONFIG_KEY} must be one of ${DASHBOARD_DATA_SOURCE_MODES.join(", ")}; got ${JSON.stringify(raw)}`
    );
  }
  return raw;
}
