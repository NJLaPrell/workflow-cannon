import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPhaseDeliveryPreflight,
  DELIVERY_EVIDENCE_METADATA_KEY,
  DELIVERY_WAIVER_METADATA_KEY
} from "./delivery-evidence.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";

type ReleaseEvidenceArgs = Record<string, unknown>;

type ReleaseEvidenceFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type ReleaseEvidenceSuccess = {
  ok: true;
  manifest: Record<string, unknown>;
};

function isReleaseEvidenceFailure(
  value: Record<string, unknown> | ReleaseEvidenceFailure
): value is ReleaseEvidenceFailure {
  return (value as ReleaseEvidenceFailure).ok === false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readPackageMetadata(workspacePath: string): { packageName: string | null; version: string | null } {
  try {
    const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf8")) as Record<string, unknown>;
    return {
      packageName: nonEmptyString(pkg.name) ? pkg.name : null,
      version: nonEmptyString(pkg.version) ? pkg.version : null
    };
  } catch {
    return { packageName: null, version: null };
  }
}

function validateApproval(value: unknown): Record<string, unknown> | ReleaseEvidenceFailure {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "release-evidence-missing-approval",
      message: "Release evidence manifest requires approval object separate from policyApproval."
    };
  }

  const missing = ["actor", "timestamp", "rationale", "scope"].filter((field) => !nonEmptyString(value[field]));
  if (missing.length > 0) {
    return {
      ok: false,
      code: "release-evidence-missing-approval",
      message: "Release approval is missing required fields.",
      details: { missingFields: missing.map((field) => `approval.${field}`) }
    };
  }
  return value;
}

function validateReleaseNotes(value: unknown): Record<string, unknown> | ReleaseEvidenceFailure {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "release-evidence-missing-release-notes",
      message: "Release evidence manifest requires releaseNotes with agent-readable evidence."
    };
  }

  const entries = value.entries;
  const hasEntries = Array.isArray(entries) && entries.some((entry) => nonEmptyString(entry));
  if (!nonEmptyString(value.source) || !hasEntries) {
    return {
      ok: false,
      code: "release-evidence-missing-release-notes",
      message: "releaseNotes requires source and at least one non-empty entry.",
      details: {
        missingFields: [
          ...(!nonEmptyString(value.source) ? ["releaseNotes.source"] : []),
          ...(!hasEntries ? ["releaseNotes.entries"] : [])
        ]
      }
    };
  }
  return value;
}

function normalizeRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function normalizeTaskRefArray(value: unknown): Array<{ taskId: string; title: string | null; status: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({
      taskId: nonEmptyString(entry.taskId) ? entry.taskId : "",
      title: nonEmptyString(entry.title) ? entry.title : null,
      status: nonEmptyString(entry.status) ? entry.status : null
    }))
    .filter((entry) => entry.taskId.length > 0);
}

function validateFollowUpScan(
  value: unknown,
  followUpTasks: Array<{ taskId: string; title: string | null; status: string | null }>
): Record<string, unknown> | ReleaseEvidenceFailure {
  if (!isRecord(value) || !nonEmptyString(value.scannedAt)) {
    return {
      ok: false,
      code: "release-evidence-followup-scan-required",
      message: "Release evidence manifest requires followUpScan.scannedAt before claiming follow-up state."
    };
  }
  if (followUpTasks.length === 0 && !nonEmptyString(value.rationale)) {
    return {
      ok: false,
      code: "release-evidence-followup-scan-required",
      message: "Zero follow-up tasks requires followUpScan.rationale so agents cannot invent 'none'."
    };
  }
  return value;
}

function validateFollowUpTaskRefs(
  allTasks: TaskEntity[],
  followUpTasks: Array<{ taskId: string; title: string | null; status: string | null }>
): ReleaseEvidenceFailure | null {
  const taskIds = new Set(allTasks.map((task) => task.id));
  const missing = followUpTasks.map((task) => task.taskId).filter((taskId) => !taskIds.has(taskId));
  if (missing.length === 0) return null;
  return {
    ok: false,
    code: "release-evidence-followup-task-missing",
    message: "Follow-up task references must exist in the task engine.",
    details: { missingTaskIds: missing }
  };
}

