import test from "node:test";
import assert from "node:assert/strict";

import {
  renderGuidanceActionResultInnerHtml,
  renderGuidanceLibraryInnerHtml,
  renderGuidancePreviewInnerHtml,
  renderGuidanceSummaryInnerHtml,
  renderGuidanceTraceDetailInnerHtml,
  GUIDANCE_LIBRARY_ARTIFACT_TYPES
} from "../dist/views/guidance/render-guidance.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "../dist/views/guidance/render-guidance-panel.js";

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

test("renderGuidancePreviewInnerHtml renders enforcement readiness when present", () => {
  const html = renderGuidancePreviewInnerHtml({
    ok: true,
    data: {
      traceId: "cae.trace.example",
      evalMode: "shadow",
      modeLabel: "Preview mode",
      ephemeral: true,
      evaluationContext: { command: { name: "get-next-actions" } },
      familyCounts: { policy: 0, think: 0, do: 0, review: 0 },
      guidanceCards: { policy: [], think: [], do: [], review: [] },
      enforcementReadiness: {
        schemaVersion: 1,
        familyHardStopCapable: true,
        previewGatesSatisfied: true,
        governanceEvidenceComplete: false,
        conflictStatus: "none",
        activationReadinessLevel: "ok",
        previewDigest: "abcd",
        blockingCodes: ["cae-enforce-governance-evidence-incomplete"],
        notes: ["Need audit id."]
      }
    }
  });
  assert.match(html, /Enforcement readiness/);
  assert.match(html, /cae-enforce-governance-evidence-incomplete/);
});

test("renderGuidanceLibraryInnerHtml lists cae and workspace sources with type chips", () => {
  const html = renderGuidanceLibraryInnerHtml({
    artifacts: {
      rows: [
        {
          artifactId: "cae.playbook.one",
          title: "Default playbook",
          artifactType: "playbook",
          source: "default",
          path: ".ai/playbooks/one.md",
          status: "active",
          fileExists: true
        },
        {
          artifactId: "workspace.runbook.ops",
          title: "Ops runbook",
          artifactType: "runbook",
          source: "workspace",
          path: ".ai/runbooks/ops.md",
          status: "active",
          fileExists: true,
          updatedAt: "2026-05-07T00:00:00.000Z"
        },
        {
          artifactId: "override.ignored",
          title: "Not in library",
          artifactType: "policy-doc",
          source: "override",
          status: "active",
          fileExists: true
        }
      ]
    }
  });
  assert.match(html, /<h2>Library<\/h2>/);
  assert.match(html, /data-gp-panel="library"/);
  assert.match(html, /cae\.playbook\.one/);
  assert.match(html, /workspace\.runbook\.ops/);
  assert.doesNotMatch(html, /override\.ignored/);
  assert.match(html, /data-gp-action="artifact-open"/);
  assert.doesNotMatch(html, /gp-artifact-content/);
  assert.doesNotMatch(html, /Hide Default/);
  assert.doesNotMatch(html, /Remove Override/);
  for (const artifactType of GUIDANCE_LIBRARY_ARTIFACT_TYPES) {
    assert.match(html, new RegExp(artifactType.replace("-", "\\-")));
  }
  assert.match(html, /gp-source-cae/);
  assert.match(html, /gp-source-workspace/);
  assert.match(html, /2026-05-07T00:00:00.000Z/);
});

test("renderGuidanceAuthoringPanelInnerHtml dashboard host renders Library instead of Artifacts editor", () => {
  const html = renderGuidanceAuthoringPanelInnerHtml(
    {
      ok: true,
      data: {
        product: { productName: "Guidance" },
        health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
        activeVersion: { versionId: "cae.reg.active", isActive: true, registryDigest: "abcd" },
        readiness: { canMutate: true },
        validation: { ok: true, registryContentHash: "abcd" },
        counts: {},
        artifacts: {
          rows: [
            {
              artifactId: "cae.doc.one",
              title: "One",
              artifactType: "policy-doc",
              source: "default",
              path: ".ai/policy.md",
              status: "active",
              fileExists: true
            }
          ]
        },
        activations: { rows: [] },
        recentMutations: { available: true, rows: [] },
        workspaceArtifactMarkdownTemplates: []
      }
    },
    { host: "dashboard" }
  );
  assert.match(html, /data-gp-tab="library"/);
  assert.match(html, />Library</);
  assert.match(html, /data-gp-panel="library"/);
  assert.match(html, /Search library/);
  assert.doesNotMatch(html, /Artifact Editor/);
  assert.doesNotMatch(html, /gp-artifact-content/);
  assert.doesNotMatch(html, /Hide Default/);
  assert.doesNotMatch(html, /Remove Override/);
  assert.match(html, /data-gp-action="artifact-open"/);
});

