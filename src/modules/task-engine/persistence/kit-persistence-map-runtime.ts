import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath, planningTaskStoreRelativePath } from "../planning-config.js";
import { DEFAULT_TASK_STORE_PATH } from "./store.js";

const PERSISTENCE_MAP_SCHEMA_VERSION = 1 as const;

/** Read-only JSON map of where kit durable state lives (SQLite-only runtime; legacy task JSON path for import only). */
export function runGetKitPersistenceMap(ctx: ModuleLifecycleContext): ModuleCommandResult {
  const taskRel = planningTaskStoreRelativePath(ctx) ?? DEFAULT_TASK_STORE_PATH;
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
          "When relational_tasks=0, task bodies and logs live in task_store_json (and envelope columns when present). When relational_tasks=1, task bodies are canonical in task_engine_tasks, transition/mutation evidence in task_engine_transition_log / task_engine_mutation_log; workspace_planning_state.task_store_json and envelope log columns are compatibility/export-only (may be empty arrays). planning_generation remains the optimistic-concurrency cursor on the singleton planning row. Legacy wishlist_store_json is collapsed into wishlist_intake tasks on planning store open."
      },
      legacyJsonImportOnly: {
        taskStoreRelativePath: taskRel,
        note: "Used by migrate-task-persistence json-to-sqlite / json-to-unified-sqlite for legacy task JSON only; wishlist intake lives in SQLite task rows."
      },
      workspaceModuleState: {
        table: "workspace_module_state",
        knownModuleIds: [
          "task-engine",
          "improvement",
          "agent-behavior",
          "agent-behavior-interview",
          "planning-build-session",
          "team-execution",
          "plugins"
        ],
        legacySessionJsonImportOnly: [
          ".workspace-kit/agent-behavior/interview-session.json",
          ".workspace-kit/planning/build-plan-session.json"
        ],
        note:
          "Module-scoped JSON (improvement cursors, agent-behavior profiles, in-flight interviews, build-plan snapshots, etc.) is canonical in workspace_module_state. Legacy sidecar JSON files are import-only: read once on load, persisted to SQLite, then renamed with a .migrated suffix."
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
      },
      audit: {
        minKitSqliteUserVersion: 24,
        tables: ["kit_approval_decisions", "kit_skill_apply_audit"],
        legacyJsonlImportOnly: [
          ".workspace-kit/approvals/decisions.jsonl",
          ".workspace-kit/evidence/skill-apply-audit.jsonl"
        ],
        note:
          "Review-item decision fingerprints and skill-apply audit rows are canonical in unified SQLite. Legacy JSONL files are imported once on first access, then archived with a .migrated suffix."
      },
      policyTraces: {
        minKitSqliteUserVersion: 25,
        tables: ["kit_policy_traces"],
        legacyJsonlImportOnly: [".workspace-kit/policy/traces.jsonl"],
        note:
          "Policy events append transactionally to kit_policy_traces. Improvement ingestion advances lastIngestedPolicyTraceId monotonically. Legacy traces.jsonl is import-only."
      },
      sessionGrants: {
        minKitSqliteUserVersion: 26,
        tables: ["kit_session_grants"],
        legacyJsonImportOnly: [".workspace-kit/policy/session-grants.json"],
        listCommand: "list-session-grants",
        note:
          "Session-scoped policyApproval reuse is stored per (session_id, operation_id). Query with workspace-kit run list-session-grants. Legacy session-grants.json is import-only."
      },
      runLog: {
        minKitSqliteUserVersion: 27,
        tables: ["kit_run_log"],
        maxRowsConfigKey: "kit.runLog.maxRows",
        defaultMaxRows: 200,
        note:
          "Append-only ring buffer of recent wk run invocations (redacted args/response JSON). Each row keys invocationId from the run envelope."
      }
    } as Record<string, unknown>
  };
}
