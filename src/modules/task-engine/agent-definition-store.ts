import type Database from "better-sqlite3";
import type { AgentDefinitionV1 } from "../../contracts/agent-orchestration.js";
import { AGENT_DEFINITION_SCHEMA_VERSION } from "../../contracts/agent-orchestration.js";
import { kitSqliteHasAgentDefinitionBridge, readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { validateAgentDefinitionV1 } from "../../core/validation/agent-orchestration/index.js";
import path from "node:path";

export const AGENT_DEFINITION_BRIDGE_MIN_USER_VERSION = 31;
const AGENT_DEFINITION_ID_RE = /^[a-z][a-z0-9-]*$/;

export type AgentDefinitionBridgeRecord = {
  id: string;
  displayName: string;
  description: string;
  allowedCommands: string[];
  retired: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  role: string | null;
  hostCompatibility: string[] | null;
  requiredCapabilities: string[] | null;
  optionalCapabilities: string[] | null;
  accessProfileId: string | null;
  contextProfileId: string | null;
  modelProfileId: string | null;
  handoffContractId: string | null;
  activityContractId: string | null;
  definitionVersion: number | null;
  agentDefinition: AgentDefinitionV1 | null;
  orchestrationReady: boolean;
};

export type AgentDefinitionValidationFailure = {
  ok: false;
  code: string;
  message: string;
  issues?: Array<{ code: string; path: string; message: string; severity?: string }>;
};

export function assertAgentDefinitionBridgeSchema(
  dbPathAbs: string
): { ok: true } | { ok: false; message: string } {
  const uv = readKitSqliteUserVersion(dbPathAbs);
  if (uv < AGENT_DEFINITION_BRIDGE_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `agent definition bridge requires kit SQLite user_version >= ${AGENT_DEFINITION_BRIDGE_MIN_USER_VERSION} (current ${uv}); open the workspace DB once with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

export function validateAgentDefinitionId(raw: string): string | null {
  const t = raw.trim();
  return !t || !AGENT_DEFINITION_ID_RE.test(t) ? null : t;
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseJsonStringArray(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === "") return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

function readBridgeAgentDefinitionFromMetadata(metadata: Record<string, unknown> | null): AgentDefinitionV1 | null {
  const bridge = metadata?.agentDefinition;
  if (!bridge || typeof bridge !== "object" || Array.isArray(bridge)) return null;
  const result = validateAgentDefinitionV1(bridge);
  return result.ok ? result.data : null;
}

function buildAgentDefinitionFromColumns(
  row: Record<string, unknown>,
  base: {
    id: string;
    displayName: string;
    description: string;
    allowedCommands: string[];
    retired: boolean;
    metadata: Record<string, unknown> | null;
  }
): AgentDefinitionV1 | null {
  const role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : null;
  const hostCompatibility = parseJsonStringArray(
    typeof row.host_compatibility_json === "string" ? row.host_compatibility_json : null
  );
  const accessProfileId = typeof row.access_profile_id === "string" ? row.access_profile_id.trim() : "";
  const contextProfileId = typeof row.context_profile_id === "string" ? row.context_profile_id.trim() : "";
  const modelProfileId = typeof row.model_profile_id === "string" ? row.model_profile_id.trim() : "";
  const handoffContractId = typeof row.handoff_contract_id === "string" ? row.handoff_contract_id.trim() : "";
  const activityContractId = typeof row.activity_contract_id === "string" ? row.activity_contract_id.trim() : "";
  if (!role || !hostCompatibility?.length || !accessProfileId || !contextProfileId || !modelProfileId || !handoffContractId || !activityContractId) {
    return null;
  }
  const candidate: AgentDefinitionV1 = {
    agentDefinitionId: base.id,
    displayName: base.displayName,
    description: base.description,
    role: role as AgentDefinitionV1["role"],
    hostCompatibility: hostCompatibility as AgentDefinitionV1["hostCompatibility"],
    requiredCapabilities: parseJsonStringArray(typeof row.required_capabilities_json === "string" ? row.required_capabilities_json : null) ?? [],
    optionalCapabilities: parseJsonStringArray(typeof row.optional_capabilities_json === "string" ? row.optional_capabilities_json : null) ?? [],
    allowedCommands: base.allowedCommands,
    accessProfileId,
    contextProfileId,
    modelProfileId,
    handoffContractId,
    activityContractId,
    metadata: base.metadata ?? undefined,
    retired: base.retired,
    version: AGENT_DEFINITION_SCHEMA_VERSION
  };
  const validated = validateAgentDefinitionV1(candidate);
  return validated.ok ? validated.data : null;
}

function materializeAgentDefinitionV1(
  row: Record<string, unknown>,
  base: {
    id: string;
    displayName: string;
    description: string;
    allowedCommands: string[];
    retired: boolean;
    metadata: Record<string, unknown> | null;
  }
): AgentDefinitionV1 | null {
  return (
    buildAgentDefinitionFromColumns(row, base) ??
    (() => {
      const fromMetadata = readBridgeAgentDefinitionFromMetadata(base.metadata);
      return fromMetadata
        ? {
            ...fromMetadata,
            agentDefinitionId: base.id,
            displayName: base.displayName,
            description: base.description,
            allowedCommands: base.allowedCommands.length > 0 ? base.allowedCommands : fromMetadata.allowedCommands,
            retired: base.retired
          }
        : null;
    })()
  );
}

export function rowToAgentDefinitionBridgeRecord(row: Record<string, unknown>, hasBridgeColumns: boolean): AgentDefinitionBridgeRecord {
  let allowed: string[] = [];
  try {
    const p = JSON.parse(String(row.allowed_commands_json ?? "[]"));
    if (Array.isArray(p)) allowed = p.filter((x): x is string => typeof x === "string");
  } catch {
    allowed = [];
  }
  const metadata = parseJsonObject(typeof row.metadata_json === "string" ? row.metadata_json : null);
  const base = {
    id: String(row.id),
    displayName: String(row.display_name ?? ""),
    description: String(row.description ?? ""),
    allowedCommands: allowed,
    retired: Number(row.retired) === 1,
    metadata
  };
  const agentDefinition = hasBridgeColumns ? materializeAgentDefinitionV1(row, base) : readBridgeAgentDefinitionFromMetadata(metadata);
  return {
    ...base,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    role: hasBridgeColumns && typeof row.role === "string" ? row.role : null,
    hostCompatibility: hasBridgeColumns ? parseJsonStringArray(typeof row.host_compatibility_json === "string" ? row.host_compatibility_json : null) : null,
    requiredCapabilities: hasBridgeColumns ? parseJsonStringArray(typeof row.required_capabilities_json === "string" ? row.required_capabilities_json : null) : null,
    optionalCapabilities: hasBridgeColumns ? parseJsonStringArray(typeof row.optional_capabilities_json === "string" ? row.optional_capabilities_json : null) : null,
    accessProfileId: hasBridgeColumns && typeof row.access_profile_id === "string" ? row.access_profile_id : null,
    contextProfileId: hasBridgeColumns && typeof row.context_profile_id === "string" ? row.context_profile_id : null,
    modelProfileId: hasBridgeColumns && typeof row.model_profile_id === "string" ? row.model_profile_id : null,
    handoffContractId: hasBridgeColumns && typeof row.handoff_contract_id === "string" ? row.handoff_contract_id : null,
    activityContractId: hasBridgeColumns && typeof row.activity_contract_id === "string" ? row.activity_contract_id : null,
    definitionVersion: hasBridgeColumns && row.definition_version != null ? Number(row.definition_version) : null,
    agentDefinition,
    orchestrationReady: agentDefinition !== null
  };
}

function bridgeMetadataForDefinition(definition: AgentDefinitionV1): Record<string, unknown> {
  const prior = definition.metadata && typeof definition.metadata === "object" ? definition.metadata : {};
  return { ...prior, schemaVersion: AGENT_DEFINITION_SCHEMA_VERSION, agentDefinition: { schemaVersion: AGENT_DEFINITION_SCHEMA_VERSION, ...definition } };
}

export function parseAgentDefinitionInput(
  args: Record<string, unknown>
): { ok: true; definition: AgentDefinitionV1 } | AgentDefinitionValidationFailure {
  const raw: Record<string, unknown> =
    args.agentDefinition && typeof args.agentDefinition === "object" && !Array.isArray(args.agentDefinition)
      ? (args.agentDefinition as Record<string, unknown>)
      : args;
  const agentDefinitionId =
    (typeof raw.agentDefinitionId === "string" ? validateAgentDefinitionId(raw.agentDefinitionId) : null) ??
    (typeof args.agentDefinitionId === "string" ? validateAgentDefinitionId(args.agentDefinitionId) : null) ??
    (typeof args.subagentId === "string" ? validateAgentDefinitionId(args.subagentId) : null);
  if (!agentDefinitionId) {
    return { ok: false, code: "invalid-args", message: "agentDefinitionId (or subagentId) is required and must match ^[a-z][a-z0-9-]*$" };
  }
  const payload = raw === args ? { ...raw, agentDefinitionId } : { ...raw, agentDefinitionId };
  const validated = validateAgentDefinitionV1(payload);
  if (!validated.ok) return validated;
  if (validated.data.agentDefinitionId !== agentDefinitionId) {
    return { ok: false, code: "invalid-args", message: "agentDefinitionId in payload must match the request id" };
  }
  return { ok: true, definition: validated.data };
}

function persistAgentDefinitionRow(db: Database.Database, definition: AgentDefinitionV1, now: string, mode: "insert" | "update"): void {
  const metadata = bridgeMetadataForDefinition(definition);
  const shared = [
    definition.displayName,
    definition.description,
    JSON.stringify(definition.allowedCommands),
    definition.role,
    JSON.stringify(definition.hostCompatibility),
    JSON.stringify(definition.requiredCapabilities),
    JSON.stringify(definition.optionalCapabilities),
    definition.accessProfileId,
    definition.contextProfileId,
    definition.modelProfileId,
    definition.handoffContractId,
    definition.activityContractId,
    definition.version,
    JSON.stringify(metadata)
  ];
  if (mode === "insert") {
    db.prepare(
      `INSERT INTO kit_subagent_definitions (
        id, display_name, description, allowed_commands_json, retired,
        role, host_compatibility_json, required_capabilities_json, optional_capabilities_json,
        access_profile_id, context_profile_id, model_profile_id,
        handoff_contract_id, activity_contract_id, definition_version,
        metadata_json, created_at, updated_at
      ) VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(definition.agentDefinitionId, ...shared, now, now);
    return;
  }
  db.prepare(
    `UPDATE kit_subagent_definitions SET
      display_name = ?, description = ?, allowed_commands_json = ?,
      role = ?, host_compatibility_json = ?, required_capabilities_json = ?, optional_capabilities_json = ?,
      access_profile_id = ?, context_profile_id = ?, model_profile_id = ?,
      handoff_contract_id = ?, activity_contract_id = ?, definition_version = ?,
      metadata_json = ?, updated_at = ?
    WHERE id = ?`
  ).run(...shared, now, definition.agentDefinitionId);
}

export function registerAgentDefinition(db: Database.Database, definition: AgentDefinitionV1, now: string): AgentDefinitionBridgeRecord {
  const existing = getAgentDefinitionById(db, definition.agentDefinitionId);
  if (existing?.retired) throw new Error(`Agent definition '${definition.agentDefinitionId}' is retired; register a new agentDefinitionId`);
  persistAgentDefinitionRow(db, definition, now, existing ? "update" : "insert");
  const row = getAgentDefinitionById(db, definition.agentDefinitionId);
  if (!row) throw new Error(`Unable to read persisted agent definition '${definition.agentDefinitionId}'`);
  return row;
}

export function updateAgentDefinition(db: Database.Database, definition: AgentDefinitionV1, now: string): AgentDefinitionBridgeRecord | null {
  const existing = getAgentDefinitionById(db, definition.agentDefinitionId);
  if (!existing) return null;
  if (existing.retired) throw new Error(`Agent definition '${definition.agentDefinitionId}' is retired`);
  persistAgentDefinitionRow(db, definition, now, "update");
  return getAgentDefinitionById(db, definition.agentDefinitionId);
}

export function getAgentDefinitionById(db: Database.Database, id: string): AgentDefinitionBridgeRecord | null {
  const hasBridge = kitSqliteHasAgentDefinitionBridge(db);
  const r = db.prepare("SELECT * FROM kit_subagent_definitions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToAgentDefinitionBridgeRecord(r, hasBridge) : null;
}

export function listAgentDefinitions(db: Database.Database, filters: { includeRetired?: boolean; orchestrationOnly?: boolean }): AgentDefinitionBridgeRecord[] {
  const hasBridge = kitSqliteHasAgentDefinitionBridge(db);
  const where = filters.includeRetired ? "" : "WHERE retired = 0";
  const rows = db.prepare(`SELECT * FROM kit_subagent_definitions ${where} ORDER BY id`).all() as Record<string, unknown>[];
  const mapped = rows.map((row) => rowToAgentDefinitionBridgeRecord(row, hasBridge));
  return filters.orchestrationOnly ? mapped.filter((row) => row.orchestrationReady) : mapped;
}

export function retireAgentDefinition(db: Database.Database, id: string, now: string): boolean {
  return db.prepare("UPDATE kit_subagent_definitions SET retired = 1, updated_at = ? WHERE id = ?").run(now, id).changes > 0;
}

export function resolveAgentDefinitionDbPathAbs(workspacePath: string, dbRel: string): string {
  return path.resolve(workspacePath, dbRel);
}
