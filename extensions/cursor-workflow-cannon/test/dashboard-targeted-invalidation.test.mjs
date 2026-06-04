import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");

test("DashboardViewProvider routes drawer submit through coordinator dispatch", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  const drawerBlock = src.slice(
    src.indexOf('if (msg?.type === "drawerSubmit")'),
    src.indexOf('if (msg?.type === "drawerCancel")')
  );
  assert.match(drawerBlock, /coordinator\.dispatch/);
  assert.doesNotMatch(drawerBlock, /pushUpdate\(\{ light: true \}\)/);
});

test("kit-state-changed uses queue content fingerprint refresh (not wcReplaceRoot)", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  assert.match(src, /onKitStateChangedRefresh/);
  assert.match(src, /patchQueueSectionFromKitState/);
  assert.match(src, /computeQueueContentFingerprint/);
  assert.match(src, /skipped queue \(content unchanged\)/);
});

test("light refresh mode always uses executeLightSectionRefresh", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  assert.match(
    src,
    /if \(lightRefresh\) \{\s*\n\s*await this\.executeLightSectionRefresh\(updateSequence\);/
  );
});

test("manual refresh still uses full pushUpdate reconciliation", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  assert.match(src, /msg\?\.type === "refresh"[\s\S]*projection: "full"/);
  assert.match(src, /skipHeavyFetches: false/);
});

test("wishlist paging invalidates queue section only", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  const block = src.slice(src.indexOf('msg?.type === "wishlistPage"'), src.indexOf('msg?.type === "prefillWishlistChat"'));
  assert.match(block, /applyDashboardMutationInvalidation\("task-queue"\)/);
  assert.doesNotMatch(block, /await this\.pushUpdate\(\)/);
});

test("webview applySectionPatch surfaces stale badge without clearing content", () => {
  const src = fs.readFileSync(path.join(srcDir, "dashboard-webview-client.ts"), "utf8");
  assert.match(src, /wc-dash-section-stale-badge/);
  assert.match(src, /staleBadge\.remove\(\)/);
});

test("light refresh skips unchanged queue section via content fingerprint", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  assert.match(src, /lastQueueContentFingerprint/);
  assert.match(src, /skipped queue \(content unchanged\)/);
});

test("mutation hold skips dashboard kit refresh after root is hydrated", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  assert.match(src, /shouldSkipDashboardKitRefresh/);
  assert.match(src, /markDeferredRefreshNeeded/);
  assert.match(src, /executeDashboardRefresh[\s\S]*shouldSkipDashboardKitRefresh/);
  assert.match(src, /patchDashboardSectionsFromSummary[\s\S]*shouldSkipDashboardKitRefresh/);
});

test("queue section patch preserves lazy bucket bodies when meta matches", () => {
  const src = fs.readFileSync(path.join(srcDir, "dashboard-webview-client.ts"), "utf8");
  assert.match(src, /captureLazyQueueBucketBodies/);
  assert.match(src, /restoreLazyQueueBucketBodies/);
  assert.match(src, /sectionId === 'queue'/);
  assert.match(src, /applyQueueFilters\(root\)/);
  assert.match(src, /applyReplaceRootHtml[\s\S]*preservedQueue/);
  assert.match(src, /captureQueueSectionUiState/);
  assert.match(src, /restoreQueueSectionUiState/);
  assert.match(src, /normalizeBucketTaskIdsAttr/);
  assert.match(src, /__wcRestoringLazyBuckets/);
});

test("lazy queue bucket details expose task id meta for preservation", () => {
  const src = fs.readFileSync(path.join(srcDir, "render-dashboard.ts"), "utf8");
  assert.match(src, /data-wc-bucket-task-ids/);
});
