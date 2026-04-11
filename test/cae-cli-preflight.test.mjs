/**
 * CAE shadow preflight (**`T864`**) — metadata attach + non-blocking degradation.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  mergeCaeIntoCommandResult,
  runCaeCliPreflight,
  workspaceConfigModule,
  contextActivationModule,
  taskEngineModule
} from "../dist/index.js";

const root = process.cwd();

test("runCaeCliPreflight: skipped when kit.cae.enabled is false", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const r = runCaeCliPreflight({
    workspacePath: root,
    effective: { kit: { cae: { enabled: false, runtime: { shadowPreflight: true } } } },
    subcommand: "cae-health",
    commandArgs: { schemaVersion: 1 },
    router
  });
  assert.equal(r.shadowAttach, null);
});

test("runCaeCliPreflight: attaches shadow metadata when enabled + shadowPreflight", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
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
          registryStore: "json",
          runtime: { shadowPreflight: true },
          enforcement: { enabled: false }
        }
      }
    },
    subcommand: "list-tasks",
    commandArgs: { schemaVersion: 1 },
    router
  });
  assert.ok(r.shadowAttach);
  assert.equal(r.shadowAttach.schemaVersion, 1);
  assert.equal(r.shadowAttach.evalMode, "shadow");
  assert.ok(typeof r.shadowAttach.traceId === "string");
  assert.equal(r.enforcementDenial, null);
});

test("mergeCaeIntoCommandResult nests under data.cae", () => {
  const merged = mergeCaeIntoCommandResult(
    { ok: true, code: "ok", data: { schemaVersion: 1, x: 1 } },
    { schemaVersion: 1, traceId: "t" }
  );
  assert.equal(merged.data.cae.traceId, "t");
  assert.equal(merged.data.x, 1);
});
