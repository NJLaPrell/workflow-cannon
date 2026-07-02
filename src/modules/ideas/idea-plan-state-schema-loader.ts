import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentDirective, AgentDirectiveLoadValue, IdeaPlanStatus } from "./idea-plan-types.js";
import { isDegradedAgentDirective, isIdeaPlanStatus, normalizeIdeaPlanStatus } from "./idea-plan-types.js";

export const IDEA_PLAN_STATE_SCHEMA_FILE_NAMES: Record<IdeaPlanStatus, string> = {
  idea: "idea.schema.json",
  brainstorming: "brainstorming.schema.json",
  planning: "planning.schema.json",
  reviewed: "reviewed.schema.json",
  accepted: "accepted.schema.json",
  delivered: "delivered.schema.json"
};

export type IdeaPlanStateSchemaDocument = {
  $id?: string;
  $defs?: {
    canonicalAgentDirective?: AgentDirective;
  };
};

export type IdeaPlanStateSchemaLoadResult = {
  status: IdeaPlanStatus;
  schemaPath: string;
  agentDirective: AgentDirectiveLoadValue;
  degraded: boolean;
  degradedReason?: string;
};

type CachedStateSchema = {
  schemaPath: string;
  agentDirective: AgentDirectiveLoadValue;
  degraded: boolean;
  degradedReason?: string;
};

const schemaCache = new Map<string, Map<IdeaPlanStatus, CachedStateSchema>>();

/** Prefer workspace when it ships schemas; else package root (dist/modules/ideas → repo/package). */
export function resolveIdeaPlanStateSchemaRoot(workspacePath?: string): string {
  const cwd = workspacePath ? path.resolve(workspacePath) : process.cwd();
  const inWorkspace = path.join(cwd, "schemas", "ideas", "states", "idea.schema.json");
  if (fs.existsSync(inWorkspace)) {
    return cwd;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function resolveCanonicalStatus(status: IdeaPlanStatus | string): IdeaPlanStatus {
  const canonical = typeof status === "string" ? normalizeIdeaPlanStatus(status) : status;
  if (!canonical || !isIdeaPlanStatus(canonical)) {
    throw new Error(`Unknown IdeaPlan status: ${String(status)}`);
  }
  return canonical;
}

function buildDegradedDirective(reason: string): AgentDirectiveLoadValue {
  return {
    degraded: true,
    reason,
    requiredFields: [],
    validTransitions: []
  };
}

function readStateSchemaFile(schemaRoot: string, status: IdeaPlanStatus): CachedStateSchema {
  const fileName = IDEA_PLAN_STATE_SCHEMA_FILE_NAMES[status];
  const schemaPath = path.join(schemaRoot, "schemas", "ideas", "states", fileName);
  if (!fs.existsSync(schemaPath)) {
    const reason = `IdeaPlan state schema not found for ${status}: ${schemaPath}`;
    return {
      schemaPath,
      agentDirective: buildDegradedDirective(reason),
      degraded: true,
      degradedReason: reason
    };
  }

  let document: IdeaPlanStateSchemaDocument;
  try {
    document = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as IdeaPlanStateSchemaDocument;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = `IdeaPlan state schema for ${status} is not valid JSON (${schemaPath}): ${detail}`;
    return {
      schemaPath,
      agentDirective: buildDegradedDirective(reason),
      degraded: true,
      degradedReason: reason
    };
  }

  const agentDirective = document.$defs?.canonicalAgentDirective;
  if (!agentDirective) {
    const reason = `IdeaPlan state schema for ${status} is missing $defs.canonicalAgentDirective (${schemaPath})`;
    return {
      schemaPath,
      agentDirective: buildDegradedDirective(reason),
      degraded: true,
      degradedReason: reason
    };
  }
  if (agentDirective.state !== status) {
    const reason = `IdeaPlan state schema agentDirective.state mismatch for ${status}: ${agentDirective.state} (${schemaPath})`;
    return {
      schemaPath,
      agentDirective: buildDegradedDirective(reason),
      degraded: true,
      degradedReason: reason
    };
  }

  return {
    schemaPath,
    agentDirective: structuredClone(agentDirective),
    degraded: false
  };
}

function getCachedStateSchema(schemaRoot: string, status: IdeaPlanStatus): CachedStateSchema {
  let rootCache = schemaCache.get(schemaRoot);
  if (!rootCache) {
    rootCache = new Map();
    schemaCache.set(schemaRoot, rootCache);
  }

  const cached = rootCache.get(status);
  if (cached) {
    return cached;
  }

  const loaded = readStateSchemaFile(schemaRoot, status);
  rootCache.set(status, loaded);
  return loaded;
}

export function loadIdeaPlanStateSchema(
  status: IdeaPlanStatus | string,
  workspacePath?: string
): IdeaPlanStateSchemaLoadResult {
  const canonical = resolveCanonicalStatus(status);
  const schemaRoot = resolveIdeaPlanStateSchemaRoot(workspacePath);
  const { schemaPath, agentDirective, degraded, degradedReason } = getCachedStateSchema(schemaRoot, canonical);
  const clonedDirective = isDegradedAgentDirective(agentDirective)
    ? { ...agentDirective }
    : structuredClone(agentDirective);
  return {
    status: canonical,
    schemaPath,
    agentDirective: clonedDirective,
    degraded,
    ...(degradedReason ? { degradedReason } : {})
  };
}

export function resolveIdeaPlanStateSchemaPath(
  status: IdeaPlanStatus | string,
  workspacePath?: string
): string {
  return loadIdeaPlanStateSchema(status, workspacePath).schemaPath;
}

/** Clear in-process schema cache (tests). */
export function clearIdeaPlanStateSchemaCache(): void {
  schemaCache.clear();
}
