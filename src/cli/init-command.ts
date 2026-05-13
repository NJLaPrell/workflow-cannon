import fs from "node:fs/promises";
import { appendPolicyTrace, resolveActorWithFallback } from "../core/policy.js";
import type { ModuleLifecycleContext } from "../contracts/module-contract.js";
import { collectDoctorContractIssues } from "./doctor-contract-validation.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { defaultRegistryModules } from "../modules/index.js";
import { openPlanningStores } from "../core/planning/index.js";
import {
  currentRuntimeIdentity,
  runtimeLauncherPath,
  runtimePackageRoot,
  runtimeStampPath,
  verifyRuntimeStamp,
  writeRuntimeLauncher,
  writeRuntimeStamp,
  type RuntimeContractIssue,
  type WorkspaceKitRuntimeStampV1
} from "../core/runtime-contract.js";
import { handleRunCommand } from "./run-command.js";
import { detectInitProjectContext } from "./init-detection.js";
import { buildInitPlan } from "./init-plan.js";
import { applyInitPlan } from "./init-writer.js";
import { ensurePlanningStoresInitialized } from "./init-sqlite.js";
import { resolveInitApprovalFromEnvAndFlags } from "./init-approval.js";
import { promptTTYConfirmation } from "./interactive-confirm.js";

export type ParsedInitArgs = {
  dryRun: boolean;
  json: boolean;
  yes: boolean;
  approvalRationale?: string;
  force: boolean;
  noStarterTask: boolean;
};

export function parseInitArgv(argv: string[]): ParsedInitArgs {
  const out: ParsedInitArgs = {
    dryRun: false,
    json: false,
    yes: false,
    force: false,
    noStarterTask: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a === "--yes") {
      out.yes = true;
    } else if (a === "--force") {
      out.force = true;
    } else if (a === "--no-starter-task") {
      out.noStarterTask = true;
    } else if (a === "--approval-rationale") {
      out.approvalRationale = argv[++i] ?? "";
    }
  }
  return out;
}

async function workspaceHasStarterTask(cwd: string): Promise<boolean> {
  const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules);
  const ctx = {
    workspacePath: cwd,
    effectiveConfig: effective as Record<string, unknown>,
    runtimeVersion: "0"
  } as ModuleLifecycleContext;
  const stores = await openPlanningStores(ctx);
  await stores.taskStore.load();
  const tasks = stores.taskStore.getAllTasks();
  stores.sqliteDual.closeDatabase();
  return tasks.some((t) => t.metadata?.starterTask === true);
}

type InitRuntimeContractStatus = {
  ok: boolean;
  stampPath: string;
  launcherPath: string;
  nodeExecutable: string | null;
  nodeVersion: string | null;
  packageRoot: string | null;
  issues: RuntimeContractIssue[];
};

function runtimeIdentityForInit(): WorkspaceKitRuntimeStampV1 {
  const testOverride = process.env.WORKSPACE_KIT_TEST_RUNTIME_IDENTITY;
  if (testOverride) {
    return JSON.parse(testOverride) as WorkspaceKitRuntimeStampV1;
  }
  return currentRuntimeIdentity(runtimePackageRoot());
}

function validateInitRuntimeContract(cwd: string): InitRuntimeContractStatus {
  const stamp = runtimeIdentityForInit();
  const verification = verifyRuntimeStamp(stamp, { currentIdentity: stamp, checkNativeSqlite: true });
  return {
    ok: verification.ok,
    stampPath: runtimeStampPath(cwd),
    launcherPath: runtimeLauncherPath(cwd),
    nodeExecutable: stamp.nodeExecutable,
    nodeVersion: stamp.nodeVersion,
    packageRoot: stamp.packageRoot,
    issues: verification.issues
  };
}

