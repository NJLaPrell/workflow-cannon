import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkflowModule } from "../contracts/module-contract.js";
import { ModuleRegistry, ModuleRegistryError, type ModuleRegistryOptions } from "./module-registry.js";
import {
  resolveWorkspaceConfigWithLayers,
  type ConfigLayer,
  type EffectiveWorkspaceConfig
} from "./workspace-kit-config.js";

/**
 * Instruction paths in module registration are repo-relative. Use `workspacePath` when it
 * contains the kit sources; otherwise fall back to `process.cwd()` (tests / ephemeral cwd).
 */
export function pickModuleContractWorkspacePath(workspacePath: string): string {
  const marker = resolve(workspacePath, "src/modules/task-engine/config.md");
  if (existsSync(marker)) {
    return workspacePath;
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

/**
 * Reads `modules.enabled` / `modules.disabled` from effective config and maps them
 * to ModuleRegistryOptions. Unknown module ids throw — fail fast on typos.
 *
 * Semantics (matches resolveEnabledModuleIds):
 * - If `modules.enabled` is non-empty: only those ids are candidates, then `modules.disabled` subtracts.
 * - If `modules.enabled` is empty/absent: start from each module's enabledByDefault, then subtract disabled.
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
  const enabled = readNonEmptyStringArray(mod.enabled);
  const disabled = readNonEmptyStringArray(mod.disabled);

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
