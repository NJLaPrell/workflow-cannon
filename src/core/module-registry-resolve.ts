import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkflowModule } from "../contracts/module-contract.js";
import { ModuleRegistry, ModuleRegistryError, type ModuleRegistryOptions } from "./module-registry.js";
import {
  resolveWorkspaceConfigWithLayers,
  type ConfigLayer,
  type EffectiveWorkspaceConfig
} from "./workspace-kit-config.js";

/** Deprecated module ids in config alias to their successor (doctor warns operators to update config). */
export const DEPRECATED_MODULE_ID_ALIASES: Readonly<Record<string, string>> = {
  ideas: "planning"
};

function moduleContractPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function hasModuleContractMarker(candidateRoot: string): boolean {
  return existsSync(resolve(candidateRoot, "src/modules/task-engine/config.md"));
}

/**
 * Instruction paths in module registration are package-relative. Use `workspacePath` when it
 * contains the kit sources; otherwise fall back to the installed package root.
 */
export function pickModuleContractWorkspacePath(workspacePath: string): string {
  if (hasModuleContractMarker(workspacePath)) {
    return workspacePath;
  }
  const packageRoot = moduleContractPackageRoot();
  if (hasModuleContractMarker(packageRoot)) {
    return packageRoot;
  }
  return process.cwd();
}

function readNonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out = value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function resolveDeprecatedModuleId(id: string): { resolved: string; deprecated: boolean } {
  const alias = DEPRECATED_MODULE_ID_ALIASES[id];
  if (alias) {
    return { resolved: alias, deprecated: true };
  }
  return { resolved: id, deprecated: false };
}

function normalizeModuleIdList(
  ids: string[] | undefined
): { normalized: string[] | undefined; deprecatedHits: string[] } {
  if (!ids) {
    return { normalized: undefined, deprecatedHits: [] };
  }
  const deprecatedHits: string[] = [];
  const normalized = [
    ...new Set(
      ids.map((id) => {
        const { resolved, deprecated } = resolveDeprecatedModuleId(id);
        if (deprecated) {
          deprecatedHits.push(id);
        }
        return resolved;
      })
    )
  ];
  return { normalized, deprecatedHits };
}

/** Doctor summary lines when config still references deprecated module ids (e.g. modules.disabled ideas). */
export function collectDeprecatedModuleConfigDoctorSummaryLines(
  effective: Record<string, unknown>
): string[] {
  const root = effective.modules;
  if (root === undefined || root === null || typeof root !== "object" || Array.isArray(root)) {
    return [];
  }
  const mod = root as Record<string, unknown>;
  const enabled = readNonEmptyStringArray(mod.enabled);
  const disabled = readNonEmptyStringArray(mod.disabled);
  const hits = new Set<string>();
  for (const id of [...(enabled ?? []), ...(disabled ?? [])]) {
    if (DEPRECATED_MODULE_ID_ALIASES[id]) {
      hits.add(id);
    }
  }
  if (hits.size === 0) {
    return [];
  }
  return [...hits]
    .sort()
    .map(
      (id) =>
        `Note: modules.* references deprecated module id '${id}' — aliased to '${DEPRECATED_MODULE_ID_ALIASES[id]}'; update .workspace-kit/config.json to use 'planning' instead.`
    );
}

/**
 * Reads `modules.enabled` / `modules.disabled` from effective config and maps them
 * to ModuleRegistryOptions. Unknown module ids throw — fail fast on typos.
 *
 * Semantics (matches resolveEnabledModuleIds):
 * - If `modules.enabled` is non-empty: only those ids are candidates, then `modules.disabled` subtracts.
 * - If `modules.enabled` is empty/absent: start from each module's enabledByDefault, then subtract disabled.
 *
 * Deprecated ids (e.g. `ideas`) alias to their successor (`planning`) for backward-compatible config.
 */
export function moduleRegistryOptionsFromEffectiveConfig(
  effective: Record<string, unknown>,
  knownModuleIds: Set<string>
): Pick<ModuleRegistryOptions, "enabledModules" | "disabledModules"> {
  const root = effective.modules;
  if (root === undefined || root === null) {
    return {};
  }
  if (typeof root !== "object" || Array.isArray(root)) {
    throw new ModuleRegistryError(
      "invalid-modules-config",
      "effectiveConfig.modules must be an object when present"
    );
  }
  const mod = root as Record<string, unknown>;
  const enabledRaw = readNonEmptyStringArray(mod.enabled);
  const disabledRaw = readNonEmptyStringArray(mod.disabled);
  const enabledNorm = normalizeModuleIdList(enabledRaw);
  const disabledNorm = normalizeModuleIdList(disabledRaw);
  const enabled = enabledNorm.normalized;
  const disabled = disabledNorm.normalized;

  for (const id of [...(enabled ?? []), ...(disabled ?? [])]) {
    if (!knownModuleIds.has(id)) {
      throw new ModuleRegistryError(
        "unknown-module-in-config",
        `Unknown module id in modules.enabled / modules.disabled: '${id}'`
      );
    }
  }

  return {
    enabledModules: enabled,
    disabledModules: disabled
  };
}

function enabledSignature(registry: ModuleRegistry): string {
  return registry
    .getEnabledModules()
    .map((m) => m.registration.id)
    .sort()
    .join(",");
}

/**
 * Resolves layered config together with module enablement toggles from that config.
 * Iterates until the enabled module set stabilizes (module config contributions can
 * change when modules drop out of startup order).
 */
export async function resolveRegistryAndConfig(
  workspacePath: string,
  allModules: WorkflowModule[],
  invocationConfig?: Record<string, unknown>
): Promise<{
  registry: ModuleRegistry;
  effective: EffectiveWorkspaceConfig;
  layers: ConfigLayer[];
}> {
  const knownIds = new Set(allModules.map((m) => m.registration.id));
  const moduleContractPath = pickModuleContractWorkspacePath(workspacePath);
  let registry = new ModuleRegistry(allModules, { workspacePath: moduleContractPath });

  for (let i = 0; i < 8; i++) {
    const { effective, layers } = await resolveWorkspaceConfigWithLayers({
      workspacePath,
      registry,
      invocationConfig
    });
    const extra = moduleRegistryOptionsFromEffectiveConfig(effective as Record<string, unknown>, knownIds);
    const candidate = new ModuleRegistry(allModules, { workspacePath: moduleContractPath, ...extra });

    if (enabledSignature(registry) === enabledSignature(candidate)) {
      const fin = await resolveWorkspaceConfigWithLayers({
        workspacePath,
        registry: candidate,
        invocationConfig
      });
      return {
        registry: candidate,
        effective: fin.effective as EffectiveWorkspaceConfig,
        layers: fin.layers
      };
    }
    registry = candidate;
  }

  throw new ModuleRegistryError(
    "module-enablement-unstable",
    "modules.enabled / modules.disabled did not stabilize after repeated config resolution; check config layers"
  );
}
