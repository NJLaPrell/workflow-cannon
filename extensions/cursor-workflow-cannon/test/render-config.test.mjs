import test from "node:test";
import assert from "node:assert/strict";

import {
  formatConfigValuePreview,
  editorTextForValue,
  isConfigRowReadOnly,
  groupConfigRows,
  renderConfigListInnerHtml
} from "../dist/views/config/render-config.js";

const baseRow = {
  type: "string",
  description: "desc",
  default: "",
  domainScope: "project",
  sensitive: false,
  requiresApproval: false,
  requiresRestart: false,
  writableLayers: ["project"],
  effectiveValue: "v"
};

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

test("groupConfigRows orders global kit, modules alphabetically, internal last", () => {
  const sections = groupConfigRows([
    { ...baseRow, key: "zeta.mod", owningModule: "zeta-mod", exposure: "public" },
    { ...baseRow, key: "kit.currentPhase", owningModule: "kit", exposure: "public" },
    { ...baseRow, key: "alpha.mod", owningModule: "alpha-mod", exposure: "public" },
    { ...baseRow, key: "internal.secret", owningModule: "kit", exposure: "internal" }
  ]);
  assert.equal(sections.length, 4);
  assert.equal(sections[0].label, "Global (kit)");
  assert.equal(sections[0].rows[0].key, "kit.currentPhase");
  assert.equal(sections[1].label, "Alpha Mod");
  assert.equal(sections[2].label, "Zeta Mod");
  assert.equal(sections[3].label, "Internal (read-only)");
  assert.equal(sections[3].readOnlySection, true);
});

test("renderConfigListInnerHtml internal section has no editable apply control", () => {
  const html = renderConfigListInnerHtml([
    {
      ...baseRow,
      key: "tasks.internalPath",
      owningModule: "task-engine",
      exposure: "internal",
      writableLayers: ["project"]
    }
  ]);
  const internalIdx = html.indexOf('data-cfg-section="internal-readonly"');
  assert.ok(internalIdx >= 0);
  const slice = html.slice(internalIdx);
  assert.doesNotMatch(slice, /data-wc-action="config-save"/);
  assert.match(slice, /disabled/);
});

test("renderConfigListInnerHtml includes section headings for modules", () => {
  const html = renderConfigListInnerHtml([
    { ...baseRow, key: "kit.x", owningModule: "kit", exposure: "public" },
    { ...baseRow, key: "tasks.y", owningModule: "task-engine", exposure: "public" }
  ]);
  assert.match(html, /Global \(kit\)/);
  assert.match(html, /Task Engine/);
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
