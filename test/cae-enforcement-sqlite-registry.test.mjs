/**
 * CAE enforcement with SQLite-backed registry (**T904**).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  runCaeCliPreflight,
  workspaceConfigModule,
  contextActivationModule,
  pluginsModule,
  taskEngineModule
} from "../dist/index.js";

const root = process.cwd();

test("runCaeCliPreflight enforcement sees SQLite registry and can deny enable-plugin (pilot allowlist)", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    pluginsModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const r = runCaeCliPreflight({
    workspacePath: root,
    effective: {
      kit: {
        currentPhaseNumber: 70,
        cae: {
          enabled: true,
          registryStore: "sqlite",
          runtime: { shadowPreflight: true },
          enforcement: { enabled: true }
        }
      },
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
    },
    subcommand: "enable-plugin",
    commandArgs: { schemaVersion: 1, pluginId: "x" },
    router
  });
  assert.ok(r.shadowAttach);
  assert.equal(r.shadowAttach.evalMode, "shadow");
  assert.ok(r.enforcementDenial);
  assert.equal(r.enforcementDenial.ok, false);
  assert.equal(r.enforcementDenial.code, "cae-enforcement-blocked");
});
