import test from "node:test";
import assert from "node:assert/strict";

import {
  DrawerSessionController,
  buildDrawerStateApplierScript
} from "../dist/views/dashboard/drawer-session.js";

test("DrawerSessionController emits wcDrawerState snapshots", () => {
  const posted = [];
  const session = new DrawerSessionController((message) => {
    posted.push(message);
  });
  session.open("accept-proposed");
  session.setSubmitting("Accepting T1…");
  assert.equal(posted.length, 2);
  assert.equal(posted[1].type, "wcDrawerState");
  assert.equal(posted[1].state.step, "submitting");
  assert.equal(posted[1].state.busy, true);
  session.setValidationError("nope");
  assert.equal(posted.at(-1).state.step, "validation-error");
});

test("buildDrawerStateApplierScript includes wcDrawerState handler", () => {
  const script = buildDrawerStateApplierScript();
  assert.match(script, /applyWcDrawerState/);
  assert.match(script, /setDrawerBusy/);
});
