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

export function validateModuleSet(modules: WorkflowModule[]): void {
  const moduleMap = buildModuleMap(modules);
  validateDependencies(moduleMap);
  topologicalSort(moduleMap);
}

export class ModuleRegistry {
  private readonly modules: WorkflowModule[];
  private readonly sortedModules: WorkflowModule[];
  private readonly moduleMap: Map<string, WorkflowModule>;

  constructor(modules: WorkflowModule[]) {
    this.moduleMap = buildModuleMap(modules);
    validateDependencies(this.moduleMap);
    this.sortedModules = topologicalSort(this.moduleMap);
    this.modules = [...modules];
  }

  getAllModules(): WorkflowModule[] {
    return [...this.modules];
  }

  getModuleById(id: string): WorkflowModule | undefined {
    return this.moduleMap.get(id);
  }

  getStartupOrder(): WorkflowModule[] {
    return [...this.sortedModules];
  }
}
