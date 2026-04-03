import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Commands in the T600 runtime validation pilot (see ADR-runtime-run-args-validation-pilot.md). */
const PILOT_COMMANDS = new Set([
  "run-transition",
  "dashboard-summary",
  "create-task",
  "update-task"
]);

/** Mutators that honor `tasks.planningGenerationPolicy` === `require` for `expectedPlanningGeneration`. */
const PLANNING_TOKEN_COMMANDS = new Set(["run-transition", "create-task", "update-task"]);

type PilotSnapshot = {
  schemaVersion: number;
  sourceSchemaPackageVersion: string;
  pilotCommands: string[];
  commands: Record<string, Record<string, unknown>>;
};

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

let compiled: Map<string, ValidateFunction> | null = null;

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
  return compiled;
}

/** Reset cached validators (tests). */
export function resetPilotRunArgsValidationCache(): void {
  compiled = null;
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

function enforceRequirePlanningToken(
  policy: "off" | "warn" | "require",
  args: Record<string, unknown>
): { ok: true } | { ok: false; code: "planning-generation-required"; message: string } {
  if (policy !== "require") {
    return { ok: true };
  }
  if (readOptionalExpectedPlanningGeneration(args) !== undefined) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "planning-generation-required",
    message:
      "tasks.planningGenerationPolicy is 'require': include expectedPlanningGeneration from a prior read (planningGeneration on responses); retry after re-read when you get planning-generation-mismatch"
  };
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
    }
  };
}

/**
 * When the command is in the pilot allowlist, validates CLI JSON args before module dispatch.
 * @returns Structured error payload for JSON stdout, or null when validation passes or command is not in the pilot.
 */
export function validatePilotRunCommandArgs(
  commandName: string,
  args: Record<string, unknown>,
  effectiveConfig: Record<string, unknown>
): Record<string, unknown> | null {
  if (!PILOT_COMMANDS.has(commandName)) {
    return null;
  }
  const validators = getCompiledValidators();
  const validate = validators.get(commandName);
  if (!validate) {
    return null;
  }
  if (!validate(args)) {
    return formatAjvFailure(commandName, validate.errors);
  }
  if (PLANNING_TOKEN_COMMANDS.has(commandName)) {
    const policy = readPlanningGenerationPolicy(effectiveConfig);
    const gate = enforceRequirePlanningToken(policy, args);
    if (!gate.ok) {
      return { ok: false, code: gate.code, message: gate.message };
    }
  }
  return null;
}
