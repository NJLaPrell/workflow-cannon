import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseAiDocument } from "../dist/modules/documentation/parser.js";
import { validateAiSchema } from "../dist/modules/documentation/validator.js";
import { normalizeDocument } from "../dist/modules/documentation/normalizer.js";
import { renderDocument } from "../dist/modules/documentation/renderer.js";
import { listViewModels, loadViewModel } from "../dist/modules/documentation/view-models.js";

const repoRoot = process.cwd();

test("v2 parser reads keyed records and skips comments", async () => {
  const text = [
    "meta|schema=base.v2|doc=rules|truth=canonical|status=active|profile=core",
    "# comment",
    "",
    "rule|id=R100|level=must|scope=repo|directive=do_the_thing|why=because"
  ].join("\n");
  const records = parseAiDocument(text);
  assert.equal(records.length, 2);
  assert.equal(records[0].type, "meta");
  assert.equal(records[1].kv.id, "R100");
});

test("v2 validator enforces key fields", async () => {
  const text = [
    "meta|schema=base.v2|doc=rules|truth=canonical|status=active|profile=core",
    "ref|id=docs|type=file|target=README.md|status=active",
    "rule|id=R101|level=must|scope=repo|directive=keep_it_clean|why=consistency",
    "check|id=K101|scope=repo|assertion=lint_passes",
    "decision|id=D101|topic=docs|choice=keyed|why=deterministic",
    "example|id=E101|for=R101|kind=good|text=include_why",
    "term|name=v2|definition=keyed_records",
    "command|id=C101|name=generate-document|use=cli|scope=documentation|expectation=single",
    "workflow|id=W101|name=doc_flow|when=on_change|steps=parse,validate|done=tests_green"
  ].join("\n");
  const issues = validateAiSchema(text, { strict: true, workspacePath: repoRoot, expectedDoc: "rules" });
  assert.equal(issues.some((i) => !i.resolved), false);
});

test("normalizer builds indexes and renderer emits deterministic markdown", async () => {
  const text = [
    "meta|schema=base.v2|doc=rules|truth=canonical|status=active|profile=core",
    "ref|id=docs|type=file|target=README.md|status=active",
    "rule|id=R102|level=must|scope=repo|directive=deterministic|why=repeatable",
    "decision|id=D102|topic=format|choice=keyed|why=stable",
    "example|id=E102|for=R102|kind=good|text=always_include_why"
  ].join("\n");
  const normalized = normalizeDocument(parseAiDocument(text));
  assert.equal(normalized.refsById.get("docs")?.target, "README.md");
  assert.equal(normalized.examplesByParent.get("R102")?.length, 1);
  const markdown = renderDocument(normalized, {
    id: "test-view",
    version: 1,
    docType: "rules",
    target: "README.md",
    profile: "core",
    sections: [
      { id: "meta", source: "meta", renderer: "renderMetaSection" },
      { id: "rules", source: "rules", renderer: "renderRuleSection" }
    ]
  });
  assert.ok(markdown.includes("## meta"));
  assert.ok(markdown.includes("R102"));
});

test("view models load from views directory", async () => {
  const files = await listViewModels(repoRoot);
  assert.ok(files.length >= 15);
  const first = await loadViewModel(repoRoot, files[0]);
  assert.ok(first.id.length > 0);
  assert.ok(first.sections.length > 0);
});

test("all 17 .ai docs validate under v2 schema", async () => {
  const files = [
    "PRINCIPLES.md",
    "AGENTS.md",
    "module-build.md",
    "README.md",
    "ARCHITECTURE.md",
    "ROADMAP.md",
    "RELEASING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "TERMS.md",
    "CONFIG.md",
    "runbooks/consumer-cadence.md",
    "runbooks/release-channels.md",
    "runbooks/parity-validation-flow.md",
    "workbooks/task-engine-workbook.md",
    "workbooks/phase2-config-policy-workbook.md",
    "workbooks/transcript-automation-baseline.md"
  ];
  for (const rel of files) {
    if (rel === "CONFIG.md") continue;
    const expectedDoc = rel.startsWith("runbooks/") ? "runbook" : rel.startsWith("workbooks/") ? "workbook" : "rules";
    const body = await readFile(path.join(repoRoot, ".ai", rel), "utf8");
    const issues = validateAiSchema(body, { strict: false, workspacePath: repoRoot, expectedDoc });
    assert.equal(issues.some((i) => !i.resolved), false, `unresolved issues for ${rel}: ${JSON.stringify(issues)}`);
  }
});
