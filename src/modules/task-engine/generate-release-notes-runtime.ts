import { readPackageMetadata } from "./release-evidence-manifest.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";

export const GENERATE_RELEASE_NOTES_SCHEMA_VERSION = 1 as const;
export const DEFAULT_MAX_FEATURES = 20;
export const DEFAULT_MAX_HIGHLIGHTS = 5;

type ChangeKind = "breaking" | "feature" | "improvement" | "fix" | "chore" | "unknown";

type OutputFormat = "markdown" | "github" | "plain";

type ClassifiedTask = {
  taskId: string;
  title: string;
  summary: string | null;
  description: string | null;
  changeKind: ChangeKind;
  userFacingDescription: string;
  acceptanceCriteria: string[];
  features: string[];
  isBreaking: boolean;
  migrationNote: string | null;
};

type ReleaseNotesSection = {
  headline: string;
  overview: string;
  highlights: string[];
  newFeatures: string[];
  improvements: string[];
  fixes: string[];
  breakingChanges: string[];
  migration: string | null;
};

type GenerateReleaseNotesSuccess = {
  ok: true;
  data: {
    schemaVersion: number;
    releaseVersion: string;
    releaseName: string | null;
    phaseKey: string;
    generatedAt: string;
    markdown: string;
    sections: ReleaseNotesSection;
    sourceTaskCount: number;
    sourceTasks: Array<{ taskId: string; title: string; changeKind: ChangeKind }>;
  };
};

type GenerateReleaseNotesFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractChangeKind(task: TaskEntity): ChangeKind {
  const meta = task.metadata;
  if (isRecord(meta) && nonEmptyString(meta.changeKind)) {
    const kind = meta.changeKind.toLowerCase().trim();
    if (kind === "breaking" || kind === "major") return "breaking";
    if (kind === "feature" || kind === "minor") return "feature";
    if (kind === "improvement" || kind === "enhancement") return "improvement";
    if (kind === "fix" || kind === "patch" || kind === "bugfix") return "fix";
    if (kind === "chore" || kind === "maintenance" || kind === "docs") return "chore";
  }
  const taskType = task.type?.toLowerCase() ?? "";
  if (taskType === "feature") return "feature";
  if (taskType === "improvement" || taskType === "enhancement") return "improvement";
  if (taskType === "bug" || taskType === "bugfix" || taskType === "fix") return "fix";
  if (taskType === "chore" || taskType === "maintenance") return "chore";
  if (taskType === "execution") return "feature";
  return "unknown";
}

function isBreakingChange(task: TaskEntity): boolean {
  const meta = task.metadata;
  if (isRecord(meta)) {
    if (meta.changeKind === "breaking" || meta.changeKind === "major") return true;
    if (meta.breaking === true) return true;
    if (nonEmptyString(meta.breakingChange)) return true;
  }
  const title = task.title?.toLowerCase() ?? "";
  const summary = task.summary?.toLowerCase() ?? "";
  return title.includes("breaking") || summary.includes("breaking change");
}

function extractMigrationNote(task: TaskEntity): string | null {
  const meta = task.metadata;
  if (isRecord(meta)) {
    if (nonEmptyString(meta.migrationNote)) return meta.migrationNote.trim();
    if (nonEmptyString(meta.migration)) return meta.migration.trim();
  }
  return null;
}

