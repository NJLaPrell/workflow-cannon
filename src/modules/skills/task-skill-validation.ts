import { discoverSkillPacks } from "./discovery.js";

function isSkillsModuleActive(effective: Record<string, unknown> | undefined): boolean {
  if (!effective) return true;
  const m = effective.modules;
  if (!m || typeof m !== "object" || Array.isArray(m)) return true;
  const mod = m as Record<string, unknown>;
  const disabled = Array.isArray(mod.disabled)
    ? mod.disabled.filter((x): x is string => typeof x === "string")
    : [];
  if (disabled.includes("skills")) return false;
  const enabled = Array.isArray(mod.enabled)
    ? mod.enabled.filter((x): x is string => typeof x === "string")
    : [];
  if (enabled.length > 0 && !enabled.includes("skills")) return false;
  return true;
}

/**
 * Extract skillIds from task metadata; null means invalid shape.
 */
export function readTaskSkillIds(metadata: Record<string, unknown> | undefined): string[] | null {
  if (!metadata) return [];
  const raw = metadata.skillIds;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  if (!raw.every((x): x is string => typeof x === "string" && x.trim().length > 0)) {
    return null;
  }
  return raw.map((s) => s.trim());
}

export function validateTaskSkillAttachments(
  workspacePath: string,
  effective: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined
): { ok: true } | { ok: false; code: string; message: string } {
  if (!isSkillsModuleActive(effective)) {
    return { ok: true };
  }
  const ids = readTaskSkillIds(metadata);
  if (ids === null) {
    return {
      ok: false,
      code: "invalid-task-skill-ids",
      message: "metadata.skillIds must be an array of non-empty strings when provided"
    };
  }
  if (ids.length === 0) return { ok: true };
  const disc = discoverSkillPacks(workspacePath, effective);
  if (!disc.ok) {
    return { ok: false, code: disc.code, message: disc.message };
  }
  const known = new Set(disc.packs.map((p) => p.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      code: "unknown-skill-id",
      message: `Unknown skill id(s): ${missing.join(", ")}`
    };
  }
  return { ok: true };
}
