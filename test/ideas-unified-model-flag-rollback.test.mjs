/**
 * T100795 / T100869 — IDEAS_UNIFIED_MODEL_ENABLED dashboard gating, kill-switch, and degraded schema loader tests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clearIdeaPlanStateSchemaCache,
  loadIdeaPlanStateSchema
} from "../dist/modules/planning/idea-plan/idea-plan-state-schema-loader.js";
import { isDegradedAgentDirective } from "../dist/modules/planning/idea-plan/idea-plan-types.js";
import {
  isIdeasUnifiedModelEnabled,
  resolveIdeasUnifiedModelEnabled
} from "../dist/modules/planning/idea-plan/ideas-unified-model-feature-flag.js";
import { renderDashboardRootInnerHtml } from "../extensions/cursor-workflow-cannon/dist/views/dashboard/render-dashboard.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("isIdeasUnifiedModelEnabled defaults true without env", () => {
  const previous = process.env.IDEAS_UNIFIED_MODEL_ENABLED;
  delete process.env.IDEAS_UNIFIED_MODEL_ENABLED;
  try {
    assert.deepEqual(resolveIdeasUnifiedModelEnabled(), { enabled: true, source: "default" });
    assert.equal(isIdeasUnifiedModelEnabled(), true);
    assert.equal(isIdeasUnifiedModelEnabled(true), true);
    assert.equal(isIdeasUnifiedModelEnabled(false), false);
  } finally {
    if (previous === undefined) {
      delete process.env.IDEAS_UNIFIED_MODEL_ENABLED;
    } else {
      process.env.IDEAS_UNIFIED_MODEL_ENABLED = previous;
    }
  }
});

test("isIdeasUnifiedModelEnabled env kill-switch disables unified UI", () => {
  const previous = process.env.IDEAS_UNIFIED_MODEL_ENABLED;
  process.env.IDEAS_UNIFIED_MODEL_ENABLED = "0";
  try {
    assert.deepEqual(resolveIdeasUnifiedModelEnabled(), { enabled: false, source: "env" });
    assert.equal(isIdeasUnifiedModelEnabled(), false);
  } finally {
    if (previous === undefined) {
      delete process.env.IDEAS_UNIFIED_MODEL_ENABLED;
    } else {
      process.env.IDEAS_UNIFIED_MODEL_ENABLED = previous;
    }
  }
});

test("isIdeasUnifiedModelEnabled reads env when set to enable", () => {
  const previous = process.env.IDEAS_UNIFIED_MODEL_ENABLED;
  process.env.IDEAS_UNIFIED_MODEL_ENABLED = "1";
  try {
    assert.equal(isIdeasUnifiedModelEnabled(), true);
  } finally {
    if (previous === undefined) {
      delete process.env.IDEAS_UNIFIED_MODEL_ENABLED;
    } else {
      process.env.IDEAS_UNIFIED_MODEL_ENABLED = previous;
    }
  }
});

test("loadIdeaPlanStateSchema returns degraded directive when schema file path does not exist", async () => {
  clearIdeaPlanStateSchemaCache();
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "wk-schema-missing-"));
  const schemaDir = path.join(tmp, "schemas", "ideas", "states");
  await fs.promises.mkdir(schemaDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(schemaDir, "idea.schema.json"),
    JSON.stringify({
      $defs: {
        canonicalAgentDirective: {
          schemaVersion: 1,
          state: "idea",
          questions: [{ phase: "context", fieldName: "title", prompt: "Title?", type: "text" }]
        }
      }
    }),
    "utf8"
  );
  const loaded = loadIdeaPlanStateSchema("planning", tmp);
  assert.equal(loaded.degraded, true);
  assert.equal(isDegradedAgentDirective(loaded.agentDirective), true);
  assert.match(loaded.agentDirective.reason, /not found/i);
  assert.deepEqual(loaded.agentDirective.requiredFields, []);
  assert.deepEqual(loaded.agentDirective.validTransitions, []);
});

test("loadIdeaPlanStateSchema returns degraded directive when schema file is not valid JSON", async () => {
  clearIdeaPlanStateSchemaCache();
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "wk-schema-bad-json-"));
  const schemaDir = path.join(tmp, "schemas", "ideas", "states");
  await fs.promises.mkdir(schemaDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(schemaDir, "idea.schema.json"),
    JSON.stringify({
      $defs: {
        canonicalAgentDirective: {
          schemaVersion: 1,
          state: "idea",
          questions: [{ phase: "context", fieldName: "title", prompt: "Title?", type: "text" }]
        }
      }
    }),
    "utf8"
  );
  await fs.promises.writeFile(path.join(schemaDir, "reviewed.schema.json"), "{ not-json", "utf8");
  const loaded = loadIdeaPlanStateSchema("reviewed", tmp);
  assert.equal(loaded.degraded, true);
  assert.equal(isDegradedAgentDirective(loaded.agentDirective), true);
  assert.match(loaded.agentDirective.reason, /not valid JSON/i);
});

const openIdeaFixture = {
  ok: true,
  data: {
    stateSummary: {},
    workspaceStatus: {},
    ideas: {
      available: true,
      totalCount: 1,
      openCount: 1,
      planningCount: 0,
      plannedCount: 0,
      top: [{ id: "I1", title: "Draft a better dashboard", status: "open", previousPlanArtifacts: [] }]
    }
  }
};

test("renderDashboardRootInnerHtml renders legacy Plan button when unified model flag is false", () => {
  const html = renderDashboardRootInnerHtml(openIdeaFixture, null, null, null, null, {
    ideasUnifiedModelEnabled: false
  });
  assert.match(html, /data-wc-action="idea-plan"/);
  assert.doesNotMatch(html, /data-wc-action="idea-brainstorm"/);
  assert.doesNotMatch(html, /wc-brainstorming-ideas-section/);
});

test("renderDashboardRootInnerHtml renders Brainstorm and Plan when unified model flag is true", () => {
  const html = renderDashboardRootInnerHtml(openIdeaFixture, null, null, null, null, {
    ideasUnifiedModelEnabled: true
  });
  assert.match(html, /data-wc-action="idea-plan"/);
  assert.match(html, /data-wc-action="idea-brainstorm"/);
  assert.match(html, />Brainstorm</);
});
