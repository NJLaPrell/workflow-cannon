import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentBugReportingModule } from "../dist/modules/agent-bug-reporting/index.js";
import {
  WC_BUG_REPORTER_ALLOWED_COMMANDS,
  WC_BUG_REPORTER_PREFERRED_MODEL,
  WC_BUG_REPORTER_SUBAGENT_ID,
  buildWcBugReporterRegisterArgs,
  buildSeedWcBugReporterPayload
} from "../dist/modules/agent-bug-reporting/subagent-seed/wc-bug-reporter-seed.js";
import {
  assertBugReportHandoff,
  buildCliFilingPlan,
  buildCursorSpawnPlan,
  listBugReporterHostAdapters,
  resolveBugReporterSpawnPlan
} from "../dist/modules/agent-bug-reporting/adapters/index.js";
import { getPolicySensitivityForBuiltinCommand } from "../dist/core/policy.js";
import { getDefinitionById } from "../dist/modules/subagents/subagent-store.js";
import { openPlanningStores } from "../dist/core/planning/index.js";

function sqliteCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra =
    rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
  const { tasks: _drop, ...restTop } = partialEffective;
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      ...restTop,
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        ...taskExtra
      }
    }
  };
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "abr-adapt-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

const SAMPLE_HANDOFF = {
  schemaVersion: 1,
  skillId: "wc-bug-report",
  symptom: "Adapter file exploded during spawn",
  command: "pnpm exec wk run seed-wc-bug-reporter",
  code: "boom",
  clientMutationId: "bug:adapters:test-1",
  evidenceCrumbs: ["crumb-a", "crumb-b"]
};

test("seed payload pins model + allowedCommands centered on file-bug-report", () => {
  const args = buildWcBugReporterRegisterArgs();
  assert.equal(args.subagentId, WC_BUG_REPORTER_SUBAGENT_ID);
  assert.equal(args.metadata.preferredModel, WC_BUG_REPORTER_PREFERRED_MODEL);
  assert.equal(args.metadata.filingCommand, "file-bug-report");
  assert.ok(args.allowedCommands.includes("file-bug-report"));
  assert.deepEqual(args.allowedCommands, [...WC_BUG_REPORTER_ALLOWED_COMMANDS]);
  const payload = buildSeedWcBugReporterPayload(42);
  assert.equal(payload.registerInvocation.name, "register-subagent");
  assert.equal(payload.registerArgs.expectedPlanningGeneration, 42);
});

test("seed-wc-bug-reporter is sensitive; preview then apply registers definition", async () => {
  assert.equal(getPolicySensitivityForBuiltinCommand("seed-wc-bug-reporter"), "sensitive");

  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace, {
    tasks: { planningGenerationPolicy: "off" }
  });

  const preview = await agentBugReportingModule.onCommand(
    { name: "seed-wc-bug-reporter", args: {} },
    ctx
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.code, "wc-bug-reporter-seed-preview");
  assert.equal(preview.data.mode, "preview");
  assert.equal(preview.data.subagentId, "wc-bug-reporter");
  assert.ok(preview.data.registerArgs.allowedCommands.includes("file-bug-report"));

  const applied = await agentBugReportingModule.onCommand(
    { name: "seed-wc-bug-reporter", args: { apply: true } },
    ctx
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.code, "wc-bug-reporter-seeded");
  assert.equal(applied.data.subagent.id, "wc-bug-reporter");
  assert.deepEqual(applied.data.subagent.allowedCommands, [...WC_BUG_REPORTER_ALLOWED_COMMANDS]);
  assert.equal(applied.data.subagent.metadata.preferredModel, "composer-2.5");

  const planning = await openPlanningStores(ctx);
  const def = getDefinitionById(planning.sqliteDual.getDatabase(), "wc-bug-reporter");
  assert.ok(def);
  assert.equal(def.retired, false);
  assert.equal(def.metadata.skillId, "wc-bug-report");
});

test("Cursor adapter builds background Task spawn; never awaits", () => {
  const plan = buildCursorSpawnPlan({
    handoff: SAMPLE_HANDOFF,
    recordProvenance: true
  });
  assert.equal(plan.host, "cursor");
  assert.equal(plan.maturity, "implemented");
  assert.equal(plan.awaitChild, false);
  assert.equal(plan.taskTool.run_in_background, true);
  assert.equal(plan.taskTool.subagent_type, "generalPurpose");
  assert.equal(plan.taskTool.model, "composer-2.5");
  assert.equal(JSON.parse(plan.taskTool.prompt).symptom, SAMPLE_HANDOFF.symptom);
  assert.equal(plan.provenance.commandName, "spawn-subagent");
  assert.equal(plan.provenance.argsHint.hostHint, "cursor");
});

