/**
 * Context activation read-only commands (T861).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ModuleCommandRouter,
  ModuleRegistry,
  contextActivationModule,
  defaultRegistryModules,
  workspaceConfigModule
} from "../dist/index.js";

const root = process.cwd();

describe("context-activation module (T861)", () => {
  it("registers cae-list-artifacts on default registry", () => {
    const registry = new ModuleRegistry(defaultRegistryModules);
    const router = new ModuleCommandRouter(registry);
    const names = router.listCommands().map((c) => c.name);
    assert.ok(names.includes("cae-list-artifacts"));
  });

  it("cae-list-artifacts returns artifact ids", async () => {
    const registry = new ModuleRegistry([workspaceConfigModule, contextActivationModule]);
    const router = new ModuleCommandRouter(registry);
    const res = await router.execute(
      "cae-list-artifacts",
      { schemaVersion: 1, limit: 5 },
      { runtimeVersion: "0.1", workspacePath: root, moduleRegistry: registry }
    );
    assert.equal(res.ok, true);
    assert.equal(res.code, "cae-list-artifacts-ok");
    assert.equal(res.data?.schemaVersion, 1);
    assert.ok(Array.isArray(res.data?.artifactIds));
    assert.ok(res.data.artifactIds.length >= 1);
  });

  it("cae-get-artifact returns one row", async () => {
    const registry = new ModuleRegistry([workspaceConfigModule, contextActivationModule]);
    const router = new ModuleCommandRouter(registry);
    const res = await router.execute(
      "cae-get-artifact",
      { schemaVersion: 1, artifactId: "cae.playbook.machine-playbooks" },
      { runtimeVersion: "0.1", workspacePath: root, moduleRegistry: registry }
    );
    assert.equal(res.ok, true);
    assert.equal(res.code, "cae-get-artifact-ok");
    assert.equal(res.data?.artifact?.artifactId, "cae.playbook.machine-playbooks");
  });
});
