/**
 * Planning session CAE scope hook (WP-2 T-2.3 / T100453).
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  runCaeCliPreflight,
  workspaceConfigModule,
  contextActivationModule,
  taskEngineModule
} from "../dist/index.js";
import {
  collectThinkArtifactIdsFromBundle,
  PLANNING_SESSION_DRAFT_REQUIRED_LENS_IDS,
  isPlanningSessionCaeCommand
} from "../dist/core/cae/planning-session-scope.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const caeEffective = {
  kit: {
    currentPhaseNumber: 110,
    cae: {
      enabled: true,
      registryStore: "json",
      runtime: { shadowPreflight: true },
      enforcement: { enabled: false }
    }
  }
};

function preflightFor(subcommand, commandArgs) {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  return runCaeCliPreflight({
    workspacePath: root,
    effective: caeEffective,
    subcommand,
    commandArgs,
    router
  });
}

test("isPlanningSessionCaeCommand includes draft-plan-artifact", () => {
  assert.equal(isPlanningSessionCaeCommand("draft-plan-artifact"), true);
  assert.equal(isPlanningSessionCaeCommand("list-tasks"), false);
});

test("runCaeCliPreflight: draft-plan-artifact fires planning session lens activations", () => {
  const r = preflightFor("draft-plan-artifact", { persist: false });
  assert.ok(r.shadowAttach, "expected shadow preflight attach");
  assert.equal(r.shadowAttach.planningSession, true);
  assert.equal(r.shadowAttach.planningSessionCommand, "draft-plan-artifact");
  assert.ok(r.traceToStore, "expected trace for bundle inspection");
  const thinkIds = collectThinkArtifactIdsFromBundle(r.traceToStore.bundle);
  for (const required of PLANNING_SESSION_DRAFT_REQUIRED_LENS_IDS) {
    assert.ok(
      thinkIds.includes(required),
      `expected think bundle to include ${required}; got ${thinkIds.join(", ")}`
    );
  }
  assert.ok(
    thinkIds.includes("cae.reasoning.planning-architecture"),
    "draft session activation should surface architecture lens"
  );
});
