import fs from "node:fs/promises";
import path from "node:path";
import { UnifiedStateDb } from "./unified-state-db.js";

export const SIDECAR_MIGRATED_SUFFIX = ".migrated";

export type SidecarReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; corrupt: true }
  | { ok: false; missing: true };

export function sidecarPath(workspacePath: string, relativePath: string): string {
  return path.join(workspacePath, relativePath);
}

export async function readSidecarJsonFile(
  workspacePath: string,
  relativePath: string
): Promise<SidecarReadResult<Record<string, unknown>>> {
  const fp = sidecarPath(workspacePath, relativePath);
  try {
    const rawText = await fs.readFile(fp, "utf8");
    const raw = JSON.parse(rawText) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, corrupt: true };
    }
    return { ok: true, value: raw as Record<string, unknown> };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, missing: true };
    }
    return { ok: false, corrupt: true };
  }
}

/** Rename legacy sidecar so subsequent runs do not re-read it. */
export async function archiveSidecarFile(workspacePath: string, relativePath: string): Promise<void> {
  const fp = sidecarPath(workspacePath, relativePath);
  const archived = `${fp}${SIDECAR_MIGRATED_SUFFIX}`;
  try {
    await fs.rename(fp, archived);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw e;
  }
}

export function persistModuleStateRow(args: {
  workspacePath: string;
  databaseRelativePath: string;
  moduleId: string;
  stateSchemaVersion: number;
  state: Record<string, unknown>;
}): void {
  const db = new UnifiedStateDb(args.workspacePath, args.databaseRelativePath);
  db.setModuleState(args.moduleId, args.stateSchemaVersion, args.state);
}
