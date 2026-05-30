import type { DashboardServiceEvent } from "@workflow-cannon/workspace-kit/contracts/dashboard-events";
import type * as vscode from "vscode";
import type { DashboardSnapshot, DashboardSliceName } from "./dashboard-snapshot-types.js";

/** Pluggable dashboard read path (Option 1 CLI pollers vs Option 2 warm service). */
export interface DashboardDataSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  refreshSlice(name: DashboardSliceName): Promise<void>;
  getSnapshot(): Promise<DashboardSnapshot>;
  subscribe?(listener: (event: DashboardServiceEvent) => void): vscode.Disposable;
}

export type DashboardDataSourceMode = "cli-polling" | "service" | "auto";
