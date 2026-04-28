import type { BuiltinRunCommandManifestRow } from "../../contracts/builtin-run-command-manifest.js";

export type GuidanceScopeCondition =
  | { kind: "always" }
  | { kind: "commandName"; match: "exact" | "prefix"; value: string }
  | { kind: "commandArgEquals"; path: string; value: string | number | boolean | null }
  | { kind: "phaseKey"; value: string }
  | { kind: "taskIdPattern"; pattern: string }
  | { kind: "taskTag"; match?: "any" | "all"; values: string[] };

export type GuidanceScopeDraft =
  | { preset: "always" }
  | { preset: "workflow"; workflowName: string }
  | { preset: "completingTask"; phaseKey?: string; taskId?: string; taskIdPattern?: string }
  | { preset: "phase"; phaseKey: string }
  | { preset: "task"; taskId?: string; taskIdPattern?: string }
  | { preset: "taskTag"; values: string[]; match?: "any" | "all" }
  | {
      preset: "advancedCommand";
      commandName: string;
      commandNameMatch?: "exact" | "prefix";
      commandArgPath?: string;
      commandArgValue?: string | number | boolean | null;
    };

export type GuidanceScopeBuildOptions = {
  knownWorkflowNames?: string[];
};

export type GuidanceScopeBuildResult = {
  schemaVersion: 1;
  ok: boolean;
  preset: GuidanceScopeDraft["preset"] | "unknown";
  scope: { conditions: GuidanceScopeCondition[] } | null;
  summary: string;
  warnings: { code: string; message: string }[];
  errors: { code: string; message: string }[];
};

export type GuidanceScopePresetDescriptor = {
  preset: GuidanceScopeDraft["preset"];
  label: string;
  description: string;
  broad?: boolean;
};

export const GUIDANCE_SCOPE_PRESETS: GuidanceScopePresetDescriptor[] = [
  {
    preset: "always",
    label: "Always",
    description: "Apply this Guidance rule to every CAE evaluation.",
    broad: true
  },
  {
    preset: "workflow",
    label: "Workflow",
    description: "Apply when a selected workspace-kit workflow runs."
  },
  {
    preset: "completingTask",
    label: "Completing a task",
    description: "Apply when run-transition is completing a task, optionally narrowed by task or phase."
  },
  {
    preset: "phase",
    label: "Phase",
    description: "Apply when the active task belongs to a kit phase."
  },
  {
    preset: "task",
    label: "Task",
    description: "Apply to a specific task id or task id pattern."
  },
  {
    preset: "taskTag",
    label: "Task tag/type",
    description: "Apply when the active task has one or more tags."
  },
  {
    preset: "advancedCommand",
    label: "Advanced command",
    description: "Apply to a custom command name and optional scalar command argument."
  }
];

