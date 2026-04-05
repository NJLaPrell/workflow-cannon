import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "../planning-config.js";
import { DEFAULT_TASK_STORE_PATH } from "./store.js";
import { DEFAULT_WISHLIST_PATH } from "./wishlist-store.js";

const PERSISTENCE_MAP_SCHEMA_VERSION = 1 as const;

/** Read-only JSON map of where kit durable state lives (SQLite runtime; legacy JSON paths for migration). */
export function runGetKitPersistenceMap(ctx: ModuleLifecycleContext): ModuleCommandResult {
  const taskRel = planningTaskStoreRelativePath(ctx) ?? DEFAULT_TASK_STORE_PATH;
  const wishRel = planningWishlistStoreRelativePath(ctx) ?? DEFAULT_WISHLIST_PATH;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  return {
    ok: true,
    code: "kit-persistence-map",
    message: "Structured persistence layout (SQLite-only runtime).",
    data: {
      schemaVersion: PERSISTENCE_MAP_SCHEMA_VERSION,
      runtime: "sqlite-only",
      unifiedSqliteRelativePath: dbRel,
      planning: {
        table: "workspace_planning_state",
        taskDocumentColumn: "task_store_json",
        relationalTasksTable: "task_engine_tasks",
        relationalFlagColumn: "relational_tasks",
        envelopeLogColumns: ["transition_log_json", "mutation_log_json"],
        note:
          "When relational_tasks=0, task bodies and logs live in task_store_json. After workspace-kit run migrate-task-persistence sqlite-blob-to-relational, task bodies live in task_engine_tasks; logs also in envelope columns; task_store_json mirrors logs with empty tasks array. Legacy wishlist_store_json may exist until migrate-wishlist-intake."
      },
      legacyJsonImportOnly: {
        taskStoreRelativePath: taskRel,
        wishlistStoreRelativePath: wishRel,
        note: "Used by migrate-task-persistence json-to-sqlite / json-to-unified-sqlite only; not read at runtime."
      },
      workspaceModuleState: {
        table: "workspace_module_state",
        knownModuleIds: ["task-engine", "improvement", "agent-behavior", "team-execution", "plugins"]
      },
      legacySidecarJsonFiles: {
        improvement: ".workspace-kit/improvement/state.json",
        agentBehavior: ".workspace-kit/agent-behavior/state.json",
        note: "Read once when migrating from file to unified SQLite; saves go to workspace_module_state."
      },
      subagents: {
        minKitSqliteUserVersion: 6,
        tables: ["kit_subagent_definitions", "kit_subagent_sessions", "kit_subagent_messages"],
        note: "Definitions + session/message audit for delegated agent work; host (e.g. Cursor) executes; kit persists provenance. See docs/maintainers/adrs/ADR-subagent-registry-v1.md."
      },
      teamExecution: {
        minKitSqliteUserVersion: 7,
        tables: ["kit_team_assignments"],
        note: "Supervisor/worker assignment + handoff persistence; host runs agents; kit does not spawn workers. See docs/maintainers/adrs/ADR-team-execution-v1.md."
      },
      plugins: {
        minKitSqliteUserVersion: 8,
        tables: ["kit_plugin_state"],
        note: "Claude-layout plugin install provenance + enable/disable toggles; discovery remains filesystem under plugins.discoveryRoots. See docs/maintainers/adrs/ADR-claude-code-plugin-platform-v1.md."
      }
    } as Record<string, unknown>
  };
}
