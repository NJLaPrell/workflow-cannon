import { runGit } from "../checkpoints/checkpoint-git.js";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";

export type KitStateClassification =
  | "durable-planning-state"
  | "generated-export"
  | "volatile-runtime-state"
  | "kit-config"
  | "unknown-kit-state";

export function classifyKitStatePath(path: string): {
  path: string;
  classification: KitStateClassification;
  safeAction: string;
} {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === ".workspace-kit/tasks/workspace-kit.db") {
    return {
      path: normalized,
      classification: "durable-planning-state",
      safeAction:
        "Commit only after a mutating workspace-kit response says the change is durable task/workspace evidence; otherwise restore after verifying state."
    };
  }
  if (
    normalized === "docs/maintainers/data/workspace-kit-status.yaml" ||
    normalized === "docs/maintainers/data/workspace-kit-status.db-export.yaml"
  ) {
    return {
      path: normalized,
      classification: "generated-export",
      safeAction: "Regenerate with export-workspace-status or commit together with the workspace-status mutation that produced it."
    };
  }
  if (
    normalized.startsWith(".workspace-kit/runtime/") ||
    normalized.startsWith(".workspace-kit/kit/") ||
    normalized.startsWith(".workspace-kit/cae/runtime/")
  ) {
    return {
      path: normalized,
      classification: "volatile-runtime-state",
      safeAction: "Do not commit for release evidence; restore, ignore, or move to an untracked runtime store."
    };
  }
  if (normalized.startsWith(".workspace-kit/config") || normalized === "workspace-kit.profile.json") {
    return {
      path: normalized,
      classification: "kit-config",
      safeAction: "Treat as durable configuration; commit only when the task intentionally changed kit config."
    };
  }
  return {
    path: normalized,
    classification: "unknown-kit-state",
    safeAction: "Inspect before checkout, pull, merge, tag, or publish; do not assume this is disposable churn."
  };
}

function parsePorcelainPaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (line.length < 4) continue;
    const rest = line.slice(3).trim();
    if (!rest) continue;
    paths.push(rest.includes(" -> ") ? rest.split(" -> ").pop()!.trim() : rest);
  }
  return [...new Set(paths)].filter((p) => {
    const normalized = p.replace(/\\/g, "/").replace(/^\.\//, "");
    return normalized.startsWith(".workspace-kit/") || normalized.startsWith("docs/maintainers/data/workspace-kit-status");
  });
}

export async function runClassifyKitState(
  ctx: ModuleLifecycleContext,
  _args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const git = runGit(ctx.workspacePath, ["status", "--porcelain=v1"]);
  if (!git.ok) {
    return {
      ok: false,
      code: "git-status-unavailable",
      message: git.error
    };
  }
  const dirtyPaths = parsePorcelainPaths(git.stdout);
  const items = dirtyPaths.map((dirtyPath) => {
    const statusLine = git.stdout
      .split("\n")
      .find((line) => line.slice(3).trim() === dirtyPath || line.slice(3).trim().endsWith(` -> ${dirtyPath}`));
    return {
      ...classifyKitStatePath(dirtyPath),
      gitStatus: statusLine?.slice(0, 2) ?? "??"
    };
  });
  const summary = items.reduce<Record<KitStateClassification, number>>(
    (acc, row) => {
      acc[row.classification] += 1;
      return acc;
    },
    {
      "durable-planning-state": 0,
      "generated-export": 0,
      "volatile-runtime-state": 0,
      "kit-config": 0,
      "unknown-kit-state": 0
    }
  );
  return {
    ok: true,
    code: "kit-state-classified",
    message: items.length
      ? `Classified ${items.length} dirty kit-owned path(s)`
      : "No dirty kit-owned paths detected",
    data: {
      schemaVersion: 1,
      dirtyPathCount: items.length,
      items,
      summary,
      releaseSafe: items.every((row) => row.classification === "volatile-runtime-state"),
      guidance:
        items.length === 0
          ? "No dirty kit-owned state detected."
          : "Resolve dirty durable planning/config/export paths before checkout, pull, merge, tag, or publish."
    }
  };
}
