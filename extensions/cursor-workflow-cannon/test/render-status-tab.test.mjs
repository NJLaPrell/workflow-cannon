import test from "node:test";
import assert from "node:assert/strict";
import { renderStatusTabInnerHtml } from "../dist/views/status/render-status-tab.js";

test("renderStatusTabInnerHtml surfaces ok:false envelope", () => {
  const html = renderStatusTabInnerHtml({
    ok: false,
    code: "nope",
    message: "CLI exploded"
  });
  assert.match(html, /nope/);
  assert.match(html, /CLI exploded/);
});

test("renderStatusTabInnerHtml renders systemStatus sections when present", () => {
  const html = renderStatusTabInnerHtml({
    ok: true,
    code: "dashboard-summary",
    data: {
      schemaVersion: 6,
      planningGeneration: 99,
      planningGenerationPolicy: "require",
      agentGuidance: {
        schemaVersion: 1,
        tier: 4,
        displayLabel: "Wizard",
        temperamentLabel: "Tavern",
        temperamentProfileId: "custom:x",
        profileSetId: "rpg_party_v1",
        usingDefaultTier: false
      },
      stateSummary: { ready: 1, in_progress: 0, blocked: 0, total: 9 },
      systemStatus: {
        schemaVersion: 2,
        generatedAt: "2026-05-05T12:00:00.000Z",
        identity: {
          schemaVersion: 1,
          projectName: "my-project",
          packageName: "@scope/pkg",
          workspaceKitVersion: "0.78.0",
          rootPackageVersion: "1.0.0"
        },
        planningStore: {
          schemaVersion: 1,
          backend: "sqlite",
          databaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        },
        phase: {
          schemaVersion: 1,
          ok: true,
          canonicalPhaseKey: "79",
          source: "workspace-status",
          currentKitPhase: "79",
          nextKitPhase: "80",
          configPhaseKey: "79",
          workspaceStatusPhaseKey: "79",
          configMatchesWorkspaceStatus: true,
          exportStale: false,
          exportReason: "fresh",
          driftMessages: [],
          remediationSuggestions: []
        },
        doctor: {
          schemaVersion: 1,
          ok: true,
          issueCount: 0,
          issues: []
        },
        modules: {
          schemaVersion: 1,
          enabledModuleIds: ["task-engine", "documentation"],
          disabledModuleIds: []
        },
        caeLines: ["CAE: enabled=true persistence=false shadowPreflight=true"]
      }
    }
  });
  assert.match(html, /my-project/);
  assert.match(html, /Wizard/);
  assert.match(html, /Tavern/);
  assert.match(html, /Planning sync/);
  assert.match(html, /This workspace/);
  assert.match(html, /Planning data/);
  assert.match(html, /Canonical phase/);
  assert.match(html, /Contract checks passed/);
  assert.match(html, /task-engine/);
  assert.match(html, /Context activation \(CAE\)/);
});

test("renderStatusTabInnerHtml tolerates missing systemStatus on older schema", () => {
  const html = renderStatusTabInnerHtml({
    ok: true,
    data: {
      schemaVersion: 4,
      agentGuidance: {
        schemaVersion: 1,
        tier: 2,
        displayLabel: "Adventurer",
        temperamentLabel: "Steady",
        temperamentProfileId: "builtin:balanced",
        profileSetId: "rpg_party_v1",
        usingDefaultTier: true
      }
    }
  });
  assert.match(html, /upgrade workspace-kit/);
});

test("renderStatusTabInnerHtml shows editor folder label when passed", () => {
  const html = renderStatusTabInnerHtml(
    {
      ok: true,
      code: "dashboard-summary",
      data: {
        schemaVersion: 6,
        planningGeneration: 1,
        planningGenerationPolicy: "off",
        systemStatus: {
          schemaVersion: 2,
          generatedAt: "2026-05-05T12:00:00.000Z",
          identity: {
            schemaVersion: 1,
            projectName: null,
            packageName: null,
            workspaceKitVersion: null,
            rootPackageVersion: null
          },
          planningStore: {
            schemaVersion: 1,
            backend: "sqlite",
            databaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
          },
          phase: {
            schemaVersion: 1,
            ok: true,
            canonicalPhaseKey: "1",
            driftMessages: [],
            remediationSuggestions: []
          },
          doctor: { schemaVersion: 1, ok: true, issueCount: 0, issues: [] },
          modules: {
            schemaVersion: 1,
            enabledModuleIds: [],
            disabledModuleIds: []
          },
          caeLines: []
        }
      }
    },
    { editorWorkspaceFolderLabel: "workflow-cannon" }
  );
  assert.match(html, /Editor folder/);
  assert.match(html, /workflow-cannon/);
});
