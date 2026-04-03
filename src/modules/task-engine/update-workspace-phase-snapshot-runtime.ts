import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  applyWorkspacePhaseSnapshotToYaml,
  parseWorkspaceKitStatusYaml,
  WORKSPACE_KIT_STATUS_YAML_RELATIVE
} from "./dashboard/dashboard-status.js";

/** Atomic update of `current_kit_phase` / `next_kit_phase` in workspace-kit-status.yaml. */
export async function runUpdateWorkspacePhaseSnapshot(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;

  let currentKitPhase: string | undefined;
  let nextKitPhase: string | null | undefined;

  if (Object.hasOwn(args, "currentKitPhase")) {
    const v = args.currentKitPhase;
    if (v === null) {
      return { ok: false, code: "invalid-task-schema", message: "currentKitPhase cannot be null" };
    }
    if (typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "currentKitPhase must be a string when provided" };
    }
    currentKitPhase = v;
  }

  if (Object.hasOwn(args, "nextKitPhase")) {
    const v = args.nextKitPhase;
    if (v === null) {
      nextKitPhase = null;
    } else if (typeof v === "string") {
      nextKitPhase = v;
    } else {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "nextKitPhase must be a string or JSON null when provided"
      };
    }
  }

  if (currentKitPhase === undefined && nextKitPhase === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message:
        "update-workspace-phase-snapshot requires currentKitPhase and/or nextKitPhase (string); use null for nextKitPhase to remove the line"
    };
  }

  const updates: { currentKitPhase?: string; nextKitPhase?: string | null } = {};
  if (currentKitPhase !== undefined) {
    updates.currentKitPhase = currentKitPhase;
  }
  if (nextKitPhase !== undefined) {
    updates.nextKitPhase = nextKitPhase;
  }

  const abs = path.join(ctx.workspacePath, WORKSPACE_KIT_STATUS_YAML_RELATIVE);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return {
      ok: false,
      code: "storage-read-error",
      message: `Cannot read ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}`
    };
  }

  const before = parseWorkspaceKitStatusYaml(raw);
  const applied = applyWorkspacePhaseSnapshotToYaml(raw, updates);
  if (!applied.ok) {
    return { ok: false, code: "invalid-transition", message: applied.message };
  }

  if (dryRun) {
    const after = parseWorkspaceKitStatusYaml(applied.yaml);
    return {
      ok: true,
      code: "workspace-phase-snapshot-dry-run",
      message: "Dry run — no file write",
      data: {
        dryRun: true,
        fileRelativePath: WORKSPACE_KIT_STATUS_YAML_RELATIVE,
        snapshotBefore: before,
        snapshotAfter: after
      } as Record<string, unknown>
    };
  }

  const tmpPath = `${abs}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(tmpPath, applied.yaml, "utf8");
    await fs.rename(tmpPath, abs);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to write ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}: ${(err as Error).message}`
    };
  }

  const after = parseWorkspaceKitStatusYaml(applied.yaml);
  return {
    ok: true,
    code: "workspace-phase-snapshot-updated",
    message: `Updated phase snapshot fields in ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}`,
    data: {
      dryRun: false,
      fileRelativePath: WORKSPACE_KIT_STATUS_YAML_RELATIVE,
      snapshotBefore: before,
      snapshotAfter: after
    } as Record<string, unknown>
  };
}
