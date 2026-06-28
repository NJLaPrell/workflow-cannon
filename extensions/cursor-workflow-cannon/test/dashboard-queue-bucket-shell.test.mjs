import test from "node:test";
import assert from "node:assert/strict";
import { buildLazyQueueBucketShellHtml } from "../dist/views/dashboard/dashboard-queue-bucket-shell.js";

test("buildLazyQueueBucketShellHtml renders open lazy bucket with preloaded rows", () => {
  const html = buildLazyQueueBucketShellHtml({
    category: "ready",
    phaseKey: "141",
    count: 1,
    taskIds: ["T100744"],
    preloadRowHtml: '<div class="dash-row-list"><div class="dash-row">T100744</div></div>',
    openByDefault: true
  });
  assert.match(html, /details[^>]* open/);
  assert.match(html, /data-wc-queue-category="ready"/);
  assert.match(html, /data-wc-phase-key="141"/);
  assert.match(html, /data-wc-lazy-loaded="1"/);
  assert.match(html, /T100744/);
});

test("buildLazyQueueBucketShellHtml supports backlog bucket", () => {
  const html = buildLazyQueueBucketShellHtml({
    category: "ready",
    phaseKey: null,
    count: 2,
    taskIds: ["T1", "T2"]
  });
  assert.match(html, /data-wc-phase-bucket="__no_phase__"/);
  assert.match(html, /Not phased/);
});
