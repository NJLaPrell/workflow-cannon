import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_REMEDIATION_DOCS, CLI_REMEDIATION_INSTRUCTIONS } from "./cli-remediation.js";
import { getBuiltinRunCommandManifestRow } from "../contracts/builtin-run-command-manifest.js";

type PilotSnapshot = {
  schemaVersion: number;
  sourceSchemaPackageVersion: string;
  pilotCommands: string[];
  commands: Record<string, Record<string, unknown>>;
};

type PreludeFile = {
  schemaVersion: number;
  commands: string[];
};

export type RunArgsSchemaOnlyCommandMetadata = {
  name: string;
  moduleId: string;
  instructionPath: string;
  description?: string;
};

/** Stripped before AJV: global response-template shaping, not domain args (see response-template-shaping). */
const RESPONSE_TEMPLATE_RUN_OVERLAY_KEYS = [
  "responseTemplateId",
  "responseTemplateDirective",
  "instructionTemplateDirective",
  "instruction"
] as const;

function pilotArgsForSchemaValidation(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  for (const k of RESPONSE_TEMPLATE_RUN_OVERLAY_KEYS) {
    delete out[k];
  }
  return out;
}

function resolvePackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../..");
}

function loadPilotSnapshot(): PilotSnapshot {
  const root = resolvePackageRoot();
  const snapPath = join(root, "schemas", "pilot-run-args.snapshot.json");
  if (!existsSync(snapPath)) {
    throw new Error(`Missing pilot args snapshot at ${snapPath}`);
  }
  const raw = JSON.parse(readFileSync(snapPath, "utf8")) as PilotSnapshot;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.pilotCommands) || !raw.commands) {
    throw new Error("Invalid pilot-run-args.snapshot.json structure");
  }
  return raw;
}

function loadPlanningPreludeCommands(): Set<string> {
  const root = resolvePackageRoot();
  const p = join(root, "schemas", "planning-generation-cli-prelude.json");
  if (!existsSync(p)) {
    return new Set();
  }
  const raw = JSON.parse(readFileSync(p, "utf8")) as PreludeFile;
  if (!Array.isArray(raw.commands)) {
    return new Set();
  }
  return new Set(raw.commands);
}

let compiled: Map<string, ValidateFunction> | null = null;
let preludeSet: Set<string> | null = null;

type AjvLike = { compile: (schema: object) => ValidateFunction };

function createPilotAjv(): AjvLike {
  const Ctor = AjvImport as unknown as new (opts?: {
    allErrors?: boolean;
    strict?: boolean;
    allowUnionTypes?: boolean;
  }) => AjvLike;
  return new Ctor({ allErrors: true, strict: false, allowUnionTypes: true });
}

function getCompiledValidators(): Map<string, ValidateFunction> {
  if (compiled) {
    return compiled;
  }
  const snap = loadPilotSnapshot();
  const ajv = createPilotAjv();
  const m = new Map<string, ValidateFunction>();
  for (const cmd of snap.pilotCommands) {
    const schema = snap.commands[cmd];
    if (!schema) {
      throw new Error(`Pilot snapshot missing commands.${cmd}`);
    }
    m.set(cmd, ajv.compile(schema));
  }
  compiled = m;
  return m;
}

/** Reset cached validators (tests). */
export function resetPilotRunArgsValidationCache(): void {
  compiled = null;
  preludeSet = null;
}

function getPreludeCommandSet(): Set<string> {
  if (preludeSet) {
    return preludeSet;
  }
  preludeSet = loadPlanningPreludeCommands();
  return preludeSet;
}

function readPlanningGenerationPolicy(effective: Record<string, unknown>): "off" | "warn" | "require" {
  const tasks = effective.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return "off";
  }
  const raw = (tasks as Record<string, unknown>).planningGenerationPolicy;
  if (raw === "warn" || raw === "require") {
    return raw;
  }
  return "off";
}

function readOptionalExpectedPlanningGeneration(args: Record<string, unknown>): number | undefined {
  const v = args.expectedPlanningGeneration;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
    return v;
  }
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    return Number(v.trim());
  }
  return undefined;
}

