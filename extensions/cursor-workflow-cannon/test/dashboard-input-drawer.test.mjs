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

test("drawer: add idea markup and validation", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildAddIdeaDrawerSpec();
  const html = mod.renderDrawerFormHtml(spec);
  assert.equal(spec.workflowId, "add-idea");
  assert.equal(spec.primaryLabel, "Add idea");
  assert.match(html, /data-wc-drawer-field="title"/);
  assert.match(html, /data-wc-drawer-field="note"/);
  assert.match(html, /New Idea/);
  const empty = mod.validateAddIdeaSubmit({ title: "  ", note: "" });
  assert.equal(empty.ok, false);
  const good = mod.validateAddIdeaSubmit({ title: " Ship it ", note: " optional " });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.title, "Ship it");
    assert.equal(good.values.note, "optional");
  }
  const longTitle = mod.validateAddIdeaSubmit({ title: "x".repeat(181), note: "" });
  assert.equal(longTitle.ok, false);
});

test("drawer: normalizeDrawerValues trims", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const v = mod.normalizeDrawerValues({ a: "  x  ", b: 3 });
  assert.equal(v.a, "x");
  assert.equal(v.b, "3");
});

test("drawer: assign phase spec defaults phase, scope, and Set Phase label", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildAssignTaskPhaseDrawerSpec(
    "T100406",
    [{ label: "Phase 109", phaseKey: "109" }],
    "109"
  );
  const html = mod.renderDrawerFormHtml(spec);
  assert.equal(spec.primaryLabel, "Set Phase");
  assert.match(html, /data-wc-drawer-field="phaseSelect"/);
  assert.match(html, /value="109" selected/);
  assert.doesNotMatch(html, /data-wc-drawer-field="phaseKeyCustom"/);
  assert.doesNotMatch(html, /data-wc-drawer-field="shortDescription"/);
  assert.match(html, /Scope/);
  assert.match(html, /T100406/);
  assert.doesNotMatch(html, /Task id:/);
  const backlogIdx = html.indexOf('value="__backlog__"');
  const phase109Idx = html.indexOf('value="109"');
  assert.ok(backlogIdx >= 0 && phase109Idx >= 0 && backlogIdx < phase109Idx, "backlog option precedes phase keys");
  assert.match(html, /Move to Backlog/);
});

test("drawer: validate assign phase — pick phase or backlog", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const emptySel = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "", phaseKeyCustom: "" });
  assert.equal(emptySel.ok, false);
  const pickOk = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "91", phaseKeyCustom: "" });
  assert.equal(pickOk.ok, true);
  if (pickOk.ok) assert.equal(pickOk.values.phaseKey, "91");
  const backlogOk = mod.validateAssignTaskPhaseSubmit({ phaseSelect: "__backlog__", phaseKeyCustom: "" });
  assert.equal(backlogOk.ok, true);
  if (backlogOk.ok) assert.equal(backlogOk.values.moveToBacklog, "true");
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

test("drawer: view phase note spec is read-only summary", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildViewPhaseNoteDrawerSpec({
    noteId: "note-1",
    noteType: "risk",
    priority: "high",
    summary: "Watch deploy window",
    details: "Coordinate with on-call"
  });
  const html = mod.renderDrawerFormHtml(spec);
  assert.equal(spec.workflowId, "view-phase-note");
  assert.match(html, /Watch deploy window/);
  assert.match(html, /Coordinate with on-call/);
});

test("drawer: edit phase note spec and validation", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const spec = mod.buildEditPhaseNoteDrawerSpec({
    noteId: "note-2",
    summary: "Initial summary",
    details: "Initial details"
  });
  const html = mod.renderDrawerFormHtml(spec);
  assert.equal(spec.workflowId, "edit-phase-note");
  assert.match(html, /data-wc-drawer-field="summary"/);
  assert.match(html, /data-wc-drawer-field="details"/);
  assert.equal(mod.validateEditPhaseNoteSubmit({ summary: "", details: "x" }).ok, false);
  assert.equal(mod.validateEditPhaseNoteSubmit({ summary: "ok", details: "x" }).ok, true);
});

