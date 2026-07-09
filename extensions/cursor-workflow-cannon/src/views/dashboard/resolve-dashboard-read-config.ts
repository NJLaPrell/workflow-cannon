import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveDashboardDataSource,
  resolveDashboardPostPaintPromote,
  type DashboardDataSourceMode
} from "./resolve-dashboard-data-source-mode.js";

const CONFIG_REL = ".workspace-kit/config.json";

async function readWorkspaceKitConfig(
  workspacePath: string
): Promise<Record<string, unknown> | undefined> {
  const configPath = path.join(workspacePath, CONFIG_REL);
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Read `dashboard.dataSource` from workspace config (defaults to `auto`). */
export async function readConfiguredDashboardDataSourceMode(
  workspacePath: string
): Promise<DashboardDataSourceMode> {
  const raw = await readWorkspaceKitConfig(workspacePath);
  if (!raw) {
    return "auto";
  }
  return resolveDashboardDataSource(raw);
}

/** Read `dashboard.postPaintPromote` (defaults to `true`). */
export async function readConfiguredDashboardPostPaintPromote(
  workspacePath: string
): Promise<boolean> {
  const raw = await readWorkspaceKitConfig(workspacePath);
  return resolveDashboardPostPaintPromote(raw);
}
