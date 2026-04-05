import fs from "node:fs/promises";
import path from "node:path";

/** Per-module persisted defaults / mirrors; merged before project global `.workspace-kit/config.json`. */
export const MODULE_SCOPED_CONFIG_ROOT = ".workspace-kit/modules";

export function getModuleScopedConfigPath(workspacePath: string, moduleId: string): string {
  return path.join(workspacePath, MODULE_SCOPED_CONFIG_ROOT, moduleId, "config.json");
}

/**
 * Project-layer persistence path: kit-wide keys use global config; everything else uses the owning module file.
 */
export function projectPersistConfigPath(workspacePath: string, owningModule: string): string {
  if (owningModule === "workspace-kit") {
    return path.join(workspacePath, ".workspace-kit", "config.json");
  }
  return getModuleScopedConfigPath(workspacePath, owningModule);
}

export async function readModuleScopedConfigDocument(
  workspacePath: string,
  moduleId: string
): Promise<Record<string, unknown>> {
  const fp = getModuleScopedConfigPath(workspacePath, moduleId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`module-config-invalid: ${fp} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {};
    }
    throw e;
  }
}
