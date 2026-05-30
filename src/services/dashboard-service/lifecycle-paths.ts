import path from "node:path";

export const DASHBOARD_SERVICE_REL_DIR = ".workspace-kit/dashboard-service";
export const DASHBOARD_SERVICE_RUNTIME_FILE = "runtime.json";
export const DASHBOARD_SERVICE_PID_FILE = "service.pid";
export const DASHBOARD_SERVICE_LOG_FILE = "service.log";

export type DashboardServiceRuntimeV1 = {
  schemaVersion: 1;
  pid: number;
  host: string;
  port: number;
  startedAt: string;
  serviceVersion: string;
  generation: number;
  planningGeneration: number | null;
};

export function dashboardServiceDir(workspacePath: string): string {
  return path.join(workspacePath, DASHBOARD_SERVICE_REL_DIR);
}

export function dashboardServiceRuntimePath(workspacePath: string): string {
  return path.join(dashboardServiceDir(workspacePath), DASHBOARD_SERVICE_RUNTIME_FILE);
}

export function dashboardServicePidPath(workspacePath: string): string {
  return path.join(dashboardServiceDir(workspacePath), DASHBOARD_SERVICE_PID_FILE);
}

export function dashboardServiceLogPath(workspacePath: string): string {
  return path.join(dashboardServiceDir(workspacePath), DASHBOARD_SERVICE_LOG_FILE);
}
