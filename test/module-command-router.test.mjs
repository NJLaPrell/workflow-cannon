import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleCommandRouterError,
  ModuleRegistry,
  UNKNOWN_COMMAND_SAMPLE_LIMIT,
  agentBehaviorModule,
  createCommandRegistryRuntime,
  documentationModule,
  formatUnknownCommandMessage,
  getAtPath,
  ideasModule,
  planningModule,
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
    ideasModule,
    planningModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);

  const commandNames = router.listCommands().map((command) => command.name);
  assert.deepEqual(commandNames, [
    "accept-improvement",
    "accept-plan-artifact",
    "add-dependency",
    "add-phase-note",
    "agent-bootstrap",
    "agent-mutation-plan",
    "agent-session-snapshot",
    "apply-task-batch",
    "apply-task-mutation-intent",
    "apply-task-state-events",
    "archive-task",
    "assign-task-phase",
    "backfill-task-feature-links",
    "backup-planning-sqlite",
    "batch-transition",
    "block-task",
    "build-plan",
    "check-task-store-commit",
    "claim-next-task",
    "claim-workspace-edit-lease",
    "classify-kit-state",
    "clear-agent-activity",
    "clear-task-phase",
    "complete-task",
    "completion-preflight",
    "convert-phase-note-to-task",
    "create-behavior-profile",
    "create-idea",
    "create-task",
    "create-task-from-plan",
    "create-task-mutation-intent",
    "dashboard-agent-activity-slice",
    "dashboard-agent-types-slice",
    "dashboard-bootstrap-slices",
    "dashboard-overview-slice",
    "dashboard-queue-slice",
    "dashboard-service-snapshot",
    "dashboard-service-start",
    "dashboard-service-status",
    "dashboard-service-stop",
    "dashboard-status-slice",
    "dashboard-summary",
    "dashboard-terminal-rows",
    "dashboard-terminal-tasks",
    "dashboard-terminal-tasks-page",
    "delete-behavior-profile",
    "delete-idea",
    "demote-task",
    "derive-publish-artifacts",
    "derive-validations",
    "diff-behavior-profiles",
    "dismiss-phase-note",
    "document-project",
    "draft-plan-artifact",
    "execute-plan-artifact",
    "explain-behavior-profiles",
    "explain-config",
    "explain-planning-rules",
    "explain-task-engine-model",
    "export-feature-taxonomy-json",
    "export-workspace-status",
    "finalize-plan-to-phase",
    "generate-document",
    "get-behavior-profile",
    "get-blocked-summary",
    "get-dependency-graph",
    "get-idea",
    "get-kit-persistence-map",
    "get-last-output",
    "get-module-state",
    "get-next-actions",
    "get-phase-context",
    "get-ready-queue",
    "get-recent-task-activity",
    "get-task",
    "get-task-history",
    "get-task-summary",
    "get-workspace-status",
    "harvest-delivery-evidence",
    "heartbeat-workspace-edit-lease",
    "improvement-dedupe-explain",
    "improvement-workflow-summary",
    "install-git-hooks",
    "interview-behavior-profile",
    "list-behavior-profiles",
    "list-components",
    "list-features",
    "list-ideas",
    "list-module-states",
    "list-phase-catalog",
    "list-phase-notes",
    "list-planning-types",
    "list-task-mutation-intents",
    "list-tasks",
    "migrate-task-persistence",
    "pause-task",
    "persist-planning-execution-drafts",
    "phase-closeout-readiness",
    "phase-delivery-preflight",
    "phase-drain-delta",
    "phase-focus-dashboard",
    "phase-kickoff-readiness",
    "phase-release-orchestration-state",
    "phase-release-state",
    "phase-status",
    "planning-state-migrate-baseline",
    "prepare-release-artifacts",
    "propose-release-version",
    "propose-tasks-from-phase-notes",
    "queue-git-alignment",
    "queue-health",
    "rebuild-task-state-cache",
    "recommend-validation",
    "reject-improvement",
    "reject-task-mutation-intent",
    "release-closeout-result",
    "release-evidence-manifest",
    "release-status",
    "release-workspace-edit-lease",
    "remove-dependency",
    "reorder-ideas",
    "repair-task-state-cache",
    "replay-queue-snapshot",
    "report-defect",
    "resolve-agent-guidance",
    "resolve-behavior-profile",
    "resolve-config",
    "resolve-maintainer-delivery-policy",
    "resolve-task-intake-policy",
    "review-plan-artifact",
    "review-planning-execution-drafts",
    "run-transition",
    "set-active-behavior-profile",
    "set-agent-activity",
    "set-agent-guidance",
    "set-current-phase",
    "start-task",
    "supersede-phase-note",
    "sync-effective-behavior-cursor-rule",
    "sync-task-store-after-merge",
    "synthesize-transcript-churn",
    "task-persistence-readiness",
    "task-state-compact",
    "task-state-hydrate",
    "task-state-init",
    "task-state-migrate-baseline",
    "task-state-publish",
    "task-state-snapshot",
    "task-state-status",
    "task-state-verify",
    "task-sync-compact",
    "task-sync-hydrate",
    "task-sync-init",
    "task-sync-publish",
    "task-sync-snapshot",
    "task-sync-status",
    "task-sync-verify",
    "unblock-task",
    "uninstall-git-hooks",
    "update-behavior-profile",
    "update-idea",
    "update-phase-note",
    "update-task",
    "update-workspace-phase-snapshot",
    "update-workspace-status",
    "upsert-phase-catalog-entry",
    "wait-for-pr-checks",
    "workspace-coordination-status",
    "workspace-edit-status",
    "workspace-status-history"
  ]);
});

test("ModuleCommandRouter registers task-state-* recovery commands alongside task-sync-*", async () => {
  const registry = new ModuleRegistry([workspaceConfigModule, taskEngineModule]);
  const router = new ModuleCommandRouter(registry);

  const canonical = router.describeCommand("task-sync-status");
  const alias = router.describeCommand("task-state-status");
  assert.ok(canonical);
  assert.ok(alias);
  assert.ok(alias?.instructionFile?.endsWith("task-state-status.md"));

  const result = await router.execute(
    "task-state-status",
    {},
    { ...lifecycleContext, moduleRegistry: registry }
  );
  assert.equal(typeof result.ok, "boolean");
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

test("CommandRegistryRuntime invokes commands through shared runtime", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const runtime = createCommandRegistryRuntime(registry, {
    ctx: { ...lifecycleContext, moduleRegistry: registry }
  });

  assert.ok(runtime.describeCommand("explain-config"));
  const result = await runtime.invoke({
    name: "explain-config",
    args: { path: "tasks.persistenceBackend" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, "config-explained");
  assert.equal(result.data?.effectiveValue, "sqlite");
});

test("CommandRegistryRuntime matches ModuleCommandRouter output for same invocation", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    agentBehaviorModule,
    taskEngineModule
  ]);
  const ctx = { ...lifecycleContext, moduleRegistry: registry };
  const router = new ModuleCommandRouter(registry);
  const runtime = createCommandRegistryRuntime(registry, { ctx });
  const args = { path: "tasks.persistenceBackend" };

  const viaRouter = await router.execute("explain-config", args, ctx);
  const viaRuntime = await runtime.invoke({ name: "explain-config", args });

  assert.deepEqual(viaRuntime, viaRouter);
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
        dryRun: true,
        overwriteAi: true
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