const TASK_ID_RE = /^T[0-9]{3,}$/;
const PHASE_RE = /^[0-9]+$/;
const ARG_PATH_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,5}$/;

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function regexIsValid(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function commandLabel(commandName: string, manifest?: BuiltinRunCommandManifestRow): string {
  return manifest?.description ? `${commandName} (${manifest.description})` : commandName;
}

export function buildGuidanceScopeDraft(
  draft: unknown,
  options: GuidanceScopeBuildOptions = {}
): GuidanceScopeBuildResult {
  const errors: GuidanceScopeBuildResult["errors"] = [];
  const warnings: GuidanceScopeBuildResult["warnings"] = [];
  const record = draft && typeof draft === "object" && !Array.isArray(draft) ? (draft as Record<string, unknown>) : null;
  const preset = cleanString(record?.preset) as GuidanceScopeDraft["preset"];
  const knownWorkflowNames = new Set(options.knownWorkflowNames ?? []);
  const conditions: GuidanceScopeCondition[] = [];
  let summary = "Invalid Guidance scope draft.";

  if (!record || !preset) {
    errors.push({ code: "scope-preset-required", message: "Choose a Guidance scope preset." });
  } else if (preset === "always") {
    conditions.push({ kind: "always" });
    summary = "Always applies.";
    warnings.push({
      code: "scope-broad-always",
      message: "This scope is broad: the rule can appear for every Guidance evaluation."
    });
  } else if (preset === "workflow") {
    const workflowName = cleanString(record.workflowName);
    if (!workflowName) {
      errors.push({ code: "scope-workflow-required", message: "Choose a workflow." });
    } else if (knownWorkflowNames.size > 0 && !knownWorkflowNames.has(workflowName)) {
      errors.push({
        code: "scope-workflow-unknown",
        message: `Unknown curated workflow: ${workflowName}.`
      });
    } else {
      conditions.push({ kind: "commandName", match: "exact", value: workflowName });
      summary = `Applies when the ${workflowName} workflow runs.`;
    }
  } else if (preset === "completingTask") {
    conditions.push({ kind: "commandName", match: "exact", value: "run-transition" });
    conditions.push({ kind: "commandArgEquals", path: "action", value: "complete" });
    const phaseKey = cleanString(record.phaseKey);
    const taskId = cleanString(record.taskId);
    const taskIdPattern = cleanString(record.taskIdPattern);
    if (phaseKey) {
      if (!PHASE_RE.test(phaseKey)) {
        errors.push({ code: "scope-phase-invalid", message: "Phase key must contain only digits." });
      } else {
        conditions.push({ kind: "phaseKey", value: phaseKey });
      }
    }
    if (taskId && taskIdPattern) {
      errors.push({ code: "scope-task-ambiguous", message: "Use either taskId or taskIdPattern, not both." });
    } else if (taskId) {
      if (!TASK_ID_RE.test(taskId)) {
        errors.push({ code: "scope-task-id-invalid", message: "Task id must look like T123." });
      } else {
        conditions.push({ kind: "taskIdPattern", pattern: `^${escapeRegex(taskId)}$` });
      }
    } else if (taskIdPattern) {
      if (!regexIsValid(taskIdPattern)) {
        errors.push({ code: "scope-task-pattern-invalid", message: "Task id pattern must be a valid JavaScript regex." });
      } else {
        conditions.push({ kind: "taskIdPattern", pattern: taskIdPattern });
      }
    }
    summary = phaseKey
      ? `Applies when completing a task in Phase ${phaseKey}.`
      : taskId
        ? `Applies when completing task ${taskId}.`
        : taskIdPattern
          ? `Applies when completing tasks matching /${taskIdPattern}/.`
          : "Applies when completing any task.";
    if (conditions.length === 2) {
      warnings.push({
        code: "scope-broad-completing-task",
        message: "This scope applies to every task completion; narrow by phase or task when possible."
      });
    }
  } else if (preset === "phase") {
    const phaseKey = cleanString(record.phaseKey);
    if (!phaseKey) {
      errors.push({ code: "scope-phase-required", message: "Phase key is required." });
    } else if (!PHASE_RE.test(phaseKey)) {
      errors.push({ code: "scope-phase-invalid", message: "Phase key must contain only digits." });
    } else {
      conditions.push({ kind: "phaseKey", value: phaseKey });
      summary = `Applies to tasks in Phase ${phaseKey}.`;
    }
  } else if (preset === "task") {
    const taskId = cleanString(record.taskId);
    const taskIdPattern = cleanString(record.taskIdPattern);
    if (!taskId && !taskIdPattern) {
      errors.push({ code: "scope-task-required", message: "Provide taskId or taskIdPattern." });
    } else if (taskId && taskIdPattern) {
      errors.push({ code: "scope-task-ambiguous", message: "Use either taskId or taskIdPattern, not both." });
    } else if (taskId) {
      if (!TASK_ID_RE.test(taskId)) {
        errors.push({ code: "scope-task-id-invalid", message: "Task id must look like T123." });
      } else {
        conditions.push({ kind: "taskIdPattern", pattern: `^${escapeRegex(taskId)}$` });
        summary = `Applies to task ${taskId}.`;
      }
    } else if (!regexIsValid(taskIdPattern)) {
      errors.push({ code: "scope-task-pattern-invalid", message: "Task id pattern must be a valid JavaScript regex." });
    } else {
      conditions.push({ kind: "taskIdPattern", pattern: taskIdPattern });
      summary = `Applies to tasks matching /${taskIdPattern}/.`;
    }
  } else if (preset === "taskTag") {
    const values = Array.isArray(record.values)
      ? record.values.map(cleanString).filter((value) => value.length > 0)
      : [];
    const match = record.match === "all" ? "all" : "any";
    if (values.length === 0) {
      errors.push({ code: "scope-task-tag-required", message: "Provide at least one task tag." });
    } else if (values.length > 16) {
      errors.push({ code: "scope-task-tag-too-many", message: "Use at most 16 task tags." });
    } else {
      conditions.push({ kind: "taskTag", match, values });
      summary = `Applies when a task has ${match === "all" ? "all" : "any"} of these tags: ${values.join(", ")}.`;
    }
  } else if (preset === "advancedCommand") {
    const commandName = cleanString(record.commandName);
    const commandNameMatch = record.commandNameMatch === "prefix" ? "prefix" : "exact";
    if (!commandName) {
      errors.push({ code: "scope-command-required", message: "Command name is required." });
    } else {
      conditions.push({ kind: "commandName", match: commandNameMatch, value: commandName });
      summary = `Applies when command ${commandNameMatch === "prefix" ? "starts with" : "is"} ${commandName}.`;
    }
    const commandArgPath = cleanString(record.commandArgPath);
    if (commandArgPath) {
      if (!ARG_PATH_RE.test(commandArgPath)) {
        errors.push({
          code: "scope-command-arg-path-invalid",
          message: "Command argument path must be dot-separated identifiers."
        });
      } else if (!Object.hasOwn(record, "commandArgValue")) {
        errors.push({
          code: "scope-command-arg-value-required",
          message: "Command argument value is required when commandArgPath is set."
        });
      } else {
        const commandArgValue = record.commandArgValue;
        if (
          typeof commandArgValue === "string" ||
          typeof commandArgValue === "number" ||
          typeof commandArgValue === "boolean" ||
          commandArgValue === null
        ) {
          conditions.push({ kind: "commandArgEquals", path: commandArgPath, value: commandArgValue });
          summary += ` Argument ${commandArgPath} must equal ${JSON.stringify(commandArgValue)}.`;
        } else {
          errors.push({
            code: "scope-command-arg-value-invalid",
            message: "Command argument value must be a string, number, boolean, or null."
          });
        }
      }
    }
  } else {
    errors.push({ code: "scope-preset-unknown", message: `Unknown Guidance scope preset: ${preset}.` });
  }

  return {
    schemaVersion: 1,
    ok: errors.length === 0,
    preset: preset || "unknown",
    scope: errors.length === 0 ? { conditions } : null,
    summary,
    warnings,
    errors
  };
}

export function guidanceScopeWorkflowNames(manifest: BuiltinRunCommandManifestRow[]): string[] {
  return manifest.map((row) => row.name).sort((a, b) => a.localeCompare(b));
}

export function guidanceScopeWorkflowChoices(manifest: BuiltinRunCommandManifestRow[]): Record<string, unknown>[] {
  return manifest
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({
      name: row.name,
      moduleId: row.moduleId,
      label: row.name,
      description: commandLabel(row.name, row)
    }));
}

/** Flat JSON objects validated by `#/$defs/scopeCondition` on `schemas/cae/activation-definition.schema.json`. */
export function serializeGuidanceScopeForActivation(
  conditions: GuidanceScopeCondition[]
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const raw of conditions) {
    switch (raw.kind) {
      case "always":
        out.push({ kind: "always" });
        break;
      case "commandName":
        out.push({ kind: "commandName", match: raw.match, value: raw.value });
        break;
      case "commandArgEquals":
        out.push({
          kind: "commandArgEquals",
          path: raw.path,
          value: raw.value
        });
        break;
      case "phaseKey":
        out.push({ kind: "phaseKey", value: raw.value });
        break;
      case "taskIdPattern":
        out.push({ kind: "taskIdPattern", pattern: raw.pattern });
        break;
      case "taskTag": {
        const row: Record<string, unknown> = { kind: "taskTag", values: raw.values };
        if (raw.match !== undefined) row.match = raw.match;
        out.push(row);
        break;
      }
    }
  }
  return out;
}
