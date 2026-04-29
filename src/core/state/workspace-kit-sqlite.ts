import Database from "better-sqlite3";
import { seedFeatureRegistryIfEmpty } from "./feature-registry-migration.js";

type SqliteDatabase = InstanceType<typeof Database>;

/** Bump and add a migration step in `migrateKitSqliteSchema` when DDL changes. Exposed for doctor / list-module-states. */
export const KIT_SQLITE_USER_VERSION = 18;

export const TASK_ENGINE_TASKS_TABLE = "task_engine_tasks";
export const TASK_ENGINE_DEPENDENCIES_TABLE = "task_engine_dependencies";
export const TASK_ENGINE_TRANSITION_LOG_TABLE = "task_engine_transition_log";
export const TASK_ENGINE_MUTATION_LOG_TABLE = "task_engine_mutation_log";

/**
 * Baseline DDL for the unified planning DB (task document row + module state). Idempotent via IF NOT EXISTS.
 * Legacy rows may add columns to workspace_planning_state outside this baseline (detected at runtime).
 */
const BASELINE_DDL = `
CREATE TABLE IF NOT EXISTS workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_module_state (
  module_id TEXT PRIMARY KEY,
  state_schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const TASK_ENGINE_TASKS_DDL = `
CREATE TABLE IF NOT EXISTS task_engine_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  priority TEXT,
  phase TEXT,
  phase_key TEXT,
  ownership TEXT,
  approach TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  unblocks_json TEXT NOT NULL DEFAULT '[]',
  technical_scope_json TEXT,
  acceptance_criteria_json TEXT,
  summary TEXT,
  description TEXT,
  risk TEXT,
  queue_namespace TEXT,
  evidence_key TEXT,
  evidence_kind TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_status ON task_engine_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_type_status ON task_engine_tasks(type, status);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_phase_key ON task_engine_tasks(phase_key);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_queue_ns_status ON task_engine_tasks(queue_namespace, status);
