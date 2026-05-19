import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { waitForPrChecks } from "../wait-for-pr-checks-runtime.js";

const INSTRUCTION = "src/modules/task-engine/instructions/wait-for-pr-checks.md";

function readPr(args: Record<string, unknown>): number | null {
  if (typeof args.pr === "number" && Number.isInteger(args.pr) && args.pr > 0) {
    return args.pr;
  }
  if (typeof args.pr === "string" && args.pr.trim()) {
    const s = args.pr.trim();
    const fromUrl = s.match(/\/pull\/(\d+)\b/);
    if (fromUrl) {
      return Number.parseInt(fromUrl[1]!, 10);
    }
    const n = Number.parseInt(s, 10);
    if (Number.isInteger(n) && n > 0) {
      return n;
    }
  }
  return null;
}

function readPositiveInt(args: Record<string, unknown>, key: string, fallback: number): number {
  const raw = args[key];
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return fallback;
}

export function buildWaitForPrChecks(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): ModuleCommandResult {
  const pr = readPr(args);
  if (!pr) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "wait-for-pr-checks requires pr (number or pull request URL).",
      remediation: { instructionPath: INSTRUCTION }
    };
  }

  const timeoutSec = readPositiveInt(args, "timeoutSec", 1800);
  const intervalSec = readPositiveInt(args, "intervalSec", 20);
  const requiredOnly = args.requiredOnly !== false;

  const result = waitForPrChecks({
    workspacePath: ctx.workspacePath,
    pr,
    timeoutSec,
    intervalSec,
    requiredOnly
  });

  const data: Record<string, unknown> = {
    ...result,
    requiredOnly,
    timeoutSec,
    intervalSec,
    remediation: { instructionPath: INSTRUCTION }
  };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());

  const passed = result.state === "passed";
  return {
    ok: passed,
    code: passed ? "wait-for-pr-checks-passed" : `wait-for-pr-checks-${result.state}`,
    message: passed
      ? `PR #${pr} checks passed after ${result.elapsedSec}s (${result.pollCount} poll(s))`
      : `PR #${pr} checks ended with state '${result.state}' after ${result.elapsedSec}s`,
    data
  };
}
