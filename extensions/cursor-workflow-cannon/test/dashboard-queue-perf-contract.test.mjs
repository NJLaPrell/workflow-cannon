import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);
const webviewSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/dashboard-webview-client.ts"),
  "utf8"
);

test("queuePhasePatchFailed prefers cached queue section patch over light refresh when rollups hydrated", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('msg?.type === "queuePhasePatchFailed"'),
    providerSrc.indexOf('msg?.type === "loadLazyTerminalBucket"')
  );
  assert.match(block, /dashboardSummaryNeedsQueueRollupHydration/);
  assert.match(block, /cachedSummaryOnly:\s*true/);
  assert.match(block, /patchDashboardSectionsFromSummary\(\["queue"\]/);
  assert.match(block, /refreshController\.request/);
});

test("patchDashboardSectionsFromSummary skips cachedSummaryOnly when still on overview stub", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("if (options?.cachedSummaryOnly === true)"),
    providerSrc.indexOf('raw = { ok: true, data: cached, code: "dashboard-summary-cached" }')
  );
  assert.match(block, /dashboardSummaryNeedsQueueRollupHydration\(cached\)/);
  assert.match(block, /skipping cache-only patch/);
});

test("kit-state refresh on overview upgrades queue rollups before patching", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (this.activeDashboardTab === "overview"'),
    providerSrc.indexOf('if (this.activeDashboardTab === "planning")')
  );
  assert.match(block, /dashboardSummaryNeedsQueueRollupHydration/);
  assert.match(block, /ensureQueueRollupsHydrated/);
});

test("startup schedules planning hydration for eager planning cards", () => {
  assert.match(providerSrc, /startup planning hydration scheduled/);
  assert.match(providerSrc, /void this\.ensurePlanningSectionsHydrated/);
  assert.match(providerSrc, /dashboardSummaryNeedsPlanningHydration/);
});

test("planning kit-state refresh uses queue projection", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (this.activeDashboardTab === "planning")'),
    providerSrc.indexOf('await this.markDashboardSectionStale("queue")')
  );
  assert.match(block, /projection:\s*"queue"/);
});

test("postTaskEngineTabBadgesFromSummary includes humanGateCount", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async postTaskEngineTabBadgesFromSummary"),
    providerSrc.indexOf("private async executeLightSectionRefresh")
  );
  assert.match(block, /humanGatesSummary/);
  assert.match(block, /humanGateCount/);
  assert.match(block, /type:\s*"wcUpdateTabBadges"/);
});

test("webview wcUpdateTabBadges updates human gate chrome", () => {
  assert.match(webviewSrc, /function updateHumanGateCountChrome/);
  assert.match(webviewSrc, /wc-filter-chip-human-gates/);
  assert.match(webviewSrc, /wc-pill-human/);
  assert.match(webviewSrc, /updateTaskEngineTabBadges\(m\.readyCount, m\.blockedCount, m\.humanGateCount\)/);
});

test("phase roster deliverables path does not record activity", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async onUpdatePhaseDeliverables"),
    providerSrc.indexOf("private async closeDashboardDrawer")
  );
  assert.doesNotMatch(block, /recordActivity/);
  assert.doesNotMatch(block, /clearActivity/);
});

test("mark phase complete path does not record activity before ingest", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async onMarkPhaseComplete"),
    providerSrc.indexOf("private async onUpdatePhaseDeliverables")
  );
  assert.doesNotMatch(block, /recordActivity/);
});

test("lazy bucket phase move opens collapsed bucket and marks loaded for row insert", () => {
  assert.match(webviewSrc, /if \(!toBucket\.hasAttribute\('open'\)\)/);
  assert.match(webviewSrc, /body\.setAttribute\('data-wc-lazy-loaded', '1'\)/);
});
