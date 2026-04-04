import fs from "node:fs";
import path from "node:path";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { appendSkillApplyAudit } from "./apply-audit.js";
import { discoverSkillPacks, getSkillPackById } from "./discovery.js";
import { parseSkillMd } from "./skill-md-parse.js";

function readOptions(args: Record<string, unknown>): Record<string, unknown> {
  const o = args.options;
  if (o && typeof o === "object" && !Array.isArray(o)) {
    return o as Record<string, unknown>;
  }
  return {};
}

export const skillsModule: WorkflowModule = {
  registration: {
    id: "skills",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["skills"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/skills/config.md",
      format: "md",
      description: "Skill pack discovery, inspection, application, and recommendations."
    },
    instructions: {
      directory: "src/modules/skills/instructions",
      entries: builtinInstructionEntriesForModule("skills")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const name = command.name;
    const ws = ctx.workspacePath;
    const eff = ctx.effectiveConfig as Record<string, unknown> | undefined;

    if (name === "list-skills") {
      const res = discoverSkillPacks(ws, eff);
      if (!res.ok) {
        return { ok: false, code: res.code, message: res.message };
      }
      return {
        ok: true,
        code: "skills-listed",
        data: {
          skills: res.packs.map((p) => ({
            id: p.id,
            version: p.version,
            displayName: p.displayName,
            description: p.description,
            discoveryTags: p.discoveryTags,
            layout: p.layout,
            hasSidecar: p.hasSidecar,
            rootPath: p.rootPath
          })),
          count: res.packs.length
        }
      };
    }

    if (name === "inspect-skill") {
      const skillId = typeof args.skillId === "string" ? args.skillId.trim() : "";
      if (!skillId) {
        return { ok: false, code: "invalid-args", message: "inspect-skill requires skillId" };
      }
      const pack = getSkillPackById(ws, eff, skillId);
      if (!pack) {
        return { ok: false, code: "skill-not-found", message: `Skill '${skillId}' not found` };
      }
      const instrAbs = path.join(pack.rootPath, pack.instructionsRelPath);
      let bodyPreview = "";
      try {
        const raw = fs.readFileSync(instrAbs, "utf8");
        const parsed = parseSkillMd(raw);
        bodyPreview = parsed.body.trim().slice(0, 2000);
      } catch {
        return {
          ok: false,
          code: "skill-read-error",
          message: `Cannot read instructions at ${pack.instructionsRelPath}`
        };
      }
      return {
        ok: true,
        code: "skill-inspected",
        data: {
          skill: {
            id: pack.id,
            version: pack.version,
            displayName: pack.displayName,
            description: pack.description,
            discoveryTags: pack.discoveryTags,
            instructionsRelPath: pack.instructionsRelPath,
            layout: pack.layout,
            hasSidecar: pack.hasSidecar,
            rootPath: pack.rootPath,
            bodyPreview
          }
        }
      };
    }

    if (name === "apply-skill") {
      const skillId = typeof args.skillId === "string" ? args.skillId.trim() : "";
      if (!skillId) {
        return { ok: false, code: "invalid-args", message: "apply-skill requires skillId" };
      }
      const opts = readOptions(args);
      /** Default dryRun true (preview); set dryRun false for non-preview materialization + policy lane. */
      const dryRun = opts.dryRun !== false;
      const recordAudit = opts.recordAudit === true;
      const pack = getSkillPackById(ws, eff, skillId);
      if (!pack) {
        return { ok: false, code: "skill-not-found", message: `Skill '${skillId}' not found` };
      }
      const instrAbs = path.join(pack.rootPath, pack.instructionsRelPath);
      let resolvedBody = "";
      try {
        const raw = fs.readFileSync(instrAbs, "utf8");
        const parsed = parseSkillMd(raw);
        resolvedBody = parsed.body.trim();
      } catch {
        return {
          ok: false,
          code: "skill-read-error",
          message: `Cannot read instructions at ${pack.instructionsRelPath}`
        };
      }
      const actor = ctx.resolvedActor ?? "unknown";
      if (!dryRun && recordAudit) {
        appendSkillApplyAudit(ws, {
          schemaVersion: 1,
          at: new Date().toISOString(),
          skillId,
          actor,
          dryRun,
          recordAudit
        });
      }
      return {
        ok: true,
        code: "skill-applied",
        data: {
          skillId,
          dryRun,
          recordAudit,
          manifest: {
            id: pack.id,
            version: pack.version,
            displayName: pack.displayName,
            description: pack.description,
            discoveryTags: pack.discoveryTags,
            instructionsRelPath: pack.instructionsRelPath,
            hasSidecar: pack.hasSidecar
          },
          resolvedInstructionsMarkdown: resolvedBody,
          provenance: {
            schemaVersion: 1,
            rootPath: pack.rootPath,
            instructionsPath: instrAbs
          }
        }
      };
    }

    if (name === "recommend-skills") {
      const res = discoverSkillPacks(ws, eff);
      if (!res.ok) {
        return { ok: false, code: res.code, message: res.message };
      }
      const tagsFilter = Array.isArray(args.tags)
        ? (args.tags as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      const phaseKey = typeof args.phaseKey === "string" ? args.phaseKey.trim() : "";
      const taskType = typeof args.taskType === "string" ? args.taskType.trim() : "";

      let packs = res.packs;
      if (tagsFilter.length > 0) {
        const want = new Set(tagsFilter.map((t) => t.trim().toLowerCase()));
        packs = packs.filter((p) => {
          const have = p.discoveryTags.map((t) => t.toLowerCase());
          return [...want].every((w) => have.includes(w));
        });
      }
      if (phaseKey) {
        packs = packs.filter((p) => p.discoveryTags.some((t) => t.toLowerCase() === `phase:${phaseKey.toLowerCase()}`));
      }
      if (taskType) {
        packs = packs.filter((p) =>
          p.discoveryTags.some((t) => t.toLowerCase() === `task-type:${taskType.toLowerCase()}`)
        );
      }
      packs = [...packs].sort((a, b) => a.id.localeCompare(b.id));
      return {
        ok: true,
        code: "skills-recommended",
        data: {
          recommended: packs.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            description: p.description,
            discoveryTags: p.discoveryTags
          })),
          count: packs.length,
          filters: { tags: tagsFilter, phaseKey: phaseKey || null, taskType: taskType || null }
        }
      };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `skills: unknown command '${name}'`
    };
  }
};
