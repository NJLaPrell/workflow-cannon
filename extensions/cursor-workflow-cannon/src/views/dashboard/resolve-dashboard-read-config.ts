import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveDashboardDataSource,
  type DashboardDataSourceMode
} from "@workflow-cannon/workspace-kit/services/dashboard-service/resolve-data-source-config";

const CONFIG_REL = ".workspace-kit/config.json";

/** Read `dashboard.dataSource` from workspace config (defaults to `auto`). */
export async function readConfiguredDashboardDataSourceMode(
  workspacePath: string
): Promise<DashboardDataSourceMode> {
  const configPath = path.join(workspacePath, CONFIG_REL);
  try {
    const raw = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    return resolveDashboardDataSource(raw);
  } catch {
    return "auto";
  }
}
