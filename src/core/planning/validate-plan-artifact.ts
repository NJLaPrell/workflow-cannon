/**
 * PlanArtifact v1 JSON Schema validation + draft normalization (WP-3.2 / T100456).
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020Import from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import {
  PLAN_ARTIFACT_SCHEMA_VERSION,
  type PlanArtifactProvenanceSource,
  type PlanArtifactV1
} from "./plan-artifact-v1.js";
import { readLatestPlanArtifact } from "./plan-artifact-storage.js";
import { validatePlanArtifactWbsItemShape } from "./normalize-wbs-to-task-draft.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ajv/dist/2020 default export shape varies by bundler
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;

const PLAN_SCHEMA_ID = "https://workflow-cannon.dev/schemas/planning/plan-artifact.v1.json";

export type PlanArtifactValidationError = {
  path: string;
  message: string;
  keyword?: string;
};

export type ValidatePlanArtifactSuccess = {
  ok: true;
  artifact: PlanArtifactV1;
};

export type ValidatePlanArtifactFailure = {
  ok: false;
  code: "plan-artifact-schema-invalid";
  errors: PlanArtifactValidationError[];
};

export type ValidatePlanArtifactResult = ValidatePlanArtifactSuccess | ValidatePlanArtifactFailure;

export type NormalizePlanArtifactDraftOptions = {
  planId?: string;
  importSource?: PlanArtifactProvenanceSource;
  /** When set, draft is treated as idea-originated (planner-chat / Ideas row). */
  ideaId?: string;
  actor?: string;
  now?: string;
};

let cachedValidator: ValidateFunction | null = null;
let cachedValidatorRoot: string | null = null;

/** Prefer workspace when it ships schemas; else package root (dist/core/planning → repo/package). */
export function resolvePlanArtifactSchemaRoot(workspacePath?: string): string {
  const cwd = workspacePath ? path.resolve(workspacePath) : process.cwd();
  const inWorkspace = path.join(cwd, "schemas", "planning", "plan-artifact.v1.schema.json");
  if (fs.existsSync(inWorkspace)) {
    return cwd;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function loadPlanArtifactValidator(workspaceRoot: string): ValidateFunction {
  const root = resolvePlanArtifactSchemaRoot(workspaceRoot);
  if (cachedValidator && cachedValidatorRoot === root) {
    return cachedValidator;
  }
  const schemasDir = path.join(root, "schemas", "planning");
  const ajv = new Ajv2020Ctor({ strict: true, allErrors: true }) as {
    addSchema: (schema: object) => void;
    getSchema: (id: string) => ValidateFunction | undefined;
  };
  const wbsSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, "plan-artifact-wbs-item.v1.schema.json"), "utf8")
  ) as object;
  const planSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, "plan-artifact.v1.schema.json"), "utf8")
  ) as object;
  ajv.addSchema(wbsSchema);
  ajv.addSchema(planSchema);
  const validate = ajv.getSchema(PLAN_SCHEMA_ID);
  if (!validate) {
    throw new Error("plan-artifact.v1 schema failed to register");
  }
  cachedValidator = validate;
  cachedValidatorRoot = root;
  return validate;
}

