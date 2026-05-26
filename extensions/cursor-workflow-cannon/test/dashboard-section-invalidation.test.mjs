import test from "node:test";
import assert from "node:assert/strict";

import {
  dashboardSectionsForMutation,
  extractDashboardSectionInnerHtml
} from "../dist/views/dashboard/dashboard-section-invalidation.js";

test("dashboardSectionsForMutation maps task-queue to queue and overview", () => {
  assert.deepEqual(dashboardSectionsForMutation("task-queue"), ["queue", "overview"]);
  assert.deepEqual(dashboardSectionsForMutation("phase-journal"), ["phase-journal", "queue"]);
});

test("extractDashboardSectionInnerHtml pulls nested section content", () => {
  const html =
    '<div class="wc-dashboard-tab-shell">' +
    '<div data-wc-section="overview" class="wc-dash-section wc-dash-section--ready">' +
    '<div class="inner"><span>Hello</span></div>' +
    "</div>" +
    '<div data-wc-section="queue" class="wc-dash-section wc-dash-section--ready">' +
    "<p>Queue</p></div></div>";
  const overview = extractDashboardSectionInnerHtml(html, "overview");
  assert.match(overview ?? "", /Hello/);
  assert.match(extractDashboardSectionInnerHtml(html, "queue") ?? "", /Queue/);
});
