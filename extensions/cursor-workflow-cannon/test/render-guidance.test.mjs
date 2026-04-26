import test from "node:test";
import assert from "node:assert/strict";

import {
  renderGuidancePreviewInnerHtml,
  renderGuidanceSummaryInnerHtml
} from "../dist/views/guidance/render-guidance.js";

test("renderGuidanceSummaryInnerHtml renders health and escapes issue details", () => {
  const html = renderGuidanceSummaryInnerHtml({
    ok: true,
    data: {
      schemaVersion: 1,
      health: {
        caeEnabled: true,
        persistenceEnabled: true,
        registryStatus: "invalid",
        activeRegistryVersionId: "v1",
        issues: [{ code: "borked", detail: "<script>alert(1)</script>" }]
      },
      validation: { ok: false, code: "cae-registry-validation-error" },
      recentTraces: { available: true, rows: [], count: 0 },
      acknowledgements: { available: true, count: 0, rows: [] },
      feedback: { available: true, summary: { total: 0, useful: 0, noisy: 0 }, rows: [] }
    }
  });
  assert.match(html, /Guidance status/);
  assert.match(html, /How to recover/);
  assert.match(html, /Fix the Guidance registry/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;/);
});

test("renderGuidanceSummaryInnerHtml renders persistence recovery copy", () => {
  const html = renderGuidanceSummaryInnerHtml({
    ok: true,
    data: {
      schemaVersion: 1,
      health: {
        caeEnabled: true,
        persistenceEnabled: false,
        registryStatus: "ok",
        activeRegistryVersionId: "v1",
        issues: []
      },
      validation: { ok: true, code: "cae-registry-validate-ok" },
      recentTraces: {
        available: false,
        rows: [],
        count: 0,
        code: "cae-persistence-disabled",
        message: "Enable kit.cae.persistence to list durable Guidance checks."
      },
      acknowledgements: { available: true, count: 0, rows: [] },
      feedback: { available: true, summary: { total: 0, useful: 0, noisy: 0 }, rows: [] }
    }
  });
  assert.match(html, /Enable Guidance history/);
  assert.match(html, /trace history will be ephemeral/);
  assert.match(html, /Persistence off/);
});

test("renderGuidancePreviewInnerHtml renders grouped guidance actions", () => {
  const html = renderGuidancePreviewInnerHtml({
    ok: true,
    data: {
      traceId: "cae.trace.example",
      evalMode: "shadow",
      modeLabel: "Preview mode",
      ephemeral: false,
      evaluationContext: { command: { name: "get-next-actions" } },
      familyCounts: { policy: 1, think: 0, do: 0, review: 0 },
      pendingAcknowledgements: [
        {
          activationId: "cae.activation.policy.phase70-playbook",
          strength: "ack_required",
          ackToken: "phase70-policy-surface"
        }
      ],
      guidanceCards: {
        policy: [
          {
            activationId: "cae.activation.policy.phase70-playbook",
            family: "policy",
            familyLabel: "Rules to follow",
            title: "Machine playbooks",
            attention: "required",
            artifactIds: ["cae.playbook.machine-playbooks"],
            sourceTitles: ["Machine playbooks"],
            priority: 100,
            aggregateTightness: 4
          }
        ],
        think: [],
        do: [],
        review: []
      }
    }
  });
  assert.match(html, /Rules to follow/);
  assert.match(html, /data-wc-action="guidance-ack"/);
  assert.match(html, /data-wc-action="guidance-feedback"/);
});