test("drawer: accept proposed spec has no policy rationale field", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const html = mod.renderDrawerFormHtml(
    mod.buildAcceptProposedDrawerSpec({
      taskIds: ["T1"],
      categoryLabel: "",
      suggestions: [{ label: "Next", phaseKey: "92" }],
      defaultPhaseKey: "92"
    })
  );
  assert.doesNotMatch(html, /data-wc-drawer-field="policyRationale"/);
  assert.doesNotMatch(html, /data-wc-drawer-field="phaseKeyCustom"/);
  assert.match(html, /data-wc-drawer-field="phaseSelect"/);
  assert.match(html, /value="92" selected/);
  assert.match(html, /Accept Proposed Task T1/);
  assert.match(html, /data-wc-drawer-task-count="1"/);
  assert.match(html, />Accept<\/button>/);
  assert.doesNotMatch(html, /run-transition/);
  assert.doesNotMatch(html, /Accept and assign phase/);
});

test("drawer: accept proposed batch uses simplified copy and Accept All label", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const batchOk = mod.validateAcceptProposedSubmit({ phaseSelect: "91", phaseKeyCustom: "" });
  assert.equal(batchOk.ok, true);
  const batchHtml = mod.renderDrawerFormHtml(
    mod.buildAcceptProposedDrawerSpec({
      taskIds: ["T100405", "T100406", "T100407"],
      categoryLabel: "execution",
      suggestions: [{ label: "Phase 100", phaseKey: "100" }],
      defaultPhaseKey: "100"
    })
  );
  assert.match(batchHtml, /Batch accept/);
  assert.match(batchHtml, /Accept 3 Proposed Execution Tasks/);
  assert.match(batchHtml, /data-wc-drawer-task-count="3"/);
  assert.match(batchHtml, /Tasks \(3, execution\): T100405, T100406, T100407/);
  assert.match(batchHtml, /Accept All<\/button>/);
  assert.doesNotMatch(batchHtml, /data-wc-drawer-field="policyRationale"/);
  assert.doesNotMatch(batchHtml, /Enter another phase key/);
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

test("drawer: guidance library identity create + duplicate specs", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const createSpec = mod.buildGuidanceLibraryIdentityDrawerSpec({ mode: "create" });
  assert.equal(createSpec.workflowId, "guidance-library-create");
  const createHtml = mod.renderDrawerFormHtml(createSpec);
  assert.match(createHtml, /data-wc-drawer-field="artifactType"/);
  assert.match(createHtml, /data-wc-drawer-field="artifactId"/);
  assert.match(createHtml, /data-wc-drawer-field="title"/);
  assert.doesNotMatch(createHtml, /contentMarkdown/);
  const badCreate = mod.validateGuidanceLibraryIdentitySubmit("create", {
    artifactType: "playbook",
    artifactId: "cae.bad",
    title: "x"
  });
  assert.equal(badCreate.ok, false);
  const goodCreate = mod.validateGuidanceLibraryIdentitySubmit("create", {
    artifactType: "playbook",
    artifactId: "workspace.example.playbook",
    title: "Example",
    slug: "example"
  });
  assert.equal(goodCreate.ok, true);

  const dupSpec = mod.buildGuidanceLibraryIdentityDrawerSpec({
    mode: "duplicate",
    sourceArtifactId: "cae.playbook.one",
    defaultArtifactId: "workspace.playbook.one.copy"
  });
  assert.equal(dupSpec.workflowId, "guidance-library-duplicate");
  const dupHtml = mod.renderDrawerFormHtml(dupSpec);
  assert.match(dupHtml, /cae\.playbook\.one/);
  assert.doesNotMatch(dupHtml, /data-wc-drawer-field="artifactType"/);
  const goodDup = mod.validateGuidanceLibraryIdentitySubmit("duplicate", {
    artifactId: "workspace.playbook.one.copy",
    title: "",
    slug: ""
  });
  assert.equal(goodDup.ok, true);
});