async function establishRuntimeArtifacts(
  cwd: string,
  runtimeStatus: InitRuntimeContractStatus,
  applied: {
    filesCreated: string[];
    filesUpdated: string[];
    filesPreserved: string[];
  }
): Promise<void> {
  const stampBefore = await fs.readFile(runtimeStatus.stampPath, "utf8").catch(() => null);
  const launcherBefore = await fs.readFile(runtimeStatus.launcherPath, "utf8").catch(() => null);
  const stamp = runtimeIdentityForInit();
  writeRuntimeStamp(cwd, stamp);
  writeRuntimeLauncher(cwd);
  const stampAfter = await fs.readFile(runtimeStatus.stampPath, "utf8");
  const launcherAfter = await fs.readFile(runtimeStatus.launcherPath, "utf8");
  const stampRel = ".workspace-kit/runtime.json";
  const launcherRel = ".workspace-kit/bin/wk";
  if (stampBefore === null) {
    applied.filesCreated.push(stampRel);
  } else if (stampBefore === stampAfter) {
    applied.filesPreserved.push(stampRel);
  } else {
    applied.filesUpdated.push(stampRel);
  }
  if (launcherBefore === null) {
    applied.filesCreated.push(launcherRel);
  } else if (launcherBefore === launcherAfter) {
    applied.filesPreserved.push(launcherRel);
  } else {
    applied.filesUpdated.push(launcherRel);
  }
}

async function appendInitPolicyTrace(cwd: string, rationale: string, commandOk: boolean): Promise<void> {
  await appendPolicyTrace(cwd, {
    timestamp: new Date().toISOString(),
    operationId: "cli.init",
    command: "init",
    actor: await resolveActorWithFallback(cwd, {}, process.env),
    allowed: true,
    rationale,
    commandOk
  });
}

/**
 * Top-level `workspace-kit init` — attach/detection/plan/apply/sqlite/starter/doctor orchestration.
 */
