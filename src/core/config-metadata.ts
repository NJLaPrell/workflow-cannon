/**
 * Canonical metadata for user-facing workspace config keys (Phase 2b).
 * CLI, explain, and generated docs consume this registry.
 *
 * Key/value records live in `config-registry.json` (validated at runtime via existing config tests).
 * Registry accessors live in `./config/metadata/access.ts` (REF-008).
 */

import type { ConfigKeyMetadata } from "./config/metadata/access.js";
import { configMetadataRegistry as REGISTRY } from "./config/metadata/access.js";

export type { ConfigKeyExposure, ConfigValueType, ConfigKeyMetadata } from "./config/metadata/access.js";
export { getConfigKeyMetadata, listConfigMetadata, assertWritableKey } from "./config/metadata/access.js";

export function validateValueForMetadata(meta: ConfigKeyMetadata, value: unknown): void {
  if (meta.type === "array") {
    if (!Array.isArray(value)) {
      throw typeError(meta.key, "array", value);
    }
    if (meta.key === "policy.extraSensitiveModuleCommands") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    if (meta.key === "improvement.transcripts.discoveryPaths") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    if (meta.key === "skills.discoveryRoots" || meta.key === "plugins.discoveryRoots") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    if (meta.key === "modules.enabled" || meta.key === "modules.disabled") {
      for (const item of value) {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
      }
    }
    if (meta.key === "kit.githubInvocation.allowedRepositories") {
      for (const item of value) {
        if (typeof item !== "string" || !item.trim()) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
        const s = item.trim();
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s)) {
          throw new Error(
            `config-type-error(${meta.key}): entries must be GitHub repo full names (owner/repo)`
          );
        }
      }
      return;
    }
    if (
      meta.key === "kit.githubInvocation.planOnlyRunCommands" ||
      meta.key === "kit.githubInvocation.sensitiveRunCommands" ||
      meta.key === "kit.autoCheckpoint.beforeCommands"
    ) {
      for (const item of value) {
        if (typeof item !== "string" || !item.trim()) {
          throw new Error(`config-type-error(${meta.key}): array entries must be non-empty strings`);
        }
        if (!/^[a-z][a-z0-9-]*$/i.test(item.trim())) {
          throw new Error(
            `config-type-error(${meta.key}): command entries must be alphanumeric/hyphen subcommand ids`
          );
        }
      }
      return;
    }
    return;
  }
  if (meta.type === "string" && typeof value !== "string") {
    throw typeError(meta.key, "string", value);
  }
  if (meta.type === "boolean" && typeof value !== "boolean") {
    throw typeError(meta.key, "boolean", value);
  }
  if (meta.type === "number" && typeof value !== "number") {
    throw typeError(meta.key, "number", value);
  }
  if (meta.key === "kit.agentGuidance.tier") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`config-constraint(${meta.key}): must be an integer from 1 to 5`);
    }
    return;
  }
  if (
    meta.key === "kit.githubInvocation.commentDebounceSeconds" ||
    meta.key === "kit.githubInvocation.rateLimitEventsPerHour"
  ) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`config-constraint(${meta.key}): must be a non-negative integer`);
    }
    return;
  }
  if (meta.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw typeError(meta.key, "object", value);
    }
    if (meta.key === "responseTemplates.commandOverrides") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof k !== "string" || !k.trim()) {
          throw new Error(`config-type-error(${meta.key}): keys must be non-empty strings`);
        }
        if (typeof v !== "string" || !v.trim()) {
          throw new Error(`config-type-error(${meta.key}): values must be non-empty strings`);
        }
      }
    }
    if (meta.key === "kit.githubInvocation.eventPlaybookMap") {
      const allowedRoutes = new Set(["plan", "implement", "review", "fix-review", "none"]);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof k !== "string" || !k.trim()) {
          throw new Error(`config-type-error(${meta.key}): keys must be non-empty strings`);
        }
        if (typeof v !== "string" || !allowedRoutes.has(v)) {
          throw new Error(
            `config-type-error(${meta.key}): values must be one of plan, implement, review, fix-review, none`
          );
        }
      }
    }
    if (meta.key === "agentBehavior.customProfiles") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof k !== "string" || !k.startsWith("custom:")) {
          throw new Error(`config-type-error(${meta.key}): keys must start with custom:`);
        }
        if (typeof v !== "object" || v === null || Array.isArray(v)) {
          throw new Error(`config-type-error(${meta.key}): profile values must be objects`);
        }
      }
      return;
    }
  }
  if (meta.allowedValues && meta.allowedValues.length > 0) {
    if (!meta.allowedValues.some((v) => deepEqualLoose(v, value))) {
      throw new Error(
        `config-constraint(${meta.key}): value not in allowed set: ${JSON.stringify(meta.allowedValues)}`
      );
    }
  }
}

