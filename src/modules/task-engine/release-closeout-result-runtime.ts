import { readPackageMetadata } from "./release-evidence-manifest.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";

export const RELEASE_CLOSEOUT_RESULT_SCHEMA_VERSION = 1 as const;
export const RELEASE_CLOSEOUT_RESULT_FEATURE_LIMIT = 12;
export const RELEASE_CLOSEOUT_RESULT_FOLLOW_UP_LIMIT = 12;
export const RELEASE_CLOSEOUT_RESULT_NOTE_LIMIT = 8;

type CommandRef = {
  command: string;
  commandLine: string;
  instructionPath: string;
};

type ReleaseCloseoutResultFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type ReleaseCloseoutResultSuccess = {
  ok: true;
  packet: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function commandLine(command: string, args?: Record<string, unknown>): string {
  return args
    ? `pnpm exec wk run ${command} '${JSON.stringify(args)}'`
    : `pnpm exec wk run ${command} '{}'`;
}

function commandRef(command: string, args?: Record<string, unknown>): CommandRef {
  return {
    command,
    commandLine: commandLine(command, args),
    instructionPath: `src/modules/task-engine/instructions/${command}.md`
  };
}

function readManifest(args: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(args.manifest)) {
    return args.manifest;
  }
  if (isRecord(args.releaseEvidenceManifest)) {
    return args.releaseEvidenceManifest;
  }
  return {};
}

function readReleaseNotes(args: Record<string, unknown>, manifest: Record<string, unknown>): {
  source: string | null;
  entries: string[];
} {
  const fromArgs = isRecord(args.releaseNotes) ? args.releaseNotes : null;
  const fromManifest = isRecord(manifest.releaseNotes) ? manifest.releaseNotes : null;
  const sourceRecord = fromArgs ?? fromManifest;
  const entries = Array.isArray(sourceRecord?.entries)
    ? sourceRecord.entries.filter(nonEmptyString).map((entry) => entry.trim())
    : [];
  return {
    source: nonEmptyString(sourceRecord?.source) ? sourceRecord.source.trim() : null,
    entries
  };
}

function normalizeFollowUpTasks(args: Record<string, unknown>, manifest: Record<string, unknown>): Array<{
  taskId: string;
  title: string | null;
  status: string | null;
}> {
  const raw = Array.isArray(args.followUpTasks)
    ? args.followUpTasks
    : Array.isArray(manifest.followUpTasks)
      ? manifest.followUpTasks
      : [];
  return raw
    .filter(isRecord)
    .map((entry) => ({
      taskId: nonEmptyString(entry.taskId) ? entry.taskId.trim() : "",
      title: nonEmptyString(entry.title) ? entry.title.trim() : null,
      status: nonEmptyString(entry.status) ? entry.status.trim() : null
    }))
    .filter((entry) => entry.taskId.length > 0)
    .slice(0, RELEASE_CLOSEOUT_RESULT_FOLLOW_UP_LIMIT);
}

function readFollowUpSummary(args: Record<string, unknown>, manifest: Record<string, unknown>, followUpTasks: unknown[]): {
  count: number | null;
  scannedAt: string | null;
  rationale: string | null;
} {
  const summary = isRecord(args.followUpSummary)
    ? args.followUpSummary
    : isRecord(manifest.followUpSummary)
      ? manifest.followUpSummary
      : {};
  const scan = isRecord(args.followUpScan)
    ? args.followUpScan
    : isRecord(manifest.followUpScan)
      ? manifest.followUpScan
      : {};
  const rawCount = Number(summary.count);
  const count = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : followUpTasks.length;
  return {
    count,
    scannedAt: nonEmptyString(summary.scannedAt)
      ? summary.scannedAt.trim()
      : nonEmptyString(scan.scannedAt)
        ? scan.scannedAt.trim()
        : null,
    rationale: nonEmptyString(summary.rationale)
      ? summary.rationale.trim()
      : nonEmptyString(scan.rationale)
        ? scan.rationale.trim()
        : null
  };
}

function countCompletedExecutionTasks(tasks: TaskEntity[], phaseKey: string | null): number {
  return tasks.filter((task) => {
    if (task.archived || task.status !== "completed" || task.type !== "execution") {
      return false;
    }
    return phaseKey === null || inferTaskPhaseKey(task) === phaseKey;
  }).length;
}

