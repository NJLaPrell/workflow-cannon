import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "./planning-config.js";
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
        note:
          "Tasks and transition/mutation logs live in task_store_json. Legacy wishlist_store_json may exist until migrate-wishlist-intake."
      },
      legacyJsonImportOnly: {
        taskStoreRelativePath: taskRel,
        wishlistStoreRelativePath: wishRel,
        note: "Used by migrate-task-persistence json-to-sqlite / json-to-unified-sqlite only; not read at runtime."
      },
      workspaceModuleState: {
        table: "workspace_module_state",
        knownModuleIds: ["task-engine", "improvement", "agent-behavior"]
      },
      legacySidecarJsonFiles: {
        improvement: ".workspace-kit/improvement/state.json",
        agentBehavior: ".workspace-kit/agent-behavior/state.json",
        note: "Read once when migrating from file to unified SQLite; saves go to workspace_module_state."
      }
    } as Record<string, unknown>
  };
}
