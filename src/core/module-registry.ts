import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { WorkflowModule } from "../contracts/module-contract.js";

export class ModuleRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ModuleRegistryError";
    this.code = code;
  }
}

function buildModuleMap(modules: WorkflowModule[]): Map<string, WorkflowModule> {
  const moduleMap = new Map<string, WorkflowModule>();
  for (const module of modules) {
    const id = module.registration.id;
    if (moduleMap.has(id)) {
      throw new ModuleRegistryError("duplicate-module-id", `Duplicate module id: '${id}'`);
    }
    moduleMap.set(id, module);
  }
  return moduleMap;
}

function validateDependencies(moduleMap: Map<string, WorkflowModule>): void {
  for (const module of moduleMap.values()) {
    const moduleId = module.registration.id;
    for (const dependency of module.registration.dependsOn) {
      if (dependency === moduleId) {
        throw new ModuleRegistryError(
          "self-dependency",
          `Module '${moduleId}' cannot depend on itself`
        );
      }
      if (!moduleMap.has(dependency)) {
        throw new ModuleRegistryError(
          "missing-dependency",
          `Module '${moduleId}' depends on missing module '${dependency}'`
        );
      }
    }
  }
}

function validateOptionalPeers(moduleMap: Map<string, WorkflowModule>): void {
  for (const module of moduleMap.values()) {
    const moduleId = module.registration.id;
    const peers = module.registration.optionalPeers ?? [];
    const hard = new Set(module.registration.dependsOn);
    for (const peerId of peers) {
      if (peerId === moduleId) {
        throw new ModuleRegistryError(
          "self-optional-peer",
          `Module '${moduleId}' cannot list itself in optionalPeers`
        );
      }
      if (!moduleMap.has(peerId)) {
        throw new ModuleRegistryError(
          "missing-optional-peer",
          `Module '${moduleId}' lists unknown optional peer '${peerId}'`
        );
      }
      if (hard.has(peerId)) {
        throw new ModuleRegistryError(
          "optional-peer-overlap-dependsOn",
          `Module '${moduleId}' lists '${peerId}' in both dependsOn and optionalPeers`
        );
      }
    }
  }
}

function validateRegistrationSchemas(moduleMap: Map<string, WorkflowModule>): void {
  for (const module of moduleMap.values()) {
    const schema = module.registration.stateSchema;
    if (!Number.isInteger(schema) || schema < 1) {
      throw new ModuleRegistryError(
        "invalid-state-schema",
        `Module '${module.registration.id}' must declare integer stateSchema >= 1`
      );
    }
  }
}

function topologicalSort(moduleMap: Map<string, WorkflowModule>): WorkflowModule[] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const sorted: WorkflowModule[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    if (inStack.has(id)) {
      throw new ModuleRegistryError("dependency-cycle", `Dependency cycle detected at module '${id}'`);
    }

    inStack.add(id);
    const module = moduleMap.get(id);
    if (!module) {
      throw new ModuleRegistryError("missing-module", `Module '${id}' not found`);
    }

    for (const dependencyId of module.registration.dependsOn) {
      visit(dependencyId);
    }

    inStack.delete(id);
    visited.add(id);
    sorted.push(module);
  };

  for (const moduleId of moduleMap.keys()) {
    visit(moduleId);
  }

  return sorted;
}

function resolveEnabledModuleIds(
  modules: WorkflowModule[],
  options?: ModuleRegistryOptions
): Set<string> {
  const explicitEnabled = options?.enabledModules;
  const explicitDisabled = new Set(options?.disabledModules ?? []);

  const enabledIds = new Set<string>();
  for (const module of modules) {
    if (module.registration.enabledByDefault) {
      enabledIds.add(module.registration.id);
    }
  }

  if (explicitEnabled && explicitEnabled.length > 0) {
    enabledIds.clear();
    for (const moduleId of explicitEnabled) {
      enabledIds.add(moduleId);
    }
  }

  for (const moduleId of explicitDisabled) {
    enabledIds.delete(moduleId);
  }

  return enabledIds;
}

function buildEnabledModuleMap(
  moduleMap: Map<string, WorkflowModule>,
  enabledModuleIds: Set<string>
): Map<string, WorkflowModule> {
  const enabledModuleMap = new Map<string, WorkflowModule>();
  for (const moduleId of enabledModuleIds) {
    const module = moduleMap.get(moduleId);
    if (!module) {
      throw new ModuleRegistryError("unknown-enabled-module", `Enabled module '${moduleId}' not found`);
    }
    enabledModuleMap.set(moduleId, module);
  }
  return enabledModuleMap;
}

function validateEnabledDependencies(enabledModuleMap: Map<string, WorkflowModule>): void {
  for (const module of enabledModuleMap.values()) {
    for (const dependencyId of module.registration.dependsOn) {
      if (!enabledModuleMap.has(dependencyId)) {
        throw new ModuleRegistryError(
          "disabled-required-dependency",
          `Enabled module '${module.registration.id}' requires disabled module '${dependencyId}'`
        );
      }
    }
  }
}

