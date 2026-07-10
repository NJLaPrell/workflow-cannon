import assert from "node:assert/strict";
import test from "node:test";
import {
  ModuleCommandRouter,
  ModuleCommandRouterError,
  ModuleRegistry,
  agentBugReportingModule,
  approvalsModule,
  contextActivationModule,
  skillsModule,
  subagentsModule,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";
import { getBuiltinRunCommandManifestRow } from "../dist/contracts/builtin-run-command-manifest.js";
import { getPolicySensitivityForBuiltinCommand } from "../dist/core/policy.js";

const lifecycleContext = {
  runtimeVersion: "0.1",
  workspacePath: process.cwd()
};

// Include optionalPeers so ModuleRegistry peer validation is happy (R112).
const MODULE_DEPS = [
  workspaceConfigModule,
  skillsModule,
  taskEngineModule,
  subagentsModule,
  contextActivationModule,
  approvalsModule,
  agentBugReportingModule
];

test("agent-bug-reporting registers file-bug-report + seed-wc-bug-reporter when enabled", () => {
  const registry = new ModuleRegistry(MODULE_DEPS);
  assert.equal(registry.isModuleEnabled("agent-bug-reporting"), true);

  const router = new ModuleCommandRouter(registry);
  const names = router.listCommands().map((c) => c.name);
  assert.ok(names.includes("file-bug-report"));
  assert.ok(names.includes("seed-wc-bug-reporter"));

  const fileBug = router.describeCommand("file-bug-report");
  assert.equal(fileBug?.moduleId, "agent-bug-reporting");
  assert.match(fileBug?.instructionFile ?? "", /file-bug-report\.md$/);

  const seed = router.describeCommand("seed-wc-bug-reporter");
  assert.equal(seed?.moduleId, "agent-bug-reporting");
});

test("agent-bug-reporting module wiring: registration + builtin manifest rows", () => {
  const reg = agentBugReportingModule.registration;
  assert.equal(reg.id, "agent-bug-reporting");
  assert.equal(reg.enabledByDefault, true);
  assert.deepEqual(reg.dependsOn, ["task-engine", "subagents"]);
  assert.ok(reg.capabilities.includes("improvement"));

  const fileBugRow = getBuiltinRunCommandManifestRow("file-bug-report");
  assert.ok(fileBugRow);
  assert.equal(fileBugRow.moduleId, "agent-bug-reporting");
  assert.equal(getPolicySensitivityForBuiltinCommand("file-bug-report"), "non-sensitive");

  const seedRow = getBuiltinRunCommandManifestRow("seed-wc-bug-reporter");
  assert.ok(seedRow);
  assert.equal(seedRow.moduleId, "agent-bug-reporting");
  assert.equal(getPolicySensitivityForBuiltinCommand("seed-wc-bug-reporter"), "sensitive");
});

test("modules.disabled agent-bug-reporting: commands vanish; agents fall back to create-task", async () => {
  const registry = new ModuleRegistry(MODULE_DEPS, {
    disabledModules: ["agent-bug-reporting"]
  });
  assert.equal(registry.isModuleEnabled("agent-bug-reporting"), false);
  // Required peers stay up so task-engine create-task remains the fallback path.
  assert.equal(registry.isModuleEnabled("task-engine"), true);

  const router = new ModuleCommandRouter(registry);
  const names = router.listCommands().map((c) => c.name);
  assert.ok(!names.includes("file-bug-report"));
  assert.ok(!names.includes("seed-wc-bug-reporter"));
  assert.ok(names.includes("create-task"), "create-task must remain available as agent fallback");

  await assert.rejects(
    () => router.execute("file-bug-report", { title: "x", symptom: "y" }, lifecycleContext),
    (error) =>
      error instanceof ModuleCommandRouterError &&
      error.code === "unknown-command" &&
      /file-bug-report/.test(error.message)
  );

  // create-task still routes (validation error without full args is fine — proves executability).
  const create = await router.execute("create-task", {}, lifecycleContext);
  assert.equal(typeof create.ok, "boolean");
  assert.notEqual(create.code, "unknown-command");
});

test("agent-bug-reporting-overview is instruction-routed but not a builtin-manifest row", () => {
  const registry = new ModuleRegistry(MODULE_DEPS);
  const router = new ModuleCommandRouter(registry);
  const names = router.listCommands().map((c) => c.name);
  // Extra instruction entry (registered by the module) — not in builtin-run-command-manifest.
  assert.ok(names.includes("agent-bug-reporting-overview"));
  assert.equal(getBuiltinRunCommandManifestRow("agent-bug-reporting-overview"), undefined);
  const desc = router.describeCommand("agent-bug-reporting-overview");
  assert.equal(desc?.moduleId, "agent-bug-reporting");
});