function humanizeTitle(title: string): string {
  let cleaned = title.replace(/^(T\d+[-:\s]*|Phase\s*\d+[-:\s]*)/i, "").trim();
  cleaned = cleaned.replace(/[_-]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ");
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

function generateUserFacingDescription(task: TaskEntity): string {
  if (nonEmptyString(task.summary)) {
    return humanizeTitle(task.summary);
  }
  if (nonEmptyString(task.title)) {
    return humanizeTitle(task.title);
  }
  return "General improvements and updates";
}

function classifyTask(task: TaskEntity): ClassifiedTask {
  const changeKind = extractChangeKind(task);
  return {
    taskId: task.id,
    title: task.title,
    summary: task.summary ?? null,
    description: task.description ?? null,
    changeKind,
    userFacingDescription: generateUserFacingDescription(task),
    acceptanceCriteria: task.acceptanceCriteria ?? [],
    features: task.features ?? [],
    isBreaking: isBreakingChange(task),
    migrationNote: extractMigrationNote(task)
  };
}

function generateHeadline(tasks: ClassifiedTask[], releaseName: string | null): string {
  if (releaseName) {
    return releaseName;
  }
  const featureCount = tasks.filter((t) => t.changeKind === "feature").length;
  const fixCount = tasks.filter((t) => t.changeKind === "fix").length;
  const improvementCount = tasks.filter((t) => t.changeKind === "improvement").length;
  const breakingCount = tasks.filter((t) => t.isBreaking).length;

  if (breakingCount > 0) {
    return "Major update with breaking changes";
  }
  if (featureCount >= 3) {
    return "Feature-packed release";
  }
  if (featureCount > 0 && improvementCount > 0) {
    return "New features and improvements";
  }
  if (fixCount >= 3) {
    return "Stability and bug fixes";
  }
  if (improvementCount >= 2) {
    return "Quality of life improvements";
  }
  return "Updates and improvements";
}

function generateOverview(tasks: ClassifiedTask[], releaseName: string | null): string {
  const featureCount = tasks.filter((t) => t.changeKind === "feature").length;
  const fixCount = tasks.filter((t) => t.changeKind === "fix").length;
  const improvementCount = tasks.filter((t) => t.changeKind === "improvement").length;
  const breakingCount = tasks.filter((t) => t.isBreaking).length;

  const parts: string[] = [];

  if (releaseName) {
    parts.push(`This release delivers ${releaseName}.`);
  }

  if (breakingCount > 0) {
    parts.push(
      `**Heads up:** This release includes ${breakingCount} breaking change${breakingCount > 1 ? "s" : ""} — please review the migration notes below.`
    );
  }

  const summaryParts: string[] = [];
  if (featureCount > 0) {
    summaryParts.push(`${featureCount} new feature${featureCount > 1 ? "s" : ""}`);
  }
  if (improvementCount > 0) {
    summaryParts.push(`${improvementCount} improvement${improvementCount > 1 ? "s" : ""}`);
  }
  if (fixCount > 0) {
    summaryParts.push(`${fixCount} bug fix${fixCount > 1 ? "es" : ""}`);
  }

  if (summaryParts.length > 0) {
    parts.push(`Includes ${summaryParts.join(", ")}.`);
  }

  return parts.join(" ");
}

function generateHighlights(tasks: ClassifiedTask[], maxHighlights: number): string[] {
  const highlights: string[] = [];
  const breakingTasks = tasks.filter((t) => t.isBreaking);
  for (const task of breakingTasks.slice(0, 2)) {
    highlights.push(`**Breaking:** ${task.userFacingDescription}`);
  }
  const features = tasks.filter((t) => t.changeKind === "feature" && !t.isBreaking);
  for (const task of features.slice(0, maxHighlights - highlights.length)) {
    highlights.push(task.userFacingDescription);
  }
  if (highlights.length < maxHighlights) {
    const improvements = tasks.filter((t) => t.changeKind === "improvement" && !t.isBreaking);
    for (const task of improvements.slice(0, maxHighlights - highlights.length)) {
      highlights.push(task.userFacingDescription);
    }
  }

  return highlights.slice(0, maxHighlights);
}

function buildSections(
  tasks: ClassifiedTask[],
  releaseName: string | null,
  includeBreaking: boolean,
  includeMigration: boolean,
  maxFeatures: number
): ReleaseNotesSection {
  const headline = generateHeadline(tasks, releaseName);
  const overview = generateOverview(tasks, releaseName);
  const highlights = generateHighlights(tasks, DEFAULT_MAX_HIGHLIGHTS);

  const newFeatures = tasks
    .filter((t) => t.changeKind === "feature" && !t.isBreaking)
    .map((t) => t.userFacingDescription)
    .slice(0, maxFeatures);

  const improvements = tasks
    .filter((t) => t.changeKind === "improvement" && !t.isBreaking)
    .map((t) => t.userFacingDescription)
    .slice(0, maxFeatures);

  const fixes = tasks
    .filter((t) => t.changeKind === "fix")
    .map((t) => t.userFacingDescription)
    .slice(0, maxFeatures);

  const breakingChanges = includeBreaking
    ? tasks
        .filter((t) => t.isBreaking)
        .map((t) => t.userFacingDescription)
        .slice(0, maxFeatures)
    : [];

  const migrationNotes = tasks.map((t) => t.migrationNote).filter(nonEmptyString);
  const migration = includeMigration && migrationNotes.length > 0 ? migrationNotes.join("\n\n") : null;

  return {
    headline,
    overview,
    highlights,
    newFeatures,
    improvements,
    fixes,
    breakingChanges,
    migration
  };
}

function formatMarkdown(
  sections: ReleaseNotesSection,
  releaseVersion: string,
  releaseName: string | null
): string {
  const lines: string[] = [];

  const title = releaseName ? `# Release ${releaseVersion}: ${releaseName}` : `# Release ${releaseVersion}`;
  lines.push(title);
  lines.push("");

  if (sections.overview) {
    lines.push(sections.overview);
    lines.push("");
  }

  if (sections.highlights.length > 0) {
    lines.push("## Highlights");
    lines.push("");
    for (const highlight of sections.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push("");
  }

  if (sections.breakingChanges.length > 0) {
    lines.push("## Breaking Changes");
    lines.push("");
    lines.push("> **Action required:** Review these changes before upgrading.");
    lines.push("");
    for (const change of sections.breakingChanges) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  if (sections.newFeatures.length > 0) {
    lines.push("## New Features");
    lines.push("");
    for (const feature of sections.newFeatures) {
      lines.push(`- ${feature}`);
    }
    lines.push("");
  }

  if (sections.improvements.length > 0) {
    lines.push("## Improvements");
    lines.push("");
    for (const improvement of sections.improvements) {
      lines.push(`- ${improvement}`);
    }
    lines.push("");
  }

  if (sections.fixes.length > 0) {
    lines.push("## Bug Fixes");
    lines.push("");
    for (const fix of sections.fixes) {
      lines.push(`- ${fix}`);
    }
    lines.push("");
  }

  if (sections.migration) {
    lines.push("## Migration Notes");
    lines.push("");
    lines.push(sections.migration);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatGitHub(
  sections: ReleaseNotesSection,
  releaseVersion: string,
  releaseName: string | null
): string {
  const lines: string[] = [];

  const title = releaseName ? `## ${releaseName}` : `## What's New in ${releaseVersion}`;
  lines.push(title);
  lines.push("");

  if (sections.overview) {
    lines.push(sections.overview);
    lines.push("");
  }

  if (sections.highlights.length > 0) {
    lines.push("### ✨ Highlights");
    lines.push("");
    for (const highlight of sections.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push("");
  }

  if (sections.breakingChanges.length > 0) {
    lines.push("### ⚠️ Breaking Changes");
    lines.push("");
    for (const change of sections.breakingChanges) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  if (sections.newFeatures.length > 0) {
    lines.push("### 🚀 New Features");
    lines.push("");
    for (const feature of sections.newFeatures) {
      lines.push(`- ${feature}`);
    }
    lines.push("");
  }

  if (sections.improvements.length > 0) {
    lines.push("### 💪 Improvements");
    lines.push("");
    for (const improvement of sections.improvements) {
      lines.push(`- ${improvement}`);
    }
    lines.push("");
  }

  if (sections.fixes.length > 0) {
    lines.push("### 🐛 Bug Fixes");
    lines.push("");
    for (const fix of sections.fixes) {
      lines.push(`- ${fix}`);
    }
    lines.push("");
  }

  if (sections.migration) {
    lines.push("<details>");
    lines.push("<summary>📋 Migration Notes</summary>");
    lines.push("");
    lines.push(sections.migration);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatPlain(sections: ReleaseNotesSection, releaseVersion: string, releaseName: string | null): string {
  const lines: string[] = [];

  const title = releaseName ? `Release ${releaseVersion}: ${releaseName}` : `Release ${releaseVersion}`;
  lines.push(title);
  lines.push("=".repeat(title.length));
  lines.push("");

  if (sections.overview) {
    lines.push(sections.overview.replace(/\*\*/g, ""));
    lines.push("");
  }

  if (sections.highlights.length > 0) {
    lines.push("Highlights:");
    for (const highlight of sections.highlights) {
      lines.push(`  * ${highlight.replace(/\*\*/g, "")}`);
    }
    lines.push("");
  }

  if (sections.breakingChanges.length > 0) {
    lines.push("Breaking Changes:");
    for (const change of sections.breakingChanges) {
      lines.push(`  * ${change}`);
    }
    lines.push("");
  }

  if (sections.newFeatures.length > 0) {
    lines.push("New Features:");
    for (const feature of sections.newFeatures) {
      lines.push(`  * ${feature}`);
    }
    lines.push("");
  }

  if (sections.improvements.length > 0) {
    lines.push("Improvements:");
    for (const improvement of sections.improvements) {
      lines.push(`  * ${improvement}`);
    }
    lines.push("");
  }

  if (sections.fixes.length > 0) {
    lines.push("Bug Fixes:");
    for (const fix of sections.fixes) {
      lines.push(`  * ${fix}`);
    }
    lines.push("");
  }

  if (sections.migration) {
    lines.push("Migration Notes:");
    lines.push(sections.migration);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildReleaseNotes(args: {
  workspacePath: string;
  tasks: TaskEntity[];
  commandArgs: Record<string, unknown>;
  phaseKey: string | null;
  planningGeneration: number;
  createdAt?: string;
}): GenerateReleaseNotesSuccess | GenerateReleaseNotesFailure {
  const packageMeta = readPackageMetadata(args.workspacePath);
  const phaseKey = nonEmptyString(args.commandArgs.phaseKey)
    ? args.commandArgs.phaseKey.trim()
    : args.phaseKey;

  if (!phaseKey) {
    return {
      ok: false,
      code: "generate-release-notes-invalid-phase",
      message: "Phase key is required. Provide phaseKey in args or ensure workspace has a canonical phase.",
      details: { providedPhaseKey: args.commandArgs.phaseKey }
    };
  }

  const releaseVersion = nonEmptyString(args.commandArgs.releaseVersion)
    ? args.commandArgs.releaseVersion.trim()
    : packageMeta.version ?? "0.0.0";

  const releaseName = nonEmptyString(args.commandArgs.releaseName)
    ? args.commandArgs.releaseName.trim()
    : null;

  const format: OutputFormat = nonEmptyString(args.commandArgs.format)
    ? (args.commandArgs.format.trim().toLowerCase() as OutputFormat)
    : "markdown";

  const includeBreaking = args.commandArgs.includeBreakingChanges !== false;
  const includeMigration = args.commandArgs.includeMigration !== false;
  const maxFeatures =
    typeof args.commandArgs.maxFeatures === "number" && args.commandArgs.maxFeatures > 0
      ? args.commandArgs.maxFeatures
      : DEFAULT_MAX_FEATURES;
  const explicitTaskIds = Array.isArray(args.commandArgs.taskIds)
    ? args.commandArgs.taskIds.filter(nonEmptyString)
    : null;
  let eligibleTasks: TaskEntity[];
  if (explicitTaskIds && explicitTaskIds.length > 0) {
    const idSet = new Set(explicitTaskIds);
    eligibleTasks = args.tasks.filter(
      (task) => idSet.has(task.id) && task.status === "completed" && !task.archived
    );
  } else {
    eligibleTasks = args.tasks.filter((task) => {
      if (task.archived || task.status !== "completed") return false;
      return inferTaskPhaseKey(task) === phaseKey;
    });
  }

  if (eligibleTasks.length === 0) {
    return {
      ok: false,
      code: "generate-release-notes-no-tasks",
      message: `No completed tasks found for phase '${phaseKey}'.`,
      details: { phaseKey, totalTasks: args.tasks.length }
    };
  }
  const classifiedTasks = eligibleTasks.map(classifyTask);
  const sections = buildSections(classifiedTasks, releaseName, includeBreaking, includeMigration, maxFeatures);
  let markdown: string;
  switch (format) {
    case "github":
      markdown = formatGitHub(sections, releaseVersion, releaseName);
      break;
    case "plain":
      markdown = formatPlain(sections, releaseVersion, releaseName);
      break;
    default:
      markdown = formatMarkdown(sections, releaseVersion, releaseName);
  }

  return {
    ok: true,
    data: {
      schemaVersion: GENERATE_RELEASE_NOTES_SCHEMA_VERSION,
      releaseVersion,
      releaseName,
      phaseKey,
      generatedAt: args.createdAt ?? new Date().toISOString(),
      markdown,
      sections,
      sourceTaskCount: classifiedTasks.length,
      sourceTasks: classifiedTasks.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        changeKind: t.changeKind
      }))
    }
  };
}