export function formatPlanArtifactInstancePath(instancePath: string | undefined): string {
  if (!instancePath || instancePath.length === 0) {
    return "(root)";
  }
  return instancePath.replace(/^\//, "").replace(/\//g, ".");
}

function ajvErrorsToPlanArtifactErrors(errors: ErrorObject[] | null | undefined): PlanArtifactValidationError[] {
  if (!errors?.length) {
    return [{ path: "(root)", message: "validation failed" }];
  }
  return errors.map((e) => ({
    path: formatPlanArtifactInstancePath(e.instancePath),
    message: e.message ?? e.keyword ?? "validation error",
    keyword: e.keyword
  }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function expectedPlanRef(planId: string): string {
  return `plan-artifact:${planId}`;
}

const IDEA_PLANNING_CHAT_SESSION_PREFIX = "pcs-";

function isImportProvenanceSource(source: unknown): boolean {
  return source === "import-build-plan" || source === "import-wishlist";
}

/**
 * True when the draft argv or provenance signals planner-chat / Ideas-row origin.
 */
export function isIdeaOriginatedPlanArtifactDraft(
  doc: Record<string, unknown>,
  options: Pick<NormalizePlanArtifactDraftOptions, "ideaId" | "importSource"> = {}
): boolean {
  if (options.importSource && isImportProvenanceSource(options.importSource)) {
    return false;
  }
  if (nonEmptyString(options.ideaId)) {
    return true;
  }
  const provenance = asRecord(doc.provenance);
  if (!provenance) {
    return false;
  }
  if (isImportProvenanceSource(provenance.source)) {
    return false;
  }
  const chatSessionRef = nonEmptyString(provenance.chatSessionRef) ? provenance.chatSessionRef.trim() : "";
  if (chatSessionRef.startsWith(IDEA_PLANNING_CHAT_SESSION_PREFIX)) {
    return true;
  }
  return cleanStringArray(provenance.previousPlanArtifacts).length > 0;
}

function validateIdeaOriginatedProvenance(
  doc: Record<string, unknown>,
  options: Pick<NormalizePlanArtifactDraftOptions, "ideaId" | "importSource">
): PlanArtifactValidationError[] {
  if (!isIdeaOriginatedPlanArtifactDraft(doc, options)) {
    return [];
  }
  const provenance = asRecord(doc.provenance);
  if (!provenance || !nonEmptyString(provenance.sourceIdeaId)) {
    return [
      {
        path: "provenance.sourceIdeaId",
        message: "sourceIdeaId is required for idea-originated PlanArtifact drafts",
        keyword: "ideaProvenanceRequired"
      }
    ];
  }
  return [];
}

/** Carry forward idea lineage from the latest stored version when updating an existing plan. */
function mergeStoredPlanArtifactProvenance(
  doc: Record<string, unknown>,
  workspaceRoot?: string
): void {
  if (!workspaceRoot) {
    return;
  }
  const planId = nonEmptyString(doc.planId) ? doc.planId.trim() : "";
  if (!planId) {
    return;
  }
  const stored = readLatestPlanArtifact(workspaceRoot, planId);
  if (!stored?.provenance) {
    return;
  }
  const provenance = asRecord(doc.provenance) ?? {};
  if (!nonEmptyString(provenance.sourceIdeaId) && nonEmptyString(stored.provenance.sourceIdeaId)) {
    provenance.sourceIdeaId = stored.provenance.sourceIdeaId;
  }
  const incomingPrevious = cleanStringArray(provenance.previousPlanArtifacts);
  const storedPrevious = cleanStringArray(stored.provenance.previousPlanArtifacts);
  if (incomingPrevious.length === 0 && storedPrevious.length > 0) {
    provenance.previousPlanArtifacts = [...storedPrevious];
  } else if (incomingPrevious.length > 0 && storedPrevious.length > 0) {
    provenance.previousPlanArtifacts = [...new Set([...storedPrevious, ...incomingPrevious])];
  }
  doc.provenance = provenance;
}

/**
 * Fill envelope defaults for draft argv without overwriting supplied content.
 */
export function normalizePlanArtifactDraft(
  raw: unknown,
  options: NormalizePlanArtifactDraftOptions = {}
): Record<string, unknown> {
  const base = asRecord(raw);
  if (!base) {
    return { schemaVersion: PLAN_ARTIFACT_SCHEMA_VERSION };
  }
  const doc = cloneJson(base);
  doc.schemaVersion = PLAN_ARTIFACT_SCHEMA_VERSION;

  const planId =
    (typeof options.planId === "string" && options.planId.trim()) ||
    (typeof doc.planId === "string" && doc.planId.trim()) ||
    randomUUID();
  doc.planId = planId;

  if (typeof doc.version !== "number" || !Number.isInteger(doc.version) || doc.version < 1) {
    doc.version = 1;
  }

  const planRef = expectedPlanRef(planId);
  doc.planRef = planRef;

  if (typeof doc.status !== "string" || !doc.status.trim()) {
    doc.status = "draft";
  }

  const now = options.now ?? new Date().toISOString();
  const actor = options.actor?.trim() || "agent";
  const provenance = asRecord(doc.provenance) ?? {};
  let source: PlanArtifactProvenanceSource = "draft-plan-artifact";
  if (options.importSource) {
    source = options.importSource;
  } else {
    const existingSource = provenance.source;
    if (existingSource === "import-build-plan" || existingSource === "import-wishlist") {
      source = existingSource;
    }
  }
  provenance.createdAt = typeof provenance.createdAt === "string" ? provenance.createdAt : now;
  provenance.updatedAt = typeof provenance.updatedAt === "string" ? provenance.updatedAt : now;
  provenance.createdBy = typeof provenance.createdBy === "string" ? provenance.createdBy : actor;
  provenance.source = source;
  const previousPlanArtifacts = cleanStringArray(provenance.previousPlanArtifacts);
  if (previousPlanArtifacts.length > 0) {
    provenance.previousPlanArtifacts = previousPlanArtifacts;
  } else {
    delete provenance.previousPlanArtifacts;
  }
  doc.provenance = provenance;

  if (!Array.isArray(doc.nonGoals)) {
    doc.nonGoals = [];
  }
  if (!Array.isArray(doc.riskAssessment)) {
    doc.riskAssessment = [];
  }
  if (!Array.isArray(doc.assumptions)) {
    doc.assumptions = [];
  }
  if (!Array.isArray(doc.openQuestions)) {
    doc.openQuestions = [];
  }
  if (!Array.isArray(doc.wbs)) {
    doc.wbs = [];
  }

  return doc;
}

function validatePlanRefConsistency(doc: Record<string, unknown>): PlanArtifactValidationError[] {
  const errors: PlanArtifactValidationError[] = [];
  if (typeof doc.planId === "string" && typeof doc.planRef === "string") {
    const expected = expectedPlanRef(doc.planId);
    if (doc.planRef !== expected) {
      errors.push({
        path: "planRef",
        message: `planRef must be ${expected}`,
        keyword: "planRefMismatch"
      });
    }
  }
  return errors;
}

function validateWbsShapeRows(doc: Record<string, unknown>): PlanArtifactValidationError[] {
  const errors: PlanArtifactValidationError[] = [];
  const wbs = doc.wbs;
  if (!Array.isArray(wbs)) {
    return errors;
  }
  wbs.forEach((row, index) => {
    const guarded = validatePlanArtifactWbsItemShape(row);
    if (guarded.ok) {
      return;
    }
    for (const finding of guarded.findings) {
      const suffix = finding.field ? `.${finding.field}` : "";
      errors.push({
        path: `wbs[${index}]${suffix}`,
        message: finding.message,
        keyword: finding.code
      });
    }
  });
  return errors;
}

/**
 * Validate a PlanArtifact document (call {@link normalizePlanArtifactDraft} first for partial argv).
 */
export function validatePlanArtifactDocument(
  doc: unknown,
  options: {
    workspaceRoot?: string;
    ideaId?: string;
    importSource?: PlanArtifactProvenanceSource;
  } = {}
): ValidatePlanArtifactResult {
  const workspaceRoot = resolvePlanArtifactSchemaRoot(options.workspaceRoot);
  const validate = loadPlanArtifactValidator(workspaceRoot);

  const record = asRecord(doc);
  if (!record) {
    return {
      ok: false,
      code: "plan-artifact-schema-invalid",
      errors: [{ path: "(root)", message: "artifact must be a JSON object" }]
    };
  }

  const errors: PlanArtifactValidationError[] = [...validatePlanRefConsistency(record)];
  errors.push(
    ...validateIdeaOriginatedProvenance(record, {
      ideaId: options.ideaId,
      importSource: options.importSource
    })
  );
  const schemaOk = validate(record);
  if (!schemaOk) {
    errors.push(...ajvErrorsToPlanArtifactErrors(validate.errors));
  }
  errors.push(...validateWbsShapeRows(record));

  if (errors.length > 0) {
    return { ok: false, code: "plan-artifact-schema-invalid", errors };
  }

  return { ok: true, artifact: record as unknown as PlanArtifactV1 };
}

/**
 * Normalize argv `artifact`, then validate. Convenience for `draft-plan-artifact`.
 */
export function validatePlanArtifactDraftInput(
  raw: unknown,
  options: NormalizePlanArtifactDraftOptions & { workspaceRoot?: string } = {}
): ValidatePlanArtifactResult {
  const normalized = normalizePlanArtifactDraft(raw, options);
  mergeStoredPlanArtifactProvenance(normalized, options.workspaceRoot);
  return validatePlanArtifactDocument(normalized, {
    workspaceRoot: options.workspaceRoot,
    ideaId: options.ideaId,
    importSource: options.importSource
  });
}
