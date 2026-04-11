/**
 * cae-evaluate against SQLite-backed registry (**T912** smoke).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { contextActivationModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("cae-evaluate live with SQLite registry", async () => {
  const raw = await readFile(
    path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"),
    "utf8"
  );
  const evaluationContext = JSON.parse(raw);
  const eff = {
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
    kit: { cae: { registryStore: "sqlite" } }
  };
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-evaluate",
      args: { schemaVersion: 1, evaluationContext, evalMode: "live" }
    },
    { runtimeVersion: "0.1", workspacePath: root, effectiveConfig: eff }
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "cae-evaluate-ok");
  assert.ok(typeof r.data.traceId === "string");
});
