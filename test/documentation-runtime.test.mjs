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

  const result = await callOnCommand("generate-document", {}, ctx);

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

  const result = await callOnCommand("generate-document", {
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

  const result = await callOnCommand("generate-document", {
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

  const result = await callOnCommand("generate-document", {
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

  const result = await callOnCommand("generate-document", {
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

  const result = await callOnCommand("generate-document", {
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

  const result = await callOnCommand("generate-document", {
    documentType: "SIMPLE.md",
    options: { dryRun: false, overwrite: true, strict: false }
  }, ctx);

  assert.equal(result.ok, true);
  const ev = result.data.evidence;
  assert.equal(ev.documentType, "SIMPLE.md");
  assert.ok(Array.isArray(ev.filesRead));
  assert.ok(Array.isArray(ev.filesWritten));
  assert.ok(ev.filesWritten.length >= 2, "Should write AI + human output files");
  assert.ok(Array.isArray(ev.filesSkipped));
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

  const result = await callOnCommand("generate-document", {
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

  const result = await callOnCommand("generate-document", {
    documentType: "EXISTS.md",
    options: { dryRun: false, overwrite: false, strict: false }
  }, ctx);

  assert.equal(result.ok, false);
  assert.ok(result.data.evidence.validationIssues.some(
    (i) => i.check === "write-boundary" && i.message.includes("overwrite")
  ));
});

// --- Batch document-project ---

test("document-project generates all templates in batch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(path.join(templatesRoot, "A.md"), "# A\n\n## Section\n\nContent.\n");
  await writeFile(path.join(templatesRoot, "B.md"), "# B\n\n## Section\n\nContent.\n");

  const result = await callOnCommand("document-project", {
    options: { dryRun: true }
  }, ctx);

  assert.equal(result.ok, true);
  assert.equal(result.code, "documented-project");
  assert.ok(result.data.summary.total >= 2, "Should process at least 2 templates");
  assert.equal(result.data.summary.failed, 0);
});

test("document-project discovers nested templates and preserves relative output paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot, aiRoot, humanRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await mkdir(path.join(templatesRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(templatesRoot, "runbooks", "NESTED.md"),
    "# Nested\n\n## Section\n\nContent.\n"
  );

  const result = await callOnCommand("document-project", {
    options: { dryRun: false, strict: false }
  }, ctx);

  assert.equal(result.ok, true);
  assert.ok(
    result.data.results.some((r) => r.documentType === "runbooks/NESTED.md"),
    "Should include nested template in batch results"
  );
  assert.ok(
    result.data.results.some((r) =>
      r.filesWritten.some((f) => f === path.join(aiRoot, "runbooks", "NESTED.md"))
    ),
    "Should write nested AI output path"
  );
  assert.ok(
    result.data.results.some((r) =>
      r.filesWritten.some((f) => f === path.join(humanRoot, "runbooks", "NESTED.md"))
    ),
    "Should write nested human output path"
  );
});

test("schema validator accepts active runbook AI docs in strict mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-schema-"));
  const { templatesRoot, aiRoot, humanRoot, schemasRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  // Ensure referenced docs exist for `ref` validation.
  const releasingPath = path.join(humanRoot, "RELEASING.md");
  await writeFile(releasingPath, "# Releasing\n", "utf8");

  // Provide a minimal template with at least one required heading.
  await mkdir(path.join(templatesRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(templatesRoot, "runbooks", "GOOD.md"),
    "# Good\n\n## Overview\n\nStatic.\n",
    "utf8"
  );

  // Craft an active runbook AI doc.
  await mkdir(path.join(aiRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(aiRoot, "runbooks", "GOOD.md"),
    [
      "meta|v=1|doc=runbook|truth=canonical|st=active",
      "runbook|name=parity_validation_flow|scope=release_readiness|owner=maintainers",
      "ref|name=releasing|path=docs/maintainers/RELEASING.md",
      "rule|R001|must|parity_flow|run_parity_commands_in_fixed_order_and_stop_on_first_non_zero_exit|st=active",
      "chain|step=1|command=pnpm run build|expect_exit=0",
    ].join("\n"),
    "utf8"
  );

  // Provide a minimal schema file to satisfy existence expectations if added later.
  await mkdir(schemasRoot, { recursive: true });

  const result = await callOnCommand(
    "generate-document",
    {
      documentType: "runbooks/GOOD.md",
      options: { dryRun: true, overwriteAi: false, strict: true, allowWithoutTemplate: false }
    },
    ctx
  );

  assert.equal(result.ok, true);
});

test("schema validator rejects active runbook AI docs missing required rule/chain in strict mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-schema-"));
  const { templatesRoot, aiRoot, humanRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await mkdir(path.join(templatesRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(templatesRoot, "runbooks", "MISSING_REQUIRED.md"),
    "# Missing\n\n## Overview\n\nStatic.\n",
    "utf8"
  );

  await mkdir(path.join(aiRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(aiRoot, "runbooks", "MISSING_REQUIRED.md"),
    [
      "meta|v=1|doc=runbook|truth=canonical|st=active",
      "runbook|name=bad|scope=release_readiness|owner=maintainers",
      "ref|name=releasing|path=docs/maintainers/RELEASING.md"
    ].join("\n"),
    "utf8"
  );

  // referenced doc exists
  await writeFile(path.join(humanRoot, "RELEASING.md"), "# Releasing\n", "utf8");

  const result = await callOnCommand(
    "generate-document",
    {
      documentType: "runbooks/MISSING_REQUIRED.md",
      options: { dryRun: true, overwriteAi: false, strict: true }
    },
    ctx
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.data.evidence.validationIssues.some((i) => i.check === "schema"),
    "Expected schema validation failure"
  );
});

test("schema validator enforces ref.path existence by strictness tier", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-schema-"));
  const { templatesRoot, aiRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await mkdir(path.join(templatesRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(templatesRoot, "runbooks", "BAD_REF.md"),
    "# Bad Ref\n\n## Overview\n\nStatic.\n",
    "utf8"
  );

  await mkdir(path.join(aiRoot, "runbooks"), { recursive: true });
  await writeFile(
    path.join(aiRoot, "runbooks", "BAD_REF.md"),
    [
      "meta|v=1|doc=runbook|truth=canonical|st=active",
      "runbook|name=bad|scope=release_readiness|owner=maintainers",
      "ref|name=releasing|path=docs/maintainers/DOES_NOT_EXIST.md",
      "rule|R001|must|parity_flow|run_parity_commands_in_fixed_order_and_stop_on_first_non_zero_exit|st=active"
    ].join("\n"),
    "utf8"
  );

  const strictResult = await callOnCommand(
    "generate-document",
    {
      documentType: "runbooks/BAD_REF.md",
      options: { dryRun: true, overwriteAi: false, strict: true }
    },
    ctx
  );
  assert.equal(strictResult.ok, false);

  const advisoryResult = await callOnCommand(
    "generate-document",
    {
      documentType: "runbooks/BAD_REF.md",
      options: { dryRun: true, overwriteAi: false, strict: false }
    },
    ctx
  );
  assert.equal(advisoryResult.ok, true);
});

test("path-aware meta.doc defaults classify nested templates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-meta-"));
  const { templatesRoot, aiRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await mkdir(path.join(templatesRoot, "workbooks"), { recursive: true });
  await writeFile(
    path.join(templatesRoot, "workbooks", "META.md"),
    "# Meta\n\n## Overview\n\nStatic.\n",
    "utf8"
  );

  const result = await callOnCommand(
    "generate-document",
    {
      documentType: "workbooks/META.md",
      options: { dryRun: false, overwriteAi: true, strict: true }
    },
    ctx
  );
  assert.equal(result.ok, true);

  const generatedAi = await (await import("node:fs/promises")).readFile(
    path.join(aiRoot, "workbooks", "META.md"),
    "utf8"
  );
  assert.match(generatedAi, /^meta\|v=1\|doc=workbook\|truth=canonical\|st=draft/m);
});

test("document-project continues on individual failure and reports batch outcome", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(path.join(templatesRoot, "GOOD.md"), "# Good\n\n## Section\n\nContent.\n");
  await writeFile(path.join(templatesRoot, "BAD.md"), "# Bad\n\n## Section\n\nCONFLICT: this breaks.\n");

  const result = await callOnCommand("document-project", {
    options: { dryRun: true }
  }, ctx);

  assert.equal(result.ok, false);
  assert.equal(result.code, "documentation-batch-failed");
  assert.ok(result.data.summary.failed >= 1, "Should report at least one failure");
  assert.ok(result.data.summary.total >= 2, "Should still process all templates");
});

test("document-project preserves AI docs but overwrites human docs by default", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-"));
  const { templatesRoot, aiRoot, humanRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(path.join(templatesRoot, "KEEP.md"), "# Keep\n\n## Section\n\nContent.\n");
  await writeFile(path.join(aiRoot, "KEEP.md"), "original-ai-content");
  await writeFile(path.join(humanRoot, "KEEP.md"), "original-human-content");

  const result = await callOnCommand("document-project", {
    options: { dryRun: false }
  }, ctx);

  assert.equal(result.ok, true);
  const keepResult = result.data.results.find((r) => r.documentType === "KEEP.md");
  assert.ok(keepResult, "Should have result for KEEP.md");
  assert.ok(
    keepResult.filesWritten.some((f) => f.includes("docs") || f.includes("maintainers")),
    "Should have written human doc"
  );
  assert.ok(
    !keepResult.filesWritten.some((f) => f.includes(".ai")),
    "Should NOT have overwritten AI doc"
  );
  assert.ok(
    keepResult.filesSkipped.some((f) => f.includes(".ai")),
    "Should report AI doc as skipped"
  );
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

test("buildRepoRootReadmeFromMaintainerBody rewrites maintainer README for repo root", async () => {
  const { buildRepoRootReadmeFromMaintainerBody } = await import(
    "../dist/modules/documentation/runtime-render-support.js"
  );
  const maint = [
    "<!-- note -->",
    "",
    '<img src="../title_image.png" />',
    "",
    "See [road](ROADMAP.md) and [agents](../../AGENTS.md) and [play](playbooks/p.md).",
    ""
  ].join("\n");
  const root = buildRepoRootReadmeFromMaintainerBody(maint);
  assert.match(root, /^AI agents:/);
  assert.ok(root.includes('src="title_image.png"'));
  assert.ok(root.includes("](docs/maintainers/ROADMAP.md)"));
  assert.ok(root.includes("](AGENTS.md)"));
  assert.ok(root.includes("](docs/maintainers/playbooks/p.md)"));
});

test("generate-document writes repo root README.md for README documentType", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-readme-root-"));
  const { templatesRoot, aiRoot, humanRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  const templateContent = [
    "<!-- t -->",
    "",
    "## Overview",
    "",
    '<div><img src="../title_image.png" alt="x" /></div>',
    "",
    "## Chat",
    "",
    "<!--DOC_MODULE:CHAT_FEATURES-->",
    "",
    "## Policy",
    "",
    "Guide [ROADMAP.md](ROADMAP.md).",
    ""
  ].join("\n");
  await writeFile(path.join(templatesRoot, "README.md"), templateContent);

  const aiReadme = [
    "meta|v=1|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core",
    "project|name=t|type=project_readme|scope=onboarding",
    "chat_feature|id=CFX|title=T|summary=S|steps=a>b",
    ""
  ].join("\n");
  await writeFile(path.join(aiRoot, "README.md"), aiReadme, "utf8");

  const result = await callOnCommand(
    "generate-document",
    {
      documentType: "README.md",
      options: { dryRun: false, overwrite: true, strict: false, overwriteAi: false }
    },
    ctx
  );

  assert.equal(result.ok, true);
  const rootReadme = path.join(root, "README.md");
  assert.ok(
    result.data.evidence.filesWritten.includes(rootReadme),
    "expected repo root README in filesWritten"
  );
  const disk = await (await import("node:fs/promises")).readFile(rootReadme, "utf8");
  assert.ok(disk.includes('src="title_image.png"'));
  assert.ok(disk.startsWith("AI agents:"));
});

test("generate-document dryRun does not write repo root README.md", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wc-doc-rt-readme-dry-"));
  const { templatesRoot, aiRoot } = await createDocFixture(root);
  const ctx = { ...baseLifecycleContext(), workspacePath: root };

  await writeFile(
    path.join(templatesRoot, "README.md"),
    "## Overview\n\n<img src=\"../title_image.png\" />\n\n## Chat\n\n<!--DOC_MODULE:CHAT_FEATURES-->\n\n## Policy\n\nx\n",
    "utf8"
  );
  await writeFile(
    path.join(aiRoot, "README.md"),
    "meta|v=1|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core\nproject|name=t|type=project_readme|scope=onboarding\nchat_feature|id=CFX|title=T|summary=S|steps=a\n",
    "utf8"
  );
  await writeFile(path.join(root, "README.md"), "keep-me", "utf8");

  const result = await callOnCommand(
    "generate-document",
    {
      documentType: "README.md",
      options: { dryRun: true, strict: false, overwriteAi: false }
    },
    ctx
  );

  assert.equal(result.ok, true);
  assert.ok(!result.data.evidence.filesWritten.includes(path.join(root, "README.md")));
  const disk = await (await import("node:fs/promises")).readFile(path.join(root, "README.md"), "utf8");
  assert.equal(disk, "keep-me");
});
