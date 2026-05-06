import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyResponseTemplateApplication,
  mergeAgentPresentationTemplateHints,
  parseTemplateDirectiveFromText,
  truncateTemplateWarning,
  MAX_TEMPLATE_WARNING_LENGTH
} from "../dist/index.js";
import { runCli } from "../dist/cli.js";

async function tmpWs() {
  return mkdtemp(path.join(os.tmpdir(), "wk-phase6b-"));
}

test("Phase6b: plain-English directive resolves COMPLETED_TASK", () => {
  const r = parseTemplateDirectiveFromText('Use the COMPLETED_TASK template for output.');
  assert.equal(r.templateId, "COMPLETED_TASK");
  assert.equal(r.warnings.length, 0);
});

test("Phase6b: multiple template phrases are ambiguous", () => {
  const r = parseTemplateDirectiveFromText('Use the compact template and template: default');
  assert.ok(r.templateId);
  assert.ok(r.warnings.length >= 1);
});

test("Phase6b: truncateTemplateWarning enforces length cap", () => {
  const long = "x".repeat(200);
  const t = truncateTemplateWarning(long);
  assert.ok(t.length <= MAX_TEMPLATE_WARNING_LENGTH);
});

test("Phase6b: run JSON includes responseTemplate for list-tasks", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const cap = { lines: [], errors: [], writeLine: (m) => cap.lines.push(m), writeError: (m) => cap.errors.push(m) };
  const code = await runCli(["run", "list-tasks", "{}"], { cwd: workspacePath, ...cap });
  assert.equal(code, 0, cap.errors.join("\n"));
  const out = JSON.parse(cap.lines.join(""));
  assert.equal(out.ok, true);
  assert.ok(out.responseTemplate);
  assert.equal(out.responseTemplate.enforcementMode, "advisory");
  assert.ok(typeof out.responseTemplate.appliedTemplateId === "string");
});

test("Phase6b: template presentation preserves command-specific phase rollover projection", () => {
  const shaped = applyResponseTemplateApplication(
    "set-current-phase",
    { currentKitPhase: "72", expectedWorkspaceRevision: 0 },
    {
      ok: true,
      code: "set-current-phase-updated",
      data: {
        dryRun: false,
        presentation: {
          phaseRollover: {
            schemaVersion: 1,
            kind: "phase_rollover_v1",
            workspaceRevisionBefore: 0,
            workspaceRevisionAfter: 1
          }
        }
      }
    },
    {}
  );

  assert.equal(shaped.data.presentation.templateId, "phase_ship");
  assert.equal(shaped.data.presentation.phaseRollover.kind, "phase_rollover_v1");
  assert.equal(shaped.data.presentation.phaseRollover.workspaceRevisionAfter, 1);
});

test("Phase80: response templates project resolved agent presentation as metadata only", () => {
  const shaped = applyResponseTemplateApplication(
    "resolve-agent-guidance",
    {},
    {
      ok: true,
      code: "agent-guidance-resolved",
      data: {
        schemaVersion: 1,
        tier: 4,
        displayLabel: "Wizard",
        agentPresentation: {
          schemaVersion: 1,
          mode: "derived",
          workLog: "frequent",
          rationale: "technical",
          technicality: "technical",
          finalAnswerDetail: "detailed",
          privateReasoning: "never_disclose",
          agentInstruction: "private full instruction should not be duplicated"
        }
      }
    },
    {}
  );

  assert.equal(shaped.ok, true);
  assert.equal(shaped.data.presentation.agentPresentation.schemaVersion, 1);
  assert.equal(shaped.data.presentation.agentPresentation.workLog, "frequent");
  assert.equal(shaped.data.presentation.agentPresentation.primaryInstructionSource, "generated_cursor_rule");
  assert.equal(shaped.data.presentation.agentPresentation.responseTemplateRole, "output_metadata_only");
  assert.equal(shaped.data.presentation.agentPresentation.privateReasoning, "never_disclose");
  assert.equal(shaped.data.presentation.agentPresentation.agentInstruction, undefined);
});

