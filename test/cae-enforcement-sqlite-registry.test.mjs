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
import { seededCaeEffective, workspaceWithSeededCaeRegistry } from "./cae-test-utils.mjs";

test("runCaeCliPreflight enforcement sees SQLite registry and can deny enable-plugin (pilot allowlist)", async () => {
  const workspacePath = await workspaceWithSeededCaeRegistry("wk-cae-preflight-");
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    pluginsModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const r = runCaeCliPreflight({
    workspacePath,
    effective: seededCaeEffective({
      cae: {
        runtime: { shadowPreflight: true },
        enforcement: { enabled: true }
      },
      kit: { currentPhaseNumber: 70 }
    }),
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