function typeError(key: string, expected: string, got: unknown): Error {
  return new Error(
    `config-type-error(${key}): expected ${expected}, got ${got === null ? "null" : typeof got}`
  );
}

function deepEqualLoose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function getAtPathForConfigValidation(root: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Validate `.workspace-kit/modules/<moduleId>/config.json`: only keys owned by that module (registry owningModule).
 */
export function validateModuleScopedConfigDocument(
  moduleId: string,
  data: Record<string, unknown>,
  label: string
): void {
  const allowedTop = new Set<string>();
  for (const meta of Object.values(REGISTRY)) {
    if (meta.owningModule === moduleId) {
      allowedTop.add(meta.key.split(".")[0]!);
    }
  }
  const contentKeys = Object.keys(data).filter((k) => k !== "schemaVersion");
  if (contentKeys.length > 0 && allowedTop.size === 0) {
    throw new Error(
      `config-invalid(${label}): module '${moduleId}' config file has entries but no registered keys for this module`
    );
  }
  if (data.schemaVersion !== undefined && typeof data.schemaVersion !== "number") {
    throw new Error(`config-invalid(${label}): schemaVersion must be a number`);
  }
  for (const k of contentKeys) {
    if (!allowedTop.has(k)) {
      throw new Error(
        `config-invalid(${label}): module '${moduleId}' cannot declare top-level key '${k}' (not owned by this module)`
      );
    }
  }
  for (const meta of Object.values(REGISTRY)) {
    if (meta.owningModule !== moduleId) {
      continue;
    }
    const val = getAtPathForConfigValidation(data, meta.key);
    if (val !== undefined) {
      validateValueForMetadata(meta, val);
    }
  }
}

/**
 * Validate top-level shape of persisted kit config files (strict unknown-key rejection).
 */
export function validatePersistedConfigDocument(
  data: Record<string, unknown>,
  label: string
): void {
  const allowed = new Set([
    "schemaVersion",
    "core",
    "tasks",
    "documentation",
    "policy",
    "improvement",
    "skills",
    "responseTemplates",
    "modules",
    "kit",
    "planning",
    "agentBehavior"
  ]);
  for (const k of Object.keys(data)) {
    if (!allowed.has(k)) {
      throw new Error(`config-invalid(${label}): unknown top-level key '${k}'`);
    }
  }
  if (data.schemaVersion !== undefined && typeof data.schemaVersion !== "number") {
    throw new Error(`config-invalid(${label}): schemaVersion must be a number`);
  }
  const tasks = data.tasks;
  if (tasks !== undefined) {
    if (typeof tasks !== "object" || tasks === null || Array.isArray(tasks)) {
      throw new Error(`config-invalid(${label}): tasks must be an object`);
    }
    const t = tasks as Record<string, unknown>;
    for (const k of Object.keys(t)) {
      if (
        k !== "storeRelativePath" &&
        k !== "persistenceBackend" &&
        k !== "sqliteDatabaseRelativePath" &&
        k !== "strictValidation" &&
        k !== "planningGenerationPolicy"
      ) {
        throw new Error(`config-invalid(${label}): unknown tasks.${k}`);
      }
    }
    if (t.storeRelativePath !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.storeRelativePath"]!, t.storeRelativePath);
    }
    if (t.persistenceBackend !== undefined) {
      if (t.persistenceBackend === "json") {
        throw new Error(
          `config-invalid(${label}): tasks.persistenceBackend "json" is not supported (v0.40+). Remove it (default is sqlite) or migrate with workspace-kit run migrate-task-persistence — docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`
        );
      }
      validateValueForMetadata(REGISTRY["tasks.persistenceBackend"]!, t.persistenceBackend);
    }
    if (t.sqliteDatabaseRelativePath !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.sqliteDatabaseRelativePath"]!, t.sqliteDatabaseRelativePath);
    }
    if (t.strictValidation !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.strictValidation"]!, t.strictValidation);
    }
    if (t.planningGenerationPolicy !== undefined) {
      validateValueForMetadata(REGISTRY["tasks.planningGenerationPolicy"]!, t.planningGenerationPolicy);
    }
  }
  const policy = data.policy;
  if (policy !== undefined) {
    if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
      throw new Error(`config-invalid(${label}): policy must be an object`);
    }
    const p = policy as Record<string, unknown>;
    for (const k of Object.keys(p)) {
      if (k !== "extraSensitiveModuleCommands") {
        throw new Error(`config-invalid(${label}): unknown policy.${k}`);
      }
    }
    if (p.extraSensitiveModuleCommands !== undefined) {
      validateValueForMetadata(REGISTRY["policy.extraSensitiveModuleCommands"]!, p.extraSensitiveModuleCommands);
    }
  }
  const core = data.core;
  if (core !== undefined) {
    if (typeof core !== "object" || core === null || Array.isArray(core) || Object.keys(core).length > 0) {
      throw new Error(`config-invalid(${label}): core must be an empty object when present`);
    }
  }
  const doc = data.documentation;
  if (doc !== undefined) {
    if (typeof doc !== "object" || doc === null || Array.isArray(doc) || Object.keys(doc).length > 0) {
      throw new Error(`config-invalid(${label}): documentation must be an empty object when present`);
    }
  }
  const mods = data.modules;
  if (mods !== undefined) {
    if (typeof mods !== "object" || mods === null || Array.isArray(mods)) {
      throw new Error(`config-invalid(${label}): modules must be an object`);
    }
    const m = mods as Record<string, unknown>;
    for (const k of Object.keys(m)) {
      if (k !== "enabled" && k !== "disabled") {
        throw new Error(`config-invalid(${label}): unknown modules.${k}`);
      }
    }
    if (m.enabled !== undefined) {
      validateValueForMetadata(REGISTRY["modules.enabled"]!, m.enabled);
    }
    if (m.disabled !== undefined) {
      validateValueForMetadata(REGISTRY["modules.disabled"]!, m.disabled);
    }
  }
  const kit = data.kit;
  if (kit !== undefined) {
    if (typeof kit !== "object" || kit === null || Array.isArray(kit)) {
      throw new Error(`config-invalid(${label}): kit must be an object`);
    }
    const k = kit as Record<string, unknown>;
    for (const key of Object.keys(k)) {
      if (
        key !== "currentPhaseNumber" &&
        key !== "currentPhaseLabel" &&
        key !== "agentGuidance" &&
        key !== "githubInvocation" &&
        key !== "lifecycleHooks" &&
        key !== "autoCheckpoint" &&
        key !== "cae"
      ) {
        throw new Error(`config-invalid(${label}): unknown kit.${key}`);
      }
    }
    if (k.currentPhaseNumber !== undefined) {
      validateValueForMetadata(REGISTRY["kit.currentPhaseNumber"]!, k.currentPhaseNumber);
      const n = k.currentPhaseNumber;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
        throw new Error(`config-invalid(${label}): kit.currentPhaseNumber must be a positive integer`);
      }
    }
    if (k.currentPhaseLabel !== undefined) {
      validateValueForMetadata(REGISTRY["kit.currentPhaseLabel"]!, k.currentPhaseLabel);
    }
    if (k.agentGuidance !== undefined) {
      if (
        typeof k.agentGuidance !== "object" ||
        k.agentGuidance === null ||
        Array.isArray(k.agentGuidance)
      ) {
        throw new Error(`config-invalid(${label}): kit.agentGuidance must be an object`);
      }
      const ag = k.agentGuidance as Record<string, unknown>;
      for (const ak of Object.keys(ag)) {
        if (ak !== "profileSetId" && ak !== "tier" && ak !== "displayLabel") {
          throw new Error(`config-invalid(${label}): unknown kit.agentGuidance.${ak}`);
        }
      }
      if (ag.profileSetId !== undefined) {
        validateValueForMetadata(REGISTRY["kit.agentGuidance.profileSetId"]!, ag.profileSetId);
      }
      if (ag.tier !== undefined) {
        validateValueForMetadata(REGISTRY["kit.agentGuidance.tier"]!, ag.tier);
      }
      if (ag.displayLabel !== undefined) {
        validateValueForMetadata(REGISTRY["kit.agentGuidance.displayLabel"]!, ag.displayLabel);
      }
    }
    if (k.githubInvocation !== undefined) {
      if (
        typeof k.githubInvocation !== "object" ||
        k.githubInvocation === null ||
        Array.isArray(k.githubInvocation)
      ) {
        throw new Error(`config-invalid(${label}): kit.githubInvocation must be an object`);
      }
      const gi = k.githubInvocation as Record<string, unknown>;
      for (const gk of Object.keys(gi)) {
        if (
          gk !== "enabled" &&
          gk !== "allowedRepositories" &&
          gk !== "eventPlaybookMap" &&
          gk !== "commentDebounceSeconds" &&
          gk !== "rateLimitEventsPerHour" &&
          gk !== "planOnlyRunCommands" &&
          gk !== "sensitiveRunCommands"
        ) {
          throw new Error(`config-invalid(${label}): unknown kit.githubInvocation.${gk}`);
        }
      }
      if (gi.enabled !== undefined) {
        validateValueForMetadata(REGISTRY["kit.githubInvocation.enabled"]!, gi.enabled);
      }
      if (gi.allowedRepositories !== undefined) {
        validateValueForMetadata(REGISTRY["kit.githubInvocation.allowedRepositories"]!, gi.allowedRepositories);
      }
      if (gi.eventPlaybookMap !== undefined) {
        validateValueForMetadata(REGISTRY["kit.githubInvocation.eventPlaybookMap"]!, gi.eventPlaybookMap);
      }
      if (gi.commentDebounceSeconds !== undefined) {
        validateValueForMetadata(
          REGISTRY["kit.githubInvocation.commentDebounceSeconds"]!,
          gi.commentDebounceSeconds
        );
      }
      if (gi.rateLimitEventsPerHour !== undefined) {
        validateValueForMetadata(
          REGISTRY["kit.githubInvocation.rateLimitEventsPerHour"]!,
          gi.rateLimitEventsPerHour
        );
      }
      if (gi.planOnlyRunCommands !== undefined) {
        validateValueForMetadata(
          REGISTRY["kit.githubInvocation.planOnlyRunCommands"]!,
          gi.planOnlyRunCommands
        );
      }
      if (gi.sensitiveRunCommands !== undefined) {
        validateValueForMetadata(
          REGISTRY["kit.githubInvocation.sensitiveRunCommands"]!,
          gi.sensitiveRunCommands
        );
      }
    }
    if (k.lifecycleHooks !== undefined) {
      if (
        typeof k.lifecycleHooks !== "object" ||
        k.lifecycleHooks === null ||
        Array.isArray(k.lifecycleHooks)
      ) {
        throw new Error(`config-invalid(${label}): kit.lifecycleHooks must be an object`);
      }
      const lh = k.lifecycleHooks as Record<string, unknown>;
      for (const lk of Object.keys(lh)) {
        if (
          lk !== "enabled" &&
          lk !== "mode" &&
          lk !== "traceRelativePath" &&
          lk !== "handlers"
        ) {
          throw new Error(`config-invalid(${label}): unknown kit.lifecycleHooks.${lk}`);
        }
      }
      if (lh.enabled !== undefined) {
        validateValueForMetadata(REGISTRY["kit.lifecycleHooks.enabled"]!, lh.enabled);
      }
      if (lh.mode !== undefined) {
        validateValueForMetadata(REGISTRY["kit.lifecycleHooks.mode"]!, lh.mode);
      }
      if (lh.traceRelativePath !== undefined) {
        validateValueForMetadata(REGISTRY["kit.lifecycleHooks.traceRelativePath"]!, lh.traceRelativePath);
      }
      if (lh.handlers !== undefined) {
        if (!Array.isArray(lh.handlers)) {
          throw new Error(`config-invalid(${label}): kit.lifecycleHooks.handlers must be an array`);
        }
        for (const h of lh.handlers) {
          if (typeof h !== "object" || h === null || Array.isArray(h)) {
            throw new Error(`config-invalid(${label}): kit.lifecycleHooks.handlers entries must be objects`);
          }
        }
      }
    }
    if (k.autoCheckpoint !== undefined) {
      if (
        typeof k.autoCheckpoint !== "object" ||
        k.autoCheckpoint === null ||
        Array.isArray(k.autoCheckpoint)
      ) {
        throw new Error(`config-invalid(${label}): kit.autoCheckpoint must be an object`);
      }
      const ac = k.autoCheckpoint as Record<string, unknown>;
      for (const ak of Object.keys(ac)) {
        if (ak !== "enabled" && ak !== "beforeCommands" && ak !== "stashWhenDirty") {
          throw new Error(`config-invalid(${label}): unknown kit.autoCheckpoint.${ak}`);
        }
      }
      if (ac.enabled !== undefined) {
        validateValueForMetadata(REGISTRY["kit.autoCheckpoint.enabled"]!, ac.enabled);
      }
      if (ac.beforeCommands !== undefined) {
        validateValueForMetadata(REGISTRY["kit.autoCheckpoint.beforeCommands"]!, ac.beforeCommands);
      }
      if (ac.stashWhenDirty !== undefined) {
        validateValueForMetadata(REGISTRY["kit.autoCheckpoint.stashWhenDirty"]!, ac.stashWhenDirty);
      }
    }
    if (k.cae !== undefined) {
      if (typeof k.cae !== "object" || k.cae === null || Array.isArray(k.cae)) {
        throw new Error(`config-invalid(${label}): kit.cae must be an object`);
      }
      const cae = k.cae as Record<string, unknown>;
      for (const ck of Object.keys(cae)) {
        if (
          ck !== "enabled" &&
          ck !== "registryStore" &&
          ck !== "advisoryInstructionSurface" &&
          ck !== "persistence" &&
          ck !== "adminMutations" &&
          ck !== "runtime" &&
          ck !== "enforcement" &&
          ck !== "shadow"
        ) {
          throw new Error(`config-invalid(${label}): unknown kit.cae.${ck}`);
        }
      }
      if (cae.enabled !== undefined) {
        validateValueForMetadata(REGISTRY["kit.cae.enabled"]!, cae.enabled);
      }
      if (cae.registryStore !== undefined) {
        validateValueForMetadata(REGISTRY["kit.cae.registryStore"]!, cae.registryStore);
      }
      if (cae.advisoryInstructionSurface !== undefined) {
        validateValueForMetadata(REGISTRY["kit.cae.advisoryInstructionSurface"]!, cae.advisoryInstructionSurface);
      }
      if (cae.persistence !== undefined) {
        validateValueForMetadata(REGISTRY["kit.cae.persistence"]!, cae.persistence);
      }
      if (cae.adminMutations !== undefined) {
        validateValueForMetadata(REGISTRY["kit.cae.adminMutations"]!, cae.adminMutations);
      }
      if (cae.runtime !== undefined) {
        if (typeof cae.runtime !== "object" || cae.runtime === null || Array.isArray(cae.runtime)) {
          throw new Error(`config-invalid(${label}): kit.cae.runtime must be an object`);
        }
        const rt = cae.runtime as Record<string, unknown>;
        for (const rk of Object.keys(rt)) {
          if (rk !== "shadowPreflight" && rk !== "persistShadowPreflight") {
            throw new Error(`config-invalid(${label}): unknown kit.cae.runtime.${rk}`);
          }
        }
        if (rt.shadowPreflight !== undefined) {
          validateValueForMetadata(REGISTRY["kit.cae.runtime.shadowPreflight"]!, rt.shadowPreflight);
        }
        if (rt.persistShadowPreflight !== undefined) {
          validateValueForMetadata(
            REGISTRY["kit.cae.runtime.persistShadowPreflight"]!,
            rt.persistShadowPreflight
          );
        }
      }
      if (cae.enforcement !== undefined) {
        if (
          typeof cae.enforcement !== "object" ||
          cae.enforcement === null ||
          Array.isArray(cae.enforcement)
        ) {
          throw new Error(`config-invalid(${label}): kit.cae.enforcement must be an object`);
        }
        const en = cae.enforcement as Record<string, unknown>;
        for (const ek of Object.keys(en)) {
          if (ek !== "enabled") {
            throw new Error(`config-invalid(${label}): unknown kit.cae.enforcement.${ek}`);
          }
        }
        if (en.enabled !== undefined) {
          validateValueForMetadata(REGISTRY["kit.cae.enforcement.enabled"]!, en.enabled);
        }
      }
      if (cae.shadow !== undefined) {
        if (typeof cae.shadow !== "object" || cae.shadow === null || Array.isArray(cae.shadow)) {
          throw new Error(`config-invalid(${label}): kit.cae.shadow must be an object`);
        }
        const sh = cae.shadow as Record<string, unknown>;
        for (const sk of Object.keys(sh)) {
          if (sk !== "defaultOn") {
            throw new Error(`config-invalid(${label}): unknown kit.cae.shadow.${sk}`);
          }
        }
        if (sh.defaultOn !== undefined) {
          validateValueForMetadata(REGISTRY["kit.cae.shadow.defaultOn"]!, sh.defaultOn);
        }
      }
    }
  }
  const improvement = data.improvement;
  if (improvement !== undefined) {
    if (typeof improvement !== "object" || improvement === null || Array.isArray(improvement)) {
      throw new Error(`config-invalid(${label}): improvement must be an object`);
    }
    const imp = improvement as Record<string, unknown>;
    for (const k of Object.keys(imp)) {
      if (k !== "transcripts" && k !== "cadence" && k !== "hooks" && k !== "recommendations") {
        throw new Error(`config-invalid(${label}): unknown improvement.${k}`);
      }
    }
    if (imp.recommendations !== undefined) {
      if (
        typeof imp.recommendations !== "object" ||
        imp.recommendations === null ||
        Array.isArray(imp.recommendations)
      ) {
        throw new Error(`config-invalid(${label}): improvement.recommendations must be an object`);
      }
      const rec = imp.recommendations as Record<string, unknown>;
      for (const rk of Object.keys(rec)) {
        if (rk !== "heuristicVersion") {
          throw new Error(`config-invalid(${label}): unknown improvement.recommendations.${rk}`);
        }
      }
      if (rec.heuristicVersion !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.recommendations.heuristicVersion"]!,
          rec.heuristicVersion
        );
      }
    }
    if (imp.transcripts !== undefined) {
      if (
        typeof imp.transcripts !== "object" ||
        imp.transcripts === null ||
        Array.isArray(imp.transcripts)
      ) {
        throw new Error(`config-invalid(${label}): improvement.transcripts must be an object`);
      }
      const tr = imp.transcripts as Record<string, unknown>;
      for (const k of Object.keys(tr)) {
        if (
          k !== "sourcePath" &&
          k !== "archivePath" &&
          k !== "maxFilesPerSync" &&
          k !== "maxBytesPerFile" &&
          k !== "maxTotalScanBytes" &&
          k !== "discoveryPaths"
        ) {
          throw new Error(`config-invalid(${label}): unknown improvement.transcripts.${k}`);
        }
      }
      if (tr.sourcePath !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.sourcePath"]!, tr.sourcePath);
      }
      if (tr.archivePath !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.archivePath"]!, tr.archivePath);
      }
      if (tr.maxFilesPerSync !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.maxFilesPerSync"]!, tr.maxFilesPerSync);
      }
      if (tr.maxBytesPerFile !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.maxBytesPerFile"]!, tr.maxBytesPerFile);
      }
      if (tr.maxTotalScanBytes !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.maxTotalScanBytes"]!, tr.maxTotalScanBytes);
      }
      if (tr.discoveryPaths !== undefined) {
        validateValueForMetadata(REGISTRY["improvement.transcripts.discoveryPaths"]!, tr.discoveryPaths);
      }
    }
    if (imp.cadence !== undefined) {
      if (typeof imp.cadence !== "object" || imp.cadence === null || Array.isArray(imp.cadence)) {
        throw new Error(`config-invalid(${label}): improvement.cadence must be an object`);
      }
      const cd = imp.cadence as Record<string, unknown>;
      for (const k of Object.keys(cd)) {
        if (k !== "minIntervalMinutes" && k !== "skipIfNoNewTranscripts" && k !== "maxRecommendationCandidatesPerRun") {
          throw new Error(`config-invalid(${label}): unknown improvement.cadence.${k}`);
        }
      }
      if (cd.minIntervalMinutes !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.cadence.minIntervalMinutes"]!,
          cd.minIntervalMinutes
        );
      }
      if (cd.skipIfNoNewTranscripts !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.cadence.skipIfNoNewTranscripts"]!,
          cd.skipIfNoNewTranscripts
        );
      }
      if (cd.maxRecommendationCandidatesPerRun !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.cadence.maxRecommendationCandidatesPerRun"]!,
          cd.maxRecommendationCandidatesPerRun
        );
      }
    }
    if (imp.hooks !== undefined) {
      if (typeof imp.hooks !== "object" || imp.hooks === null || Array.isArray(imp.hooks)) {
        throw new Error(`config-invalid(${label}): improvement.hooks must be an object`);
      }
      const hk = imp.hooks as Record<string, unknown>;
      for (const k of Object.keys(hk)) {
        if (k !== "afterTaskCompleted") {
          throw new Error(`config-invalid(${label}): unknown improvement.hooks.${k}`);
        }
      }
      if (hk.afterTaskCompleted !== undefined) {
        validateValueForMetadata(
          REGISTRY["improvement.hooks.afterTaskCompleted"]!,
          hk.afterTaskCompleted
        );
      }
    }
  }
  const skills = data.skills;
  if (skills !== undefined) {
    if (typeof skills !== "object" || skills === null || Array.isArray(skills)) {
      throw new Error(`config-invalid(${label}): skills must be an object`);
    }
    const sk = skills as Record<string, unknown>;
    for (const k of Object.keys(sk)) {
      if (k !== "discoveryRoots") {
        throw new Error(`config-invalid(${label}): unknown skills.${k}`);
      }
    }
    if (sk.discoveryRoots !== undefined) {
      validateValueForMetadata(REGISTRY["skills.discoveryRoots"]!, sk.discoveryRoots);
    }
  }
  const planning = data.planning;
  if (planning !== undefined) {
    if (typeof planning !== "object" || planning === null || Array.isArray(planning)) {
      throw new Error(`config-invalid(${label}): planning must be an object`);
    }
    const pl = planning as Record<string, unknown>;
    for (const k of Object.keys(pl)) {
      if (
        k !== "defaultQuestionDepth" &&
        k !== "hardBlockCriticalUnknowns" &&
        k !== "adaptiveFinalizePolicy" &&
        k !== "rulePacks"
      ) {
        throw new Error(`config-invalid(${label}): unknown planning.${k}`);
      }
    }
    if (pl.defaultQuestionDepth !== undefined) {
      validateValueForMetadata(REGISTRY["planning.defaultQuestionDepth"]!, pl.defaultQuestionDepth);
    }
    if (pl.hardBlockCriticalUnknowns !== undefined) {
      validateValueForMetadata(REGISTRY["planning.hardBlockCriticalUnknowns"]!, pl.hardBlockCriticalUnknowns);
    }
    if (pl.adaptiveFinalizePolicy !== undefined) {
      validateValueForMetadata(REGISTRY["planning.adaptiveFinalizePolicy"]!, pl.adaptiveFinalizePolicy);
    }
    if (pl.rulePacks !== undefined) {
      validateValueForMetadata(REGISTRY["planning.rulePacks"]!, pl.rulePacks);
    }
  }
  const agentBehavior = data.agentBehavior;
  if (agentBehavior !== undefined) {
    if (typeof agentBehavior !== "object" || agentBehavior === null || Array.isArray(agentBehavior)) {
      throw new Error(`config-invalid(${label}): agentBehavior must be an object`);
    }
    const ab = agentBehavior as Record<string, unknown>;
    for (const k of Object.keys(ab)) {
      if (k !== "activeProfileId" && k !== "customProfiles") {
        throw new Error(`config-invalid(${label}): unknown agentBehavior.${k}`);
      }
    }
    if (ab.activeProfileId !== undefined) {
      validateValueForMetadata(REGISTRY["agentBehavior.activeProfileId"]!, ab.activeProfileId);
    }
    if (ab.customProfiles !== undefined) {
      validateValueForMetadata(REGISTRY["agentBehavior.customProfiles"]!, ab.customProfiles);
    }
  }
  const responseTemplates = data.responseTemplates;
  if (responseTemplates !== undefined) {
    if (
      typeof responseTemplates !== "object" ||
      responseTemplates === null ||
      Array.isArray(responseTemplates)
    ) {
      throw new Error(`config-invalid(${label}): responseTemplates must be an object`);
    }
    const rt = responseTemplates as Record<string, unknown>;
    for (const k of Object.keys(rt)) {
      if (k !== "enforcementMode" && k !== "defaultTemplateId" && k !== "commandOverrides") {
        throw new Error(`config-invalid(${label}): unknown responseTemplates.${k}`);
      }
    }
    if (rt.enforcementMode !== undefined) {
      validateValueForMetadata(REGISTRY["responseTemplates.enforcementMode"]!, rt.enforcementMode);
    }
    if (rt.defaultTemplateId !== undefined) {
      validateValueForMetadata(REGISTRY["responseTemplates.defaultTemplateId"]!, rt.defaultTemplateId);
    }
    if (rt.commandOverrides !== undefined) {
      validateValueForMetadata(REGISTRY["responseTemplates.commandOverrides"]!, rt.commandOverrides);
    }
  }
}

export function getConfigRegistryExport(): typeof REGISTRY {
  return REGISTRY;
}
