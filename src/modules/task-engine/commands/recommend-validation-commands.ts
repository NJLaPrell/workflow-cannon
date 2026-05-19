import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  CLI_REMEDIATION_DOCS,
  CLI_REMEDIATION_INSTRUCTIONS
} from "../../../core/cli-remediation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import type { TaskEntity } from "../types.js";
import { readPlanString } from "./task-intent-commands.js";

export type ValidationRecommendation = {
  priority: number;
  command: string;
  rationale: string;
  expectedEvidenceFields: {
    validationCommands: Array<{ command: string; result: string }>;
    checks: Array<{ name: string; conclusion: string }>;
  };
};

const BASE_CHECK = "pnpm run check";
const BUILD = "pnpm run build";
const TEST_ALL = "pnpm run test";
const PRE_MERGE = "pnpm run pre-merge-gates";
const PARITY = "pnpm run parity";

function readStringArray(args: Record<string, unknown>, key: string): string[] {
  const raw = args[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function taskFeatures(task: TaskEntity | undefined): string[] {
  if (!task) {
    return [];
  }
  if (Array.isArray(task.features)) {
    return task.features.filter((x): x is string => typeof x === "string");
  }
  const fromRouting = task.agentRouting?.features;
  if (Array.isArray(fromRouting)) {
    return fromRouting.filter((x): x is string => typeof x === "string");
  }
  const meta = task.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const raw = (meta as Record<string, unknown>).features;
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === "string");
    }
  }
  return [];
}

function priorValidationCommands(task: TaskEntity | undefined): string[] {
  const meta = task?.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return [];
  }
  const de = (meta as Record<string, unknown>).deliveryEvidence;
  if (!de || typeof de !== "object" || Array.isArray(de)) {
    return [];
  }
  const cmds = (de as Record<string, unknown>).validationCommands;
  if (!Array.isArray(cmds)) {
    return [];
  }
  const out: string[] = [];
  for (const row of cmds) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const c = (row as Record<string, unknown>).command;
      if (typeof c === "string" && c.trim()) {
        out.push(c.trim());
      }
    }
  }
  return out;
}

function pathSignals(paths: string[]): {
  schemas: boolean;
  contracts: boolean;
  taskEngine: boolean;
  improvement: boolean;
  extension: boolean;
  cli: boolean;
  docs: boolean;
} {
  const lower = paths.map((p) => p.replace(/\\/g, "/").toLowerCase());
  return {
    schemas: lower.some((p) => p.includes("/schemas/") || p.startsWith("schemas/")),
    contracts: lower.some((p) => p.includes("/contracts/") || p.includes("builtin-run-command-manifest")),
    taskEngine: lower.some((p) => p.includes("/modules/task-engine/")),
    improvement: lower.some((p) => p.includes("/modules/improvement/")),
    extension: lower.some((p) => p.includes("cursor-workflow-cannon") || p.includes("/extension/")),
    cli: lower.some((p) => p.includes("/cli.") || p.includes("dist/cli")),
    docs: lower.some((p) => p.includes("/.ai/") || p.includes("/documentation/"))
  };
}

function evidenceFor(command: string, checkName: string): ValidationRecommendation["expectedEvidenceFields"] {
  return {
    validationCommands: [{ command, result: "success" }],
    checks: [{ name: checkName, conclusion: "success" }]
  };
}

function addRecommendation(
  list: ValidationRecommendation[],
  seen: Set<string>,
  priority: number,
  command: string,
  rationale: string,
  checkName: string
): void {
  if (seen.has(command)) {
    return;
  }
  seen.add(command);
  list.push({
    priority,
    command,
    rationale,
    expectedEvidenceFields: evidenceFor(command, checkName)
  });
}

