import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigRegistryView } from "../contracts/module-contract.js";
import { validatePersistedConfigDocument } from "./config-metadata.js";

export type ConfigLayerId =
  | "kit-default"
  | `module:${string}`
  | "user"
  | "project"
  | "env"
  | "invocation";

export type ConfigLayer = {
  id: ConfigLayerId;
  data: Record<string, unknown>;
};

/** Effective workspace config: domain keys + optional modules map (project file). */
export type EffectiveWorkspaceConfig = Record<string, unknown>;

export const PROJECT_CONFIG_REL = ".workspace-kit/config.json";

export function getProjectConfigPath(workspacePath: string): string {
  return path.join(workspacePath, PROJECT_CONFIG_REL);
}

/** Built-in defaults (lowest layer). */
export const KIT_CONFIG_DEFAULTS: Record<string, unknown> = {
  core: {},
  /**
   * Module enablement: `enabled` whitelist (non-empty replaces default-by-flag set), then `disabled` subtracts.
   * Empty arrays = no effect (all modules use registration.enabledByDefault).
   */
  modules: {
    enabled: [] as string[],
    disabled: [] as string[]
  },
  /** Maintainer-declared current kit phase (optional); overrides YAML-derived phase for queue audits when set. */
  kit: {
    githubInvocation: {
      enabled: false,
      allowedRepositories: [] as string[],
      eventPlaybookMap: {} as Record<string, string>,
      commentDebounceSeconds: 0,
      rateLimitEventsPerHour: 0,
      planOnlyRunCommands: ["get-next-actions", "list-tasks", "get-task"],
      sensitiveRunCommands: ["run-transition"]
    },
    lifecycleHooks: {
      enabled: false,
      mode: "off",
      traceRelativePath: ".workspace-kit/kit/lifecycle-hook-traces.jsonl",
      handlers: [] as unknown[]
    }
  } as Record<string, unknown>,
  tasks: {
    storeRelativePath: ".workspace-kit/tasks/state.json",
    wishlistStoreRelativePath: ".workspace-kit/wishlist/state.json",
    persistenceBackend: "sqlite",
    sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
    strictValidation: false
  },
  documentation: {},
  responseTemplates: {
    enforcementMode: "advisory",
    defaultTemplateId: "default",
    commandOverrides: {} as Record<string, string>
  },
  improvement: {
    transcripts: {
      sourcePath: "",
      archivePath: "agent-transcripts",
      maxFilesPerSync: 5000,
      maxBytesPerFile: 50_000_000,
      maxTotalScanBytes: 500_000_000,
      discoveryPaths: [] as string[]
    },
    cadence: {
      minIntervalMinutes: 15,
      skipIfNoNewTranscripts: true,
      maxRecommendationCandidatesPerRun: 500
    },
    hooks: {
      afterTaskCompleted: "off"
    }
  }
};

/**
 * Static module-level defaults keyed by module id (merged in registry startup order).
 * Keep true defaults in KIT_CONFIG_DEFAULTS as the canonical source; use this map
 * only when a module contributes additional non-default config structure.
 */
export const MODULE_CONFIG_CONTRIBUTIONS: Record<string, Record<string, unknown>> = {
  approvals: {},
  planning: {
    defaultQuestionDepth: "adaptive",
    hardBlockCriticalUnknowns: true,
    rulePacks: {}
  },
  skills: {
    skills: {
      discoveryRoots: [".claude/skills"]
    }
  }
};

export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const prev = out[k];
      const prevObj =
        prev !== null && typeof prev === "object" && !Array.isArray(prev)
          ? (prev as Record<string, unknown>)
          : {};
      out[k] = deepMerge(prevObj, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function cloneDeep(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

export function getAtPath(root: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ak = Object.keys(a as object).sort();
  const bk = Object.keys(b as object).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
  }
  for (const k of ak) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

/** Resolved home for user-level config (`~/.workspace-kit/config.json`). Override with `WORKSPACE_KIT_HOME` (tests). */
export function getUserConfigFilePath(): string {
  const home = process.env.WORKSPACE_KIT_HOME?.trim() || os.homedir();
  return path.join(home, ".workspace-kit", "config.json");
}

async function readUserConfigFile(): Promise<Record<string, unknown>> {
  const fp = getUserConfigFilePath();
  if (!existsSync(fp)) {
    return {};
  }
  const raw = await fs.readFile(fp, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`config-invalid(user): ${fp} must be a JSON object`);
  }
  const obj = parsed as Record<string, unknown>;
  validatePersistedConfigDocument(obj, "user config");
  return obj;
}

async function readProjectConfigFile(workspacePath: string): Promise<Record<string, unknown>> {
  const fp = path.join(workspacePath, PROJECT_CONFIG_REL);
  if (!existsSync(fp)) {
    return {};
  }
  const raw = await fs.readFile(fp, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config-invalid: .workspace-kit/config.json must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  validatePersistedConfigDocument(obj, ".workspace-kit/config.json");
  return obj;
}

/** Read `.workspace-kit/config.json` for mutation (validated). Returns `{}` when missing. */
export async function readProjectConfigDocument(workspacePath: string): Promise<Record<string, unknown>> {
  return readProjectConfigFile(workspacePath);
}

/** Atomically write project config after validation. */
export async function writeProjectConfigDocument(
  workspacePath: string,
  doc: Record<string, unknown>
): Promise<void> {
  validatePersistedConfigDocument(doc, ".workspace-kit/config.json");
  const fp = getProjectConfigPath(workspacePath);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, stableStringifyConfig(doc), "utf8");
  await fs.rename(tmp, fp);
}

export async function loadUserLayer(): Promise<ConfigLayer> {
  const data = await readUserConfigFile();
  return { id: "user", data };
}

/**
 * Parse WORKSPACE_KIT_* env into a nested object (double-underscore → path under domains).
 * Example: WORKSPACE_KIT_TASKS__STORE_PATH -> { tasks: { storeRelativePath: "..." } }
 * Uses segment after prefix; known domain prefix sets first key.
 */
export function envToConfigOverlay(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const prefix = "WORKSPACE_KIT_";
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(env)) {
    if (!key.startsWith(prefix) || val === undefined) continue;
    const rest = key.slice(prefix.length);
    if (!rest || rest === "ACTOR") continue;
    const segments = rest.split("__").map((s) => camelCaseEnvSegment(s));
    if (segments.length === 0) continue;
    setDeep(out, segments, coerceEnvValue(val));
  }
  return out;
}

