import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDashboardReadModeBadgeDetail,
  formatDashboardReadModeBadgeLabel
} from "../dist/views/dashboard/dashboard-read-mode-badge.js";
import { renderDashboardReadModeBadgeHtml } from "../dist/views/dashboard/render-dashboard-shell.js";

test("formatDashboardReadModeBadgeLabel covers auto fallback", () => {
  const label = formatDashboardReadModeBadgeLabel({
    configured: "auto",
    active: "cli-polling",
    detail: "Dashboard service unavailable — using CLI polling"
  });
  assert.match(label, /CLI polling/i);
  assert.match(label, /auto/i);
});

test("renderDashboardReadModeBadgeHtml includes data-wc-read-mode-badge", () => {
  const html = renderDashboardReadModeBadgeHtml({
    configured: "service",
    active: "service",
    pollingCadence: "push-safety-net"
  });
  assert.match(html, /data-wc-read-mode-badge/);
  assert.match(html, /Push-driven service/);
});

test("push-driven service badge explains safety-net polling", () => {
  const detail = formatDashboardReadModeBadgeDetail({
    configured: "auto",
    active: "service",
    pollingCadence: "push-safety-net"
  });
  assert.match(detail ?? "", /SSE push updates active/i);
  assert.match(detail ?? "", /safety net/i);
});

test("service mode unavailable preserves detail copy", () => {
  const detail = formatDashboardReadModeBadgeDetail({
    configured: "service",
    active: "cli-polling"
  });
  assert.match(detail ?? "", /not reachable|unavailable/i);
});