function normalizeRisks(args: Record<string, unknown>, manifest: Record<string, unknown>): string[] {
  return asRecordArray(args.risks ?? manifest.risks)
    .map((risk) => {
      const label = nonEmptyString(risk.label) ? risk.label.trim() : nonEmptyString(risk.code) ? risk.code.trim() : null;
      const message = nonEmptyString(risk.message)
        ? risk.message.trim()
        : nonEmptyString(risk.description)
          ? risk.description.trim()
          : null;
      if (label && message) return `${label}: ${message}`;
      return label ?? message ?? null;
    })
    .filter(nonEmptyString)
    .slice(0, RELEASE_CLOSEOUT_RESULT_NOTE_LIMIT);
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(nonEmptyString).map((entry) => entry.trim()) : [];
}

function readPostReleaseEvidence(args: Record<string, unknown>, manifest: Record<string, unknown>): {
  branchesAndPrs: string[];
  tag: string | null;
  publishedPackage: string | null;
  ci: string[];
  workspace: Record<string, unknown> | null;
  missingFinalEvidence: string[];
} {
  const source = isRecord(args.postReleaseEvidence)
    ? args.postReleaseEvidence
    : isRecord(args.finalEvidence)
      ? args.finalEvidence
      : isRecord(manifest.postReleaseEvidence)
        ? manifest.postReleaseEvidence
        : isRecord(manifest.finalEvidence)
          ? manifest.finalEvidence
          : {};
  const branchesAndPrs = readStringList(source.branchesAndPrs ?? source.branches ?? source.prs);
  const tag = nonEmptyString(source.tag) ? source.tag.trim() : nonEmptyString(source.gitTag) ? source.gitTag.trim() : null;
  const publishedPackage = nonEmptyString(source.publishedPackage)
    ? source.publishedPackage.trim()
    : nonEmptyString(source.package)
      ? source.package.trim()
      : null;
  const ci = readStringList(source.ci ?? source.checks);
  const workspace = isRecord(source.workspace) ? source.workspace : null;
  const missingFinalEvidence: string[] = [];
  if (branchesAndPrs.length === 0) missingFinalEvidence.push("postReleaseEvidence.branchesAndPrs");
  if (!tag) missingFinalEvidence.push("postReleaseEvidence.tag");
  if (!publishedPackage) missingFinalEvidence.push("postReleaseEvidence.publishedPackage");
  if (ci.length === 0) missingFinalEvidence.push("postReleaseEvidence.ci");
  if (!workspace) missingFinalEvidence.push("postReleaseEvidence.workspace");
  return { branchesAndPrs, tag, publishedPackage, ci, workspace, missingFinalEvidence };
}

