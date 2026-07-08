import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { ModuleCommandResult } from "../contracts/module-contract.js";
import { resolveGitHeadSha } from "../modules/task-engine/persistence/task-state-cache-runtime-shared.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable
} from "../modules/task-engine/persistence/task-state-projection-meta-store.js";
export interface StateLikeFreshnessBinding {
  workspaceRoot: string;
  workspaceTrusted: boolean;
}

export const STATE_LIKE_MCP_TOOL_NAMES = [
  "workflow-cannon.phase-release-orchestration-state",
  "workflow-cannon.agent-execution-packet",
  "workflow-cannon.assignment-reconciliation-preflight",
  "workflow-cannon.phase-drain-delta",
  "workflow-cannon.phase-release-state",
  "workflow-cannon.release-closeout-result",
  "workflow-cannon.memory-list",
  "workflow-cannon.planner-packet",
  "workflow-cannon.list-ideas",
  "workflow-cannon.get-plan-artifact",
  "workflow-cannon.plan-review-packet"
] as const;

export type StateLikeMcpToolName = (typeof STATE_LIKE_MCP_TOOL_NAMES)[number];

export type FreshnessSignalProvenance =
  | "sqlite"
  | "sqlite-projection"
  | "command-result"
  | "git"
  | "unavailable";

export interface McpStateLikeFreshness {
  schemaVersion: 1;
  generatedAt: string;
  workspaceRoot: string;
  workspaceTrusted: boolean;
  taskStoreGeneration: number | null;
  planningGeneration: number | null;
  gitHead: string | null;
  stale: boolean;
  staleReasons: string[];
  provenance: {
    taskStoreGeneration: FreshnessSignalProvenance;
    planningGeneration: FreshnessSignalProvenance;
    gitHead: FreshnessSignalProvenance;
  };
  recovery?: {
    note: string;
    cliFallback: string;
  };
}

const STATE_LIKE_TOOL_NAME_SET = new Set<string>(STATE_LIKE_MCP_TOOL_NAMES);

export function isStateLikeMcpTool(toolName: string): toolName is StateLikeMcpToolName {
  return STATE_LIKE_TOOL_NAME_SET.has(toolName);
}

function resolvePlanningSqliteRelativePath(workspaceRoot: string): string {
  const configPath = path.join(workspaceRoot, ".workspace-kit", "config.json");
  if (!existsSync(configPath)) {
    return ".workspace-kit/tasks/workspace-kit.db";
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
      tasks?: { sqliteDatabaseRelativePath?: unknown };
    };
    const configured = parsed.tasks?.sqliteDatabaseRelativePath;
    if (typeof configured === "string" && configured.trim().length > 0) {
      return configured.trim();
    }
  } catch {
    // fall through to default
  }
  return ".workspace-kit/tasks/workspace-kit.db";
}

function readPlanningGenerationFromSqlite(workspaceRoot: string): number | null {
  const dbPath = path.join(workspaceRoot, resolvePlanningSqliteRelativePath(workspaceRoot));
  if (!existsSync(dbPath)) {
    return null;
  }
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db
      .prepare("SELECT planning_generation AS g FROM workspace_planning_state WHERE id = 1")
      .get() as { g: number } | undefined;
    return row !== undefined ? Number(row.g) || 0 : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function readTaskStoreGenerationFromSqlite(workspaceRoot: string): number | null {
  const dbPath = path.join(workspaceRoot, resolvePlanningSqliteRelativePath(workspaceRoot));
  if (!existsSync(dbPath)) {
    return null;
  }
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    if (!taskStateProjectionMetaTableAvailable(db)) {
      return null;
    }
    const meta = readTaskStateProjectionMeta(db);
    return meta ? meta.appliedSequence : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function readProjectionSyncStatus(workspaceRoot: string): string | null {
  const dbPath = path.join(workspaceRoot, resolvePlanningSqliteRelativePath(workspaceRoot));
  if (!existsSync(dbPath)) {
    return null;
  }
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    if (!taskStateProjectionMetaTableAvailable(db)) {
      return null;
    }
    return readTaskStateProjectionMeta(db)?.syncStatus ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function extractPlanningGenerationFromResult(result: ModuleCommandResult): number | null {
  const data = result.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.planningGeneration === "number") {
    return record.planningGeneration;
  }
  const task = record.task;
  if (typeof task === "object" && task !== null && typeof (task as Record<string, unknown>).planningGeneration === "number") {
    return (task as Record<string, unknown>).planningGeneration as number;
  }
  return null;
}

function extractPacketAuditStale(result: ModuleCommandResult): boolean {
  const data = result.data;
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  const audit = record.packetAudit;
  if (typeof audit === "object" && audit !== null && (audit as Record<string, unknown>).stale === true) {
    return true;
  }
  return false;
}

export function buildStateLikeFreshness(
  binding: StateLikeFreshnessBinding,
  result: ModuleCommandResult,
  cliFallbackCommand: string
): McpStateLikeFreshness {
  const generatedAt = new Date().toISOString();
  const gitHead = resolveGitHeadSha(binding.workspaceRoot);
  const commandPlanningGeneration = extractPlanningGenerationFromResult(result);
  const sqlitePlanningGeneration = readPlanningGenerationFromSqlite(binding.workspaceRoot);
  const planningGeneration = commandPlanningGeneration ?? sqlitePlanningGeneration;
  const taskStoreGeneration = readTaskStoreGenerationFromSqlite(binding.workspaceRoot);
  const projectionSyncStatus = readProjectionSyncStatus(binding.workspaceRoot);

  const staleReasons: string[] = [];
  if (!binding.workspaceTrusted) {
    staleReasons.push("workspace-untrusted");
  }
  if (gitHead === null) {
    staleReasons.push("git-head-unavailable");
  }
  if (planningGeneration === null) {
    staleReasons.push("planning-generation-unavailable");
  }
  if (taskStoreGeneration === null) {
    staleReasons.push("task-store-generation-unavailable");
  }
  if (projectionSyncStatus === "stale") {
    staleReasons.push("task-store-projection-stale");
  }
  if (extractPacketAuditStale(result)) {
    staleReasons.push("packet-context-stale");
  }

  const stale =
    !binding.workspaceTrusted ||
    extractPacketAuditStale(result) ||
    projectionSyncStatus === "stale" ||
    (planningGeneration === null && taskStoreGeneration === null);
  const freshness: McpStateLikeFreshness = {
    schemaVersion: 1,
    generatedAt,
    workspaceRoot: binding.workspaceRoot,
    workspaceTrusted: binding.workspaceTrusted,
    taskStoreGeneration,
    planningGeneration,
    gitHead,
    stale,
    staleReasons,
    provenance: {
      taskStoreGeneration: taskStoreGeneration === null ? "unavailable" : "sqlite-projection",
      planningGeneration:
        commandPlanningGeneration !== null
          ? "command-result"
          : sqlitePlanningGeneration !== null
            ? "sqlite"
            : "unavailable",
      gitHead: gitHead === null ? "unavailable" : "git"
    }
  };

  if (stale) {
    freshness.recovery = {
      note:
        "Freshness could not be fully proven or the underlying packet/task context may have drifted. Re-invoke this MCP tool or run the CLI fallback before acting on state-critical data.",
      cliFallback: cliFallbackCommand
    };
  }

  return freshness;
}