`;

function tableExists(db: SqliteDatabase, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function columnNames(db: SqliteDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function migrateV1ToV2(db: SqliteDatabase): void {
  db.exec(TASK_ENGINE_TASKS_DDL);
  const cols = columnNames(db, "workspace_planning_state");
  if (!cols.has("transition_log_json")) {
    db.exec(
      "ALTER TABLE workspace_planning_state ADD COLUMN transition_log_json TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!cols.has("mutation_log_json")) {
    db.exec(
      "ALTER TABLE workspace_planning_state ADD COLUMN mutation_log_json TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!cols.has("relational_tasks")) {
    db.exec("ALTER TABLE workspace_planning_state ADD COLUMN relational_tasks INTEGER NOT NULL DEFAULT 0");
  }
}

function migrateV2ToV3(db: SqliteDatabase): void {
  const cols = columnNames(db, "workspace_planning_state");
  if (!cols.has("planning_generation")) {
    db.exec(
      "ALTER TABLE workspace_planning_state ADD COLUMN planning_generation INTEGER NOT NULL DEFAULT 0"
    );
  }
}

function migrateV3ToV4(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }
  const cols = columnNames(db, TASK_ENGINE_TASKS_TABLE);
  if (cols.has("features_json")) {
    return;
  }
  db.exec("ALTER TABLE task_engine_tasks ADD COLUMN features_json TEXT NOT NULL DEFAULT '[]'");
}

function migrateV4ToV5(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }
  seedFeatureRegistryIfEmpty(db, TASK_ENGINE_TASKS_TABLE);
}

/** Subagent registry v1: definitions, sessions, message log (Phase 57). */
const SUBAGENT_DDL = `
CREATE TABLE IF NOT EXISTS kit_subagent_definitions (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  allowed_commands_json TEXT NOT NULL DEFAULT '[]',
  retired INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_definitions_retired ON kit_subagent_definitions(retired);
CREATE TABLE IF NOT EXISTS kit_subagent_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  definition_id TEXT NOT NULL,
  execution_task_id TEXT,
  status TEXT NOT NULL,
  host_hint TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (definition_id) REFERENCES kit_subagent_definitions(id)
);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_sessions_def ON kit_subagent_sessions(definition_id);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_sessions_task ON kit_subagent_sessions(execution_task_id);
CREATE TABLE IF NOT EXISTS kit_subagent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES kit_subagent_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_messages_session ON kit_subagent_messages(session_id);
`;

function migrateV5ToV6(db: SqliteDatabase): void {
  db.exec(SUBAGENT_DDL);
}

/** Supervisor/worker assignment rows (Phase 58 team execution v1). */
const TEAM_ASSIGNMENT_DDL = `
CREATE TABLE IF NOT EXISTS kit_team_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  execution_task_id TEXT NOT NULL,
  supervisor_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('assigned','submitted','blocked','reconciled','cancelled')),
  handoff_json TEXT,
  reconcile_checkpoint_json TEXT,
  block_reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_task ON kit_team_assignments(execution_task_id);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_status ON kit_team_assignments(status);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_supervisor ON kit_team_assignments(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_worker ON kit_team_assignments(worker_id);
`;

function migrateV6ToV7(db: SqliteDatabase): void {
  db.exec(TEAM_ASSIGNMENT_DDL);
}

/** Plugin enablement + install provenance (Phase 61). */
const PLUGIN_STATE_DDL = `
CREATE TABLE IF NOT EXISTS kit_plugin_state (
  plugin_name TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  root_relative_path TEXT NOT NULL,
  installed_via TEXT NOT NULL CHECK(installed_via IN ('scan','copy-install')),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_plugin_state_enabled ON kit_plugin_state(enabled);
`;

function migrateV7ToV8(db: SqliteDatabase): void {
  db.exec(PLUGIN_STATE_DDL);
}

/** Task-linked git checkpoints (Phase 64). */
const TASK_CHECKPOINT_DDL = `
CREATE TABLE IF NOT EXISTS kit_task_checkpoints (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  task_id TEXT,
  actor TEXT,
  label TEXT,
  action_type TEXT NOT NULL DEFAULT 'manual',
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('head','stash')),
  git_head_sha TEXT NOT NULL,
  secondary_ref TEXT,
  manifest_json TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_kit_task_checkpoints_task ON kit_task_checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_kit_task_checkpoints_created ON kit_task_checkpoints(created_at);
`;

function migrateV8ToV9(db: SqliteDatabase): void {
  db.exec(TASK_CHECKPOINT_DDL);
}

/** Workspace status singleton + audit trail (Phase 67 — ADR-workspace-status-sqlite-authority-v1). */
const WORKSPACE_STATUS_DDL = `
CREATE TABLE IF NOT EXISTS kit_workspace_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  workspace_revision INTEGER NOT NULL DEFAULT 0,
  current_kit_phase TEXT,
  next_kit_phase TEXT,
  active_focus TEXT,
  last_updated TEXT,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  pending_decisions_json TEXT NOT NULL DEFAULT '[]',
  next_agent_actions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS kit_workspace_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  actor TEXT,
  command TEXT,
  revision_before INTEGER NOT NULL,
  revision_after INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_kit_workspace_status_events_created ON kit_workspace_status_events(created_at);
`;

function migrateV9ToV10(db: SqliteDatabase): void {
  db.exec(WORKSPACE_STATUS_DDL);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO kit_workspace_status (
      id, workspace_revision, blockers_json, pending_decisions_json, next_agent_actions_json, updated_at
    ) VALUES (1, 0, '[]', '[]', '[]', ?)`
  ).run(now);
}

