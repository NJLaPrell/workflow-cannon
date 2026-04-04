import fs from "node:fs";
import path from "node:path";
import { parseSkillMd, parseTagsLine } from "./skill-md-parse.js";
import { validateSidecarJson } from "./manifest-validate.js";
import type { SkillDiscoveryResult, SkillPackRecord } from "./types.js";

const SKILL_FILE = "SKILL.md";
const SIDECAR_FILE = "workspace-kit-skill.json";

function readDiscoveryRoots(effectiveConfig: Record<string, unknown> | undefined): string[] {
  const skills = effectiveConfig?.skills;
  if (skills && typeof skills === "object" && !Array.isArray(skills)) {
    const roots = (skills as Record<string, unknown>).discoveryRoots;
    if (Array.isArray(roots)) {
      const out = roots.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (out.length > 0) return out;
    }
  }
  return [".claude/skills"];
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Discover skill packs under configured roots (workspace-relative).
 */
export function discoverSkillPacks(
  workspacePath: string,
  effectiveConfig: Record<string, unknown> | undefined
): SkillDiscoveryResult {
  const roots = readDiscoveryRoots(effectiveConfig);
  const byId = new Map<string, SkillPackRecord>();

  for (const relRoot of roots) {
    const rootAbs = path.resolve(workspacePath, relRoot);
    if (!isDir(rootAbs)) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootAbs, { withFileTypes: true });
    } catch {
      return { ok: false, code: "skill-discovery-read-error", message: `Cannot read skill root: ${relRoot}` };
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const skillId = ent.name;
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(skillId)) {
        return {
          ok: false,
          code: "skill-invalid-directory-name",
          message: `Invalid skill directory name '${skillId}' under ${relRoot}`
        };
      }
      const dirAbs = path.join(rootAbs, skillId);
      const skillMd = path.join(dirAbs, SKILL_FILE);
      if (!fs.existsSync(skillMd)) {
        continue;
      }
      let rawMd: string;
      try {
        rawMd = fs.readFileSync(skillMd, "utf8");
      } catch {
        return { ok: false, code: "skill-read-error", message: `Cannot read ${path.join(relRoot, skillId, SKILL_FILE)}` };
      }
      const parsed = parseSkillMd(rawMd);
      const fmName = parsed.frontmatter.name?.trim() ?? "";
      const fmDesc = parsed.frontmatter.description?.trim() ?? "";
      const fmTags = parseTagsLine(parsed.frontmatter.tags);

      const sidecarPath = path.join(dirAbs, SIDECAR_FILE);
      let hasSidecar = false;
      let version = "1.0.0";
      let displayName = fmName || skillId;
      let description = fmDesc;
      let discoveryTags = [...fmTags].sort((a, b) => a.localeCompare(b));
      let instructionsRelPath = SKILL_FILE;

      if (fs.existsSync(sidecarPath)) {
        hasSidecar = true;
        let sideRaw: string;
        try {
          sideRaw = fs.readFileSync(sidecarPath, "utf8");
        } catch {
          return {
            ok: false,
            code: "skill-sidecar-read-error",
            message: `Cannot read ${path.join(relRoot, skillId, SIDECAR_FILE)}`
          };
        }
        let json: unknown;
        try {
          json = JSON.parse(sideRaw) as unknown;
        } catch (e) {
          return {
            ok: false,
            code: "skill-sidecar-json",
            message: `Invalid JSON in ${SIDECAR_FILE} for '${skillId}': ${(e as Error).message}`
          };
        }
        const v = validateSidecarJson(json);
        if (!v.ok) {
          return {
            ok: false,
            code: "skill-sidecar-invalid",
            message: `Sidecar invalid for '${skillId}': ${v.message}`
          };
        }
        const m = v.manifest;
        if (m.id !== skillId) {
          return {
            ok: false,
            code: "skill-sidecar-id-mismatch",
            message: `Sidecar id '${m.id}' must match directory name '${skillId}'`
          };
        }
        version = m.version;
        displayName = m.displayName;
        instructionsRelPath = m.instructionsRelPath;
        if (m.discoveryTags && m.discoveryTags.length > 0) {
          discoveryTags = [...m.discoveryTags].sort((a, b) => a.localeCompare(b));
        }
        if (fmDesc && !description) {
          description = fmDesc;
        }
      }

      const record: SkillPackRecord = {
        id: skillId,
        version,
        displayName,
        description,
        discoveryTags,
        instructionsRelPath,
        rootPath: dirAbs,
        layout: "claude-shaped",
        hasSidecar
      };

      if (byId.has(skillId)) {
        return {
          ok: false,
          code: "skill-duplicate-id",
          message: `Duplicate skill id '${skillId}' across discovery roots`
        };
      }
      byId.set(skillId, record);
    }
  }

  const packs = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { ok: true, packs };
}

export function getSkillPackById(
  workspacePath: string,
  effectiveConfig: Record<string, unknown> | undefined,
  skillId: string
): SkillPackRecord | undefined {
  const res = discoverSkillPacks(workspacePath, effectiveConfig);
  if (!res.ok) return undefined;
  return res.packs.find((p) => p.id === skillId);
}
