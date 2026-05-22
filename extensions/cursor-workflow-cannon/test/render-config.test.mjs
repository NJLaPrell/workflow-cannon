import test from "node:test";
import assert from "node:assert/strict";

import {
  formatConfigValuePreview,
  editorTextForValue,
  editorRawValueForRow,
  isConfigRowReadOnly,
  groupConfigRows,
  pickEditorKind,
  renderConfigListInnerHtml,
  renderConfigSectionsHtml
} from "../dist/views/config/render-config.js";
import { renderConfigRestartBannerHtml } from "../dist/views/config/config-mutation-result.js";

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

test("pickEditorKind matrix", () => {
  assert.equal(pickEditorKind({ ...baseRow, type: "boolean" }), "toggle");
  assert.equal(
    pickEditorKind({ ...baseRow, type: "string", allowedValues: ["a", "b"] }),
    "select"
  );
  assert.equal(pickEditorKind({ ...baseRow, type: "number" }), "number");
  assert.equal(pickEditorKind({ ...baseRow, type: "object" }), "json");
  assert.equal(pickEditorKind({ ...baseRow, type: "string", effectiveValue: { x: 1 } }), "json");
});

test("renderConfigListInnerHtml uses toggle for boolean keys", () => {
  const html = renderConfigListInnerHtml([
    { ...baseRow, key: "kit.verbose", type: "boolean", owningModule: "kit", effectiveValue: true }
  ]);
  assert.match(html, /data-editor-kind="toggle"/);
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /data-editor-kind="toggle"[\s\S]*<textarea/);
});

test("renderConfigListInnerHtml uses select for allowedValues", () => {
  const html = renderConfigListInnerHtml([
    {
      ...baseRow,
      key: "kit.planningGenerationPolicy",
      type: "string",
      owningModule: "kit",
      allowedValues: ["require", "warn"],
      effectiveValue: "require"
    }
  ]);
  assert.match(html, /data-editor-kind="select"/);
  assert.match(html, /<select[^>]+data-role="value"/);
  assert.match(html, /require/);
});

test("renderConfigListInnerHtml uses JSON textarea for object types", () => {
  const html = renderConfigListInnerHtml([
    { ...baseRow, key: "kit.meta", type: "object", owningModule: "kit", effectiveValue: { a: 1 } }
  ]);
  assert.match(html, /data-editor-kind="json"/);
  assert.match(html, /<textarea[^>]+data-value-kind="json"/);
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

/** Fixture: kit + two module sections (phase 106 canonical dashboard surface). */
const multiModuleFixture = [
  { ...baseRow, key: "kit.agentRole", type: "string", owningModule: "kit", exposure: "public", effectiveValue: "wizard" },
  {
    ...baseRow,
    key: "tasks.storeRelativePath",
    type: "string",
    owningModule: "task-engine",
    exposure: "public",
    effectiveValue: ".workspace-kit/tasks/workspace-kit.db"
  },
  {
    ...baseRow,
    key: "documentation.mode",
    type: "string",
    owningModule: "documentation",
    allowedValues: ["human", "machine"],
    exposure: "public",
    effectiveValue: "machine"
  },
  {
    ...baseRow,
    key: "kit.secretToken",
    type: "string",
    owningModule: "kit",
    exposure: "internal",
    sensitive: true,
    effectiveValue: "hidden"
  }
];

test("groupConfigRows fixture yields Global plus two public module sections", () => {
  const sections = groupConfigRows(multiModuleFixture);
  const labels = sections.map((s) => s.label);
  assert.deepEqual(labels, ["Global (kit)", "Documentation", "Task Engine", "Internal (read-only)"]);
  assert.equal(sections.filter((s) => !s.readOnlySection).length, 3);
});

test("renderConfigListInnerHtml multi-module fixture renders grouped typed controls", () => {
  const html = renderConfigListInnerHtml(multiModuleFixture);
  assert.match(html, /cfg-sections/);
  assert.match(html, /Global \(kit\)/);
  assert.match(html, /Task Engine/);
  assert.match(html, /Documentation/);
  assert.match(html, /data-editor-kind="select"/);
  assert.match(html, /kit\.agentRole/);
  assert.match(html, /— hidden \(sensitive\) —/);
});

test("renderConfigSectionsHtml preserves section order from groupConfigRows", () => {
  const sections = groupConfigRows(multiModuleFixture);
  const html = renderConfigSectionsHtml(sections);
  const kitIdx = html.indexOf("Global (kit)");
  const docIdx = html.indexOf("Documentation");
  const taskIdx = html.indexOf("Task Engine");
  const internalIdx = html.indexOf("Internal (read-only)");
  assert.ok(kitIdx < docIdx && docIdx < taskIdx && taskIdx < internalIdx);
});

test("renderConfigRestartBannerHtml pairs with requiresRestart rows in host flow", () => {
  const banner = renderConfigRestartBannerHtml("kit.agentGuidance");
  assert.match(banner, /config-reload-window/);
  const rowHtml = renderConfigListInnerHtml([
    {
      ...baseRow,
      key: "kit.agentGuidance",
      type: "object",
      owningModule: "kit",
      requiresRestart: true,
      effectiveValue: {}
    }
  ]);
  assert.match(rowHtml, /kit\.agentGuidance/);
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

test("editorRawValueForRow matches select serialization", () => {
  const row = {
    ...baseRow,
    key: "kit.planningGenerationPolicy",
    type: "string",
    allowedValues: ["require", "warn"],
    effectiveValue: "warn"
  };
  assert.equal(editorRawValueForRow(row), '"warn"');
});

test("renderConfigListInnerHtml includes dirty affordances for editable rows", () => {
  const html = renderConfigListInnerHtml([
    {
      key: "tasks.storeRelativePath",
      type: "string",
      description: "Where tasks live",
      default: "x",
      domainScope: "project",
      owningModule: "task-engine",
      exposure: "public",
      sensitive: false,
      requiresApproval: false,
      requiresRestart: false,
      writableLayers: ["project"],
      effectiveValue: "y"
    }
  ]);
  assert.match(html, /cfg-dirty-pill/);
  assert.match(html, /data-wc-baseline=/);
  assert.match(html, /config-save[^>]* disabled/);
  assert.match(html, /cfg-field-hint/);
});

test("renderConfigListInnerHtml uses Explain Layers label", () => {
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
  assert.match(html, />Explain Layers</);
  assert.doesNotMatch(html, />Explain layers</);
});
