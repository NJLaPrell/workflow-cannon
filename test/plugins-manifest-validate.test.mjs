import test from "node:test";
import assert from "node:assert/strict";
import { validateClaudePluginManifestJson } from "../dist/modules/plugins/manifest-validate.js";

test("validateClaudePluginManifestJson accepts minimal Claude manifest", () => {
  const r = validateClaudePluginManifestJson({ name: "hello-world" });
  assert.equal(r.ok, true);
});

test("validateClaudePluginManifestJson rejects invalid name", () => {
  const r = validateClaudePluginManifestJson({ name: "Bad_Name" });
  assert.equal(r.ok, false);
});

test("validateClaudePluginManifestJson rejects path without ./ prefix", () => {
  const r = validateClaudePluginManifestJson({
    name: "x",
    commands: "commands"
  });
  assert.equal(r.ok, false);
});
