/**
 * Guidance scope builder (phase 75 T1000): product presets → activation scope conditions.
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildGuidanceScopeDraft,
  GUIDANCE_SCOPE_PRESETS,
  serializeGuidanceScopeForActivation,
  guidanceScopeWorkflowChoices
} from "../dist/core/cae/guidance-scope-builder.js";
import { buildEvaluationContext, deriveArgHints } from "../dist/core/cae/evaluation-context-builder.js";
import { BUILTIN_RUN_COMMAND_MANIFEST } from "../dist/contracts/builtin-run-command-manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const activationSchemaPath = path.join(root, "schemas/cae/activation-definition.schema.json");

describe("guidance-scope-builder (T1000)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const activationSchema = JSON.parse(fs.readFileSync(activationSchemaPath, "utf8"));
  const validateCondition = ajv.compile(activationSchema.$defs.scopeCondition);

  /** Every serialized condition validates against `#/$defs/scopeCondition`. */
  function validateScope(conditions) {
    const rows = serializeGuidanceScopeForActivation(conditions);
    for (const row of rows) {
      assert.equal(validateCondition(row), true, `${JSON.stringify(row)}: ${ajv.errorsText(validateCondition.errors)}`);
    }
    return rows;
  }

  it("documents one descriptor per GuidanceScopeDraft preset", () => {
    const draftPresets = new Set([
      "always",
      "workflow",
      "completingTask",
      "phase",
      "task",
      "taskTag",
      "advancedCommand"
    ]);
    const listed = GUIDANCE_SCOPE_PRESETS.map((d) => d.preset);
    assert.deepEqual(new Set(listed), draftPresets);
  });

  it("always emits broad-scope warning + always condition", () => {
    const r = buildGuidanceScopeDraft({ preset: "always" });
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some((w) => w.code === "scope-broad-always"));
    validateScope(r.scope.conditions);
  });

  it("workflow requires a known curated name when whitelist is supplied", () => {
    const bad = buildGuidanceScopeDraft({ preset: "workflow", workflowName: "not-a-real-workflow-ever" }, {
      knownWorkflowNames: ["run-transition"]
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => e.code === "scope-workflow-unknown"));

    const good = buildGuidanceScopeDraft({ preset: "workflow", workflowName: "run-transition" }, {
      knownWorkflowNames: ["run-transition"]
    });
    assert.equal(good.ok, true);
    validateScope(good.scope.conditions);
  });

  it("workflow allows unknown workflow names without a whitelist", () => {
    const r = buildGuidanceScopeDraft({ preset: "workflow", workflowName: "cae-evaluate" });
    assert.equal(r.ok, true);
    validateScope(r.scope.conditions);
  });

  it("completingTask emits run-transition + complete + optional narrows", () => {
    const broad = buildGuidanceScopeDraft({ preset: "completingTask" });
    assert.equal(broad.ok, true);
    assert.ok(broad.warnings.some((w) => w.code === "scope-broad-completing-task"));

    const r = buildGuidanceScopeDraft({
      preset: "completingTask",
      phaseKey: "75",
      taskIdPattern: "^T99[0-9]$"
    });
    assert.equal(r.ok, true);
    const rows = validateScope(r.scope.conditions);
    assert.deepEqual(rows[0], { kind: "commandName", match: "exact", value: "run-transition" });
    assert.deepEqual(rows[1], { kind: "commandArgEquals", path: "action", value: "complete" });
    assert.ok(rows.some((x) => x.kind === "phaseKey" && x.value === "75"));
    assert.ok(rows.some((x) => x.kind === "taskIdPattern"));

    const ambiguous = buildGuidanceScopeDraft({
      preset: "completingTask",
      taskId: "T991",
      taskIdPattern: "^T"
    });
    assert.equal(ambiguous.ok, false);
    assert.ok(ambiguous.errors.some((e) => e.code === "scope-task-ambiguous"));
  });

  it("phase and task presets validate", () => {
    const badPhase = buildGuidanceScopeDraft({ preset: "phase", phaseKey: "x75" });
    assert.equal(badPhase.ok, false);

    const phase = buildGuidanceScopeDraft({ preset: "phase", phaseKey: "75" });
    assert.equal(phase.ok, true);
    validateScope(phase.scope.conditions);

    const task = buildGuidanceScopeDraft({ preset: "task", taskId: "T991" });
    assert.equal(task.ok, true);
    validateScope(task.scope.conditions);

    const pat = buildGuidanceScopeDraft({ preset: "task", taskIdPattern: "T99[01]" });
    assert.equal(pat.ok, true);
    validateScope(pat.scope.conditions);
  });

  it("taskTag preset validates match cardinality and cardinality limits", () => {
    const empty = buildGuidanceScopeDraft({ preset: "taskTag", values: [] });
    assert.equal(empty.ok, false);

    const tags = buildGuidanceScopeDraft({ preset: "taskTag", values: ["a", "b"], match: "all" });
    assert.equal(tags.ok, true);
    validateScope(tags.scope.conditions);
  });

  it("advancedCommand supports optional commandArgEquals", () => {
    const noArg = buildGuidanceScopeDraft({
      preset: "advancedCommand",
      commandName: "wk",
      commandNameMatch: "prefix"
    });
    assert.equal(noArg.ok, true);
    validateScope(noArg.scope.conditions);

    const badPath = buildGuidanceScopeDraft({
      preset: "advancedCommand",
      commandName: "run-transition",
      commandArgPath: "evil..nested",
      commandArgValue: "x"
    });
    assert.equal(badPath.ok, false);

    const withArg = buildGuidanceScopeDraft({
      preset: "advancedCommand",
      commandName: "run-transition",
      commandArgPath: "action",
      commandArgValue: "complete"
    });
    assert.equal(withArg.ok, true);
    validateScope(withArg.scope.conditions);
  });

  it("workflow choices derive from builtin manifest deterministically", () => {
    const choices = guidanceScopeWorkflowChoices(BUILTIN_RUN_COMMAND_MANIFEST);
    assert.ok(choices.length > 10);
    const names = choices.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names, sorted);
  });

  it("deriveArgHints lines up with completingTask commandArgEquals matching", () => {
    const args = JSON.parse(JSON.stringify({ taskId: "T991", action: "complete" }));
    const hints = deriveArgHints(args);
    assert.deepEqual(hints.taskId, "T991");
    assert.deepEqual(hints.action, "complete");

    const ctx = buildEvaluationContext({
      taskRow: { id: "T991", status: "in_progress", phaseKey: "75" },
      command: {
        name: "run-transition",
        moduleId: "task-engine",
        args
      },
      workspace: { currentKitPhase: "75" },
      governance: { policyApprovalRequired: true, approvalTierHint: "A" },
      queue: { readyQueueDepth: 0 }
    });
    assert.equal(ctx.command.argHints?.taskId, "T991");
    assert.equal(ctx.command.argHints?.action, "complete");
  });
});

