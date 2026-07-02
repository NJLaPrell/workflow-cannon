import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IDEA_PLAN_STATUSES } from "../dist/modules/ideas/idea-plan-types.js";
import {
  IDEA_PLAN_STATE_SCHEMA_FILE_NAMES,
  loadIdeaPlanStateSchema,
  resolveIdeaPlanStateSchemaPath,
  resolveIdeaPlanStateSchemaRoot
} from "../dist/modules/ideas/idea-plan-state-schema-loader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("resolveIdeaPlanStateSchemaRoot finds workspace schemas", () => {
  const schemaRoot = resolveIdeaPlanStateSchemaRoot(root);
  assert.equal(
    fs.existsSync(path.join(schemaRoot, "schemas", "ideas", "states", "idea.schema.json")),
    true
  );
});

test("loadIdeaPlanStateSchema returns schema path and parsed agentDirective for each status", () => {
  for (const status of IDEA_PLAN_STATUSES) {
    const loaded = loadIdeaPlanStateSchema(status, root);
    const expectedPath = path.join(
      root,
      "schemas",
      "ideas",
      "states",
      IDEA_PLAN_STATE_SCHEMA_FILE_NAMES[status]
    );

    assert.equal(loaded.status, status);
    assert.equal(path.resolve(loaded.schemaPath), path.resolve(expectedPath));
    assert.equal(loaded.agentDirective.state, status);
    assert.equal(loaded.agentDirective.schemaVersion, 1);
    assert.ok(Array.isArray(loaded.agentDirective.questions));
    assert.ok(loaded.agentDirective.questions.length > 0);
  }
});

test("loadIdeaPlanStateSchema normalizes legacy aliases", () => {
  const fromOpen = loadIdeaPlanStateSchema("open", root);
  const fromIdea = loadIdeaPlanStateSchema("idea", root);
  assert.equal(fromOpen.status, "idea");
  assert.deepEqual(fromOpen.agentDirective, fromIdea.agentDirective);
  assert.equal(fromOpen.schemaPath, fromIdea.schemaPath);

  const fromPlanned = loadIdeaPlanStateSchema("planned", root);
  const fromAccepted = loadIdeaPlanStateSchema("accepted", root);
  assert.equal(fromPlanned.status, "accepted");
  assert.deepEqual(fromPlanned.agentDirective, fromAccepted.agentDirective);
});

test("resolveIdeaPlanStateSchemaPath matches loader schemaPath", () => {
  for (const status of IDEA_PLAN_STATUSES) {
    const loaded = loadIdeaPlanStateSchema(status, root);
    assert.equal(resolveIdeaPlanStateSchemaPath(status, root), loaded.schemaPath);
  }
});

test("loadIdeaPlanStateSchema caches repeated reads", () => {
  const first = loadIdeaPlanStateSchema("planning", root);
  const second = loadIdeaPlanStateSchema("planning", root);
  assert.notEqual(first.agentDirective, second.agentDirective);
  assert.deepEqual(first.agentDirective, second.agentDirective);
  assert.equal(first.schemaPath, second.schemaPath);
});
