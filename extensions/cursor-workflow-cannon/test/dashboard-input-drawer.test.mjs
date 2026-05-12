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

test("drawer: add wishlist spec has eight required fields", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildAddWishlistDrawerSpec();
  assert.equal(spec.fields.length, 8);
  const html = mod.renderDrawerFormHtml(spec);
  assert.match(html, /data-wc-drawer-field="title"/);
  assert.match(html, /data-wc-drawer-field="evidenceRef"/);
});

test("drawer: validate add wishlist rejects empty field", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateAddWishlistSubmit({ title: "x", problemStatement: "" });
  assert.equal(bad.ok, false);
  const good = mod.validateAddWishlistSubmit({
    title: "t",
    problemStatement: "p",
    expectedOutcome: "e",
    impact: "i",
    constraints: "c",
    successSignals: "s",
    requestor: "r",
    evidenceRef: "ref"
  });
  assert.equal(good.ok, true);
});

test("drawer: normalizeDrawerValues trims", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const v = mod.normalizeDrawerValues({ a: "  x  ", b: 3 });
  assert.equal(v.a, "x");
  assert.equal(v.b, "3");
});

test("drawer: assign phase spec includes select and custom field", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildAssignTaskPhaseDrawerSpec("T100", [
    { label: "Next", phaseKey: "92" }
  ]);
  const html = mod.renderDrawerFormHtml(spec);
  assert.match(html, /data-wc-drawer-field="phaseSelect"/);
  assert.match(html, /class="wc-drawer-select"/);
  assert.match(html, /data-wc-drawer-field="phaseKeyCustom"/);
  assert.match(html, /value="92"/);
  assert.match(html, /value="__custom__"/);
});

test("drawer: validate assign phase — custom requires text", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const emptySel = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "", phaseKeyCustom: "" });
  assert.equal(emptySel.ok, false);
  const customNoText = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "__custom__", phaseKeyCustom: "  " });
  assert.equal(customNoText.ok, false);
  const customOk = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "__custom__", phaseKeyCustom: " 88 " });
  assert.equal(customOk.ok, true);
  if (customOk.ok) assert.equal(customOk.values.phaseKey, "88");
  const pickOk = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "91", phaseKeyCustom: "" });
  assert.equal(pickOk.ok, true);
  if (pickOk.ok) assert.equal(pickOk.values.phaseKey, "91");
});

test("drawer: add phase note spec has type, summary, priority fields", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const html = mod.renderDrawerFormHtml(mod.buildAddPhaseNoteDrawerSpec("91"));
  assert.match(html, /data-wc-drawer-field="noteType"/);
  assert.match(html, /data-wc-drawer-field="summary"/);
  assert.match(html, /data-wc-drawer-field="priority"/);
  assert.match(html, /value="follow-up"/);
});

test("drawer: validate add phase note rejects missing type or long summary", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const badType = mod.validateAddPhaseNoteSubmit({
    noteType: "",
    summary: "ok",
    priority: "normal",
    details: ""
  });
  assert.equal(badType.ok, false);
  const longSum = "x".repeat(300);
  const badLen = mod.validateAddPhaseNoteSubmit({
    noteType: "finding",
    summary: longSum,
    priority: "normal",
    details: ""
  });
  assert.equal(badLen.ok, false);
  const good = mod.validateAddPhaseNoteSubmit({
    noteType: "risk",
    summary: "Ship gate",
    priority: "high",
    details: "more"
  });
  assert.equal(good.ok, true);
});

test("drawer: accept proposed spec includes rationale field", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const html = mod.renderDrawerFormHtml(
    mod.buildAcceptProposedDrawerSpec({
      taskIds: ["T1"],
      categoryLabel: "",
      suggestions: [{ label: "Next", phaseKey: "92" }]
    })
  );
  assert.match(html, /data-wc-drawer-field="policyRationale"/);
  assert.match(html, /data-wc-drawer-field="phaseSelect"/);
});

test("drawer: validate accept proposed requires rationale", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateAcceptProposedSubmit({
    phaseSelect: "91",
    phaseKeyCustom: "",
    policyRationale: "  "
  });
  assert.equal(bad.ok, false);
  const good = mod.validateAcceptProposedSubmit({
    phaseSelect: "91",
    phaseKeyCustom: "",
    policyRationale: "Approved in standup"
  });
  assert.equal(good.ok, true);
});

test("drawer: guidance CAE mutation spec + validation", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildGuidanceCaeMutationDrawerSpec({
    command: "cae-create-workspace-artifact",
    target: "cae.foo",
    fallbackNote: "seed",
    defaultActor: "agent@example.com"
  });
  assert.equal(spec.workflowId, "guidance-cae-mutation");
  const html = mod.renderDrawerFormHtml(spec);
  assert.match(html, /caeMutationApproval/);
  assert.match(html, /data-wc-drawer-field="rationale"/);
  const bad = mod.validateGuidanceCaeMutationSubmit({ rationale: "   " });
  assert.equal(bad.ok, false);
  const good = mod.validateGuidanceCaeMutationSubmit({ rationale: "Because QA asked" });
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.values.rationale, "Because QA asked");
});