function instructionPathForCommand(commandName: string): string {
  switch (commandName) {
    case "run-transition":
      return CLI_REMEDIATION_INSTRUCTIONS.runTransition;
    case "synthesize-transcript-churn":
      return CLI_REMEDIATION_INSTRUCTIONS.synthesizeTranscriptChurn;
    case "create-task":
    case "create-task-from-plan":
      return CLI_REMEDIATION_INSTRUCTIONS.createTask;
    case "update-task":
      return CLI_REMEDIATION_INSTRUCTIONS.updateTask;
    case "dashboard-summary":
      return CLI_REMEDIATION_INSTRUCTIONS.dashboardSummary;
    case "create-wishlist":
      return CLI_REMEDIATION_INSTRUCTIONS.createWishlist;
    case "archive-task":
      return CLI_REMEDIATION_INSTRUCTIONS.archiveTask;
    case "add-dependency":
    case "remove-dependency":
      return CLI_REMEDIATION_INSTRUCTIONS.addDependency;
    case "generate-recommendations":
    case "ingest-transcripts":
      return CLI_REMEDIATION_INSTRUCTIONS.generateRecommendations;
    default:
      return `src/modules/task-engine/instructions/${commandName}.md`;
  }
}

function formatAjvFailure(commandName: string, errors: ErrorObject[] | null | undefined): Record<string, unknown> {
  const list = (errors ?? []).map((e) => ({
    instancePath: e.instancePath ?? "",
    keyword: e.keyword,
    message: e.message ?? "",
    params: e.params
  }));
  return {
    ok: false,
    code: "invalid-run-args",
    message: `Invalid JSON args for workspace-kit run ${commandName}.`,
    details: {
      command: commandName,
      errors: list
    },
    remediation: {
      instructionPath: instructionPathForCommand(commandName),
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
  };
}

/** Minimal sample args from JSON Schema `required` + `properties` (session bootstrap / --schema-only). */
function minimalSampleFromArgsSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const props =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const out: Record<string, unknown> = {};
  for (const key of req) {
    const p = props[key];
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      out[key] = null;
      continue;
    }
    const t = p.type;
    if (t === "string") {
      if (typeof p.pattern === "string" && p.pattern.includes("T[")) {
        out[key] = "T000";
      } else if (typeof p.enum === "object" && Array.isArray(p.enum) && p.enum.length > 0) {
        out[key] = p.enum[0];
      } else {
        out[key] = "";
      }
    } else if (t === "integer" || t === "number") {
      out[key] = 0;
    } else if (t === "boolean") {
      out[key] = false;
    } else if (t === "object") {
      out[key] = {};
    } else if (t === "array") {
      out[key] = [];
    } else if (Array.isArray(p.oneOf) || Array.isArray(p.anyOf)) {
      out[key] = 0;
    } else {
      out[key] = null;
    }
  }
  if (req.includes("policyApproval") && out.policyApproval === null) {
    out.policyApproval = { confirmed: true, rationale: "example" };
  }
  if (req.includes("updates") && out.updates === null) {
    out.updates = {};
  }
  return out;
}

function sampleArgsForCommand(commandName: string, schema: Record<string, unknown>): Record<string, unknown> {
  if (commandName === "persist-planning-execution-drafts") {
    return {
      targetPhaseKey: "73",
      targetPhase: "Phase 73",
      desiredStatus: "ready",
      tasks: [
        {
          id: "T900",
          title: "Draft follow-up",
          approach: "Implement the follow-up",
          technicalScope: ["Wire the command path"],
          acceptanceCriteria: ["Batch persists without row-level phase"]
        }
      ],
      expectedPlanningGeneration: 0
    };
  }
  return minimalSampleFromArgsSchema(schema);
}

function buildPermissiveArgsSchema(commandName: string): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: true,
    description: `Permissive fallback args schema for '${commandName}'. Use instructionPath for command-specific field guidance until a stricter schema is added.`
  };
}

function buildRunArgsExample(commandName: string, sampleArgs: Record<string, unknown>): Record<string, unknown> {
  return {
    description: "Minimal argv example",
    argv: `workspace-kit run ${commandName} '${JSON.stringify(sampleArgs)}'`
  };
}

function hasClientMutationId(schema: Record<string, unknown>): boolean {
  const props =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  return Object.hasOwn(props, "clientMutationId");
}