test("Phase80: response template presentation hints coexist with CAE hints and explicit template id", () => {
  const shaped = applyResponseTemplateApplication(
    "dashboard-summary",
    { responseTemplateId: "compact" },
    {
      ok: true,
      code: "dashboard-summary",
      data: {
        agentGuidance: {
          agentPresentation: {
            schemaVersion: 1,
            mode: "derived",
            workLog: "normal",
            rationale: "simple",
            technicality: "balanced",
            finalAnswerDetail: "normal",
            privateReasoning: "never_disclose"
          }
        },
        cae: { traceId: "cae.trace.123", evalMode: "shadow", degraded: false }
      }
    },
    {}
  );

  assert.equal(shaped.responseTemplate.appliedTemplateId, "compact");
  assert.equal(shaped.data.presentation.agentPresentation.kind, "agent_presentation_policy_v1");
  assert.equal(shaped.data.presentation.cae.kind, "shadow_preflight_v1");
  assert.equal(shaped.data.presentation.cae.traceId, "cae.trace.123");
});

test("Phase80: response template helper ignores outputs without resolved presentation policy", () => {
  assert.deepEqual(mergeAgentPresentationTemplateHints({ rows: [] }), {});
});

test("Phase6b: strict mode fails on unknown defaultTemplateId", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        responseTemplates: {
          enforcementMode: "strict",
          defaultTemplateId: "not-a-real-template-id",
          commandOverrides: {}
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const cap = { lines: [], errors: [], writeLine: (m) => cap.lines.push(m), writeError: (m) => cap.errors.push(m) };
  // Use a command with no builtin manifest defaultResponseTemplateId so resolution reaches config defaultTemplateId.
  const code = await runCli(["run", "list-behavior-profiles", "{}"], { cwd: workspacePath, ...cap });
  assert.equal(code, 1);
  const out = JSON.parse(cap.lines.join(""));
  assert.equal(out.ok, false);
  assert.equal(out.code, "response-template-invalid");
  assert.ok(
    String(out.message).includes("defaultTemplateId"),
    `expected defaultTemplateId in message: ${out.message}`
  );
});

test("Phase6b: strict mode fails on explicit template id vs instruction directive conflict", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        responseTemplates: {
          enforcementMode: "strict",
          defaultTemplateId: "default",
          commandOverrides: {}
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const args = JSON.stringify({
    responseTemplateId: "compact",
    instruction: "Use the COMPLETED_TASK template for output."
  });
  const cap = { lines: [], errors: [], writeLine: (m) => cap.lines.push(m), writeError: (m) => cap.errors.push(m) };
  const code = await runCli(["run", "list-tasks", args], { cwd: workspacePath, ...cap });
  assert.equal(code, 1);
  const out = JSON.parse(cap.lines.join(""));
  assert.equal(out.ok, false);
  assert.equal(out.code, "response-template-conflict");
  assert.ok(String(out.message).includes("`instruction`"), `expected field name in message: ${out.message}`);
  assert.ok(String(out.message).includes("Advisory mode"), `expected advisory hint: ${out.message}`);
});

test("Phase6b: strict mode fails on unknown explicit template id", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        responseTemplates: {
          enforcementMode: "strict",
          defaultTemplateId: "default",
          commandOverrides: {}
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const args = JSON.stringify({ responseTemplateId: "no-such-template-xyz" });
  const cap = { lines: [], errors: [], writeLine: (m) => cap.lines.push(m), writeError: (m) => cap.errors.push(m) };
  const code = await runCli(["run", "list-tasks", args], { cwd: workspacePath, ...cap });
  assert.equal(code, 1);
  const out = JSON.parse(cap.lines.join(""));
  assert.equal(out.ok, false);
  assert.equal(out.code, "response-template-invalid");
  assert.ok(
    String(out.message).includes("responseTemplateId"),
    `expected resolution source in message: ${out.message}`
  );
});
