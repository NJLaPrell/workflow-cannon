import { spawn } from "node:child_process";
import { collectDoctorContractIssues } from "../../cli/doctor-contract-validation.js";
import { buildScopePathManifest } from "./kickoff/scope-path-manifest.js";
import { evaluatePathStaleness } from "./kickoff/path-git-staleness.js";
import type { KickoffScopeFindingCode } from "./kickoff/types.js";
import { buildRecommendValidation } from "./commands/recommend-validation-commands.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "./persistence/planning-open.js";
import type { TaskStore } from "./persistence/store.js";
import { readPhaseCatalogRows } from "./persistence/phase-catalog-store.js";
import { buildQueueGitAlignmentReport, probeGitHead } from "./queue/queue-git-alignment.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity, TaskStatus } from "./types.js";

export const PHASE_KICKOFF_READINESS_SCHEMA_VERSION = 1 as const;

export const DEFAULT_KICKOFF_BASE_REF = "origin/main";
export const DEFAULT_STALE_TASK_DAYS = 14;
export const DEFAULT_SCOPE_TASK_CAP = 50;
export const DEFAULT_VALIDATION_READY_TOP = 5;

export type KickoffReadinessSeverity = "advisory" | "warn" | "block";
export type KickoffReadinessMode = "advisory" | "enforce";

export type KickoffReadinessFinding = {
  code: string;
  severity: KickoffReadinessSeverity;
  message: string;
  taskId?: string;
  path?: string;
  slice: "planning" | "git" | "scope" | "validation" | "doctor";
};

type GitRunResult = {
  ok: boolean;
  stdout: string;
};

function runGit(cwd: string, argv: string[]): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["-C", cwd, ...argv]);
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => resolve({ ok: false, stdout: "" }));
    child.on("close", (status) => resolve({ ok: status === 0, stdout: stdout.trimEnd() }));
  });
}

async function refExists(workspacePath: string, ref: string): Promise<boolean> {
  const r = await runGit(workspacePath, ["rev-parse", "--verify", ref]);
  return r.ok && r.stdout.length > 0;
}

