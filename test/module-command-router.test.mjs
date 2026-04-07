import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleCommandRouterError,
  ModuleRegistry,
  UNKNOWN_COMMAND_SAMPLE_LIMIT,
  agentBehaviorModule,
  documentationModule,
  formatUnknownCommandMessage,
  getAtPath,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";

const lifecycleContext = {
  runtimeVersion: "0.1",
  workspacePath: process.cwd()
};

test("ModuleCommandRouter lists commands from enabled modules", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);

  const commandNames = router.listCommands().map((command) => command.name);
  assert.deepEqual(commandNames, [
    "add-dependency",
    "agent-session-snapshot",
    "archive-task",
    "assign-task-phase",
    "backfill-task-feature-links",
    "backup-planning-sqlite",
    "clear-task-phase",
    "convert-wishlist",
    "create-behavior-profile",
    "create-task",
    "create-task-from-plan",
    "create-wishlist",
    "dashboard-summary",
    "delete-behavior-profile",
    "diff-behavior-profiles",
    "document-project",
    "explain-behavior-profiles",
    "explain-config",
    "explain-task-engine-model",
    "export-feature-taxonomy-json",
    "generate-document",
    "get-behavior-profile",
    "get-blocked-summary",
    "get-dependency-graph",
    "get-kit-persistence-map",
    "get-module-state",
    "get-next-actions",
    "get-ready-queue",
    "get-recent-task-activity",
    "get-task",
    "get-task-history",
    "get-task-summary",
    "get-wishlist",
    "interview-behavior-profile",
    "list-behavior-profiles",
    "list-components",
    "list-features",
    "list-module-states",
    "list-tasks",
    "list-wishlist",
    "migrate-task-persistence",
    "queue-git-alignment",
    "queue-health",
    "remove-dependency",
    "replay-queue-snapshot",
    "resolve-agent-guidance",
    "resolve-behavior-profile",
    "resolve-config",
    "run-transition",
    "set-active-behavior-profile",
    "set-agent-guidance",
    "synthesize-transcript-churn",
    "update-behavior-profile",
    "update-task",
    "update-wishlist",
    "update-workspace-phase-snapshot"
  ]);
});

test("ModuleCommandRouter executes explain-config", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute(
    "explain-config",
    { path: "tasks.storeRelativePath" },
    { ...lifecycleContext, moduleRegistry: registry }
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "config-explained");
  assert.equal(result.data?.effectiveValue, ".workspace-kit/tasks/state.json");
});

test("ModuleCommandRouter explain-config shows sqlite as default tasks.persistenceBackend", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute(
    "explain-config",
    { path: "tasks.persistenceBackend" },
    { ...lifecycleContext, moduleRegistry: registry }
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "config-explained");
  assert.equal(result.data?.effectiveValue, "sqlite");
});

test("ModuleCommandRouter explain-config rejects path and facet together", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute(
    "explain-config",
    { path: "tasks.persistenceBackend", facet: "tasks" },
    { ...lifecycleContext, moduleRegistry: registry }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-config-path");
});

test("ModuleCommandRouter explain-config facet entries match resolve-config effective values", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const ctx = { ...lifecycleContext, moduleRegistry: registry };

  const resolved = await router.execute("resolve-config", {}, ctx);
  assert.equal(resolved.ok, true);
  const effective = resolved.data?.effective;
  assert.ok(effective && typeof effective === "object");

  for (const facet of ["tasks", "kit"]) {
    const explained = await router.execute("explain-config", { facet }, ctx);
    assert.equal(explained.ok, true);
    assert.equal(explained.code, "config-explained");
    const facetKeys = explained.data?.facetKeys;
    const entries = explained.data?.entries;
    assert.ok(Array.isArray(facetKeys) && facetKeys.length > 0);
    assert.ok(Array.isArray(entries) && entries.length === facetKeys.length);
    for (const entry of entries) {
      const path = entry.path;
      assert.ok(typeof path === "string");
      const ev = getAtPath(effective, path);
      assert.deepEqual(entry.effectiveValue, ev);
    }
  }
});

test("ModuleCommandRouter executes resolve-config", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute(
    "resolve-config",
    {},
    { ...lifecycleContext, moduleRegistry: registry }
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "config-resolved");
  assert.ok(result.data?.effective && typeof result.data.effective === "object");
  assert.ok(Array.isArray(result.data?.layers));
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

test("formatUnknownCommandMessage caps listed commands and stays bounded", () => {
  const many = Array.from({ length: 80 }, (_, i) => `cmd-${String(i).padStart(3, "0")}`);
  const msg = formatUnknownCommandMessage("nope", many);
  assert.ok(msg.includes("Sample of"));
  assert.ok(msg.includes("65 more (not listed)"));
  assert.ok(msg.includes("workspace-kit run"));
  assert.ok(msg.length < 900, "message should not enumerate every command");
  const commas = msg.split(",").length;
  assert.ok(commas <= UNKNOWN_COMMAND_SAMPLE_LIMIT + 4);
});

test("ModuleCommandRouter executes task-engine run-transition returning validation error for missing args", async () => {
  const registry = new ModuleRegistry([taskEngineModule]);
  const router = new ModuleCommandRouter(registry);

  const result = await router.execute("run-transition", undefined, lifecycleContext);
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-task-schema");
});

test("ModuleCommandRouter detects duplicate command declarations", () => {
  const duplicateDocumentationModule = {
    registration: {
      id: "documentation-dup",
      version: "0.1.0",
      contractVersion: "1",
    stateSchema: 1,
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