/** CAE trace + ack satisfaction (ADR-cae-persistence-v1, Phase 70). */
const CAE_PERSISTENCE_DDL = `
CREATE TABLE IF NOT EXISTS cae_trace_snapshots (
  trace_id TEXT PRIMARY KEY NOT NULL,
  trace_json TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  summary_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cae_trace_snapshots_created ON cae_trace_snapshots(created_at);
CREATE TABLE IF NOT EXISTS cae_ack_satisfaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  ack_token TEXT NOT NULL,
  activation_id TEXT NOT NULL,
  satisfied_at TEXT NOT NULL,
  actor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cae_ack_trace ON cae_ack_satisfaction(trace_id);
`;

function migrateV10ToV11(db: SqliteDatabase): void {
  db.exec(CAE_PERSISTENCE_DDL);
}

/**
 * CAE registry (authoritative rows) — Phase 70 CAE SQLite migration (`CAE_PLAN.md` / T887).
 * Artifact bodies stay on disk; DB holds metadata + activation rules. Activation → artifact
 * integrity is enforced in validation/application code, not SQLite FKs to artifacts.
 */
const CAE_REGISTRY_DDL = `
CREATE TABLE IF NOT EXISTS cae_registry_versions (
  version_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_cae_registry_versions_created ON cae_registry_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_cae_registry_versions_active ON cae_registry_versions(is_active) WHERE is_active = 1;
CREATE TABLE IF NOT EXISTS cae_registry_artifacts (
  version_id TEXT NOT NULL REFERENCES cae_registry_versions(version_id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  description TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  retired_at TEXT,
  PRIMARY KEY (version_id, artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_cae_registry_artifacts_version ON cae_registry_artifacts(version_id);
CREATE TABLE IF NOT EXISTS cae_registry_activations (
  version_id TEXT NOT NULL REFERENCES cae_registry_versions(version_id) ON DELETE CASCADE,
  activation_id TEXT NOT NULL,
  family TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  lifecycle_state TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL,
  acknowledgement_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  retired_at TEXT,
  PRIMARY KEY (version_id, activation_id)
);
CREATE INDEX IF NOT EXISTS idx_cae_registry_activations_version ON cae_registry_activations(version_id);
`;

function migrateV11ToV12(db: SqliteDatabase): void {
  db.exec(CAE_REGISTRY_DDL);
}

/** Append-only audit for CAE registry mutations (Phase 70 / CAE_PLAN Epic 5 E3, T902). */
const CAE_REGISTRY_MUTATIONS_AUDIT_DDL = `
CREATE TABLE IF NOT EXISTS cae_registry_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  command_name TEXT NOT NULL,
  version_id TEXT NOT NULL,
  note TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_cae_registry_mutations_version ON cae_registry_mutations(version_id);
CREATE INDEX IF NOT EXISTS idx_cae_registry_mutations_recorded ON cae_registry_mutations(recorded_at);
`;

function migrateV12ToV13(db: SqliteDatabase): void {
  db.exec(CAE_REGISTRY_MUTATIONS_AUDIT_DDL);
}

function migrateV13ToV14(db: SqliteDatabase): void {
  if (!tableExists(db, "cae_trace_snapshots")) {
    db.exec(CAE_PERSISTENCE_DDL);
    return;
  }
  const cols = columnNames(db, "cae_trace_snapshots");
  if (!cols.has("summary_json")) {
    db.exec("ALTER TABLE cae_trace_snapshots ADD COLUMN summary_json TEXT");
  }
}

const TASK_ENGINE_DEPENDENCIES_DDL = `
CREATE TABLE IF NOT EXISTS task_engine_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'dependsOn',
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES task_engine_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES task_engine_tasks(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_task_engine_dependencies_depends_on ON task_engine_dependencies(depends_on_task_id);
`;