function isInstructionNameValid(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function validateInstructionContracts(
  moduleMap: Map<string, WorkflowModule>,
  workspacePath: string
): void {
  for (const module of moduleMap.values()) {
    const { id, instructions } = module.registration;
    const instructionDirectory = resolve(workspacePath, instructions.directory);
    const seenNames = new Set<string>();
    const seenFiles = new Set<string>();

    for (const entry of instructions.entries) {
      if (!isInstructionNameValid(entry.name)) {
        throw new ModuleRegistryError(
          "invalid-instruction-name",
          `Module '${id}' has invalid instruction name '${entry.name}'`
        );
      }

      if (seenNames.has(entry.name)) {
        throw new ModuleRegistryError(
          "duplicate-instruction-name",
          `Module '${id}' has duplicate instruction name '${entry.name}'`
        );
      }
      seenNames.add(entry.name);

      if (!entry.file.endsWith(".md")) {
        throw new ModuleRegistryError(
          "invalid-instruction-file",
          `Module '${id}' instruction file '${entry.file}' must end with .md`
        );
      }

      const expectedFileName = `${entry.name}.md`;
      if (entry.file !== expectedFileName) {
        throw new ModuleRegistryError(
          "instruction-name-file-mismatch",
          `Module '${id}' instruction '${entry.name}' must map to '${expectedFileName}'`
        );
      }

      if (seenFiles.has(entry.file)) {
        throw new ModuleRegistryError(
          "duplicate-instruction-file",
          `Module '${id}' has duplicate instruction file '${entry.file}'`
        );
      }
      seenFiles.add(entry.file);

      const instructionFilePath = resolve(instructionDirectory, entry.file);
      if (
        instructionFilePath !== instructionDirectory &&
        !instructionFilePath.startsWith(`${instructionDirectory}${sep}`)
      ) {
        throw new ModuleRegistryError(
          "instruction-path-escape",
          `Module '${id}' instruction '${entry.name}' resolves outside instruction directory`
        );
      }

      if (!existsSync(instructionFilePath)) {
        throw new ModuleRegistryError(
          "missing-instruction-file",
          `Module '${id}' instruction file '${instructionFilePath}' does not exist`
        );
      }

      if (!statSync(instructionFilePath).isFile()) {
        throw new ModuleRegistryError(
          "invalid-instruction-file",
          `Module '${id}' instruction path '${instructionFilePath}' is not a file`
        );
      }

      const reqPeers = entry.requiresPeers ?? [];
      for (const peerId of reqPeers) {
        if (peerId === id) {
          throw new ModuleRegistryError(
            "instruction-requires-self",
            `Module '${id}' instruction '${entry.name}' cannot list its own module id in requiresPeers`
          );
        }
        if (!moduleMap.has(peerId)) {
          throw new ModuleRegistryError(
            "unknown-requires-peer",
            `Module '${id}' instruction '${entry.name}' lists unknown requiresPeers module '${peerId}'`
          );
        }
      }
    }
  }
}

export type ModuleActivationEntry = {
  moduleId: string;
  enabled: boolean;
  /** dependsOn entries not present in the enabled set (non-empty only if misconfigured). */
  unsatisfiedHardDependencies: string[];
  /** optionalPeers not currently enabled (informational). */
  missingOptionalPeers: string[];
};

export type ModuleActivationReport = {
  schemaVersion: 1;
  modules: ModuleActivationEntry[];
};

export function validateModuleSet(modules: WorkflowModule[], workspacePath?: string): void {
  const moduleMap = buildModuleMap(modules);
  validateDependencies(moduleMap);
  validateOptionalPeers(moduleMap);
  validateRegistrationSchemas(moduleMap);
  validateInstructionContracts(moduleMap, workspacePath ?? process.cwd());
  topologicalSort(moduleMap);
}

export type ModuleRegistryOptions = {
  enabledModules?: string[];
  disabledModules?: string[];
  workspacePath?: string;
};

export class ModuleRegistry {
  private readonly modules: WorkflowModule[];
  private readonly enabledModules: WorkflowModule[];
  private readonly sortedModules: WorkflowModule[];
  private readonly moduleMap: Map<string, WorkflowModule>;
  private readonly enabledModuleMap: Map<string, WorkflowModule>;

  constructor(modules: WorkflowModule[], options?: ModuleRegistryOptions) {
    this.moduleMap = buildModuleMap(modules);
    validateDependencies(this.moduleMap);
    validateOptionalPeers(this.moduleMap);
    validateRegistrationSchemas(this.moduleMap);
    validateInstructionContracts(this.moduleMap, options?.workspacePath ?? process.cwd());
    this.modules = [...modules];

    const enabledModuleIds = resolveEnabledModuleIds(this.modules, options);
    this.enabledModuleMap = buildEnabledModuleMap(this.moduleMap, enabledModuleIds);
    validateEnabledDependencies(this.enabledModuleMap);
    this.sortedModules = topologicalSort(this.enabledModuleMap);
    this.enabledModules = [...this.sortedModules];
  }

  getAllModules(): WorkflowModule[] {
    return [...this.modules];
  }

  getModuleById(id: string): WorkflowModule | undefined {
    return this.moduleMap.get(id);
  }

  isModuleEnabled(id: string): boolean {
    return this.enabledModuleMap.has(id);
  }

  getEnabledModules(): WorkflowModule[] {
    return [...this.enabledModules];
  }

  getStartupOrder(): WorkflowModule[] {
    return [...this.sortedModules];
  }

  /** Snapshot for doctor / tooling: enablement and peer satisfaction. */
  getActivationReport(): ModuleActivationReport {
    const enabledIds = new Set(this.enabledModuleMap.keys());
    const modules: ModuleActivationEntry[] = [];
    for (const mod of this.modules) {
      const id = mod.registration.id;
      const optionalPeers = mod.registration.optionalPeers ?? [];
      const missingOptionalPeers = optionalPeers.filter((p) => !enabledIds.has(p));
      const unsatisfiedHardDependencies = mod.registration.dependsOn.filter((d) => !enabledIds.has(d));
      modules.push({
        moduleId: id,
        enabled: enabledIds.has(id),
        unsatisfiedHardDependencies,
        missingOptionalPeers
      });
    }
    return { schemaVersion: 1, modules };
  }
}