function completedPhaseTaskEvidence(tasks: TaskEntity[], phaseKey: string | null): Record<string, unknown>[] {
  return tasks
    .filter((task) => task.status === "completed")
    .filter((task) => phaseKey === null || inferTaskPhaseKey(task) === phaseKey)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      phaseKey: inferTaskPhaseKey(task),
      deliveryEvidence: task.metadata?.[DELIVERY_EVIDENCE_METADATA_KEY] ?? null,
      deliveryWaiver: task.metadata?.[DELIVERY_WAIVER_METADATA_KEY] ?? null
    }));
}

export function buildReleaseEvidenceManifest(args: {
  workspacePath: string;
  tasks: TaskEntity[];
  commandArgs: ReleaseEvidenceArgs;
  createdAt?: string;
}): ReleaseEvidenceSuccess | ReleaseEvidenceFailure {
  const packageMeta = readPackageMetadata(args.workspacePath);
  const releaseVersion = nonEmptyString(args.commandArgs.releaseVersion)
    ? args.commandArgs.releaseVersion
    : packageMeta.version;
  const packageName = nonEmptyString(args.commandArgs.packageName)
    ? args.commandArgs.packageName
    : packageMeta.packageName;
  const phaseKey = nonEmptyString(args.commandArgs.phaseKey) ? args.commandArgs.phaseKey.trim() : null;

  if (!nonEmptyString(releaseVersion)) {
    return {
      ok: false,
      code: "release-evidence-missing-version",
      message: "releaseVersion is required when package.json version cannot be resolved."
    };
  }
  if (!nonEmptyString(packageName)) {
    return {
      ok: false,
      code: "release-evidence-missing-package",
      message: "packageName is required when package.json name cannot be resolved."
    };
  }

  const approval = validateApproval(args.commandArgs.approval);
  if (isReleaseEvidenceFailure(approval)) return approval;

  const releaseNotes = validateReleaseNotes(args.commandArgs.releaseNotes);
  if (isReleaseEvidenceFailure(releaseNotes)) return releaseNotes;

  const followUpTasks = normalizeTaskRefArray(args.commandArgs.followUpTasks);
  const followUpFailure = validateFollowUpTaskRefs(args.tasks, followUpTasks);
  if (followUpFailure) return followUpFailure;

  const followUpScan = validateFollowUpScan(args.commandArgs.followUpScan, followUpTasks);
  if (isReleaseEvidenceFailure(followUpScan)) return followUpScan;

  const deliveryPreflight = buildPhaseDeliveryPreflight({
    tasks: args.tasks,
    phaseKey,
    includeInProgress: false
  });
  if (deliveryPreflight.violationCount > 0) {
    return {
      ok: false,
      code: "release-evidence-delivery-violations",
      message: "Completed phase tasks are missing delivery evidence or waivers.",
      details: { violations: deliveryPreflight.violations }
    };
  }

  const manifest = {
    schemaVersion: 1,
    createdAt: args.createdAt ?? new Date().toISOString(),
    releaseVersion,
    packageName,
    phaseKey,
    git: isRecord(args.commandArgs.git) ? args.commandArgs.git : {},
    approval,
    releaseNotes,
    validations: normalizeRecordArray(args.commandArgs.validations),
    risks: normalizeRecordArray(args.commandArgs.risks),
    publishArtifacts: normalizeRecordArray(args.commandArgs.publishArtifacts),
    taskDeliveryEvidence: completedPhaseTaskEvidence(args.tasks, phaseKey),
    followUpScan,
    followUpTasks,
    followUpSummary: {
      count: followUpTasks.length,
      scannedAt: followUpScan["scannedAt"],
      rationale: nonEmptyString(followUpScan["rationale"]) ? followUpScan["rationale"] : null
    }
  };

  return { ok: true, manifest };
}
