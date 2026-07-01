import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDashboardReadModeBadgeDetail,
  formatDashboardReadModeBadgeLabel,
  getDashboardReadModeState
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

// ── New tests for three distinct observable states (requirement d) ──────────

test("(d) getDashboardReadModeState: push-zero-cli when service active and no retries", () => {
  const state = getDashboardReadModeState({
    configured: "auto",
    active: "service",
    pollingCadence: "push-safety-net",
    serviceRetrySliceCount: 0
  });
  assert.equal(state, "push-zero-cli");
});

test("(d) getDashboardReadModeState: push-retry when service active with N slices retrying", () => {
  const state = getDashboardReadModeState({
    configured: "auto",
    active: "service",
    pollingCadence: "push-safety-net",
    serviceRetrySliceCount: 2
  });
  assert.equal(state, "push-retry");
});

test("(d) getDashboardReadModeState: cli-polling when active path is cli-polling", () => {
  const state = getDashboardReadModeState({
    configured: "auto",
    active: "cli-polling",
    pollingCadence: "full"
  });
  assert.equal(state, "cli-polling");
});

test("(d) formatDashboardReadModeBadgeLabel: distinct labels for three states", () => {
  const labelZero = formatDashboardReadModeBadgeLabel({
    configured: "auto",
    active: "service",
    pollingCadence: "push-safety-net",
    serviceRetrySliceCount: 0
  });
  assert.match(labelZero, /push-driven service/i);
  assert.doesNotMatch(labelZero, /retry/i);

  const labelRetry = formatDashboardReadModeBadgeLabel({
    configured: "auto",
    active: "service",
    pollingCadence: "push-safety-net",
    serviceRetrySliceCount: 3
  });
  assert.match(labelRetry, /push-driven service/i);
  assert.match(labelRetry, /retry/i);
  assert.match(labelRetry, /3/);

  const labelCli = formatDashboardReadModeBadgeLabel({
    configured: "auto",
    active: "cli-polling",
    pollingCadence: "full"
  });
  assert.match(labelCli, /CLI polling/i);
});

test("(d) formatDashboardReadModeBadgeDetail: detail explains push-zero-cli state", () => {
  const detail = formatDashboardReadModeBadgeDetail({
    configured: "auto",
    active: "service",
    pollingCadence: "push-safety-net",
    serviceRetrySliceCount: 0
  });
  assert.match(detail ?? "", /0 CLI reads/i);
});

test("(d) formatDashboardReadModeBadgeDetail: detail explains push-retry state", () => {
  const detail = formatDashboardReadModeBadgeDetail({
    configured: "service",
    active: "service",
    pollingCadence: "push-safety-net",
    serviceRetrySliceCount: 2
  });
  assert.match(detail ?? "", /2 slice\(s\)/i);
  assert.match(detail ?? "", /targeted service refresh/i);
  assert.match(detail ?? "", /CLI is a final fallback/i);
});
