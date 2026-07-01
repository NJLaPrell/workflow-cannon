/**
 * Process-lifetime registry/router/config cache for the warm `run-daemon`.
 *
 * The daemon keeps one Node process alive across many `workspace-kit run <command>`
 * requests. Without this cache each request re-runs the full module-system bootstrap:
 * `resolveRegistryAndConfig` (re-reads every config layer from disk and re-resolves the
 * enabled module set) plus `new ModuleCommandRouter(registry)` (re-indexes every module
 * command). None of that changes between requests unless a config input changes, so we
 * memoize the whole `{ registry, router, effective }` triple.
 *
 * Invalidation strategy (incremental, not "cache forever"):
 * The triple is keyed by a cheap signature derived from everything
 * `resolveRegistryAndConfig` reads that can change at runtime:
 *   - the user config file (`~/.workspace-kit/config.json`, or `$WORKSPACE_KIT_HOME`),
 *   - the project config file (`.workspace-kit/config.json`),
 *   - each module-scoped config file (`.workspace-kit/modules/<id>/config.json`) for
 *     every known module (a superset of the enabled set — safe over-invalidation),
 *   - the `WORKSPACE_KIT_*` environment overlay, and
 *   - the per-request invocation `config` object.
 *
 * File state is captured via `statSync` (mtime in nanoseconds + size); no config file is
 * re-read on a cache hit. Because the daemon only ever forwards `run` requests (config
 * mutations such as `workspace-kit config set/unset` run in a *separate* process and
 * write these same files), a stat-based signature reliably detects any config change on
 * the next request and rebuilds. Module enablement is derived purely from these config
 * inputs, so it is covered too. This favors correctness over raw speed: a rare unrelated
 * touch of a config file just triggers one harmless rebuild.
 */
import { statSync } from "node:fs";
import {
  envToConfigOverlay,
  getProjectConfigPath,
  getUserConfigFilePath
} from "../core/workspace-kit-config.js";
import { getModuleScopedConfigPath } from "../core/module-scoped-config.js";
import { defaultRegistryModules } from "../modules/index.js";
import {
  resolveRegistryRouterConfig,
  type ResolvedRegistryRouter
} from "./run-command.js";

export type CachedRegistryRouterResolver = (
  cwd: string,
  invocationConfig: Record<string, unknown>
) => Promise<ResolvedRegistryRouter>;

const NULL = "\u0000";

/** `exists ? mtimeNs:size : "absent"` — cheap change signal without reading the file. */
function fileStamp(filePath: string): string {
  try {
    const st = statSync(filePath, { bigint: true });
    return `${st.mtimeNs}:${st.size}`;
  } catch {
    return "absent";
  }
}

/** All config files any layer of `resolveRegistryAndConfig` may read for this workspace. */
function configFilePaths(cwd: string): string[] {
  const paths = [getUserConfigFilePath(), getProjectConfigPath(cwd)];
  for (const mod of defaultRegistryModules) {
    paths.push(getModuleScopedConfigPath(cwd, mod.registration.id));
  }
  return paths;
}

function computeInvalidationSignature(
  cwd: string,
  invocationConfig: Record<string, unknown>
): string {
  const fileParts = configFilePaths(cwd).map((p) => `${p}=${fileStamp(p)}`);
  const envPart = JSON.stringify(envToConfigOverlay(process.env));
  const invocationPart = JSON.stringify(invocationConfig ?? {});
  return [cwd, ...fileParts, `env:${envPart}`, `inv:${invocationPart}`].join(NULL);
}

/**
 * Build a resolver that memoizes a single `{ registry, router, effective }` triple for the
 * daemon process lifetime and rebuilds only when the invalidation signature changes.
 * A single-entry cache is deliberate: `invocationConfig` is almost always empty for the
 * hot dashboard-poll path, so distinct invocation configs simply cause a cheap rebuild
 * rather than growing an unbounded cache.
 */
export function createCachedRegistryRouterResolver(): CachedRegistryRouterResolver {
  let cached: { signature: string; value: ResolvedRegistryRouter } | null = null;
  return async (cwd, invocationConfig) => {
    const signature = computeInvalidationSignature(cwd, invocationConfig);
    if (cached && cached.signature === signature) {
      return cached.value;
    }
    const value = await resolveRegistryRouterConfig(cwd, invocationConfig);
    cached = { signature, value };
    return value;
  };
}
