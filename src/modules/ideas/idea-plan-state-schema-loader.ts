import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentDirective, IdeaPlanStatus } from "./idea-plan-types.js";
import { isIdeaPlanStatus, normalizeIdeaPlanStatus } from "./idea-plan-types.js";

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
  agentDirective: AgentDirective;
};

type CachedStateSchema = {
  schemaPath: string;
  agentDirective: AgentDirective;
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

function readStateSchemaFile(schemaRoot: string, status: IdeaPlanStatus): CachedStateSchema {
  const fileName = IDEA_PLAN_STATE_SCHEMA_FILE_NAMES[status];
  const schemaPath = path.join(schemaRoot, "schemas", "ideas", "states", fileName);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`IdeaPlan state schema not found for ${status}: ${schemaPath}`);
  }

  const document = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as IdeaPlanStateSchemaDocument;
  const agentDirective = document.$defs?.canonicalAgentDirective;
  if (!agentDirective) {
    throw new Error(`IdeaPlan state schema for ${status} is missing $defs.canonicalAgentDirective`);
  }
  if (agentDirective.state !== status) {
    throw new Error(
      `IdeaPlan state schema agentDirective.state mismatch for ${status}: ${agentDirective.state}`
    );
  }

  return {
    schemaPath,
    agentDirective: structuredClone(agentDirective)
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
  const { schemaPath, agentDirective } = getCachedStateSchema(schemaRoot, canonical);
  return {
    status: canonical,
    schemaPath,
    agentDirective: structuredClone(agentDirective)
  };
}

export function resolveIdeaPlanStateSchemaPath(
  status: IdeaPlanStatus | string,
  workspacePath?: string
): string {
  return loadIdeaPlanStateSchema(status, workspacePath).schemaPath;
}