/** Repopulate normalized dependency rows from each task's depends_on_json (relational task table canonical). */
function repopulateTaskEngineDependenciesFromJson(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE) || !tableExists(db, TASK_ENGINE_DEPENDENCIES_TABLE)) {
    return;
  }
  const taskIds = new Set(
    (db.prepare(`SELECT id FROM ${TASK_ENGINE_TASKS_TABLE}`).all() as Array<{ id: string }>).map((row) => row.id)
  );
  const rows = db
    .prepare(`SELECT id, depends_on_json FROM ${TASK_ENGINE_TASKS_TABLE}`)
    .all() as Array<{ id: string; depends_on_json: string }>;
  const insert = db.prepare(
    "INSERT OR IGNORE INTO task_engine_dependencies (task_id, depends_on_task_id, created_at, source) VALUES (?, ?, ?, 'dependsOn')"
  );
  const now = new Date().toISOString();
  for (const row of rows) {
    let deps: unknown;
    try {
      deps = JSON.parse(row.depends_on_json);
    } catch {
      continue;
    }
    if (!Array.isArray(deps)) {
      continue;
    }
    for (const dep of deps) {
      if (typeof dep === "string" && dep !== row.id && taskIds.has(dep)) {
        insert.run(row.id, dep, now);
      }
    }
  }
}

function migrateV14ToV15(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }
  db.exec(TASK_ENGINE_DEPENDENCIES_DDL);
  const existing = db.prepare("SELECT COUNT(*) AS c FROM task_engine_dependencies").get() as { c: number };
  if (Number(existing.c) > 0) {
    return;
  }
  repopulateTaskEngineDependenciesFromJson(db);
}

const TASK_ENGINE_EVIDENCE_DDL = `
CREATE TABLE IF NOT EXISTS task_engine_transition_log (
  transition_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  actor TEXT,
  client_mutation_id TEXT,
  payload_digest TEXT,
  guard_results_json TEXT NOT NULL DEFAULT '[]',
  dependents_unblocked_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_task_engine_transition_log_task_time ON task_engine_transition_log(task_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_task_engine_transition_log_timestamp ON task_engine_transition_log(timestamp);
CREATE TABLE IF NOT EXISTS task_engine_mutation_log (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  mutation_type TEXT NOT NULL,
  task_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  actor TEXT,
  details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_engine_mutation_log_task_time ON task_engine_mutation_log(task_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_task_engine_mutation_log_timestamp ON task_engine_mutation_log(timestamp);
`;

