import test from "node:test";
import assert from "node:assert/strict";

import {
  renderGuidanceActionResultInnerHtml,
  renderGuidancePreviewInnerHtml,
  renderGuidanceSummaryInnerHtml,
  renderGuidanceTraceDetailInnerHtml
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
      },
      conflictShadowSummary: {
        evalMode: "shadow",
        entries: [
          {
            kind: "same_family_tie",
            activationIds: ["cae.activation.policy.phase70-playbook", "cae.activation.policy.other"],
            resolution: "merge",
            detail: "Two policy activations matched the same workflow."
          }
        ]
      }
    }
  });
  assert.match(html, /Rules to follow/);
  assert.match(html, /Why this appeared/);
  assert.match(html, /Possible guidance conflicts/);
  assert.match(html, /Two policy activations matched/);
  assert.match(html, /data-wc-action="guidance-ack"/);
  assert.match(html, /data-wc-action="guidance-feedback"/);
});

test("renderGuidanceTraceDetailInnerHtml renders summary before raw JSON", () => {
  const html = renderGuidanceTraceDetailInnerHtml({
    explain: {
      ok: true,
      data: {
        storage: "sqlite",
        ephemeral: false,
        explanation: {
          traceId: "cae.trace.example",
          summaryText: "CAE trace cae.trace.example: matched policy=1, think=0, do=0, review=0."
        },
        trace: {
          traceId: "cae.trace.example",
          bundleId: "cae.bundle.example",
          events: [
            {
              eventType: "cae.trace.eval.summary",
              payload: {
                evalMode: "shadow",
                familyCounts: { policy: 1, think: 0, do: 0, review: 0 },
                conflictCount: 2
              }
            },
            { eventType: "cae.trace.ack.summary", payload: { pendingAckCount: 1 } }
          ]
        }
      }
    },
    traceFetch: { ok: true, data: { storage: "sqlite", trace: { traceId: "cae.trace.example" } } }
  });
  assert.match(html, /Trace detail/);
  assert.match(html, /matched policy=1/);
  assert.match(html, /Pending acknowledgements/);
  assert.match(html, /Rules: 1/);
  assert.match(html, /Raw trace JSON/);
});

test("renderGuidanceTraceDetailInnerHtml renders trace-not-found recovery", () => {
  const html = renderGuidanceTraceDetailInnerHtml({
    explain: {
      ok: true,
      data: {
        explanation: { traceId: "cae.trace.ephemeral", summaryText: "memory trace" },
        trace: { traceId: "cae.trace.ephemeral", events: [] },
        storage: "memory",
        ephemeral: true
      }
    },
    traceFetch: { ok: false, code: "cae-trace-not-found", message: "No persisted trace" }
  });
  assert.match(html, /Stored trace not found/);
  assert.match(html, /fresh Guidance preview/);
});

test("renderGuidanceActionResultInnerHtml renders friendly success and raw details", () => {
  const html = renderGuidanceActionResultInnerHtml({
    action: "Useful feedback",
    result: { ok: true, code: "cae-shadow-feedback-recorded", message: "Recorded feedback" }
  });
  assert.match(html, /Useful feedback recorded/);
  assert.match(html, /Recorded feedback/);
  assert.match(html, /Raw result/);
});

test("renderGuidanceActionResultInnerHtml renders friendly failure", () => {
  const html = renderGuidanceActionResultInnerHtml({
    action: "Acknowledgement",
    result: { ok: false, code: "policy-denied", message: "Policy approval required" }
  });
  assert.match(html, /Acknowledgement failed/);
  assert.match(html, /Policy approval required/);
  assert.match(html, /Needs attention/);
});