export async function runWorkspaceKitInitCommand(
  cwd: string,
  argv: string[],
  io: {
    writeLine: (s: string) => void;
    writeError: (s: string) => void;
    readStdinLine?: () => Promise<string | null>;
  },
  exitCodes: {
    success: number;
    validationFailure: number;
    usageError: number;
    internalError: number;
  }
): Promise<number> {
  const { writeLine, writeError, readStdinLine } = io;
  const flags = parseInitArgv(argv);

  const detection = await detectInitProjectContext(cwd);
  const plan = await buildInitPlan(cwd, detection);

  if (flags.dryRun && flags.json) {
    writeLine(JSON.stringify({ ok: true, code: "init-plan", schemaVersion: 1, data: plan }, null, 2));
    return exitCodes.success;
  }

  if (flags.dryRun) {
    writeLine(`workspace-kit init (dry-run) — planned mode: ${plan.mode}`);
    for (const n of plan.notes) {
      writeLine(`- ${n}`);
    }
    for (const w of plan.warnings) {
      writeLine(`- warning: ${w}`);
    }
    writeLine("Planned paths:");
    for (const p of plan.plannedWrites) {
      writeLine(`- ${p.kind}\t${p.path}\t${p.reason}`);
    }
    return exitCodes.success;
  }

  let rationale = "";
  const envOrFlag = resolveInitApprovalFromEnvAndFlags({
    yes: flags.yes,
    approvalRationale: flags.approvalRationale
  });
  if (envOrFlag.ok) {
    rationale = envOrFlag.rationale;
  } else if (!process.stdin.isTTY && !readStdinLine) {
    writeError(
      "Non-interactive init requires WORKSPACE_KIT_POLICY_APPROVAL or pass --yes with --approval-rationale \"...\"."
    );
    return exitCodes.validationFailure;
  } else {
    const ttyOk = await promptTTYConfirmation(
      "Attach Workflow Cannon to this directory? Type yes/y to continue (writes kit-owned files): ",
      writeLine,
      readStdinLine
    );
    if (!ttyOk) {
      writeLine("Initialization cancelled. No files changed.");
      return exitCodes.validationFailure;
    }
    rationale = "interactive tty confirmation for workspace-kit init";
  }

  const runtimeContract = validateInitRuntimeContract(cwd);
  if (!runtimeContract.ok) {
    await appendInitPolicyTrace(cwd, rationale, false);
    writeError("workspace-kit init requires a valid runtime contract before attaching this workspace.");
    for (const issue of runtimeContract.issues) {
      writeError(`- ${issue.code}: ${issue.message}`);
    }
    return exitCodes.validationFailure;
  }

  const applied = await applyInitPlan(cwd, plan, { dryRun: false, force: flags.force });
  if (!applied.ok) {
    await appendInitPolicyTrace(cwd, rationale, false);
    writeError(applied.message ?? "workspace-kit init failed.");
    for (const w of applied.warnings) {
      writeError(`- ${w}`);
    }
    return exitCodes.validationFailure;
  }

  await establishRuntimeArtifacts(cwd, runtimeContract, applied);

  const sqliteResult = await ensurePlanningStoresInitialized(cwd);
  if (!sqliteResult.ok) {
    await appendInitPolicyTrace(cwd, rationale, false);
    writeError(`SQLite initialization issue: ${sqliteResult.message ?? "unknown error"}`);
    return exitCodes.validationFailure;
  }

  const starterWarnings: string[] = [];
  if (!flags.noStarterTask && !(await workspaceHasStarterTask(cwd))) {
    const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules);
    const ctx = {
      workspacePath: cwd,
      effectiveConfig: effective as Record<string, unknown>,
      runtimeVersion: "0"
    } as ModuleLifecycleContext;
    const stores = await openPlanningStores(ctx);
    await stores.taskStore.load();
    const gen = stores.sqliteDual.getPlanningGeneration();
    stores.sqliteDual.closeDatabase();

    const payload: Record<string, unknown> = {
      allocateId: true,
      title: "Validate Workflow Cannon onboarding",
      status: "ready",
      type: "workspace-kit",
      summary: "Confirm Workflow Cannon CLI surfaces after init.",
      technicalScope: [
        "Run `workspace-kit doctor`",
        "Run `workspace-kit start`",
        "Run `workspace-kit run dashboard-summary '{}'`"
      ],
      acceptanceCriteria: [
        "workspace-kit doctor passes",
        "workspace-kit start prints status",
        "workspace-kit run dashboard-summary '{}' succeeds"
      ],
      metadata: {
        createdBy: "workspace-kit-init",
        starterTask: true
      },
      expectedPlanningGeneration: gen
    };

    const starterIo =
      flags.json ? { writeLine, writeError, readStdinLine } : {
        writeLine: () => {},
        writeError,
        readStdinLine
      };

    const code = await handleRunCommand(
      cwd,
      ["run", "create-task", JSON.stringify(payload)],
      starterIo,
      exitCodes
    );
    if (code !== exitCodes.success) {
      starterWarnings.push(
        "Starter task was not created (create-task returned non-zero); kit files are still installed."
      );
    }
  }

  const doctorIssues = await collectDoctorContractIssues(cwd);
  if (doctorIssues.length > 0) {
    await appendInitPolicyTrace(cwd, rationale, false);
    writeError("workspace-kit init completed writes but doctor validation failed:");
    for (const issue of doctorIssues) {
      writeError(`- ${issue.path}: ${issue.reason}`);
    }
    return exitCodes.validationFailure;
  }

  await appendInitPolicyTrace(cwd, rationale, true);

  if (flags.json) {
    writeLine(
      JSON.stringify(
        {
          ok: true,
          code: "init-complete",
          schemaVersion: 1,
          data: {
            mode: plan.mode,
            filesCreated: applied.filesCreated,
            filesUpdated: applied.filesUpdated,
            filesPreserved: applied.filesPreserved,
            runtimeContract,
            sqlite: { ok: sqliteResult.ok, dbPath: sqliteResult.relativeDbPath },
            doctor: { ok: true },
            nextCommands: [
              "workspace-kit start",
              "workspace-kit run get-next-actions '{}'",
              "workspace-kit run dashboard-summary '{}'"
            ],
            warnings: [...applied.warnings, ...starterWarnings]
          }
        },
        null,
        2
      )
    );
    return exitCodes.success;
  }

  writeLine("workspace-kit init completed.");
  writeLine(`- Runtime stamp: .workspace-kit/runtime.json`);
  writeLine(`- Runtime launcher: .workspace-kit/bin/wk`);
  writeLine(`- SQLite: ${sqliteResult.relativeDbPath}`);
  writeLine("- workspace-kit doctor passed.");
  writeLine("Next:");
  writeLine("  workspace-kit start");
  writeLine("  workspace-kit run get-next-actions '{}'");
  writeLine("  workspace-kit run dashboard-summary '{}'");
  for (const w of starterWarnings) {
    writeLine(`- warning: ${w}`);
  }
  return exitCodes.success;
}
