import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");

test("DashboardViewProvider uses targeted invalidation instead of light pushUpdate after drawer submit", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  const drawerBlock = src.slice(src.indexOf("if (refreshed)"), src.indexOf("if (msg?.type === \"drawerCancel\")"));
  assert.match(drawerBlock, /applyDashboardMutationInvalidation\("task-queue"\)/);
  assert.doesNotMatch(drawerBlock, /pushUpdate\(\{ light: true \}\)/);
});

test("kit-state-changed schedules light section refresh", () => {
  const src = fs.readFileSync(path.join(srcDir, "DashboardViewProvider.ts"), "utf8");
  assert.match(src, /kit-state-changed[\s\S]*mode: "light"/);
  assert.match(src, /executeLightSectionRefresh/);
  assert.match(src, /markDashboardSectionStale/);
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
