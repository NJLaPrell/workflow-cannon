import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  buildAgentInstructionSurface,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";
import { resolveRegistryAndConfig } from "../dist/core/module-registry-resolve.js";
import { defaultRegistryModules } from "../dist/modules/index.js";

const lifecycleContext = {
  runtimeVersion: "0.1",
  workspacePath: process.cwd()
};

/** Harness: one command that requires `task-engine` to register in the router. */
const peerGatedHarnessModule = {
  registration: {
    id: "peer-gated-harness",
    version: "0.0.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["diagnostics"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/workspace-config/config.md",
      format: "md"
    },
    instructions: {
      directory: "test/fixtures/instruction-surface-harness",
      entries: [
        {
          name: "peer-gated-cmd",
          file: "peer-gated-cmd.md",
          requiresPeers: ["task-engine"]
        }
      ]
    }
  },
  async onCommand(command) {
    if (command.name === "peer-gated-cmd") {
      return { ok: true, code: "peer-gated-ok", data: {} };
    }
    return { ok: false, code: "unknown-command", message: "harness" };
  }
};

test("requiresPeers: command omitted from router when peer module disabled", () => {
  const registry = new ModuleRegistry(
    [workspaceConfigModule, peerGatedHarnessModule, taskEngineModule],
    { enabledModules: ["workspace-config", "peer-gated-harness"] }
  );
  const router = new ModuleCommandRouter(registry);
  const names = router.listCommands().map((c) => c.name);
  assert.ok(!names.includes("peer-gated-cmd"));
});

test("requiresPeers: command present when peer module enabled", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    peerGatedHarnessModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const names = router.listCommands().map((c) => c.name);
  assert.ok(names.includes("peer-gated-cmd"));
});

test("requiresPeers: surface marks row non-executable with peer_disabled", () => {
  const registry = new ModuleRegistry(
    [workspaceConfigModule, peerGatedHarnessModule, taskEngineModule],
    { enabledModules: ["workspace-config", "peer-gated-harness"] }
  );
  const surface = buildAgentInstructionSurface(registry.getAllModules(), registry);
  assert.equal(surface.schemaVersion, 1);
  assert.equal(surface.errorRemediationCatalog.schemaVersion, 1);
  assert.ok(Array.isArray(surface.errorRemediationCatalog.entries));
  assert.ok(surface.errorRemediationCatalog.entries.some((e) => e.code === "policy-denied"));
  const row = surface.commands.find((c) => c.commandName === "peer-gated-cmd");
  assert.ok(row);
  assert.equal(row.executable, false);
  assert.equal(row.degradation.kind, "peer_disabled");
  assert.deepEqual(row.degradation.missingPeers, ["task-engine"]);
});

test("requiresPeers: surface executable when peer enabled", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    peerGatedHarnessModule,
    taskEngineModule
  ]);
  const surface = buildAgentInstructionSurface(registry.getAllModules(), registry);
  const row = surface.commands.find((c) => c.commandName === "peer-gated-cmd");
  assert.ok(row);
  assert.equal(row.executable, true);
  assert.equal(row.degradation.kind, "executable");
});

test("instruction surface: policy hints when effectiveConfig provided", async () => {
  const { registry, effective } = await resolveRegistryAndConfig(process.cwd(), defaultRegistryModules);
  const surface = buildAgentInstructionSurface(registry.getAllModules(), registry, {
    effectiveConfig: effective,
    projection: "full"
  });
  const row = surface.commands.find((c) => c.commandName === "run-transition");
  assert.ok(row);
  assert.equal(typeof row.jsonApprovalRequired, "boolean");
  assert.equal(row.jsonApprovalRequired, true);
  assert.ok(row.policyOperationId);
});

test("requiresPeers: router executes gated command when peers satisfied", async () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    peerGatedHarnessModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const result = await router.execute("peer-gated-cmd", {}, lifecycleContext);
  assert.equal(result.ok, true);
  assert.equal(result.code, "peer-gated-ok");
});
