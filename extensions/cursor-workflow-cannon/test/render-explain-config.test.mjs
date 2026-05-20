import test from "node:test";
import assert from "node:assert/strict";

import { renderExplainConfigHtml } from "../dist/views/config/render-explain-config.js";

test("renderExplainConfigHtml renders layer table for single path", () => {
  const html = renderExplainConfigHtml({
    ok: true,
    data: {
      path: "kit.agentRole",
      effectiveValue: "wizard",
      winningLayer: "project",
      alternates: [
        { layer: "kit-default", value: "adventurer" },
        { layer: "project", value: "wizard" }
      ]
    }
  });
  assert.match(html, /cfg-explain-table/);
  assert.match(html, /kit\.agentRole/);
  assert.match(html, /Project/);
  assert.match(html, /cfg-explain-win/);
  assert.doesNotMatch(html, /<script>/i);
});

test("renderExplainConfigHtml renders facet entries table", () => {
  const html = renderExplainConfigHtml({
    data: {
      facet: "kit",
      count: 1,
      entries: [{ path: "kit.x", winningLayer: "project", effectiveValue: 1 }]
    }
  });
  assert.match(html, /Facet/);
  assert.match(html, /kit\.x/);
});
