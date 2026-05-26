import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");
const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
const registryPath = path.join(srcDir, "dashboard-section-registry.ts");
const invalidationPath = path.join(srcDir, "dashboard-section-invalidation.ts");

function readSrc(name) {
  return fs.readFileSync(path.join(srcDir, name), "utf8");
}

test("initial overview hydration skips secondary kit commands (T100400 regression)", () => {
  const src = fs.readFileSync(providerPath, "utf8");
  const skipBlock = src.slice(src.indexOf("skipHeavyFetches) {"), src.indexOf("} else if (this.summaryHasCanonicalWorkspacePhase"));
  assert.match(skipBlock, /phaseJournal = undefined/);
  assert.match(skipBlock, /embeddedCaePanelHtml = null/);
  assert.doesNotMatch(skipBlock, /list-phase-notes/);
  assert.doesNotMatch(skipBlock, /get-phase-context/);
  assert.doesNotMatch(skipBlock, /cae-authoring-summary/);
});

test("initial pushUpdate uses overview projection with skipHeavyFetches", () => {
  const resolveBlock = fs.readFileSync(providerPath, "utf8").slice(
    fs.readFileSync(providerPath, "utf8").indexOf("resolveWebviewView(")
  );
  assert.match(resolveBlock, /pushUpdate\(\{ projection: "overview", skipHeavyFetches: true \}\)/);
});

function taskEnginePanelHtml(html) {
  const taskEngineStart = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusStart = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"', taskEngineStart);
  assert.ok(taskEngineStart >= 0 && statusStart > taskEngineStart, "task-engine tab panel expected");
  return html.slice(taskEngineStart, statusStart);
}

function extractUnloadedLazyBucketBodies(panelHtml) {
  return [
    ...panelHtml.matchAll(
      /<div class="wc-lazy-bucket-body" data-wc-lazy-loaded="0">([\s\S]*?)<\/div><\/details>/g
    )
  ].map((match) => match[1]);
}

test("closed lazy queue buckets render placeholders not row HTML (T100400 regression)", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  const taskEnginePanel = taskEnginePanelHtml(html);
  assert.match(taskEnginePanel, /wc-lazy-queue-bucket/);
  assert.match(taskEnginePanel, /data-wc-lazy-loaded="0"/);
  const lazyBodies = extractUnloadedLazyBucketBodies(taskEnginePanel);
  assert.ok(lazyBodies.length >= 3, "expected multiple lazy bucket placeholders");
  for (const body of lazyBodies) {
    assert.match(body, /wc-lazy-bucket-hint/);
    assert.doesNotMatch(body, /data-wc-action="task-detail"/);
    assert.doesNotMatch(body, /data-wc-action="proposed-imp-accept"/);
    assert.doesNotMatch(body, /imp-example/);
    assert.doesNotMatch(body, /T319/);
    assert.doesNotMatch(body, /T099/);
  }
});

test("section registry documents refresh policies for lazy architecture", () => {
  const src = fs.readFileSync(registryPath, "utf8");
  assert.match(src, /refreshPolicy/);
  assert.match(src, /on-tab-activate/);
  assert.match(src, /eager/);
});

test("invalidation module documents mutation to section mapping", () => {
  const src = fs.readFileSync(invalidationPath, "utf8");
  assert.match(src, /DashboardMutationKind/);
  assert.match(src, /task-queue/);
  assert.match(src, /phase-journal/);
});

test("bench script reports overview, queue, full, and secondary paths separately", () => {
  const bench = fs.readFileSync(
    path.join(__dirname, "../../../scripts/bench-dashboard-refresh.mjs"),
    "utf8"
  );
  assert.match(bench, /projection=overview/);
  assert.match(bench, /projection=queue/);
  assert.match(bench, /projection=full/);
  assert.match(bench, /cae-authoring-summary/);
  assert.match(bench, /secondary block/);
});

test("stale section state is wired in webview and provider", () => {
  assert.match(readSrc("dashboard-webview-client.ts"), /wc-dash-section--stale/);
  assert.match(fs.readFileSync(providerPath, "utf8"), /markDashboardSectionStale/);
});
