import test from "node:test";
import assert from "node:assert/strict";

import { validateConfigInputValue } from "../dist/views/config/validate-config-input.js";

const baseRow = {
  key: "kit.planningGenerationPolicy",
  type: "string",
  description: "",
  default: "require",
  domainScope: "global",
  owningModule: "kit",
  exposure: "public",
  sensitive: false,
  requiresApproval: false,
  requiresRestart: false,
  writableLayers: ["project"],
  allowedValues: ["require", "warn"],
  effectiveValue: "require"
};

test("validateConfigInputValue rejects JSON parse errors", () => {
  const row = { ...baseRow, type: "object", allowedValues: undefined, effectiveValue: {} };
  const r = validateConfigInputValue(row, "{not json}", "json");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /JSON/i);
});

test("validateConfigInputValue rejects values outside allowedValues", () => {
  const r = validateConfigInputValue(baseRow, '"nope"', "select");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /one of/i);
});

test("validateConfigInputValue accepts allowed enum", () => {
  const r = validateConfigInputValue(baseRow, '"warn"', "select");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.serialized, '"warn"');
});

test("validateConfigInputValue enforces boolean type", () => {
  const row = { ...baseRow, key: "kit.verbose", type: "boolean", allowedValues: undefined };
  assert.equal(validateConfigInputValue(row, '"yes"', "toggle").ok, false);
  const parsed = validateConfigInputValue(row, "true", "toggle");
  assert.equal(parsed.ok, true);
});

test("validateConfigInputValue accepts JSON object", () => {
  const row = { ...baseRow, key: "kit.meta", type: "object", allowedValues: undefined };
  const r = validateConfigInputValue(row, '{"a":1}', "json");
  assert.equal(r.ok, true);
});
