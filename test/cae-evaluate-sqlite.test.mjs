/**
 * cae-evaluate against SQLite-backed registry (**T912** smoke).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { contextActivationModule } from "../dist/index.js";
import { seededCaeEffective, workspaceWithSeededCaeRegistry } from "./cae-test-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("cae-evaluate live with SQLite registry", async () => {
  const workspacePath = await workspaceWithSeededCaeRegistry("wk-cae-evaluate-");
  const raw = await readFile(
    path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"),
    "utf8"
  );
  const evaluationContext = JSON.parse(raw);
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-evaluate",
      args: { schemaVersion: 1, evaluationContext, evalMode: "live" }
    },
    { runtimeVersion: "0.1", workspacePath, effectiveConfig: seededCaeEffective() }
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "cae-evaluate-ok");
  assert.ok(typeof r.data.traceId === "string");
});
