import { getAtPath } from "../../core/workspace-kit-config.js";

/** Effective dashboard read path for Option 2 (`dashboard.dataSource` in `.workspace-kit/config.json`). */
export type DashboardDataSourceMode = "cli-polling" | "service" | "auto";

export const DASHBOARD_DATA_SOURCE_MODES: readonly DashboardDataSourceMode[] = [
  "cli-polling",
  "service",
  "auto"
] as const;

export const DASHBOARD_DATA_SOURCE_CONFIG_KEY = "dashboard.dataSource";

export class DashboardDataSourceConfigError extends Error {
  readonly code = "invalid-dashboard-data-source";

  constructor(message: string) {
    super(message);
    this.name = "DashboardDataSourceConfigError";
  }
}

function isDashboardDataSourceMode(value: unknown): value is DashboardDataSourceMode {
  return (
    typeof value === "string" &&
    (DASHBOARD_DATA_SOURCE_MODES as readonly string[]).includes(value)
  );
}

/**
 * Resolve `dashboard.dataSource` from merged workspace config.
 * Missing key defaults to **`auto`** (Option 2 ship default).
 */
export function resolveDashboardDataSource(
  effectiveConfig: Record<string, unknown> | undefined
): DashboardDataSourceMode {
  const raw = getAtPath(effectiveConfig ?? {}, DASHBOARD_DATA_SOURCE_CONFIG_KEY);
  if (raw === undefined || raw === null) {
    return "auto";
  }
  if (!isDashboardDataSourceMode(raw)) {
    throw new DashboardDataSourceConfigError(
      `${DASHBOARD_DATA_SOURCE_CONFIG_KEY} must be one of ${DASHBOARD_DATA_SOURCE_MODES.join(", ")}; got ${JSON.stringify(raw)}`
    );
  }
  return raw;
}

/** Fail fast when the dashboard read service starts with an invalid config value. */
export function assertDashboardDataSourceAtServiceStart(
  effectiveConfig: Record<string, unknown> | undefined
): DashboardDataSourceMode {
  return resolveDashboardDataSource(effectiveConfig);
}
