import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleRegistry,
  ModuleRegistryError,
  approvalsModule,
  improvementModule,
  planningModule,
  taskEngineModule,
  validateModuleSet
} from "../dist/index.js";

test("validateModuleSet accepts valid module dependency graph", () => {
  assert.doesNotThrow(() =>
    validateModuleSet([taskEngineModule, planningModule, approvalsModule, improvementModule])
  );
});

test("ModuleRegistry returns startup order in dependency sequence", () => {
  const registry = new ModuleRegistry([
    improvementModule,
    approvalsModule,
    planningModule,
    taskEngineModule
  ]);

  const startupIds = registry.getStartupOrder().map((module) => module.registration.id);
  assert.deepEqual(startupIds, ["task-engine", "planning", "improvement", "approvals"]);
});

test("ModuleRegistry rejects duplicate module IDs", () => {
  const duplicateTaskModule = {
    registration: {
      id: "task-engine",
      version: "0.2.0",
      contractVersion: "1",
      capabilities: ["task-engine"],
      dependsOn: []
    }
  };

  assert.throws(
    () => new ModuleRegistry([taskEngineModule, duplicateTaskModule]),
    (error) => error instanceof ModuleRegistryError && error.code === "duplicate-module-id"
  );
});

test("ModuleRegistry rejects missing dependencies", () => {
  const moduleWithMissingDependency = {
    registration: {
      id: "broken-module",
      version: "0.1.0",
      contractVersion: "1",
      capabilities: ["planning"],
      dependsOn: ["does-not-exist"]
    }
  };

  assert.throws(
    () => new ModuleRegistry([moduleWithMissingDependency]),
    (error) => error instanceof ModuleRegistryError && error.code === "missing-dependency"
  );
});

test("ModuleRegistry rejects self-dependency", () => {
  const selfDependentModule = {
    registration: {
      id: "self-module",
      version: "0.1.0",
      contractVersion: "1",
      capabilities: ["planning"],
      dependsOn: ["self-module"]
    }
  };

  assert.throws(
    () => new ModuleRegistry([selfDependentModule]),
    (error) => error instanceof ModuleRegistryError && error.code === "self-dependency"
  );
});

test("ModuleRegistry rejects dependency cycles", () => {
  const moduleA = {
    registration: {
      id: "module-a",
      version: "0.1.0",
      contractVersion: "1",
      capabilities: ["planning"],
      dependsOn: ["module-b"]
    }
  };
  const moduleB = {
    registration: {
      id: "module-b",
      version: "0.1.0",
      contractVersion: "1",
      capabilities: ["approvals"],
      dependsOn: ["module-a"]
    }
  };

  assert.throws(
    () => new ModuleRegistry([moduleA, moduleB]),
    (error) => error instanceof ModuleRegistryError && error.code === "dependency-cycle"
  );
});