function markdownList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildReleaseCloseoutResult(args: {
  workspacePath: string;
  tasks: TaskEntity[];
  commandArgs: Record<string, unknown>;
  phaseKey: string | null;
  planningGeneration: number;
  createdAt?: string;
}): ReleaseCloseoutResultSuccess | ReleaseCloseoutResultFailure {
  const manifest = readManifest(args.commandArgs);
  const packageMeta = readPackageMetadata(args.workspacePath);
  const releaseVersion = nonEmptyString(args.commandArgs.releaseVersion)
    ? args.commandArgs.releaseVersion.trim()
    : nonEmptyString(manifest.releaseVersion)
      ? manifest.releaseVersion.trim()
      : packageMeta.version;
  const packageName = nonEmptyString(args.commandArgs.packageName)
    ? args.commandArgs.packageName.trim()
    : nonEmptyString(manifest.packageName)
      ? manifest.packageName.trim()
      : packageMeta.packageName;
  const phaseKey = args.phaseKey;
  const releaseNotes = readReleaseNotes(args.commandArgs, manifest);
  const followUpTasks = normalizeFollowUpTasks(args.commandArgs, manifest);
  const followUpSummary = readFollowUpSummary(args.commandArgs, manifest, followUpTasks);
  const postReleaseEvidence = readPostReleaseEvidence(args.commandArgs, manifest);

  const missingFields: string[] = [];
  if (!phaseKey) missingFields.push("phaseKey");
  if (!releaseVersion) missingFields.push("releaseVersion");
  if (!packageName) missingFields.push("packageName");
  if (!releaseNotes.source) missingFields.push("releaseNotes.source");
  if (releaseNotes.entries.length === 0) missingFields.push("releaseNotes.entries");
  if (!followUpSummary.scannedAt) missingFields.push("followUpSummary.scannedAt");
  if (followUpSummary.count === 0 && !followUpSummary.rationale) {
    missingFields.push("followUpSummary.rationale");
  }
  if (missingFields.length > 0) {
    return {
      ok: false,
      code: "release-closeout-result-insufficient-evidence",
      message: "release-closeout-result needs concrete release notes, follow-up scan, phase, and version evidence.",
      details: { missingFields }
    };
  }

  const completedExecutionTaskCount = countCompletedExecutionTasks(args.tasks, phaseKey);
  const featureBullets = releaseNotes.entries.slice(0, RELEASE_CLOSEOUT_RESULT_FEATURE_LIMIT);
  const risks = normalizeRisks(args.commandArgs, manifest);
  const followOnText = followUpSummary.count === 0 ? "none" : String(followUpSummary.count);
  const notesLines = [
    ...risks.map((risk) => `- **Risks / issues:** ${risk}`),
    ...followUpTasks.map((task) => {
      const title = task.title ? ` - ${task.title}` : "";
      const status = task.status ? ` (${task.status})` : "";
      return `- **Opinions / additional tasking:** ${task.taskId}${title}${status}`;
    })
  ].slice(0, RELEASE_CLOSEOUT_RESULT_NOTE_LIMIT);
  const optionalNotesBlock = notesLines.length > 0 ? `Notes:\n${notesLines.join("\n")}` : "";
  const finalReportMarkdown = [
    `Phase ${phaseKey} has been delivered!`,
    `${completedExecutionTaskCount} tasks complete`,
    `${followOnText} follow-on tasks`,
    "",
    "Features delivered:",
    markdownList(featureBullets),
    "",
    optionalNotesBlock
  ].join("\n").trimEnd();
  if (/[{}]/.test(finalReportMarkdown)) {
    return {
      ok: false,
      code: "release-closeout-result-placeholder-token",
      message: "release-closeout-result refuses to emit a final report containing placeholder braces.",
      details: { fields: ["finalReport.markdown"] }
    };
  }
  const sequence = [
    commandRef("phase-release-orchestration-state"),
    commandRef("phase-drain-delta"),
    commandRef("phase-release-state", phaseKey ? { phaseKey } : undefined),
    commandRef("prepare-release-artifacts", releaseVersion ? { version: releaseVersion } : undefined),
    commandRef("release-closeout-result", releaseVersion && phaseKey ? { phaseKey, releaseVersion } : undefined)
  ];

  return {
    ok: true,
    packet: {
      schemaVersion: RELEASE_CLOSEOUT_RESULT_SCHEMA_VERSION,
      packetKind: "releaseCloseoutResult",
      createdAt: args.createdAt ?? new Date().toISOString(),
      planningGeneration: args.planningGeneration,
      phaseKey,
      releaseVersion,
      packageName,
      finalReport: {
        format: "markdown",
        markdown: finalReportMarkdown,
        placeholderFree: true,
        fields: {
          phaseNumber: phaseKey,
          completedExecutionTaskCount,
          followOnExecutionTaskCountOrNone: followOnText,
          featureMarkdownBullets: markdownList(featureBullets),
          optionalNotesBlockOrEmpty: optionalNotesBlock
        }
      },
      releaseEvidence: {
        releaseNotesSource: releaseNotes.source,
        featureCount: featureBullets.length,
        featureLimit: RELEASE_CLOSEOUT_RESULT_FEATURE_LIMIT,
        followUpSummary,
        followUpTasks,
        risks,
        postReleaseEvidence,
        missingFinalEvidence: postReleaseEvidence.missingFinalEvidence
      },
      refs: {
        commandSequence: sequence,
        concreteRefs: [
          {
            field: "completedExecutionTaskCount",
            source: "task-store",
            ref: commandRef("list-tasks", { phaseKey, type: "execution", status: "completed" })
          },
          {
            field: "featureMarkdownBullets",
            source: releaseNotes.source,
            ref: commandRef("release-evidence-manifest", { releaseVersion, phaseKey })
          },
          {
            field: "followOnExecutionTaskCountOrNone",
            source: "releaseEvidenceManifest.followUpSummary",
            ref: commandRef("release-evidence-manifest", { releaseVersion, phaseKey })
          },
          {
            field: "postReleaseEvidence",
            source: "release-closeout-result.args.postReleaseEvidence",
            ref: commandRef("phase-release-state", { phaseKey })
          }
        ],
        instructions: sequence.map((ref) => ref.instructionPath)
      }
    }
  };
}
