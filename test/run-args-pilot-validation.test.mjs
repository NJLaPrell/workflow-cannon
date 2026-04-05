import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enforcePlanningGenerationCliPrelude,
  resetPilotRunArgsValidationCache,
  validatePilotRunCommandArgs
} from "../dist/core/run-args-pilot-validation.js";

test("non-pilot command skips validation", () => {
  resetPilotRunArgsValidationCache();
  const err = validatePilotRunCommandArgs("list-tasks", { status: "ready" }, {});
  assert.equal(err, null);
});

test("run-transition rejects malformed taskId pattern", () => {
  resetPilotRunArgsValidationCache();
  const err = validatePilotRunCommandArgs(
    "run-transition",
    { taskId: "bogus", action: "start", policyApproval: { confirmed: true, rationale: "x" } },
    { tasks: { planningGenerationPolicy: "off" } }
  );
  assert.ok(err);
  assert.equal(err.code, "invalid-run-args");
});

test("dashboard-summary rejects unknown top-level keys", () => {
  resetPilotRunArgsValidationCache();
  const err = validatePilotRunCommandArgs("dashboard-summary", { extra: 1 }, {});
  assert.ok(err);
  assert.equal(err.code, "invalid-run-args");
});

test("dashboard-summary accepts empty object", () => {
  resetPilotRunArgsValidationCache();
  const err = validatePilotRunCommandArgs("dashboard-summary", {}, {});
  assert.equal(err, null);
});

test("planning-generation-required when policy require and token omitted", () => {
  resetPilotRunArgsValidationCache();
  const args = {
    taskId: "T1",
    action: "start",
    policyApproval: { confirmed: true, rationale: "x" }
  };
  const effective = { tasks: { planningGenerationPolicy: "require" } };
  assert.equal(validatePilotRunCommandArgs("run-transition", args, effective), null);
  const prelude = enforcePlanningGenerationCliPrelude("run-transition", args, effective);
  assert.ok(prelude);
  assert.equal(prelude.code, "planning-generation-required");
});

test("planning token satisfied with integer", () => {
  resetPilotRunArgsValidationCache();
  const err = validatePilotRunCommandArgs(
    "run-transition",
    {
      taskId: "T1",
      action: "start",
      expectedPlanningGeneration: 0,
      policyApproval: { confirmed: true, rationale: "x" }
    },
    { tasks: { planningGenerationPolicy: "require" } }
  );
  assert.equal(err, null);
});
