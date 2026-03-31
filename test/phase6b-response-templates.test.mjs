import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
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
});
