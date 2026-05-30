import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DashboardSnapshotStore } from "./snapshot-store.js";
import { DashboardSliceRefresher } from "./slice-refreshers.js";
import { DashboardSseHub } from "./events.js";
import { handleDashboardServiceRequest, wireDashboardServiceEvents } from "./routes.js";

export type DashboardServiceHandle = {
  server: Server;
  host: string;
  port: number;
  snapshotStore: DashboardSnapshotStore;
  refresher: DashboardSliceRefresher;
  stop: () => Promise<void>;
};

export type CreateDashboardServiceOptions = {
  workspacePath: string;
  host?: string;
  port?: number;
  serviceVersion?: string;
};

function readKitPackageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, "../../../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export async function createDashboardService(
  options: CreateDashboardServiceOptions
): Promise<DashboardServiceHandle> {
  const host = options.host ?? "127.0.0.1";
  const serviceVersion = options.serviceVersion ?? readKitPackageVersion();
  const snapshotStore = new DashboardSnapshotStore(serviceVersion);
  const refresher = new DashboardSliceRefresher({ workspacePath: options.workspacePath, snapshotStore });
  const sseHub = new DashboardSseHub();
  const unwire = wireDashboardServiceEvents(snapshotStore, sseHub);

  await refresher.start();

  const server = createServer((req, res) => {
    void handleDashboardServiceRequest(req, res, { snapshotStore, refresher, sseHub }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, code: "internal-error", message }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("dashboard service failed to bind");
  }

  const stop = async (): Promise<void> => {
    unwire();
    sseHub.closeAll();
    await refresher.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    server,
    host,
    port: address.port,
    snapshotStore,
    refresher,
    stop
  };
}