function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function migrateV15ToV16(db: SqliteDatabase): void {
  db.exec(TASK_ENGINE_EVIDENCE_DDL);
  const row = db
    .prepare("SELECT transition_log_json, mutation_log_json FROM workspace_planning_state WHERE id = 1")
    .get() as { transition_log_json?: string; mutation_log_json?: string } | undefined;
  if (!row) {
    return;
  }
  const transitionCount = db.prepare("SELECT COUNT(*) AS c FROM task_engine_transition_log").get() as { c: number };
  if (Number(transitionCount.c) === 0) {
    const insertTransition = db.prepare(
      `INSERT OR IGNORE INTO task_engine_transition_log (
        transition_id, task_id, from_state, to_state, action, timestamp, actor,
        client_mutation_id, payload_digest, guard_results_json, dependents_unblocked_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const entry of parseJsonArray(row.transition_log_json)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const transitionId = readString(record, "transitionId");
      const taskId = readString(record, "taskId");
      const fromState = readString(record, "fromState");
      const toState = readString(record, "toState");
      const action = readString(record, "action");
      const timestamp = readString(record, "timestamp");
      if (!transitionId || !taskId || !fromState || !toState || !action || !timestamp) {
        continue;
      }
      insertTransition.run(
        transitionId,
        taskId,
        fromState,
        toState,
        action,
        timestamp,
        readString(record, "actor"),
        readString(record, "clientMutationId"),
        readString(record, "payloadDigest"),
        JSON.stringify(Array.isArray(record.guardResults) ? record.guardResults : []),
        JSON.stringify(Array.isArray(record.dependentsUnblocked) ? record.dependentsUnblocked : [])
      );
    }
  }

  const mutationCount = db.prepare("SELECT COUNT(*) AS c FROM task_engine_mutation_log").get() as { c: number };
  if (Number(mutationCount.c) === 0) {
    const insertMutation = db.prepare(
      `INSERT OR IGNORE INTO task_engine_mutation_log (
        mutation_id, mutation_type, task_id, timestamp, actor, details_json
      ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const entry of parseJsonArray(row.mutation_log_json)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const mutationId = readString(record, "mutationId");
      const mutationType = readString(record, "mutationType");
      const taskId = readString(record, "taskId");
      const timestamp = readString(record, "timestamp");
      if (!mutationId || !mutationType || !taskId || !timestamp) {
        continue;
      }
      insertMutation.run(
        mutationId,
        mutationType,
        taskId,
        timestamp,
        readString(record, "actor"),
        record.details !== undefined ? JSON.stringify(record.details) : null
      );
    }
  }
}

function migrateV16ToV17(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }
  const t = TASK_ENGINE_TASKS_TABLE;
  const cols = columnNames(db, t);
  if (!cols.has("routing_category")) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN routing_category TEXT`);
  }
  if (!cols.has("routing_confidence_tier")) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN routing_confidence_tier TEXT`);
  }
  if (!cols.has("routing_blocked_reason_category")) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN routing_blocked_reason_category TEXT`);
  }
  if (!cols.has("routing_tags_json")) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN routing_tags_json TEXT`);
  }
  db.exec(`
    UPDATE ${t} SET
      routing_category = COALESCE(routing_category, json_extract(metadata_json, '$.category')),
      routing_confidence_tier = COALESCE(routing_confidence_tier, json_extract(metadata_json, '$.confidenceTier')),
      routing_blocked_reason_category = COALESCE(routing_blocked_reason_category, json_extract(metadata_json, '$.blockedReasonCategory')),
      routing_tags_json = COALESCE(routing_tags_json, json_extract(metadata_json, '$.tags'))
    WHERE metadata_json IS NOT NULL
      AND trim(metadata_json) != ''
      AND metadata_json != 'null'
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_routing_category ON ${t}(routing_category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_routing_confidence ON ${t}(routing_confidence_tier)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_routing_blocked ON ${t}(routing_blocked_reason_category)`);
}

/** SQLite CHECK strings aligned with `TaskStatus` / `TaskPriority` in task-engine types. */
const TASK_ENGINE_TASK_STATUSES_SQL =
  "('research','proposed','ready','in_progress','blocked','completed','cancelled')";
const TASK_ENGINE_PRIORITIES_SQL = "('P1','P2','P3')";

/**
 * Rebuild `task_engine_tasks` with CHECK constraints, recreate dependency edges, and add FKs
 * from kit team/subagent/checkpoint tables (Phase 75 / T996).
 */
