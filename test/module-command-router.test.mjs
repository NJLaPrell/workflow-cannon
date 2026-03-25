import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleCommandRouterError,
  ModuleRegistry,
  documentationModule,
  taskEngineModule
} from "../dist/index.js";

const lifecycleContext = {
  runtimeVersion: "0.1",
  workspacePath: process.cwd()
};

test("ModuleCommandRouter lists commands from enabled modules", () => {
  const registry = new ModuleRegistry([documentationModule, taskEngineModule]);
  const router = new ModuleCommandRouter(registry);

  const commandNames = router.listCommands().map((command) => command.name);
  assert.deepEqual(commandNames, ["document-project", "generate-document", "run-transition"]);
});

test("ModuleCommandRouter executes generate-document for single doc", async () => {
  const registry = new ModuleRegistry([documentationModule, taskEngineModule]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute(
    "generate-document",
    {
      documentType: "AGENTS.md",
      options: {
        dryRun: true
      }
    },
    lifecycleContext
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "generated-document");
});

test("ModuleCommandRouter executes document-project for batch generation", async () => {
  const registry = new ModuleRegistry([documentationModule]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute(
    "document-project",
    {
      options: {
        dryRun: true
      }
    },
    lifecycleContext
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "documented-project");
  assert.ok(result.data.summary.total >= 8, "Should process at least 8 templates");
  assert.equal(result.data.summary.failed, 0);
});

test("ModuleCommandRouter throws unknown-command for missing command", async () => {
  const registry = new ModuleRegistry([documentationModule]);
  const router = new ModuleCommandRouter(registry);

  await assert.rejects(
    () => router.execute("not-a-command", undefined, lifecycleContext),
    (error) => error instanceof ModuleCommandRouterError && error.code === "unknown-command"
  );
});

test("ModuleCommandRouter throws command-not-implemented when module has no onCommand", async () => {
  const registry = new ModuleRegistry([taskEngineModule]);
  const router = new ModuleCommandRouter(registry);

  await assert.rejects(
    () => router.execute("run-transition", undefined, lifecycleContext),
    (error) => error instanceof ModuleCommandRouterError && error.code === "command-not-implemented"
  );
});

test("ModuleCommandRouter detects duplicate command declarations", () => {
  const duplicateDocumentationModule = {
    registration: {
      id: "documentation-dup",
      version: "0.1.0",
      contractVersion: "1",
      capabilities: ["documentation"],
      dependsOn: [],
      enabledByDefault: true,
      config: {
        path: "src/modules/documentation/config.md",
        format: "md"
      },
      state: {
        path: "src/modules/documentation/state.md",
        format: "md"
      },
      instructions: {
        directory: "src/modules/documentation/instructions",
        entries: [
          {
            name: "document-project",
            file: "document-project.md"
          },
          {
            name: "generate-document",
            file: "generate-document.md"
          }
        ]
      }
    }
  };

  const registry = new ModuleRegistry([documentationModule, duplicateDocumentationModule]);
  assert.throws(
    () => new ModuleCommandRouter(registry),
    (error) => error instanceof ModuleCommandRouterError && error.code === "duplicate-command"
  );
});