test("CLI adapter files via file-bug-report without any IDE host", () => {
  const plan = buildCliFilingPlan({ handoff: SAMPLE_HANDOFF });
  assert.equal(plan.host, "cli");
  assert.equal(plan.maturity, "implemented");
  assert.equal(plan.awaitChild, false);
  assert.equal(plan.filing.commandName, "file-bug-report");
  assert.equal(plan.filing.args.symptom, SAMPLE_HANDOFF.symptom);
  assert.equal(plan.filing.args.clientMutationId, SAMPLE_HANDOFF.clientMutationId);
  assert.match(plan.filing.argvExample, /file-bug-report/);
});

test("Antigravity and VS Code Copilot stubs match spawn contract and fall back to CLI", () => {
  const anti = resolveBugReporterSpawnPlan("antigravity", { handoff: SAMPLE_HANDOFF });
  assert.equal(anti.host, "antigravity");
  assert.equal(anti.maturity, "stub");
  assert.equal(anti.awaitChild, false);
  assert.equal(anti.contract.backgroundPreferred, true);
  assert.equal(anti.contract.defaultSkillId, "wc-bug-report");
  assert.equal(anti.contract.fallbackHost, "cli");
  assert.equal(anti.fallback.host, "cli");
  assert.equal(anti.fallback.filing.commandName, "file-bug-report");

  const copilot = resolveBugReporterSpawnPlan("vscode-copilot", { handoff: SAMPLE_HANDOFF });
  assert.equal(copilot.host, "vscode-copilot");
  assert.equal(copilot.maturity, "stub");
  assert.equal(copilot.fallback.host, "cli");

  const alias = resolveBugReporterSpawnPlan("copilot", { handoff: SAMPLE_HANDOFF });
  assert.equal(alias.host, "vscode-copilot");
});

test("unknown host falls back to CLI so core filing never requires a single host", () => {
  const plan = resolveBugReporterSpawnPlan("totally-made-up-ide", { handoff: SAMPLE_HANDOFF });
  assert.equal(plan.host, "cli");
  assert.equal(plan.filing.commandName, "file-bug-report");
});

test("handoff validation requires symptom; adapters list expected hosts", () => {
  const bad = assertBugReportHandoff({ schemaVersion: 1 });
  assert.equal(bad.ok, false);
  const hosts = listBugReporterHostAdapters().map((a) => a.hostId).sort();
  assert.deepEqual(hosts, ["antigravity", "cli", "cursor", "vscode-copilot"]);
});

test("overview surfaces seed + host adapter maturity", async () => {
  const workspace = await tmpWorkspace();
  const overview = await agentBugReportingModule.onCommand(
    { name: "agent-bug-reporting-overview", args: {} },
    sqliteCtx(workspace)
  );
  assert.equal(overview.ok, true);
  assert.ok(overview.data.shippedManifestCommands.includes("seed-wc-bug-reporter"));
  assert.equal(overview.data.wcBugReporter.subagentId, "wc-bug-reporter");
  assert.ok(overview.data.hostAdapters.some((h) => h.hostId === "cursor" && h.maturity === "implemented"));
  assert.ok(overview.data.hostAdapters.some((h) => h.hostId === "antigravity" && h.maturity === "stub"));
});

test("core filing path works without host: CLI plan → file-bug-report", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);
  const plan = resolveBugReporterSpawnPlan("cli", {
    handoff: {
      ...SAMPLE_HANDOFF,
      clientMutationId: "bug:adapters:cli-e2e",
      symptom: "Hostless filing still works"
    }
  });
  assert.equal(plan.host, "cli");
  const created = await agentBugReportingModule.onCommand(
    { name: "file-bug-report", args: plan.filing.args },
    ctx
  );
  assert.equal(created.ok, true);
  assert.equal(created.code, "file-bug-report-created");
  assert.equal(created.data.task.type, "improvement");
  assert.equal(created.data.task.status, "proposed");
});