function migrateV17ToV18(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }

  const badStatus = db
    .prepare(
      `SELECT id FROM ${TASK_ENGINE_TASKS_TABLE} WHERE status NOT IN ${TASK_ENGINE_TASK_STATUSES_SQL} LIMIT 8`
    )
    .all() as Array<{ id: string }>;
  if (badStatus.length > 0) {
    throw new Error(
      `migrateV17ToV18: invalid task status for ${badStatus.map((r) => r.id).join(", ")} — fix rows (task-persistence-readiness) before migrating`
    );
  }
  const badPriority = db
    .prepare(
      `SELECT id FROM ${TASK_ENGINE_TASKS_TABLE} WHERE priority IS NOT NULL AND priority NOT IN ${TASK_ENGINE_PRIORITIES_SQL} LIMIT 8`
    )
    .all() as Array<{ id: string }>;
  if (badPriority.length > 0) {
    throw new Error(
      `migrateV17ToV18: invalid priority for ${badPriority.map((r) => r.id).join(", ")} — normalize before migrating`
    );
  }
  const badArchived = db
    .prepare(`SELECT id FROM ${TASK_ENGINE_TASKS_TABLE} WHERE archived NOT IN (0, 1) LIMIT 8`)
    .all() as Array<{ id: string }>;
  if (badArchived.length > 0) {
    throw new Error(
      `migrateV17ToV18: archived flag must be 0 or 1 for ${badArchived.map((r) => r.id).join(", ")}`
    );
  }

  if (tableExists(db, "kit_team_assignments")) {
    const orphanTa = db
      .prepare(
        `SELECT id FROM kit_team_assignments ta WHERE NOT EXISTS (
           SELECT 1 FROM ${TASK_ENGINE_TASKS_TABLE} t WHERE t.id = ta.execution_task_id
         ) LIMIT 8`
      )
      .all() as Array<{ id: string }>;
    if (orphanTa.length > 0) {
      throw new Error(
        `migrateV17ToV18: kit_team_assignments rows reference missing tasks: ${orphanTa.map((r) => r.id).join(", ")}`
      );
    }
  }

  const cols = columnNames(db, TASK_ENGINE_TASKS_TABLE);
  const hasRouting = cols.has("routing_category");
  const hasFeatures = cols.has("features_json");
  if (!hasFeatures) {
    throw new Error("migrateV17ToV18: task_engine_tasks.features_json missing — unexpected schema");
  }

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
CREATE TABLE task_engine_tasks__strict (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ${TASK_ENGINE_TASK_STATUSES_SQL}),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  archived_at TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ${TASK_ENGINE_PRIORITIES_SQL}),
  phase TEXT,
  phase_key TEXT,
  ownership TEXT,
  approach TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  unblocks_json TEXT NOT NULL DEFAULT '[]',
  technical_scope_json TEXT,
  acceptance_criteria_json TEXT,
  summary TEXT,
  description TEXT,
  risk TEXT,
  queue_namespace TEXT,
  evidence_key TEXT,
  evidence_kind TEXT,
  metadata_json TEXT,
  features_json TEXT NOT NULL DEFAULT '[]',
  routing_category TEXT,
  routing_confidence_tier TEXT,
  routing_blocked_reason_category TEXT,
  routing_tags_json TEXT
);
`);

      if (hasRouting) {
        db.exec(`
INSERT INTO task_engine_tasks__strict (
  id, status, type, title, created_at, updated_at, archived, archived_at,
  priority, phase, phase_key, ownership, approach,
  depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
  summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json,
  features_json, routing_category, routing_confidence_tier, routing_blocked_reason_category, routing_tags_json
)
SELECT
  id, status, type, title, created_at, updated_at, archived, archived_at,
  priority, phase, phase_key, ownership, approach,
  depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
  summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json,
  COALESCE(features_json, '[]'),
  routing_category, routing_confidence_tier, routing_blocked_reason_category, routing_tags_json
FROM ${TASK_ENGINE_TASKS_TABLE};
`);
      } else {
        db.exec(`
INSERT INTO task_engine_tasks__strict (
  id, status, type, title, created_at, updated_at, archived, archived_at,
  priority, phase, phase_key, ownership, approach,
  depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
  summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json,
  features_json, routing_category, routing_confidence_tier, routing_blocked_reason_category, routing_tags_json
)
SELECT
  id, status, type, title, created_at, updated_at, archived, archived_at,
  priority, phase, phase_key, ownership, approach,
  depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
  summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json,
  COALESCE(features_json, '[]'),
  NULL, NULL, NULL, NULL
