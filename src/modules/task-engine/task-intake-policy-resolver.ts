import type {
  TaskIntakeEnforcementMode,
  TaskIntakeFieldRule,
  TaskIntakeOverride,
  TaskIntakePolicyConfig,
  TaskIntakeProfile
} from "./policy-config.js";
import {
  DEFAULT_TASK_INTAKE_POLICY,
  TASK_POLICY_OVERRIDE_PRECEDENCE
} from "./policy-config.js";
import type { TaskEntity, TaskStatus } from "./types.js";

export type TaskIntakeContextAction = "create-task" | "create-ready" | "accept" | string;

export type TaskIntakeExplainSource =
  | "task-metadata"
  | "module-override"
  | "context-match"
  | "workspace-default"
  | "built-in-default";

export type TaskIntakeExplainEntry = {
  key: string;
  value: unknown;
  source: TaskIntakeExplainSource;
};

export type TaskIntakePolicyWarning = {
  code: string;
  message: string;
};

export type TaskIntakeFieldRuleViolation = {
  field: string;
  rule: keyof TaskIntakeFieldRule;
  message: string;
};

export type ResolveTaskIntakePolicyArgs = {
  effectiveConfig: Record<string, unknown> | undefined;
  task?: TaskEntity | null;
  taskId?: string | null;
  type?: string | null;
  targetStatus?: TaskStatus | string | null;
  action?: TaskIntakeContextAction | null;
  moduleId?: string | null;
  category?: string | null;
  phaseKey?: string | null;
  metadata?: Record<string, unknown> | null;
  fields?: Record<string, unknown> | null;
};

export type ResolvedTaskIntakePolicyV1 = {
  schemaVersion: 1;
  profileName: string;
  enforcementMode: TaskIntakeEnforcementMode;
  action: string;
  context: {
    taskId: string | null;
    type: string | null;
    targetStatus: string | null;
    moduleId: string | null;
    category: string | null;
    phaseKey: string | null;
  };
  requiredFields: string[];
  recommendedFields: string[];
  forbiddenFields: string[];
  fieldRules: Record<string, TaskIntakeFieldRule>;
};

const SAFE_FIELD_PATH_RE = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/;
const PROFILE_METADATA_KEY = "taskIntakeProfile";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneDefaultConfig(): TaskIntakePolicyConfig {
  return JSON.parse(JSON.stringify(DEFAULT_TASK_INTAKE_POLICY)) as TaskIntakePolicyConfig;
}

function parseIntakeEnforcementMode(raw: unknown): TaskIntakeEnforcementMode | undefined {
  if (raw === "off" || raw === "advisory" || raw === "enforce" || raw === "enforce-on-accept") {
    return raw;
  }
  return undefined;
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function parseFieldRules(raw: unknown): Record<string, TaskIntakeFieldRule> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, TaskIntakeFieldRule> = {};
  for (const [path, value] of Object.entries(raw)) {
    if (!SAFE_FIELD_PATH_RE.test(path) || !isRecord(value)) {
      continue;
    }
    const rule: TaskIntakeFieldRule = {};
    for (const key of ["minItems", "minLength", "maxLength", "itemMinLength"] as const) {
      const v = value[key];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
        rule[key] = v;
      }
    }
    if (Array.isArray(value.allowedValues)) {
      rule.allowedValues = [...value.allowedValues];
    }
    const requiresAny = stringArray(value.requiresAny);
    if (requiresAny.length > 0) {
      rule.requiresAny = requiresAny;
    }
    out[path] = rule;
  }
  return out;
}

function parseProfile(raw: unknown, fallback?: TaskIntakeProfile): TaskIntakeProfile {
  const base = fallback ?? DEFAULT_TASK_INTAKE_POLICY.profiles.advisory;
  if (!isRecord(raw)) {
    return { ...base, fieldRules: { ...base.fieldRules } };
  }
  return {
    requiredFields: stringArray(raw.requiredFields),
    recommendedFields: stringArray(raw.recommendedFields),
    forbiddenFields: stringArray(raw.forbiddenFields),
    fieldRules: parseFieldRules(raw.fieldRules),
    enforcementMode: parseIntakeEnforcementMode(raw.enforcementMode) ?? base.enforcementMode
  };
}

export function parseTaskIntakePolicyConfig(
  effective: Record<string, unknown> | undefined
): TaskIntakePolicyConfig {
  const rawTasks = effective?.tasks;
  const raw = isRecord(rawTasks) ? rawTasks.intakePolicy : undefined;
  if (!isRecord(raw)) {
    return cloneDefaultConfig();
  }
  const defaults = cloneDefaultConfig();
  const profiles: Record<string, TaskIntakeProfile> = { ...defaults.profiles };
  if (isRecord(raw.profiles)) {
    for (const [name, profile] of Object.entries(raw.profiles)) {
      profiles[name] = parseProfile(profile, profiles[name]);
    }
  }
  const moduleOverrides: Record<string, TaskIntakeOverride> = {};
  if (isRecord(raw.moduleOverrides)) {
    for (const [moduleId, overrideRaw] of Object.entries(raw.moduleOverrides)) {
      if (isRecord(overrideRaw) && typeof overrideRaw.profile === "string") {
        moduleOverrides[moduleId] = {
          profile: overrideRaw.profile,
          enforcementMode: parseIntakeEnforcementMode(overrideRaw.enforcementMode)
        };
      }
    }
  }
  return {
    defaultProfile: typeof raw.defaultProfile === "string" ? raw.defaultProfile : defaults.defaultProfile,
    enforcementMode: parseIntakeEnforcementMode(raw.enforcementMode) ?? defaults.enforcementMode,
    profiles,
    moduleOverrides
  };
}

