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

test("queuePhasePatchFailed prefers cached queue section patch over light refresh", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('msg?.type === "queuePhasePatchFailed"'),
    providerSrc.indexOf('msg?.type === "loadLazyTerminalBucket"')
  );
  assert.match(block, /cachedSummaryOnly:\s*true/);
  assert.match(block, /patchDashboardSectionsFromSummary\(\["queue"\]/);
  assert.match(block, /refreshController\.request/);
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