FROM ${TASK_ENGINE_TASKS_TABLE};
`);
      }

      db.exec(`DROP TABLE ${TASK_ENGINE_TASKS_TABLE}`);
      db.exec(`ALTER TABLE task_engine_tasks__strict RENAME TO ${TASK_ENGINE_TASKS_TABLE}`);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_status ON ${TASK_ENGINE_TASKS_TABLE}(status)`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_type_status ON ${TASK_ENGINE_TASKS_TABLE}(type, status)`
      );
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_phase_key ON ${TASK_ENGINE_TASKS_TABLE}(phase_key)`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_queue_ns_status ON ${TASK_ENGINE_TASKS_TABLE}(queue_namespace, status)`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_routing_category ON ${TASK_ENGINE_TASKS_TABLE}(routing_category)`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_routing_confidence ON ${TASK_ENGINE_TASKS_TABLE}(routing_confidence_tier)`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_routing_blocked ON ${TASK_ENGINE_TASKS_TABLE}(routing_blocked_reason_category)`
      );

      db.exec(`DROP TABLE IF EXISTS ${TASK_ENGINE_DEPENDENCIES_TABLE}`);
      db.exec(TASK_ENGINE_DEPENDENCIES_DDL);
      repopulateTaskEngineDependenciesFromJson(db);

      if (tableExists(db, "kit_team_assignments")) {
        db.exec(`
CREATE TABLE kit_team_assignments__fk (
  id TEXT PRIMARY KEY NOT NULL,
  execution_task_id TEXT NOT NULL REFERENCES ${TASK_ENGINE_TASKS_TABLE}(id) ON DELETE CASCADE,
  supervisor_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('assigned','submitted','blocked','reconciled','cancelled')),
  handoff_json TEXT,
  reconcile_checkpoint_json TEXT,
  block_reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
        db.exec(`INSERT INTO kit_team_assignments__fk SELECT * FROM kit_team_assignments`);
        db.exec(`DROP TABLE kit_team_assignments`);
        db.exec(`ALTER TABLE kit_team_assignments__fk RENAME TO kit_team_assignments`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_task ON kit_team_assignments(execution_task_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_status ON kit_team_assignments(status)`);
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_supervisor ON kit_team_assignments(supervisor_id)`
        );
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_worker ON kit_team_assignments(worker_id)`);
      }

      if (tableExists(db, "kit_subagent_sessions")) {
        db.exec(`
CREATE TABLE kit_subagent_sessions__fk (
  id TEXT PRIMARY KEY NOT NULL,
  definition_id TEXT NOT NULL,
  execution_task_id TEXT REFERENCES ${TASK_ENGINE_TASKS_TABLE}(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  host_hint TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (definition_id) REFERENCES kit_subagent_definitions(id)
);
`);
        db.exec(`
INSERT INTO kit_subagent_sessions__fk
SELECT
  id,
  definition_id,
  CASE
    WHEN execution_task_id IS NULL THEN NULL
    WHEN execution_task_id IN (SELECT id FROM ${TASK_ENGINE_TASKS_TABLE}) THEN execution_task_id
    ELSE NULL
  END,
  status, host_hint, metadata_json, created_at, updated_at
FROM kit_subagent_sessions;
`);
        db.exec(`DROP TABLE kit_subagent_sessions`);
        db.exec(`ALTER TABLE kit_subagent_sessions__fk RENAME TO kit_subagent_sessions`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_subagent_sessions_def ON kit_subagent_sessions(definition_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_subagent_sessions_task ON kit_subagent_sessions(execution_task_id)`);
      }

      if (tableExists(db, "kit_task_checkpoints")) {
        db.exec(`
CREATE TABLE kit_task_checkpoints__fk (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  task_id TEXT REFERENCES ${TASK_ENGINE_TASKS_TABLE}(id) ON DELETE SET NULL,
  actor TEXT,
  label TEXT,
  action_type TEXT NOT NULL DEFAULT 'manual',
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('head','stash')),
  git_head_sha TEXT NOT NULL,
  secondary_ref TEXT,
  manifest_json TEXT NOT NULL,
  metadata_json TEXT
);
`);
        db.exec(`
INSERT INTO kit_task_checkpoints__fk
SELECT
  id, created_at,
  CASE
    WHEN task_id IS NULL THEN NULL
    WHEN task_id IN (SELECT id FROM ${TASK_ENGINE_TASKS_TABLE}) THEN task_id
    ELSE NULL
  END,
  actor, label, action_type, ref_kind, git_head_sha, secondary_ref, manifest_json, metadata_json
FROM kit_task_checkpoints;
`);
        db.exec(`DROP TABLE kit_task_checkpoints`);
        db.exec(`ALTER TABLE kit_task_checkpoints__fk RENAME TO kit_task_checkpoints`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_task_checkpoints_task ON kit_task_checkpoints(task_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_task_checkpoints_created ON kit_task_checkpoints(created_at)`);
      }
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * Shared SQLite setup for workspace-kit.db: pragmas, centralized user_version migrations.
 * Call after `new Database(path)` for every open (read/write).
 */