test("drawer: guidance sidebar ack + registry version specs", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const ack = mod.buildGuidanceAckDrawerSpec({
    traceId: "tr1",
    activationId: "act1",
    defaultActor: "a@b.com"
  });
  assert.match(mod.renderDrawerFormHtml(ack), /data-wc-drawer-field="actor"/);
  assert.equal(mod.validateGuidanceAckSubmit({ actor: "" }).ok, false);
  assert.equal(mod.validateGuidanceAckSubmit({ actor: "x" }).ok, true);

  const reg = mod.buildGuidanceRegistryVersionMutationDrawerSpec({
    command: "cae-activate-registry-version",
    actionLabel: "activate",
    targetSummaryPlain: "Activate v1",
    needsDraftVersionId: false,
    draftVersionDefault: "",
    defaultActor: "op"
  });
  const badR = mod.validateGuidanceRegistryVersionMutationSubmit({ rationale: "", actor: "a" }, false);
  assert.equal(badR.ok, false);
  const goodR = mod.validateGuidanceRegistryVersionMutationSubmit(
    { rationale: "ok", actor: "a" },
    false
  );
  assert.equal(goodR.ok, true);
  const badClone = mod.validateGuidanceRegistryVersionMutationSubmit(
    { rationale: "ok", actor: "a", draftVersionId: " " },
    true
  );
  assert.equal(badClone.ok, false);
});

test("drawer: register team assignment validates task id and policy rationale", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateRegisterTeamAssignmentSubmit({
    executionTaskId: "nope",
    supervisorId: "op",
    workerId: "w",
    policyRationale: "short"
  });
  assert.equal(bad.ok, false);
  const good = mod.validateRegisterTeamAssignmentSubmit({
    executionTaskId: "t701",
    supervisorId: "operator",
    workerId: "tab-2",
    policyRationale: "register for phase 100 delivery"
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.executionTaskId, "T701");
  }
});

test("drawer: register subagent validates id and allowed commands", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateRegisterSubagentSubmit({
    subagentId: "9bad",
    displayName: "X",
    allowedCommands: "",
    policyRationale: "short"
  });
  assert.equal(bad.ok, false);
  const good = mod.validateRegisterSubagentSubmit({
    subagentId: "Reviewer",
    displayName: "Reviewer",
    allowedCommands: "list-tasks, get-task",
    policyRationale: "register reviewer role for dashboard"
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.subagentId, "reviewer");
  }
});

test("drawer: rewind checkpoint requires longer rationale", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const bad = mod.validateRewindCheckpointSubmit({
    force: "",
    policyRationale: "too short"
  });
  assert.equal(bad.ok, false);
  const good = mod.validateRewindCheckpointSubmit({
    force: "yes",
    policyRationale: "operator confirmed destructive rewind for T901"
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.force, "yes");
  }
});

test("drawer: cancel plan artifact confirm is optional-rationale", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const html = mod.renderDrawerFormHtml(
    mod.buildCancelPlanArtifactDrawerSpec({
      planId: "p1",
      planRef: "plan-artifact:p1",
      ideaId: "I001",
      title: "Demo"
    })
  );
  assert.match(html, /Cancel plan/);
  assert.match(html, /Cancelled/);
  const ok = mod.validateCancelPlanArtifactSubmit({ rationale: "not needed" });
  assert.equal(ok.ok, true);
});

test("drawer: delete plan artifact requires elevated policy rationale", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-input-drawer.js");
  const html = mod.renderDrawerFormHtml(
    mod.buildDeletePlanArtifactDrawerSpec({
      planId: "p1",
      planRef: "plan-artifact:p1",
      ideaId: "I001",
      title: "Demo"
    })
  );
  assert.match(html, /Delete plan and idea/);
  assert.match(html, /policyRationale|Policy rationale/);
  const bad = mod.validateDeletePlanArtifactSubmit({ policyRationale: "" });
  assert.equal(bad.ok, false);
  const good = mod.validateDeletePlanArtifactSubmit({
    policyRationale: "remove abandoned test plan and idea from dashboard"
  });
  assert.equal(good.ok, true);
});
