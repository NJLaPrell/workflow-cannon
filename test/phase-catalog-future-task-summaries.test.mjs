import test from "node:test";
import assert from "node:assert/strict";
import { enrichFuturePhaseCatalogWithTaskSummaries } from "../dist/modules/task-engine/persistence/phase-catalog-store.js";

test("enrichFuturePhaseCatalogWithTaskSummaries fills future phase from task titles", () => {
  const phases = [
    { phaseKey: "86", shortDescription: "Shipped", inCatalog: true },
    { phaseKey: "87", shortDescription: null, inCatalog: false },
    { phaseKey: "88", shortDescription: null, inCatalog: false }
  ];
  const tasks = [
    {
      id: "T3",
      status: "ready",
      type: "execution",
      title: "Third",
      createdAt: "x",
      updatedAt: "x",
      phaseKey: "88"
    },
    {
      id: "T2",
      status: "ready",
      type: "execution",
      title: "Second headline",
      createdAt: "x",
      updatedAt: "x",
      phaseKey: "88"
    },
    {
      id: "T1",
      status: "ready",
      type: "execution",
      title: "First feature title",
      createdAt: "x",
      updatedAt: "x",
      phaseKey: "88"
    }
  ];
  const out = enrichFuturePhaseCatalogWithTaskSummaries(phases, tasks, "87");
  assert.equal(out[0].shortDescription, "Shipped");
  assert.equal(out[1].shortDescription, null);
  assert.match(out[2].shortDescription, /First feature title/);
  assert.match(out[2].shortDescription, /Second headline/);
  assert.match(out[2].shortDescription, /· …$/);
});

test("enrichFuturePhaseCatalogWithTaskSummaries does not overwrite catalog text", () => {
  const phases = [{ phaseKey: "90", shortDescription: "From catalog", inCatalog: true }];
  const tasks = [{ id: "T1", status: "ready", type: "x", title: "Ignored", createdAt: "a", updatedAt: "b", phaseKey: "90" }];
  const out = enrichFuturePhaseCatalogWithTaskSummaries(phases, tasks, "87");
  assert.equal(out[0].shortDescription, "From catalog");
});

test("enrichFuturePhaseCatalogWithTaskSummaries skips when workspace phase not parseable", () => {
  const phases = [{ phaseKey: "88", shortDescription: null, inCatalog: false }];
  const tasks = [{ id: "T1", status: "ready", type: "x", title: "Hi", createdAt: "a", updatedAt: "b", phaseKey: "88" }];
  const out = enrichFuturePhaseCatalogWithTaskSummaries(phases, tasks, "rolling-thunder");
  assert.equal(out[0].shortDescription, null);
});

test("enrichFuturePhaseCatalogWithTaskSummaries uses summary when title empty", () => {
  const phases = [{ phaseKey: "99", shortDescription: null, inCatalog: false }];
  const tasks = [
    {
      id: "T1",
      status: "proposed",
      type: "improvement",
      title: " ",
      summary: "Risk triage automation",
      createdAt: "a",
      updatedAt: "b",
      phaseKey: "99"
    }
  ];
  const out = enrichFuturePhaseCatalogWithTaskSummaries(phases, tasks, "1");
  assert.equal(out[0].shortDescription, "Risk triage automation");
});
