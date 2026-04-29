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
  assert.match(html, /Guidance System/);
  assert.match(html, /How to recover/);
  assert.match(html, /Guidance rules need repair/);
  assert.match(html, /active guidance set/);
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
  assert.match(html, /Guidance history is off/);
  assert.match(html, /history disappears after the session/);
  assert.match(html, /History off/);
});

test("renderGuidanceSummaryInnerHtml renders grouped recent activity and manage guidance", () => {
  const html = renderGuidanceSummaryInnerHtml({
    ok: true,
    data: {
      schemaVersion: 1,
      health: {
        caeEnabled: true,
        persistenceEnabled: true,
        registryStatus: "ok",
        activeRegistryVersionId: "v1",
        issues: [],
        traceRowCount: 1
      },
      validation: { ok: true, code: "cae-registry-validate-ok" },
      recentTraces: {
        available: true,
        count: 2,
        rows: [
          {
            traceId: "cae.trace.1234567890abcdef",
            commandName: "get-next-actions",
            createdAt: "2026-04-27T00:00:00.000Z",
            evalMode: "shadow",
            storage: "sqlite",
            familyCounts: { policy: 0, think: 1, do: 2, review: 0 }
          },
          {
            traceId: "cae.trace.abcdef1234567890",
            commandName: "get-next-actions",
            createdAt: "2026-04-26T23:59:59.000Z",
            evalMode: "shadow",
            storage: "sqlite",
            familyCounts: { policy: 0, think: 1, do: 2, review: 0 }
          }
        ]
      },
      acknowledgements: { available: true, count: 0, rows: [] },
      feedback: { available: true, summary: { total: 0, useful: 0, noisy: 0 }, rows: [] },
      guidanceProduct: {
        schemaVersion: 1,
        registry: {
          activeVersionId: "cae.reg.active",
          artifactCount: 3,
          activationCount: 4
        },
        versions: {
          versions: [
            {
              versionId: "cae.reg.active",
              createdAt: "2026-04-27T00:00:00.000Z",
              createdBy: "agent",
              isActive: true,
              artifactCount: 3,
              activationCount: 4
            }
          ]
        },
        library: {
          artifacts: { artifactIds: ["cae.doc.one"] },
          activations: { activationIds: ["cae.activation.one"] }
        },
        mutationCapability: {
          registryStore: "sqlite",
          canMutate: false,
          denialReason: "Guidance admin mutations are disabled (`kit.cae.adminMutations`)."
        }
      },
      caeConfig: { adminMutations: false }
    }
  });
  assert.match(html, /Find The Next Actions|Get Next Actions/);
  assert.match(html, /Recent Activity/);
  assert.match(html, /2 unchanged checks collapsed/);
  assert.match(html, /Review why/);
  assert.match(html, /Manage Guidance/);
  assert.match(html, /Guidance Library/);
  assert.match(html, /Guidance admin mutations are disabled/);
  assert.match(html, /Registry backend/);
  assert.match(html, /disabled/);
  assert.match(html, /policyApproval/);
  assert.match(html, /Debug details JSON/);
  assert.match(html, /data-wc-action="guidance-copy-block"/);
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
  assert.match(html, /Pre-flight result/);
  assert.match(html, /Review 1 guidance item/);
  assert.match(html, /Possible guidance conflicts/);
  assert.match(html, /Two policy activations matched/);
  assert.match(html, /data-wc-action="guidance-ack"/);
  assert.match(html, /data-wc-action="guidance-improve"/);
  assert.match(html, /data-wc-action="guidance-feedback"/);
  assert.match(html, /Raw preview JSON/);
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
  assert.match(html, /Why this guidance appeared/);
  assert.match(html, /matched policy=1/);
  assert.match(html, /Pending acknowledgements/);
  assert.match(html, /Required rules: 1/);
  assert.match(html, /Raw trace JSON/);
  assert.match(html, /Copy shown JSON/);
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
  assert.match(html, /Stored check not found/);
  assert.match(html, /fresh Guidance preview|fresh Guidance preview/);
});

test("renderGuidanceActionResultInnerHtml renders friendly success and raw details", () => {
  const html = renderGuidanceActionResultInnerHtml({
    action: "Useful feedback",
    result: { ok: true, code: "cae-shadow-feedback-recorded", message: "Recorded feedback" }
  });
  assert.match(html, /Useful feedback recorded/);
  assert.match(html, /Recorded feedback/);
  assert.match(html, /Raw action result JSON/);
});

test("renderManageGuidance leaves mutation controls enabled when canMutate", () => {
  const html = renderGuidanceSummaryInnerHtml({
    ok: true,
    data: {
      schemaVersion: 1,
      health: {
        caeEnabled: true,
        persistenceEnabled: true,
        registryStatus: "ok",
        activeRegistryVersionId: "v1",
        issues: [],
        traceRowCount: 0
      },
      validation: { ok: true, code: "cae-registry-validate-ok" },
      recentTraces: { available: true, count: 0, rows: [] },
      acknowledgements: { available: true, count: 0, rows: [] },
      feedback: { available: true, summary: { total: 0, useful: 0, noisy: 0 }, rows: [] },
      guidanceProduct: {
        schemaVersion: 1,
        registry: {
          activeVersionId: "cae.reg.active",
          store: "sqlite",
          artifactCount: 1,
          activationCount: 1
        },
        versions: { versions: [] },
        library: { artifacts: { artifactIds: [] }, activations: { activationIds: [] } },
        mutationCapability: {
          registryStore: "sqlite",
          canMutate: true,
          denialReason: null
        }
      }
    }
  });
  assert.doesNotMatch(html, /data-wc-action="guidance-version-clone"[^>]*disabled/);
});

test("renderGuidanceActionResultInnerHtml surfaces mutation remediation before raw JSON", () => {
  const html = renderGuidanceActionResultInnerHtml({
    action: "Guidance set activate",
    result: {
      ok: false,
      code: "cae-mutation-approval-missing",
      message: "Pass caeMutationApproval…"
    }
  });
  assert.match(html, /What to do:/);
  assert.match(html, /caeMutationApproval/);
  assert.match(html, /Raw action result JSON/);
});

test("renderGuidanceActionResultInnerHtml shows audit panel on registry mutation success", () => {
  const html = renderGuidanceActionResultInnerHtml({
    action: "Guidance set activate",
    result: {
      ok: true,
      code: "cae-activate-registry-version-ok",
      message: "ok",
      data: { schemaVersion: 1, versionId: "cae.reg.v2" }
    },
    mutationContext: {
      kind: "registry-mutation",
      commandName: "cae-activate-registry-version",
      actor: "operator@example.com"
    }
  });
  assert.match(html, /Audit trail/);
  assert.match(html, /cae-activate-registry-version/);
  assert.match(html, /cae\.reg\.v2/);
  assert.match(html, /cae-dashboard-summary/);
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
