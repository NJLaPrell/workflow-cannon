import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ModuleRegistry,
  ModuleRegistryError,
  approvalsModule,
  documentationModule,
  improvementModule,
  planningModule,
  taskEngineModule,
  validateModuleSet,
  workspaceConfigModule
} from "../dist/index.js";

test("validateModuleSet accepts valid module dependency graph", () => {
  assert.doesNotThrow(() =>
    validateModuleSet([
      workspaceConfigModule,
      documentationModule,
      taskEngineModule,
      planningModule,
      approvalsModule,
      improvementModule
    ])
  );
});

test("ModuleRegistry resolves instruction contracts from explicit workspacePath", async () => {
  const originalCwd = process.cwd();
  const otherDir = await mkdtemp(path.join(os.tmpdir(), "wk-modreg-"));
  process.chdir(otherDir);
  try {
    assert.doesNotThrow(
      () => new ModuleRegistry([documentationModule, taskEngineModule], { workspacePath: originalCwd })
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test("ModuleRegistry returns startup order in dependency sequence", () => {
  const registry = new ModuleRegistry([
    documentationModule,
    improvementModule,
    approvalsModule,
    planningModule,
    taskEngineModule
  ]);

  const startupIds = registry.getStartupOrder().map((module) => module.registration.id);
  assert.deepEqual(startupIds, ["documentation", "task-engine", "planning", "improvement", "approvals"]);
});

test("ModuleRegistry supports disabled modules and enabled dependency checks", () => {
  const registry = new ModuleRegistry(
    [documentationModule, taskEngineModule, planningModule, approvalsModule, improvementModule],
    { disabledModules: ["documentation"] }
  );

  assert.equal(registry.isModuleEnabled("documentation"), false);
  const startupIds = registry.getStartupOrder().map((module) => module.registration.id);
  assert.deepEqual(startupIds, ["task-engine", "planning", "approvals", "improvement"]);
});

test("ModuleRegistry rejects enabling module with disabled required dependency", () => {
  assert.throws(
    () =>
      new ModuleRegistry([taskEngineModule, planningModule], {
        enabledModules: ["planning"],
        disabledModules: ["task-engine"]
      }),
    (error) => error instanceof ModuleRegistryError && error.code === "disabled-required-dependency"
  );
});

test("ModuleRegistry rejects instruction entry with missing backing file", () => {
  const brokenInstructionModule = {
    ...documentationModule,
    registration: {
      ...documentationModule.registration,
      instructions: {
        ...documentationModule.registration.instructions,
        entries: [
          {
            name: "does-not-exist",
            file: "does-not-exist.md"
          }
        ]
      }
    }
  };

  assert.throws(
    () => new ModuleRegistry([brokenInstructionModule]),
    (error) => error instanceof ModuleRegistryError && error.code === "missing-instruction-file"
  );
});

test("ModuleRegistry rejects instruction name/file mismatch", () => {
  const mismatchedInstructionModule = {
    ...documentationModule,
    registration: {
      ...documentationModule.registration,
      instructions: {
        ...documentationModule.registration.instructions,
        entries: [
          {
            name: "document-project",
            file: "generate-project.md"
          }
        ]
      }
    }
  };

  assert.throws(
    () => new ModuleRegistry([mismatchedInstructionModule]),
    (error) => error instanceof ModuleRegistryError && error.code === "instruction-name-file-mismatch"
  );
});

test("ModuleRegistry rejects duplicate module IDs", () => {
  const duplicateTaskModule = {
    registration: {
      id: "task-engine",
      version: "0.2.0",
      contractVersion: "1",
    stateSchema: 1,
      capabilities: ["task-engine"],
      dependsOn: [],
      enabledByDefault: true,
      config: {
        path: "src/modules/task-engine/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/task-engine/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/task-engine/instructions",
        entries: []
      }
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
    stateSchema: 1,
      capabilities: ["planning"],
      dependsOn: ["does-not-exist"],
      enabledByDefault: true,
      config: {
        path: "src/modules/broken-module/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/broken-module/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/broken-module/instructions",
        entries: []
      }
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
    stateSchema: 1,
      capabilities: ["planning"],
      dependsOn: ["self-module"],
      enabledByDefault: true,
      config: {
        path: "src/modules/self-module/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/self-module/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/self-module/instructions",
        entries: []
      }
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
    stateSchema: 1,
      capabilities: ["planning"],
      dependsOn: ["module-b"],
      enabledByDefault: true,
      config: {
        path: "src/modules/module-a/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/module-a/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/module-a/instructions",
        entries: []
      }
    }
  };
  const moduleB = {
    registration: {
      id: "module-b",
      version: "0.1.0",
      contractVersion: "1",
    stateSchema: 1,
      capabilities: ["approvals"],
      dependsOn: ["module-a"],
      enabledByDefault: true,
      config: {
        path: "src/modules/module-b/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/module-b/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/module-b/instructions",
        entries: []
      }
    }
  };

  assert.throws(
    () => new ModuleRegistry([moduleA, moduleB]),
    (error) => error instanceof ModuleRegistryError && error.code === "dependency-cycle"
  );
});

test("ModuleRegistry rejects invalid stateSchema values", () => {
  const invalidStateSchemaModule = {
    registration: {
      id: "broken-state-schema",
      version: "0.1.0",
      contractVersion: "1",
      stateSchema: 0,
      capabilities: ["planning"],
      dependsOn: [],
      enabledByDefault: true,
      config: {
        path: "src/modules/self-module/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/self-module/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/self-module/instructions",
        entries: []
      }
    }
  };

  assert.throws(
    () => new ModuleRegistry([invalidStateSchemaModule]),
    (error) => error instanceof ModuleRegistryError && error.code === "invalid-state-schema"
  );
});
