/**
 * Detached dashboard read service process (spawned by dashboard-service-start).
 */
import { runDashboardServiceDaemonMain } from "./lifecycle-runtime.js";

const workspacePath = process.env.WORKSPACE_KIT_DASHBOARD_SERVICE_WORKSPACE;
if (!workspacePath) {
  console.error("WORKSPACE_KIT_DASHBOARD_SERVICE_WORKSPACE is required");
  process.exit(1);
}

void runDashboardServiceDaemonMain(workspacePath).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
