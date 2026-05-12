import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("drawer: register catalog markup includes field ids", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildRegisterPhaseCatalogDrawerSpec();
  const html = mod.renderDrawerFormHtml(spec);
  assert.match(html, /data-wc-drawer-field="phaseKey"/);
  assert.match(html, /data-wc-drawer-field="shortDescription"/);
  assert.match(html, /data-wc-drawer-action="submit"/);
});

test("drawer: validate register phase catalog rejects empty key", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateRegisterPhaseCatalogSubmit({ phaseKey: "  " });
  assert.equal(bad.ok, false);
  const good = mod.validateRegisterPhaseCatalogSubmit({ phaseKey: "92", shortDescription: "x" });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.phaseKey, "92");
    assert.equal(good.values.shortDescription, "x");
  }
});

test("drawer: dismiss critical requires rationale", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateDismissPhaseNoteSubmit("critical", { reason: "ok", policyRationale: "" });
  assert.equal(bad.ok, false);
  const good = mod.validateDismissPhaseNoteSubmit("critical", {
    reason: "because",
    policyRationale: "policy ok"
  });
  assert.equal(good.ok, true);
});

test("drawer: dismiss normal skips rationale requirement", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const good = mod.validateDismissPhaseNoteSubmit("normal", { reason: "nope", policyRationale: "" });
  assert.equal(good.ok, true);
});

test("drawer: normalizeDrawerValues trims", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const v = mod.normalizeDrawerValues({ a: "  x  ", b: 3 });
  assert.equal(v.a, "x");
  assert.equal(v.b, "3");
});
