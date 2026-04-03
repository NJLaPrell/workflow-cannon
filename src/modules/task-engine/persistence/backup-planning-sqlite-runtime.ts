import fs from "node:fs";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";

/**
 * Hot backup of the configured planning SQLite file using better-sqlite3's online backup API.
 * Prefer this over copying the .db file while writers may be active.
 */
export async function runBackupPlanningSqlite(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<{
  ok: boolean;
  code: string;
  message: string;
  data?: { source: string; destination: string };
}> {
  const raw = typeof args.outputPath === "string" ? args.outputPath.trim() : "";
  if (!raw) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "backup-planning-sqlite requires outputPath (relative to workspace or absolute)"
    };
  }

  const srcAbs = path.resolve(ctx.workspacePath, planningSqliteDatabaseRelativePath(ctx));
  if (!fs.existsSync(srcAbs)) {
    return {
      ok: false,
      code: "storage-read-error",
      message: `Planning database not found at ${path.relative(ctx.workspacePath, srcAbs) || srcAbs}`
    };
  }

  const destAbs = path.isAbsolute(raw) ? raw : path.resolve(ctx.workspacePath, raw);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });

  const { default: Database } = await import("better-sqlite3");
  const db = new Database(srcAbs, { readonly: true });
  try {
    await db.backup(destAbs);
  } finally {
    db.close();
  }

  return {
    ok: true,
    code: "planning-sqlite-backed-up",
    message: "Planning SQLite backup completed",
    data: {
      source: path.relative(ctx.workspacePath, srcAbs) || srcAbs,
      destination: path.relative(ctx.workspacePath, destAbs) || destAbs
    }
  };
}