function normalizeProfile(profile: TaskIntakeProfile): TaskIntakeProfile {
  return {
    requiredFields: [...new Set(profile.requiredFields)],
    recommendedFields: [...new Set(profile.recommendedFields)],
    forbiddenFields: [...new Set(profile.forbiddenFields)],
    fieldRules: { ...profile.fieldRules },
    enforcementMode: profile.enforcementMode
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function fieldPresent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function readFieldPath(source: Record<string, unknown>, path: string): unknown {
  if (!SAFE_FIELD_PATH_RE.test(path)) {
    return undefined;
  }
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function buildEvaluationSource(input: ResolveTaskIntakePolicyArgs): Record<string, unknown> {
  const task = input.task ?? undefined;
  const explicit = isRecord(input.fields) ? input.fields : {};
  const metadata = {
    ...(isRecord(task?.metadata) ? task?.metadata : {}),
    ...(isRecord(input.metadata) ? input.metadata : {}),
    ...(isRecord(explicit.metadata) ? explicit.metadata : {})
  };
  return {
    ...(task ?? {}),
    ...explicit,
    id: task?.id ?? input.taskId ?? explicit.id,
    type: input.type ?? explicit.type ?? task?.type,
    status: input.targetStatus ?? explicit.status ?? task?.status,
    phaseKey: input.phaseKey ?? explicit.phaseKey ?? task?.phaseKey,
    metadata
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function evaluateRule(
  field: string,
  rule: TaskIntakeFieldRule,
  value: unknown,
  source: Record<string, unknown>
): TaskIntakeFieldRuleViolation[] {
  const violations: TaskIntakeFieldRuleViolation[] = [];
  if (rule.minItems !== undefined && (!Array.isArray(value) || value.length < rule.minItems)) {
    violations.push({ field, rule: "minItems", message: `${field} must include at least ${rule.minItems} item(s)` });
  }
  if (rule.minLength !== undefined && (typeof value !== "string" || value.trim().length < rule.minLength)) {
    violations.push({ field, rule: "minLength", message: `${field} must be at least ${rule.minLength} character(s)` });
  }
  if (rule.maxLength !== undefined && typeof value === "string" && value.length > rule.maxLength) {
    violations.push({ field, rule: "maxLength", message: `${field} must be at most ${rule.maxLength} character(s)` });
  }
  if (
    rule.itemMinLength !== undefined &&
    (!Array.isArray(value) ||
      value.some((entry) => typeof entry !== "string" || entry.trim().length < rule.itemMinLength!))
  ) {
    violations.push({
      field,
      rule: "itemMinLength",
      message: `${field} items must be at least ${rule.itemMinLength} character(s)`
    });
  }
  if (rule.allowedValues !== undefined && !rule.allowedValues.some((entry) => valuesEqual(entry, value))) {
    violations.push({ field, rule: "allowedValues", message: `${field} must be one of the configured allowed values` });
  }
  if (rule.requiresAny !== undefined && !rule.requiresAny.some((path) => fieldPresent(readFieldPath(source, path)))) {
    violations.push({
      field,
      rule: "requiresAny",
      message: `${field} requires at least one of: ${rule.requiresAny.join(", ")}`
    });
  }
  return violations;
}

export function resolveTaskIntakePolicy(
  input: ResolveTaskIntakePolicyArgs
): {
  resolvedPolicy: ResolvedTaskIntakePolicyV1;
  missingRequiredFields: string[];
  missingRecommendedFields: string[];
  forbiddenPresentFields: string[];
  fieldRuleViolations: TaskIntakeFieldRuleViolation[];
  explain: TaskIntakeExplainEntry[];
  warnings: TaskIntakePolicyWarning[];
  precedenceOrder: typeof TASK_POLICY_OVERRIDE_PRECEDENCE;
} {
  const cfg = parseTaskIntakePolicyConfig(input.effectiveConfig);
  const explain: TaskIntakeExplainEntry[] = [];
  const warnings: TaskIntakePolicyWarning[] = [];
  const task = input.task ?? undefined;
  const moduleId = nonEmptyString(input.moduleId);
  const metadata = isRecord(input.metadata) ? input.metadata : isRecord(task?.metadata) ? task?.metadata : {};
  const metadataProfile = nonEmptyString(metadata[PROFILE_METADATA_KEY]);
  const moduleOverride = moduleId ? cfg.moduleOverrides[moduleId] : undefined;
  const explicitType = nonEmptyString(input.type) ?? nonEmptyString(input.fields?.type) ?? task?.type ?? null;
  const explicitAction = nonEmptyString(input.action) ?? "create-task";
  const explicitTargetStatus =
    nonEmptyString(input.targetStatus) ?? nonEmptyString(input.fields?.status) ?? task?.status ?? null;
  const explicitCategory = nonEmptyString(input.category) ?? nonEmptyString(metadata.category);
  const explicitPhaseKey = nonEmptyString(input.phaseKey) ?? nonEmptyString(input.fields?.phaseKey) ?? task?.phaseKey ?? null;

  let profileName = cfg.defaultProfile;
  let profileSource: TaskIntakeExplainSource = "workspace-default";
  if (metadataProfile && cfg.profiles[metadataProfile]) {
    profileName = metadataProfile;
    profileSource = "task-metadata";
  } else if (metadataProfile) {
    warnings.push({
      code: "unknown-task-metadata-profile",
      message: `metadata.${PROFILE_METADATA_KEY} '${metadataProfile}' is not defined in tasks.intakePolicy.profiles — falling back to workspace default`
    });
  }
  if (profileSource !== "task-metadata" && moduleOverride?.profile && cfg.profiles[moduleOverride.profile]) {
    profileName = moduleOverride.profile;
    profileSource = "module-override";
  }
  const contextProfileCandidates = [
    explicitAction && explicitTargetStatus ? `${explicitAction}-${explicitTargetStatus}` : null,
    explicitType && explicitAction ? `${explicitType}-${explicitAction}` : null,
    explicitType && explicitTargetStatus ? `${explicitType}-${explicitTargetStatus}` : null,
    explicitCategory ? `category-${explicitCategory}` : null,
    explicitPhaseKey ? `phase-${explicitPhaseKey}` : null,
    explicitType
  ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  if (profileSource === "workspace-default") {
    const contextProfileName = contextProfileCandidates.find((candidate) => cfg.profiles[candidate]);
    if (contextProfileName) {
      profileName = contextProfileName;
      profileSource = contextProfileName === "improvement" ? "built-in-default" : "context-match";
      explain.push({ key: "contextProfileMatch", value: contextProfileName, source: profileSource });
    }
  }
  if (!cfg.profiles[profileName]) {
    profileName = "advisory";
    profileSource = "built-in-default";
    warnings.push({
      code: "unknown-effective-profile",
      message: "Resolved task intake profile missing from config — using built-in 'advisory'"
    });
  }

  const profile = normalizeProfile(cfg.profiles[profileName]!);
  let enforcementMode = profile.enforcementMode ?? cfg.enforcementMode;
  explain.push({ key: "profileName", value: profileName, source: profileSource });
  explain.push({ key: "tasks.intakePolicy.enforcementMode", value: cfg.enforcementMode, source: "workspace-default" });
  if (profile.enforcementMode) {
    explain.push({ key: "profile.enforcementMode", value: profile.enforcementMode, source: profileSource });
  }
  if (moduleOverride?.enforcementMode) {
    enforcementMode = moduleOverride.enforcementMode;
    explain.push({ key: "tasks.intakePolicy.enforcementMode", value: enforcementMode, source: "module-override" });
  }

  const source = buildEvaluationSource(input);
  const missingRequiredFields = profile.requiredFields.filter((path) => !fieldPresent(readFieldPath(source, path)));
  const missingRecommendedFields = profile.recommendedFields.filter((path) => !fieldPresent(readFieldPath(source, path)));
  const forbiddenPresentFields = profile.forbiddenFields.filter((path) => fieldPresent(readFieldPath(source, path)));
  const fieldRuleViolations = Object.entries(profile.fieldRules).flatMap(([path, rule]) =>
    evaluateRule(path, rule, readFieldPath(source, path), source)
  );

  const action = explicitAction;
  const context = {
    taskId: nonEmptyString(input.taskId) ?? task?.id ?? null,
    type: explicitType ?? nonEmptyString(source.type) ?? null,
    targetStatus: explicitTargetStatus ?? nonEmptyString(source.status) ?? null,
    moduleId,
    category: explicitCategory,
    phaseKey: explicitPhaseKey ?? nonEmptyString(source.phaseKey) ?? null
  };

  return {
    resolvedPolicy: {
      schemaVersion: 1,
      profileName,
      enforcementMode,
      action,
      context,
      requiredFields: profile.requiredFields,
      recommendedFields: profile.recommendedFields,
      forbiddenFields: profile.forbiddenFields,
      fieldRules: profile.fieldRules
    },
    missingRequiredFields,
    missingRecommendedFields,
    forbiddenPresentFields,
    fieldRuleViolations,
    explain,
    warnings,
    precedenceOrder: [...TASK_POLICY_OVERRIDE_PRECEDENCE]
  };
}