export function prepareKitSqliteDatabase(db: SqliteDatabase): void {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 10000");
  db.pragma("journal_mode = WAL");
  migrateKitSqliteSchema(db);
}

function migrateKitSqliteSchema(db: SqliteDatabase): void {
  const readUv = (): number => {
    const raw = db.pragma("user_version", { simple: true });
    return typeof raw === "number" ? raw : Number(raw);
  };
  let current = readUv();
  if (current < 1) {
    db.exec(BASELINE_DDL);
    db.pragma("user_version = 1");
    current = 1;
  }
  if (current < 2) {
    migrateV1ToV2(db);
    db.pragma("user_version = 2");
    current = 2;
  }
  if (current < 3) {
    migrateV2ToV3(db);
    db.pragma("user_version = 3");
    current = 3;
  }
  if (current < 4) {
    migrateV3ToV4(db);
    db.pragma("user_version = 4");
    current = 4;
  }
  if (current < 5) {
    migrateV4ToV5(db);
    db.pragma("user_version = 5");
    current = 5;
  }
  if (current < 6) {
    migrateV5ToV6(db);
    db.pragma("user_version = 6");
    current = 6;
  }
  if (current < 7) {
    migrateV6ToV7(db);
    db.pragma("user_version = 7");
    current = 7;
  }
  if (current < 8) {
    migrateV7ToV8(db);
    db.pragma("user_version = 8");
    current = 8;
  }
  if (current < 9) {
    migrateV8ToV9(db);
    db.pragma("user_version = 9");
    current = 9;
  }
  if (current < 10) {
    migrateV9ToV10(db);
    db.pragma("user_version = 10");
    current = 10;
  }
  if (current < 11) {
    migrateV10ToV11(db);
    db.pragma("user_version = 11");
    current = 11;
  }
  if (current < 12) {
    migrateV11ToV12(db);
    db.pragma("user_version = 12");
    current = 12;
  }
  if (current < 13) {
    migrateV12ToV13(db);
    db.pragma("user_version = 13");
    current = 13;
  }
  if (current < 14) {
    migrateV13ToV14(db);
    db.pragma("user_version = 14");
    current = 14;
  }
  if (current < 15) {
    migrateV14ToV15(db);
    db.pragma("user_version = 15");
    current = 15;
  }
  if (current < 16) {
    migrateV15ToV16(db);
    db.pragma("user_version = 16");
    current = 16;
  }
  if (current < 17) {
    migrateV16ToV17(db);
    db.pragma("user_version = 17");
    current = 17;
  }
  if (current < 18) {
    migrateV17ToV18(db);
    db.pragma("user_version = 18");
    current = 18;
  }
}

/** True when relational task rows + envelope columns are present (post v2 migration open). */
export function kitSqliteHasRelationalTaskDdl(db: SqliteDatabase): boolean {
  return tableExists(db, TASK_ENGINE_TASKS_TABLE) && columnNames(db, "workspace_planning_state").has("relational_tasks");
}

/** Read-only pragma user_version for diagnostics (doctor summary, list-module-states). */
export function readKitSqliteUserVersion(dbAbsPath: string): number {
  const db = new Database(dbAbsPath, { readonly: true });
  try {
    const raw = db.pragma("user_version", { simple: true });
    return typeof raw === "number" ? raw : Number(raw);
  } finally {
    db.close();
  }
}
