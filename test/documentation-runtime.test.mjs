import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { documentationModule } from "../dist/index.js";

const baseLifecycleContext = () => ({ runtimeVersion: "0.1", workspacePath: "" });

async function createDocFixture(rootDir) {
  const aiRoot = path.join(rootDir, ".ai");
  const humanRoot = path.join(rootDir, "docs", "maintainers");
  const templatesRoot = path.join(rootDir, "src", "modules", "documentation", "templates");
  const instructionsRoot = path.join(rootDir, "src", "modules", "documentation", "instructions");
  const schemasRoot = path.join(rootDir, "src", "modules", "documentation", "schemas");

  await mkdir(aiRoot, { recursive: true });
  await mkdir(humanRoot, { recursive: true });
  await mkdir(templatesRoot, { recursive: true });
  await mkdir(instructionsRoot, { recursive: true });
  await mkdir(schemasRoot, { recursive: true });

  const configContent = [
    "# Documentation Module Config",
    "",
    "- `sources.aiRoot`: canonical AI docs root (default: `/.ai`)",
    "- `sources.humanRoot`: human docs root (default: `docs/maintainers`)",
    "- `sources.templatesRoot`: document template root (default: `src/modules/documentation/templates`)",
    "- `sources.instructionsRoot`: instruction root (default: `src/modules/documentation/instructions`)",
    "- `sources.schemasRoot`: schema root (default: `src/modules/documentation/schemas`)",
    "- `generation.maxValidationAttempts`: maximum validate/retry attempts (default: `3`)",
  ].join("\n");
  await writeFile(path.join(rootDir, "src", "modules", "documentation", "config.md"), configContent);

  return { aiRoot, humanRoot, templatesRoot, instructionsRoot, schemasRoot };
}

function callOnCommand(command, args, ctx) {
  return documentationModule.onCommand(
    { name: command, args },
    ctx
  );
}

// --- Missing documentType ---

test("generate-document fails with missing documentType", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const result = await callOnCommand("document-project", {}, ctx);

  assert.equal(result.ok, false);
  assert.equal(result.code, "generation-failed");
  assert.ok(result.data.evidence.validationIssues.some(
    (i) => i.check === "template-resolution" && i.message.includes("documentType")
  ));
});

// --- Missing template, allowWithoutTemplate=false ---

test("generate-document fails when template is missing and allowWithoutTemplate is false", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const result = await callOnCommand("document-project", {
    documentType: "NONEXISTENT.md",
    options: { dryRun: true, allowWithoutTemplate: false }
  }, ctx);

  assert.equal(result.ok, false);
  assert.ok(result.data.evidence.validationIssues.some(
    (i) => i.check === "template-resolution" && i.message.includes("NONEXISTENT.md")
  ));
  assert.equal(result.data.evidence.attemptsUsed, 0);
});

// --- Missing template, allowWithoutTemplate=true succeeds ---

test("generate-document succeeds without template when allowWithoutTemplate is true", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const result = await callOnCommand("document-project", {
    documentType: "NONEXISTENT.md",
    options: { dryRun: true, allowWithoutTemplate: true, strict: false }
  }, ctx);

  assert.equal(result.ok, true);
  assert.ok(result.data.evidence.validationIssues.some(
    (i) => i.check === "template-resolution" && i.resolved === true
  ));
});

// --- Write boundary escape ---

test("generate-document rejects path-traversal documentType", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const result = await callOnCommand("document-project", {
    documentType: "../../etc/passwd",
    options: { dryRun: true }
  }, ctx);

  assert.equal(result.ok, false);
  assert.ok(result.data.evidence.validationIssues.some(
    (i) => i.check === "write-boundary"
  ));
});

// --- Section coverage failure with template ---

test("generate-document reports section coverage issues for template with sections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const templateContent = [
    "# TEST DOC",
    "",
    "## First Section",
    "",
    "{{{ Generate first section content. }}}",
    "",
    "## Second Section",
    "",
    "{{{ Generate second section content. }}}",
  ].join("\n");
  await writeFile(path.join(templatesRoot, "TEST.md"), templateContent);

  const result = await callOnCommand("document-project", {
    documentType: "TEST.md",
    options: { dryRun: true, strict: false }
  }, ctx);

  assert.equal(result.ok, true);
  const evidence = result.data.evidence;
  assert.ok(evidence.filesRead.length > 0, "Should have read template file");
  assert.ok(evidence.attemptsUsed > 0, "Should have used at least one validation attempt");
  assert.equal(typeof evidence.timestamp, "string");
});

// --- Validate/retry exhaustion ---

test("evidence includes attemptsUsed count after schema validation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const result = await callOnCommand("document-project", {
    documentType: "AGENTS.md",
    options: { dryRun: true, maxValidationAttempts: 1, allowWithoutTemplate: true, strict: false }
  }, ctx);

  assert.equal(result.ok, true);
  assert.ok(result.data.evidence.attemptsUsed >= 1, "attemptsUsed should be at least 1");
});

// --- Evidence completeness ---

test("evidence output includes all required fields for successful generation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(path.join(templatesRoot, "SIMPLE.md"), "# Simple\n\n## Overview\n\nStatic content.\n");

  const result = await callOnCommand("document-project", {
    documentType: "SIMPLE.md",
    options: { dryRun: false, overwrite: true, strict: false }
  }, ctx);

  assert.equal(result.ok, true);
  const ev = result.data.evidence;
  assert.equal(ev.documentType, "SIMPLE.md");
  assert.ok(Array.isArray(ev.filesRead));
  assert.ok(Array.isArray(ev.filesWritten));
  assert.ok(ev.filesWritten.length >= 2, "Should write AI + human output files");
  assert.ok(Array.isArray(ev.validationIssues));
  assert.ok(Array.isArray(ev.conflicts));
  assert.equal(typeof ev.attemptsUsed, "number");
  assert.match(ev.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

// --- Conflict marker detection ---

test("generate-document stops on CONFLICT: marker in output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(
    path.join(templatesRoot, "CONFLICT-TEST.md"),
    "# Conflict Test\n\n## Section\n\nCONFLICT: This should trigger stop.\n"
  );

  const result = await callOnCommand("document-project", {
    documentType: "CONFLICT-TEST.md",
    options: { dryRun: true }
  }, ctx);

  assert.equal(result.ok, false);
  assert.ok(result.data.evidence.conflicts.length > 0, "Should detect conflict");
  assert.equal(result.data.evidence.conflicts[0].severity, "stop");
});

// --- overwrite=false prevents clobber ---

test("generate-document fails with overwrite=false when output exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot, aiRoot, humanRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(path.join(templatesRoot, "EXISTS.md"), "# Exists\n\n## Section\n\nContent.\n");
  await writeFile(path.join(aiRoot, "EXISTS.md"), "existing-ai-content");
  await writeFile(path.join(humanRoot, "EXISTS.md"), "existing-human-content");

  const result = await callOnCommand("document-project", {
    documentType: "EXISTS.md",
    options: { dryRun: false, overwrite: false, strict: false }
  }, ctx);

  assert.equal(result.ok, false);
  assert.ok(result.data.evidence.validationIssues.some(
    (i) => i.check === "write-boundary" && i.message.includes("overwrite")
  ));
});

// --- Unsupported command name ---

test("documentation module rejects unsupported command names", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const result = await callOnCommand("not-a-real-command", {}, ctx);

  assert.equal(result.ok, false);
  assert.equal(result.code, "unsupported-command");
});