export function buildRecommendValidation(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): ModuleCommandResult {
  const taskId = readPlanString(args, "taskId");
  const touchedPaths = readStringArray(args, "touchedPaths");
  const diffPaths = readStringArray(args, "diffPaths");
  const extraFeatures = readStringArray(args, "features");
  const paths = [...touchedPaths, ...diffPaths];
  if (!taskId && paths.length === 0 && extraFeatures.length === 0) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "recommend-validation requires taskId, touchedPaths, diffPaths, or features.",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.recommendValidation }
    };
  }
  const task = taskId ? store.getTask(taskId) : undefined;
  if (taskId && !task) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Task '${taskId}' not found.`,
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.recommendValidation }
    };
  }

  const features = [...new Set([...taskFeatures(task), ...extraFeatures])];
  const signals = pathSignals(paths);
  const recommendations: ValidationRecommendation[] = [];
  const seen = new Set<string>();

  addRecommendation(
    recommendations,
    seen,
    10,
    BASE_CHECK,
    "Default maintainer gate: metadata, manifests, and consistency scripts.",
    "check"
  );

  if (signals.schemas || signals.contracts || features.includes("policy-registry")) {
    addRecommendation(
      recommendations,
      seen,
      20,
      BASE_CHECK,
      "Schema or contract paths changed — `check` validates run-args snapshots and policy manifests.",
      "check-schemas"
    );
  }

  if (signals.taskEngine || features.includes("task-engine") || features.includes("module-platform")) {
    addRecommendation(
      recommendations,
      seen,
      25,
      BUILD,
      "Task-engine or router surface changed — compile TypeScript before targeted tests.",
      "build"
    );
    addRecommendation(
      recommendations,
      seen,
      30,
      "pnpm run build && node --test test/task-engine.test.mjs",
      "Focused task-engine regression suite.",
      "task-engine-test"
    );
    addRecommendation(
      recommendations,
      seen,
      35,
      "pnpm run build && node --test test/module-command-router.test.mjs",
      "Command router registration and ordering.",
      "module-command-router-test"
    );
  }

  if (signals.improvement || features.includes("improvement-loop")) {
    addRecommendation(
      recommendations,
      seen,
      32,
      "pnpm run build && node --test test/improvement.test.mjs",
      "Improvement pipeline paths touched.",
      "improvement-test"
    );
  }

  if (signals.extension || features.includes("cursor-extension")) {
    addRecommendation(
      recommendations,
      seen,
      40,
      "pnpm run ext:compile",
      "Cursor extension sources changed.",
      "ext-compile"
    );
  }

  if (signals.docs || features.includes("doc-generation")) {
    addRecommendation(
      recommendations,
      seen,
      45,
      "pnpm run check:doc-governance-stages",
      "Documentation or `.ai` keyed sources changed.",
      "doc-governance"
    );
  }

  if (paths.length === 0 && !task) {
    addRecommendation(
      recommendations,
      seen,
      50,
      TEST_ALL,
      "No taskId or paths supplied — full test suite is the safe default.",
      "test"
    );
  } else if (paths.length > 0 || task) {
    addRecommendation(
      recommendations,
      seen,
      55,
      TEST_ALL,
      "Run full tests before merge unless a narrower command already passed in CI.",
      "test"
    );
  }

  addRecommendation(
    recommendations,
    seen,
    60,
    PRE_MERGE,
    "Maintainer delivery: run before opening or merging a PR (includes maintainer-gates + test).",
    "pre-merge-gates"
  );

  if (features.includes("config-cli") || features.includes("config-model")) {
    addRecommendation(recommendations, seen, 65, PARITY, "Config resolution paths may affect parity fixtures.", "parity");
  }

  for (const cmd of priorValidationCommands(task)) {
    addRecommendation(recommendations, seen, 5, cmd, "Prior delivery evidence on this task used this command.", "prior-delivery");
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    taskId: taskId ?? null,
    taskStatus: task?.status ?? null,
    features,
    touchedPathCount: paths.length,
    recommendations,
    deliveryEvidenceHint: {
      schemaVersion: 2,
      validationCommands: recommendations.slice(0, 5).map((r) => ({
        command: r.command,
        result: "success"
      })),
      checks: recommendations.slice(0, 5).map((r) => ({
        name: r.expectedEvidenceFields.checks[0]?.name ?? "validation",
        conclusion: "success"
      }))
    },
    remediation: {
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.recommendValidation,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
  };
  attachPolicyMeta(data, ctx, planningGeneration);

  return {
    ok: true,
    code: "recommend-validation",
    message:
      taskId && task
        ? `Validation plan for ${taskId} (${recommendations.length} command(s))`
        : `Validation plan from paths/features (${recommendations.length} command(s))`,
    data
  };
}
