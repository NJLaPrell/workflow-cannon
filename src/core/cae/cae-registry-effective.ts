import { getAtPath } from "../workspace-kit-config.js";
import { loadCaeRegistry, type LoadCaeRegistryResult } from "./cae-registry-load.js";
import { loadCaeRegistryFromSqlite } from "./cae-registry-sqlite.js";

/**
 * Resolve CAE registry for runtime paths (preflight, advisory surface, `cae-*` handlers).
 * Use **`kit.cae.registryStore === "json"`** only for tests or explicit JSON bootstrap; default is SQLite (**Phase 70 / CAE_PLAN**).
 */
export function loadCaeRegistryForKit(
  workspacePath: string,
  effective: Record<string, unknown>
): LoadCaeRegistryResult {
  const store = getAtPath(effective, "kit.cae.registryStore");
  if (store === "json") {
    return loadCaeRegistry(workspacePath);
  }
  return loadCaeRegistryFromSqlite(workspacePath, effective);
}