function camelCaseEnvSegment(s: string): string {
  const lower = s.toLowerCase().replace(/_/g, "");
  // tasks -> tasks; STORE_PATH segments already split — first segment may be TASKS
  if (lower === "tasks") return "tasks";
  if (lower === "documentation") return "documentation";
  if (lower === "core") return "core";
  // e.g. STORE_PATH -> storePath
  return s
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

function setDeep(target: Record<string, unknown>, segments: string[], value: unknown): void {
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = cur[seg];
    if (next === undefined || typeof next !== "object" || Array.isArray(next)) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segments[segments.length - 1]] = value;
}

function coerceEnvValue(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^-?\d+$/.test(val)) return Number(val);
  return val;
}

/** Kit defaults + module contributions (topological order). Project/env/invocation added separately. */
export function buildBaseConfigLayers(registry: ConfigRegistryView): ConfigLayer[] {
  const layers: ConfigLayer[] = [];

  layers.push({ id: "kit-default", data: cloneDeep(KIT_CONFIG_DEFAULTS) });

  for (const mod of registry.getStartupOrder()) {
    const contrib = MODULE_CONFIG_CONTRIBUTIONS[mod.registration.id];
    if (contrib && Object.keys(contrib).length > 0) {
      layers.push({ id: `module:${mod.registration.id}`, data: cloneDeep(contrib) });
    }
  }

  return layers;
}

export async function loadProjectLayer(workspacePath: string): Promise<ConfigLayer> {
  const data = await readProjectConfigFile(workspacePath);
  return { id: "project", data };
}

export function mergeConfigLayers(layers: ConfigLayer[]): Record<string, unknown> {
  let acc: Record<string, unknown> = {};
  for (const layer of layers) {
    acc = deepMerge(acc, layer.data);
  }
  return acc;
}

export type ResolveWorkspaceConfigOptions = {
  workspacePath: string;
  registry: ConfigRegistryView;
  env?: NodeJS.ProcessEnv;
  /** Merged last (from `workspace-kit run` top-level `config` key). */
  invocationConfig?: Record<string, unknown>;
};

export async function resolveWorkspaceConfigWithLayers(
  options: ResolveWorkspaceConfigOptions
): Promise<{ effective: EffectiveWorkspaceConfig; layers: ConfigLayer[] }> {
  const { workspacePath, registry, env = process.env, invocationConfig } = options;
  const layers: ConfigLayer[] = [...buildBaseConfigLayers(registry)];
  layers.push(await loadUserLayer());
  layers.push(await loadProjectLayer(workspacePath));
  layers.push({ id: "env", data: envToConfigOverlay(env) });
  if (invocationConfig && Object.keys(invocationConfig).length > 0) {
    layers.push({ id: "invocation", data: cloneDeep(invocationConfig) });
  }
  return { effective: mergeConfigLayers(layers) as EffectiveWorkspaceConfig, layers };
}

export function normalizeConfigForExport(value: unknown): unknown {
  return sortKeysDeep(value);
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

/** Deterministic JSON for agents and tests (sorted keys, trailing newline). */
export function stableStringifyConfig(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

export type ExplainConfigResult = {
  path: string;
  effectiveValue: unknown;
  winningLayer: ConfigLayerId;
  alternates: { layer: ConfigLayerId; value: unknown }[];
};

export function explainConfigPath(
  dottedPath: string,
  layers: ConfigLayer[]
): ExplainConfigResult {
  const mergedFull = mergeConfigLayers(layers);
  const effectiveValue = getAtPath(mergedFull, dottedPath);

  let winningLayer: ConfigLayerId = "kit-default";
  let prevMerged: Record<string, unknown> = {};

  for (let i = 0; i < layers.length; i++) {
    const slice = layers.slice(0, i + 1);
    const nextMerged = mergeConfigLayers(slice);
    const prevVal = getAtPath(prevMerged, dottedPath);
    const nextVal = getAtPath(nextMerged, dottedPath);
    if (!deepEqual(prevVal, nextVal)) {
      winningLayer = layers[i].id;
    }
    prevMerged = nextMerged;
  }

  const alternates: { layer: ConfigLayerId; value: unknown }[] = [];
  for (let i = 0; i < layers.length; i++) {
    const slice = layers.slice(0, i + 1);
    const m = mergeConfigLayers(slice);
    alternates.push({ layer: layers[i].id, value: getAtPath(m, dottedPath) });
  }

  return { path: dottedPath, effectiveValue, winningLayer, alternates };
}