/**
 * JSON payload for `workspace-kit run <command> --schema-only`.
 *
 * Strict schemas come from the pilot snapshot. Commands without strict validation still get
 * router/manifest-backed discovery so every executable run command has one machine-readable shape.
 */
export function buildRunArgsSchemaOnlyPayload(
  commandName: string,
  metadata?: RunArgsSchemaOnlyCommandMetadata
): Record<string, unknown> | null {
  const snap = loadPilotSnapshot();
  const strictSchema = snap.commands[commandName];
  const manifest = getBuiltinRunCommandManifestRow(commandName);
  if (!strictSchema && !metadata && !manifest) {
    return null;
  }
  const schema = strictSchema ?? buildPermissiveArgsSchema(commandName);
  const sampleArgs = sampleArgsForCommand(commandName, schema);
  const instructionPath =
    metadata?.instructionPath ?? (manifest ? `src/modules/${manifest.moduleId}/instructions/${manifest.file}` : instructionPathForCommand(commandName));
  const preludeCommands = getPreludeCommandSet();
  const policySensitivity = manifest?.policySensitivity ?? "non-sensitive";
  return {
    ok: true,
    code: "run-args-schema",
    command: commandName,
    schema,
    schemaSource: strictSchema ? "pilot-run-args-snapshot" : "manifest-permissive-fallback",
    sampleArgs,
    examples: [buildRunArgsExample(commandName, sampleArgs)],
    instructionPath,
    moduleId: metadata?.moduleId ?? manifest?.moduleId ?? null,
    description: metadata?.description ?? manifest?.description ?? null,
    policy: {
      sensitivity: policySensitivity,
      operationId: manifest?.policyOperationId ?? null,
      jsonApprovalRequired:
        policySensitivity === "sensitive"
          ? true
          : policySensitivity === "sensitive-with-dryrun"
            ? "when dryRun is false or omitted by command policy"
            : false
    },
    planningGeneration: {
      cliPrelude: preludeCommands.has(commandName),
      expectedPlanningGeneration: preludeCommands.has(commandName)
        ? "required when tasks.planningGenerationPolicy is require"
        : "not required by CLI prelude"
    },
    idempotency: {
      clientMutationId: hasClientMutationId(schema)
    },
    responseTemplate: {
      defaultResponseTemplateId: manifest?.defaultResponseTemplateId ?? null
    },
    remediationContract: CLI_REMEDIATION_DOCS.remediationContract
  };
}

/**
 * When the command is in the pilot snapshot, validates CLI JSON args before module dispatch.
 * @returns Structured error payload for JSON stdout, or null when validation passes or command is not in the pilot.
 */
export function validatePilotRunCommandArgs(
  commandName: string,
  args: Record<string, unknown>,
  _effectiveConfig: Record<string, unknown>
): Record<string, unknown> | null {
  const snap = loadPilotSnapshot();
  if (!snap.pilotCommands.includes(commandName)) {
    return null;
  }
  const validators = getCompiledValidators();
  const validate = validators.get(commandName);
  if (!validate) {
    return null;
  }
  const domainArgs = pilotArgsForSchemaValidation(args);
  if (!validate(domainArgs)) {
    return formatAjvFailure(commandName, validate.errors);
  }
  return null;
}

/**
 * Early planning-generation-required for selected mutators (before policy/session work).
 * `generate-recommendations` dryRun skips the gate (no task writes).
 */
export function enforcePlanningGenerationCliPrelude(
  commandName: string,
  args: Record<string, unknown>,
  effectiveConfig: Record<string, unknown>
): Record<string, unknown> | null {
  const policy = readPlanningGenerationPolicy(effectiveConfig);
  if (policy !== "require") {
    return null;
  }
  if (!getPreludeCommandSet().has(commandName)) {
    return null;
  }
  if (commandName === "generate-recommendations" && args.dryRun === true) {
    return null;
  }
  if (readOptionalExpectedPlanningGeneration(args) !== undefined) {
    return null;
  }
  return {
    ok: false,
    code: "planning-generation-required",
    message:
      "tasks.planningGenerationPolicy is 'require': include expectedPlanningGeneration from a prior read (planningGeneration on responses); retry after re-read when you get planning-generation-mismatch",
    remediation: {
      instructionPath: instructionPathForCommand(commandName),
      docPath: CLI_REMEDIATION_DOCS.planningGenerationAdr
    }
  };
}