test("renderGuidanceAuthoringPanelInnerHtml renders the tabbed authoring shell", () => {
  const html = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    code: "cae-authoring-summary-ok",
    data: {
      schemaVersion: 1,
      product: { productName: "Guidance" },
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      activeVersion: {
        versionId: "cae.reg.active",
        registryDigest: "abcd",
        artifactCount: 2,
        activationCount: 1
      },
      counts: {
        activationFamilies: { policy: 1, think: 0, do: 0, review: 0 },
        activationStatuses: { draft: 1 },
        artifactStatuses: { active: 2, "missing-file": 0 },
        recentMutationCount: 1
      },
      validation: { ok: true, code: "cae-registry-validate-ok", registryContentHash: "abcd" },
      validationWarnings: [{ code: "cae-warning", detail: "Review <warning>" }],
      readiness: { canMutate: true },
      artifacts: {
        rows: [
          {
            artifactId: "cae.doc.one",
            title: "One <source>",
            artifactType: "policy-doc",
            source: "workspace",
            status: "active",
            fileExists: true
          },
          {
            artifactId: "cae.doc.workspace",
            title: "Workspace rule",
            artifactType: "runbook",
            path: ".ai/workspace.md",
            source: "workspace",
            status: "active",
            fileExists: false,
            updatedAt: "2026-05-07T00:00:00.000Z"
          }
        ]
      },
      activations: {
        rows: [
          {
            activationId: "cae.activation.one",
            family: "policy",
            scopeJson: '{"conditions":[{"kind":"always"}]}',
            scopeSummary: "Always",
            lifecycleState: "draft",
            status: "draft",
            source: "workspace",
            priority: 100,
            acknowledgement: { strength: "surface", token: "policy-token" },
            statusWarnings: ["Policy applies broadly"],
            artifactRefs: [{ artifactId: "cae.doc.one" }, { artifactId: "cae.doc.workspace" }]
          }
        ]
      },
      recentMutations: { count: 1, rows: [{ recordedAt: "2026-05-06T00:00:00.000Z", commandName: "cae-create-workspace-artifact", actor: "agent", note: "draft" }] },
      workspaceArtifactMarkdownTemplates: [
        {
          id: "starter-playbook",
          artifactType: "playbook",
          title: "Playbook starter",
          contentMarkdown: "# Playbook title\n\n## Overview\n\n"
        }
      ]
    }
  });
  assert.match(html, /data-gp-tab="overview"/);
  assert.match(html, /data-gp-tab="artifacts"/);
  assert.match(html, /data-gp-tab="activations"/);
  assert.match(html, /data-gp-tab="versions"/);
  assert.match(html, /id="gp-versions-json"/);
  assert.match(html, /data-gp-tab="preview"/);
  assert.match(html, /data-gp-tab="portability"/);
  assert.match(html, /gp-portability-out/);
  assert.match(html, /caeMutationApproval/);
  assert.match(html, /data-gp-tab="audit"/);
  assert.match(html, /Warnings need review/);
  assert.match(html, /New Artifact/);
  assert.match(html, /New Activation/);
  assert.match(html, /Preview Guidance/);
  assert.match(html, /Preview Draft/);
  assert.match(html, /Copy Evidence/);
  assert.match(html, /gp-preview-command-args/);
  assert.match(html, /gp-preview-result/);
  assert.match(html, /Validate Registry/);
  assert.match(html, /Registry store/);
  assert.match(html, /sqlite/);
  assert.match(html, /Validation warnings/);
  assert.match(html, /Review &lt;warning&gt;/);
  assert.match(html, /cae-create-workspace-artifact/);
  assert.match(html, /activation-bulk-retire/);
  assert.match(html, /data-gp-activation-bulk=/);
  assert.match(html, /Search artifacts/);
  assert.match(html, /Artifact Editor/);
  assert.match(html, /gp-artifact-templates-json/);
  assert.match(html, /id="gp-artifact-template"/);
  assert.match(html, /Starter/);
  assert.match(html, /reasoning-template/);
  assert.match(html, /Preview Markdown/);
  assert.match(html, /data-gp-action="artifact-create"/);
  assert.match(html, /data-gp-action="artifact-update"/);
  assert.match(html, /data-gp-action="artifact-duplicate-submit"/);
  assert.match(html, /data-gp-action="artifact-retire-submit"/);
  assert.match(html, /Search activations/);
  assert.match(html, /Activation Editor/);
  assert.match(html, /Scope preset/);
  assert.match(html, /Command arg equals/);
  assert.match(html, /Advanced JSON/);
  assert.match(html, /data-gp-activation-artifact/);
  assert.match(html, /data-gp-action="activation-create-submit"/);
  assert.match(html, /data-gp-action="activation-update-submit"/);
  assert.match(html, /Scope/);
  assert.match(html, /Policy applies broadly/);
  assert.match(html, /Activate Draft/);
  assert.match(html, /data-gp-action="activation-preview"/);
  assert.match(html, /Used by/);
  assert.match(html, /data-gp-action="artifact-open"/);
  assert.match(html, /Duplicate/);
  assert.match(html, /Hide Default/);
  assert.match(html, /Remove Override/);
  assert.match(html, /missing file/);
  assert.match(html, /2026-05-07T00:00:00.000Z/);
  assert.doesNotMatch(html, /<source>/);
  assert.match(html, /One &lt;source&gt;/);
});

