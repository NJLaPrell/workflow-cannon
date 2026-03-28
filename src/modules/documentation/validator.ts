import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DocumentationValidationIssue } from "./types.js";
import { parseAiDocument } from "./parser.js";

export type AiValidationContext = {
  strict: boolean;
  workspacePath: string;
  expectedDoc?: "rules" | "runbook" | "workbook";
};

const REF_TYPES = new Set(["adr", "file", "code", "doc", "issue", "pr", "test", "external"]);

const REQUIRED_BY_PROFILE: Record<string, string[]> = {
  core: ["meta", "ref", "rule", "check", "decision", "example", "term", "command", "workflow"],
  runbook: [
    "meta",
    "ref",
    "rule",
    "check",
    "decision",
    "example",
    "term",
    "command",
    "workflow",
    "runbook",
    "chain",
    "artifact",
    "state",
    "transition",
    "promotion",
    "rollback",
    "config",
    "cadence",
    "guardrail"
  ],
  workbook: [
    "meta",
    "ref",
    "rule",
    "check",
    "decision",
    "example",
    "term",
    "command",
    "workflow",
    "workbook",
    "state",
    "transition",
    "artifact",
    "guardrail"
  ]
};

function isAllowedMetaDoc(doc: string): boolean {
  return (
    doc === "rules" ||
    doc === "runbook" ||
    doc === "workbook" ||
    doc === "generator" ||
    doc === "map" ||
    doc === "workflows" ||
    doc === "commands" ||
    doc === "decisions" ||
    doc === "glossary" ||
    doc === "observed" ||
    doc === "planned" ||
    doc === "checks" ||
    doc === "manifest"
  );
}

function profileForDoc(doc: string | undefined, explicitProfile: string | undefined): "core" | "runbook" | "workbook" {
  if (explicitProfile === "core" || explicitProfile === "runbook" || explicitProfile === "workbook") {
    return explicitProfile;
  }
  if (doc === "runbook") return "runbook";
  if (doc === "workbook") return "workbook";
  return "core";
}