async function revListCount(workspacePath: string, range: string): Promise<number | null> {
  const r = await runGit(workspacePath, ["rev-list", "--count", range]);
  if (!r.ok) {
    return null;
  }
  const n = Number.parseInt(r.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function readStringArg(args: Record<string, unknown>, key: string): string | null {
  const raw = args[key];
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  return raw.trim();
}

function readBooleanArg(args: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const raw = args[key];
  return typeof raw === "boolean" ? raw : defaultValue;
}

function readPositiveIntArg(args: Record<string, unknown>, key: string, defaultValue: number): number {
  const raw = args[key];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return defaultValue;
  }
  return Math.floor(raw);
}

function defaultIntegrationRef(phaseKey: string): string {
  return `origin/release/phase-${phaseKey}`;
}

function phaseTasks(tasks: TaskEntity[], phaseKey: string): TaskEntity[] {
  return tasks.filter((task) => !task.archived && inferTaskPhaseKey(task) === phaseKey);
}

function countByStatus(tasks: TaskEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}

function parseIsoMs(iso: string | undefined): number | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function severityForScopeCode(code: KickoffScopeFindingCode): KickoffReadinessSeverity {
  switch (code) {
    case "kickoff-scope-path-deleted":
    case "kickoff-scope-path-missing":
      return "warn";
    case "kickoff-scope-path-stale":
    case "kickoff-scope-path-parse-skipped":
    case "kickoff-git-unavailable":
    default:
      return "advisory";
  }
}

function passedFromFindings(findings: KickoffReadinessFinding[]): boolean {
  return !findings.some((f) => f.severity === "block");
}

function normalizeHeuristicText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function catalogMismatchHeuristic(
  catalogDescription: string | null | undefined,
  tasks: TaskEntity[]
): boolean {
  if (!catalogDescription?.trim()) {
    return false;
  }
  const catalog = normalizeHeuristicText(catalogDescription);
  const combined = normalizeHeuristicText(
    tasks
      .map((t) => [t.title, t.summary, t.description].filter(Boolean).join(" "))
      .join(" ")
  );
  if (!combined) {
    return true;
  }
  if (combined.includes(catalog) || catalog.includes(combined.slice(0, Math.min(48, combined.length)))) {
    return false;
  }
  const catalogTokens = catalog.split(" ").filter((t) => t.length > 3);
  const matched = catalogTokens.filter((token) => combined.includes(token)).length;
  return catalogTokens.length > 0 && matched < Math.ceil(catalogTokens.length / 2);
}

const SCOPE_CHECK_STATUSES: TaskStatus[] = ["ready", "in_progress", "proposed"];

export async function buildPhaseKickoffReadiness(args: {
  ctx: ModuleLifecycleContext;
  planning: OpenedPlanningStores;
  store: TaskStore;
  commandArgs: Record<string, unknown>;
  phaseKey: string | null;
}): Promise<Record<string, unknown>> {
  const { ctx, planning, store, commandArgs, phaseKey } = args;
  const findings: KickoffReadinessFinding[] = [];
  const mode = (readStringArg(commandArgs, "mode") ?? "advisory") as KickoffReadinessMode;
  const staleTaskDays = readPositiveIntArg(commandArgs, "staleTaskDays", DEFAULT_STALE_TASK_DAYS);
  const checkScopePaths = readBooleanArg(commandArgs, "checkScopePaths", true);
  const includeValidationPlans = readBooleanArg(commandArgs, "includeValidationPlans", true);
  const baseRef = readStringArg(commandArgs, "baseRef") ?? DEFAULT_KICKOFF_BASE_REF;
  const integrationRef =
    readStringArg(commandArgs, "integrationRef") ??
    (phaseKey ? defaultIntegrationRef(phaseKey) : null);

  const activeTasks = store.getActiveTasks();
  const scopedTasks = phaseKey ? phaseTasks(activeTasks, phaseKey) : [];
  const completedIds = new Set(
    activeTasks.filter((t) => t.status === "completed").map((t) => t.id)
  );
  const staleCutoffMs = Date.now() - staleTaskDays * 24 * 60 * 60 * 1000;

  const planningCounts = countByStatus(scopedTasks);
  const staleTasks = scopedTasks.filter((task) => {
    if (task.status !== "ready" && task.status !== "in_progress") {
      return false;
    }
    const updatedMs = parseIsoMs(task.updatedAt);
    return updatedMs !== null && updatedMs < staleCutoffMs;
  });
  for (const task of staleTasks) {
    findings.push({
      code: "kickoff-planning-stale-task",
      severity: "warn",
      message: `Task ${task.id} (${task.status}) was last updated before the ${staleTaskDays}-day kickoff stale threshold`,
      taskId: task.id,
      slice: "planning"
    });
  }

  const dependencyBlockedReady = scopedTasks.filter((task) => {
    if (task.status !== "ready") {
      return false;
    }
    const deps = task.dependsOn ?? [];
    return deps.some((depId) => !completedIds.has(depId));
  });
  for (const task of dependencyBlockedReady) {
    const unmet = (task.dependsOn ?? []).filter((depId) => !completedIds.has(depId));
    findings.push({
      code: "kickoff-planning-dependency-blocked",
      severity: "warn",
      message: `Ready task ${task.id} has unmet dependencies: ${unmet.join(", ")}`,
      taskId: task.id,
      slice: "planning"
    });
  }

  if (phaseKey) {
    const catalogRow = readPhaseCatalogRows(planning.sqliteDual.getDatabase()).find(
      (row) => row.phaseKey === phaseKey
    );
    const activeScopeTasks = scopedTasks.filter((t) =>
      ["ready", "in_progress", "proposed"].includes(t.status)
    );
    if (catalogMismatchHeuristic(catalogRow?.shortDescription, activeScopeTasks)) {
      findings.push({
        code: "kickoff-planning-catalog-mismatch",
        severity: "advisory",
        message: `Phase catalog shortDescription for ${phaseKey} may not match current task summaries (advisory heuristic)`,
        slice: "planning"
      });
    }
  }

  let integrationBranchExists: boolean | null = null;
  let aheadOfBase: number | null = null;
  let behindBase: number | null = null;
  if (integrationRef) {
    integrationBranchExists = await refExists(ctx.workspacePath, integrationRef);
    if (!integrationBranchExists) {
      findings.push({
        code: "kickoff-git-integration-branch-missing",
        severity: mode === "enforce" ? "block" : "warn",
        message: `Integration ref ${integrationRef} is not available; create or fetch the phase branch before kickoff`,
        slice: "git"
      });
    } else {
      aheadOfBase = await revListCount(ctx.workspacePath, `${baseRef}..${integrationRef}`);
      behindBase = await revListCount(ctx.workspacePath, `${integrationRef}..${baseRef}`);
      if (aheadOfBase !== null && aheadOfBase > 0) {
        findings.push({
          code: "kickoff-git-ahead-of-base",
          severity: "advisory",
          message: `${integrationRef} is ${aheadOfBase} commit(s) ahead of ${baseRef}`,
          slice: "git"
        });
      }
      if (behindBase !== null && behindBase > 0) {
        findings.push({
          code: "kickoff-git-behind-base",
          severity: "warn",
          message: `${integrationRef} is ${behindBase} commit(s) behind ${baseRef}`,
          slice: "git"
        });
      }
    }
  }

  const queueGitAlignment = buildQueueGitAlignmentReport({
    workspacePath: ctx.workspacePath,
    tasks: activeTasks,
    transitionLog: store.getTransitionLog(),
    storeLastUpdated: store.getLastUpdated(),
    git: probeGitHead(ctx.workspacePath)
  });

  const scopeTaskCandidates = scopedTasks
    .filter((task) => SCOPE_CHECK_STATUSES.includes(task.status))
    .slice(0, DEFAULT_SCOPE_TASK_CAP);
  const scopeEntries: Array<{
    taskId: string;
    paths: string[];
    manifestFindings: number;
    stalenessFindings: number;
  }> = [];

  if (checkScopePaths) {
    for (const task of scopeTaskCandidates) {
      const manifest = buildScopePathManifest(task);
      for (const raw of manifest.findings) {
        findings.push({
          code: raw.code,
          severity: severityForScopeCode(raw.code),
          message: raw.message,
          taskId: task.id,
          path: raw.path,
          slice: "scope"
        });
      }
      if (manifest.paths.length > 0) {
        const staleness = await evaluatePathStaleness({
          workspacePath: ctx.workspacePath,
          paths: manifest.paths,
          sinceIso: task.updatedAt,
          baseRef: integrationRef ?? baseRef
        });
        for (const raw of staleness.findings) {
          findings.push({
            code: raw.code,
            severity: severityForScopeCode(raw.code),
            message: raw.message,
            taskId: task.id,
            path: raw.path,
            slice: "scope"
          });
        }
        scopeEntries.push({
          taskId: task.id,
          paths: manifest.paths,
          manifestFindings: manifest.findings.length,
          stalenessFindings: staleness.findings.length
        });
      }
    }
  }

  const validationPlans: Array<Record<string, unknown>> = [];
  if (includeValidationPlans && phaseKey) {
    const readyTop = scopedTasks.filter((t) => t.status === "ready").slice(0, DEFAULT_VALIDATION_READY_TOP);
    for (const task of readyTop) {
      const result = buildRecommendValidation(ctx, planning, store, { taskId: task.id });
      if (result.ok && result.data) {
        const data = result.data as Record<string, unknown>;
        const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
        validationPlans.push({
          taskId: task.id,
          recommendationCount: recommendations.length,
          topCommands: recommendations.slice(0, 3).map((row: { command?: string }) => row.command ?? null)
        });
        if (recommendations.length > 0) {
          findings.push({
            code: "kickoff-validation-recommendation",
            severity: "advisory",
            message: `Task ${task.id} has ${recommendations.length} recommended validation command(s) before delivery`,
            taskId: task.id,
            slice: "validation"
          });
        }
      }
    }
  }

  let doctorIssueCount = 0;
  let doctorIssues: Array<{ path: string; reason: string }> = [];
  try {
    doctorIssues = await collectDoctorContractIssues(ctx.workspacePath);
    doctorIssueCount = doctorIssues.length;
    if (doctorIssueCount > 0) {
      findings.push({
        code: "kickoff-doctor-contract-issues",
        severity: "warn",
        message: `Doctor contract check reported ${doctorIssueCount} issue(s)`,
        slice: "doctor"
      });
    }
  } catch {
    findings.push({
      code: "kickoff-doctor-unavailable",
      severity: "advisory",
      message: "Doctor contract issues could not be collected for kickoff readiness",
      slice: "doctor"
    });
  }

  const passed = passedFromFindings(findings);

  return {
    schemaVersion: PHASE_KICKOFF_READINESS_SCHEMA_VERSION,
    phaseKey,
    mode,
    passed,
    findingCount: findings.length,
    findings,
    checkedTaskCount: scopedTasks.length,
    slices: {
      planning: {
        countsByStatus: planningCounts,
        staleTaskCount: staleTasks.length,
        dependencyBlockedReadyCount: dependencyBlockedReady.length
      },
      git: {
        baseRef,
        integrationRef,
        integrationBranchExists,
        aheadOfBase,
        behindBase,
        queueGitAlignment
      },
      scope: {
        enabled: checkScopePaths,
        checkedTaskCount: scopeTaskCandidates.length,
        tasksWithPaths: scopeEntries.length,
        entries: scopeEntries
      },
      validation: {
        enabled: includeValidationPlans,
        readyTasksChecked: validationPlans.length,
        plans: validationPlans
      },
      doctor: {
        ok: doctorIssueCount === 0,
        issueCount: doctorIssueCount,
        issues: doctorIssues.slice(0, 10)
      }
    }
  };
}
