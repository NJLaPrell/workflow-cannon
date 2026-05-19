import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  applyTaskStoreSyncReport,
  buildTaskStoreSyncReport
} from "../persistence/sync-task-store-after-merge.js";

function readRef(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) {
    return null;
  }
  return v.trim();
}

export async function runSyncTaskStoreAfterMergeCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const sourceRef = readRef(args, "sourceRef");
  if (!sourceRef) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "sync-task-store-after-merge requires sourceRef (e.g. feature/T100340-arch-mismatch-remediation or origin/release/phase-102)",
      remediation: { instructionPath: "src/modules/task-engine/instructions/sync-task-store-after-merge.md" }
    };
  }
  const targetRef = readRef(args, "targetRef") ?? "working-tree";
  const dryRun = args.dryRun !== false && args.apply !== true;

  if (dryRun) {
    const { report } = await buildTaskStoreSyncReport({
      workspacePath: ctx.workspacePath,
      effectiveConfig: ctx.effectiveConfig ?? {},
      sourceRef,
      targetRef
    });
    return {
      ok: true,
      code: "task-store-sync-dry-run",
      message: `Task store sync dry-run: ${report.missingTransitionCount} missing transition(s) across ${report.diffs.length} task(s)`,
      data: { ...report, dryRun: true, applied: 0, skipped: 0 }
    };
  }

  const result = await applyTaskStoreSyncReport({
    workspacePath: ctx.workspacePath,
    effectiveConfig: ctx.effectiveConfig ?? {},
    sourceRef,
    dryRun: false
  });
  return {
    ok: true,
    code: "task-store-sync-applied",
    message: `Task store sync applied ${result.applied} transition(s); skipped ${result.skipped}`,
    data: { ...result.report, dryRun: false, applied: result.applied, skipped: result.skipped }
  };
}