export function validateAiSchema(aiOutput: string, ctx: AiValidationContext): DocumentationValidationIssue[] {
  const issues: DocumentationValidationIssue[] = [];
  const records = parseAiDocument(aiOutput);
  if (records.length === 0) {
    return [{ check: "schema", message: "AI output is empty", resolved: false }];
  }

  const meta = records[0];
  if (!meta || meta.type !== "meta") {
    return [{ check: "schema", message: "AI output must start with a meta record", resolved: false }];
  }

  const schema = meta.kv["schema"];
  const doc = meta.kv["doc"];
  const truth = meta.kv["truth"];
  const status = meta.kv["status"] ?? meta.kv["st"];
  const profile = profileForDoc(doc, meta.kv["profile"]);
  const isLegacySchema = schema !== "base.v2";
  if (schema !== "base.v2") {
    issues.push({
      check: "schema",
      message: `AI meta.schema must be 'base.v2' (found '${schema ?? ""}')`,
      resolved: true
    });
  }
  if (!doc || !isAllowedMetaDoc(doc)) {
    issues.push({ check: "schema", message: `Unsupported meta.doc '${doc ?? ""}'`, resolved: false });
  }
  if (!truth) issues.push({ check: "schema", message: "AI meta.truth is required", resolved: false });
  if (!status) issues.push({ check: "schema", message: "AI meta.status is required", resolved: false });
  if (ctx.expectedDoc && doc && ctx.expectedDoc !== doc) {
    issues.push({
      check: "schema",
      message: `meta.doc '${doc}' does not match expected doc family for '${ctx.expectedDoc}'`,
      resolved: !ctx.strict
    });
  }

  const presentByType: Record<string, boolean> = { meta: true };
  const knownIds = new Set<string>();
  for (const rec of records.slice(1)) {
    presentByType[rec.type] = true;
    const id = rec.kv["id"];
    if (id) knownIds.add(id);
    if (rec.kv["name"]) knownIds.add(rec.kv["name"]);
  }

  for (const rec of records.slice(1)) {
    if (rec.type === "rule" && !rec.kv["why"]) {
      issues.push({
        check: "schema",
        message: "rule records require why",
        resolved: isLegacySchema || !ctx.strict
      });
    }

    if (rec.type === "ref") {
      const type = rec.kv["type"];
      const target = rec.kv["target"] ?? rec.kv["path"];
      const legacyPath = rec.kv["path"];
      if (!rec.kv["id"] || !type || !target) {
        issues.push({
          check: "schema",
          message: "ref records require id, type, target",
          resolved: isLegacySchema || !ctx.strict
        });
        if (legacyPath && !existsSync(resolve(ctx.workspacePath, legacyPath))) {
          issues.push({
            check: "schema",
            message: `ref.path does not exist: '${legacyPath}'`,
            resolved: !ctx.strict
          });
        }
      } else if (!REF_TYPES.has(type)) {
        issues.push({
          check: "schema",
          message: `ref.type '${type}' must be one of ${[...REF_TYPES].join(", ")}`,
          resolved: isLegacySchema || !ctx.strict
        });
      } else if ((type === "file" || type === "code" || type === "doc") && !existsSync(resolve(ctx.workspacePath, target))) {
        issues.push({
          check: "schema",
          message: `ref.target does not exist: '${target}'`,
          resolved: !ctx.strict
        });
      }
    }

    if (rec.type === "example") {
      const parent = rec.kv["for"];
      const kind = rec.kv["kind"];
      if (!parent || !knownIds.has(parent)) {
        issues.push({
          check: "schema",
          message: `example.for must reference an existing record id/name (found '${parent ?? ""}')`,
          resolved: isLegacySchema || !ctx.strict
        });
      }
      if (!kind || !["good", "bad", "edge"].includes(kind)) {
        issues.push({
          check: "schema",
          message: "example.kind must be one of good|bad|edge",
          resolved: isLegacySchema || !ctx.strict
        });
      }
    }
  }

  const isActive = status === "active";
  if (isActive) {
    // Preserve strict runbook/workbook/rules baseline behavior during v2 migration.
    if (doc === "runbook" && !presentByType["rule"] && !presentByType["chain"]) {
      issues.push({
        check: "schema",
        message: "Missing required AI records for doc family 'runbook': at least one rule| or chain| record",
        resolved: !ctx.strict
      });
    }
    if (doc === "workbook" && !presentByType["command"]) {
      issues.push({
        check: "schema",
        message: "Missing required AI records for doc family 'workbook': at least one command| record",
        resolved: !ctx.strict
      });
    }
    if (doc === "workbook" && !presentByType["config"]) {
      issues.push({
        check: "schema",
        message: "Missing required AI records for doc family 'workbook': at least one config| record",
        resolved: !ctx.strict
      });
    }
    if (doc === "rules" && !presentByType["rule"] && !presentByType["check"]) {
      issues.push({
        check: "schema",
        message: "Missing required AI records for doc family 'rules': at least one rule| or check| record",
        resolved: !ctx.strict
      });
    }

    const missing = REQUIRED_BY_PROFILE[profile]
      .filter((type) => {
        if (type === "workflow") return !presentByType["workflow"] && !presentByType["wf"];
        if (type === "command") return !presentByType["command"] && !presentByType["cmd"];
        if (type === "example") return !presentByType["example"];
        return !presentByType[type];
      })
      .map((t) => `${t}| record`);
    if (missing.length > 0) {
      issues.push({
        check: "schema",
        message: `Missing required AI records for profile '${profile}': ${missing.join(", ")}`,
        resolved: isLegacySchema || !ctx.strict
      });
    }
  }

  return issues;
}

export function autoResolveAiSchema(aiOutput: string): string {
  if (aiOutput.startsWith("meta|schema=") || aiOutput.startsWith("meta|v=")) {
    return aiOutput;
  }
  return `meta|schema=base.v2|doc=rules|truth=canonical|status=draft|profile=core\n\n${aiOutput}`;
}
