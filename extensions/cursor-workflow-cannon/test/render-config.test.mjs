import test from "node:test";
import assert from "node:assert/strict";

import {
  formatConfigValuePreview,
  editorTextForValue,
  isConfigRowReadOnly,
  renderConfigListInnerHtml
} from "../dist/views/config/render-config.js";

test("formatConfigValuePreview masks sensitive values", () => {
  assert.equal(formatConfigValuePreview("secret", true), "— hidden (sensitive) —");
});

test("formatConfigValuePreview truncates long JSON", () => {
  const long = { a: "x".repeat(100) };
  const s = formatConfigValuePreview(long, false, 40);
  assert.ok(s.endsWith("…"));
  assert.ok(s.length <= 40);
});

test("editorTextForValue falls back to default when effective missing", () => {
  assert.equal(editorTextForValue(undefined, "hi"), '"hi"');
});

test("isConfigRowReadOnly for internal exposure", () => {
  assert.equal(
    isConfigRowReadOnly({
      key: "k",
      type: "string",
      description: "d",
      default: null,
      domainScope: "internal",
      owningModule: "x",
      exposure: "internal",
      sensitive: false,
      requiresApproval: false,
      requiresRestart: false,
      writableLayers: ["project"],
      effectiveValue: null
    }),
    true
  );
});

test("renderConfigListInnerHtml escapes XSS in description", () => {
  const html = renderConfigListInnerHtml([
    {
      key: "evil",
      type: "string",
      description: '</textarea><script>alert(1)</script>',
      default: "",
      domainScope: "project",
      owningModule: "kit",
      exposure: "public",
      sensitive: false,
      requiresApproval: false,
      requiresRestart: false,
      writableLayers: ["project"],
      effectiveValue: "v"
    }
  ]);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;\/textarea&gt;/);
});

test("renderConfigListInnerHtml includes key and apply control", () => {
  const html = renderConfigListInnerHtml([
    {
      key: "tasks.storeRelativePath",
      type: "string",
      description: "Where tasks live",
      default: ".workspace-kit/tasks/workspace-kit.db",
      domainScope: "project",
      owningModule: "task-engine",
      exposure: "public",
      sensitive: false,
      requiresApproval: false,
      requiresRestart: false,
      writableLayers: ["project"],
      effectiveValue: ".workspace-kit/tasks/workspace-kit.db"
    }
  ]);
  assert.match(html, /tasks\.storeRelativePath/);
  assert.match(html, /data-wc-action="config-save"/);
});
