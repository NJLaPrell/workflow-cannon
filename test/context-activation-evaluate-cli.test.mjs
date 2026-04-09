/**
 * CAE evaluate / trace CLI (T862).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ModuleCommandRouter,
  ModuleRegistry,
  contextActivationModule,
  workspaceConfigModule
} from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const minimalCtx = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"), "utf8")
);

describe("context-activation evaluate CLI (T862)", () => {
  it("cae-evaluate stores trace for cae-get-trace", async () => {
    const registry = new ModuleRegistry([workspaceConfigModule, contextActivationModule]);
    const router = new ModuleCommandRouter(registry);
    const ctx = { runtimeVersion: "0.1", workspacePath: root, moduleRegistry: registry, effectiveConfig: {} };

    const ev = await router.execute(
      "cae-evaluate",
      { schemaVersion: 1, evaluationContext: minimalCtx },
      ctx
    );
    assert.equal(ev.ok, true);
    assert.equal(ev.code, "cae-evaluate-ok");
    const traceId = ev.data?.traceId;
    assert.ok(typeof traceId === "string" && traceId.length >= 8);

    const tr = await router.execute("cae-get-trace", { schemaVersion: 1, traceId }, ctx);
    assert.equal(tr.ok, true);
    assert.equal(tr.code, "cae-get-trace-ok");
    assert.equal(tr.data?.trace?.traceId, traceId);
  });

  it("cae-health returns registry ok", async () => {
    const registry = new ModuleRegistry([workspaceConfigModule, contextActivationModule]);
    const router = new ModuleCommandRouter(registry);
    const res = await router.execute(
      "cae-health",
      { schemaVersion: 1 },
      { runtimeVersion: "0.1", workspacePath: root, moduleRegistry: registry, effectiveConfig: {} }
    );
    assert.equal(res.ok, true);
    assert.equal(res.code, "cae-health-ok");
    assert.equal(res.data?.registryStatus, "ok");
  });
});