test("renderGuidanceAuthoringPanelInnerHtml surfaces actionable blocked states", () => {
  const disabled = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      health: { caeEnabled: false },
      readiness: { canMutate: false },
      validation: { ok: true },
      counts: {},
      artifacts: { rows: [] },
      activations: { rows: [] },
      recentMutations: { rows: [] }
    }
  });
  assert.match(disabled, /Guidance is disabled/);
  assert.match(disabled, /kit\.cae\.enabled/);

  const jsonStore = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "json" },
      readiness: { canMutate: false },
      validation: { ok: true },
      counts: {},
      artifacts: { rows: [] },
      activations: { rows: [] },
      recentMutations: { rows: [] }
    }
  });
  assert.match(jsonStore, /Switch kit\.cae\.registryStore to sqlite/);
  assert.match(jsonStore, /data-gp-action="refresh"/);

  const nativeSqlite = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      activeVersion: { isActive: false },
      readiness: { canMutate: false },
      validation: { ok: true },
      recentMutations: { available: false, code: "cae-kit-sqlite-unavailable", rows: [] },
      counts: {},
      artifacts: { rows: [] },
      activations: { rows: [] }
    }
  });
  assert.match(nativeSqlite, /Native SQLite is unavailable/);
  assert.match(nativeSqlite, /better-sqlite3/);

  const missingActiveDb = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      activeVersion: { isActive: false },
      readiness: { canMutate: false },
      validation: { ok: true },
      recentMutations: { available: true, rows: [] },
      counts: {},
      artifacts: { rows: [] },
      activations: { rows: [] }
    }
  });
  assert.match(missingActiveDb, /No active guidance set/);

  const invalid = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      readiness: { canMutate: false },
      validation: { ok: false, code: "cae-registry-validation-error", message: "broken <rule>" },
      counts: {},
      artifacts: { rows: [] },
      activations: { rows: [] },
      recentMutations: { rows: [] }
    }
  });
  assert.match(invalid, /Registry validation failed/);
  assert.match(invalid, /broken &lt;rule&gt;/);
  assert.match(invalid, /data-gp-action="validate-registry"/);

  const invalidButConfiguredToMutate = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      activeVersion: { isActive: true },
      readiness: { canMutate: true },
      validation: { ok: false, code: "cae-registry-validation-error", message: "needs repair" },
      counts: {},
      artifacts: { rows: [] },
      activations: { rows: [] },
      recentMutations: { available: true, rows: [] }
    }
  });
  assert.match(invalidButConfiguredToMutate, /data-gp-action="artifact-create" disabled/);
  assert.match(invalidButConfiguredToMutate, /data-gp-action="activation-create-submit" disabled/);
});

test("renderGuidanceAuthoringPanelInnerHtml shows onboarding when no active workspace artifacts", () => {
  const html = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    code: "cae-authoring-summary-ok",
    data: {
      schemaVersion: 1,
      product: { productName: "Guidance" },
      health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite" },
      activeVersion: {
        versionId: "cae.reg.active",
        isActive: true,
        registryDigest: "abcd",
        artifactCount: 1,
        activationCount: 0
      },
      counts: {
        activationFamilies: {},
        activationStatuses: {},
        artifactStatuses: { active: 1 },
        recentMutationCount: 0
      },
      validation: { ok: true, code: "cae-registry-validate-ok", registryContentHash: "abcd" },
      validationWarnings: [],
      readiness: { canMutate: true },
      artifacts: {
        rows: [
          {
            artifactId: "cae.default.only",
            title: "Default only",
            artifactType: "playbook",
            source: "default",
            status: "active",
            fileExists: true
          }
        ]
      },
      activations: { rows: [] },
      recentMutations: { count: 0, rows: [], available: true },
      workspaceArtifactMarkdownTemplates: []
    }
  });
  assert.match(html, /First workspace Guidance/);
});

test("renderGuidanceAuthoringPanelInnerHtml covers representative dashboard authoring states", () => {
  const baseData = {
    product: { productName: "Guidance" },
    health: { caeEnabled: true, registryStatus: "ok", registryStore: "sqlite", currentPhase: "82" },
    activeVersion: { versionId: "cae.reg.active", isActive: true, registryDigest: "digest" },
    readiness: { canMutate: true },
    validation: { ok: true, registryContentHash: "digest" },
    counts: {},
    artifacts: { rows: [] },
    activations: { rows: [] },
    recentMutations: { available: true, rows: [] },
    workspaceArtifactMarkdownTemplates: []
  };

  const healthy = renderGuidanceAuthoringPanelInnerHtml({ ok: true, data: baseData });
  assert.match(healthy, /Guidance authoring is ready/);
  assert.match(healthy, /data-gp-action="artifact-create"/);
  assert.doesNotMatch(healthy, /data-gp-action="artifact-create" disabled/);
  assert.match(healthy, /data-gp-action="activation-create-submit"/);
  assert.doesNotMatch(healthy, /data-gp-action="activation-create-submit" disabled/);
  assert.match(healthy, /data-gp-action="preview-run-draft"/);
  assert.match(healthy, /data-gp-action="validate-registry"/);

  const warning = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      ...baseData,
      readiness: { canMutate: true, issues: [{ code: "cae-warning", message: "Review this warning" }] },
      validationWarnings: [{ code: "cae-warning", message: "Review this warning" }]
    }
  });
  assert.match(warning, /Warnings need review/);
  assert.match(warning, /Review this warning/);
  assert.match(warning, /data-gp-action="validate-registry"/);
  assert.doesNotMatch(warning, /data-gp-action="activation-create-submit" disabled/);

  const sqliteFailure = renderGuidanceAuthoringPanelInnerHtml({
    ok: true,
    data: {
      ...baseData,
      activeVersion: { isActive: false },
      readiness: { canMutate: true },
      recentMutations: { available: false, code: "cae-kit-sqlite-unavailable", rows: [] }
    }
  });
  assert.match(sqliteFailure, /Native SQLite is unavailable/);
  assert.match(sqliteFailure, /data-gp-action="refresh"/);
  assert.match(sqliteFailure, /data-gp-action="artifact-create" disabled/);
  assert.match(sqliteFailure, /data-gp-action="activation-create-submit" disabled/);
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
