import { readPackageMetadata } from "./release-evidence-manifest.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";
import {
  buildFeatureGroups,
  classifyReleaseNoteTask,
  collectPublicSectionItems,
  generateBenefitOverview,
  generateHeadline,
  generateHighlights,
  loadFeatureTaxonomyForReleaseNotes,
  type ClassifiedReleaseNoteTask,
  type ReleaseNoteFeatureGroup
} from "../documentation/release-notes.js";

export const GENERATE_RELEASE_NOTES_SCHEMA_VERSION = 2 as const;
export const DEFAULT_MAX_FEATURES = 20;
export const DEFAULT_MAX_HIGHLIGHTS = 5;

type ChangeKind = "breaking" | "feature" | "improvement" | "fix" | "chore" | "unknown";

type OutputFormat = "markdown" | "github" | "plain";

type ReleaseNotesSection = {
  headline: string;
  overview: string;
  highlights: string[];
  newFeatures: string[];
  improvements: string[];
  fixes: string[];
  breakingChanges: string[];
  migration: string | null;
  featureGroups: ReleaseNoteFeatureGroup[];
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
    sourceTasks: Array<{ taskId: string; title: string; changeKind: ChangeKind; includedInPublicSections: boolean }>;
  };
};

type GenerateReleaseNotesFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildSections(
  tasks: ClassifiedReleaseNoteTask[],
  releaseName: string | null,
  includeBreaking: boolean,
  includeMigration: boolean,
  maxFeatures: number
): ReleaseNotesSection {
  const headline = generateHeadline(tasks, releaseName);
  const overview = generateBenefitOverview(tasks, releaseName);
  const highlights = generateHighlights(tasks, DEFAULT_MAX_HIGHLIGHTS);
  const featureGroups = buildFeatureGroups(tasks);

  const newFeatures = collectPublicSectionItems(tasks, "feature", maxFeatures);
  const improvements = collectPublicSectionItems(tasks, "improvement", maxFeatures);
  const fixes = collectPublicSectionItems(tasks, "fix", maxFeatures);
  const breakingChanges = includeBreaking
    ? tasks
        .filter((task) => task.includeInPublicSections && task.isBreaking)
        .map((task) => task.userFacingDescription)
        .slice(0, maxFeatures)
    : [];

  const migrationNotes = tasks.map((task) => task.migrationNote).filter(nonEmptyString);
  const migration = includeMigration && migrationNotes.length > 0 ? migrationNotes.join("\n\n") : null;

  return {
    headline,
    overview,
    highlights,
    newFeatures,
    improvements,
    fixes,
    breakingChanges,
    migration,
    featureGroups
  };
}

function appendFeatureGroups(lines: string[], featureGroups: ReleaseNoteFeatureGroup[], headingLevel: "###" | "####"): string[] {
  if (featureGroups.length <= 1) {
    return lines;
  }
  for (const group of featureGroups) {
    lines.push(`${headingLevel} ${group.label}`);
    lines.push("");
    for (const item of group.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  return lines;
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

  const groupedFeatures = sections.featureGroups.filter((group) =>
    group.items.some((item) => sections.newFeatures.includes(item))
  );
  if (sections.newFeatures.length > 0) {
    lines.push("## New Features");
    lines.push("");
    if (groupedFeatures.length > 1) {
      appendFeatureGroups(lines, groupedFeatures, "###");
    } else {
      for (const feature of sections.newFeatures) {
        lines.push(`- ${feature}`);
      }
      lines.push("");
    }
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

  lines.push("---");
  lines.push("");
  lines.push(
    "_For command names, schema changes, and maintainer-level detail, see `docs/maintainers/CHANGELOG.md`._"
  );

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

  const groupedFeatures = sections.featureGroups.filter((group) =>
    group.items.some((item) => sections.newFeatures.includes(item))
  );
  if (sections.newFeatures.length > 0) {
    lines.push("### 🚀 New Features");
    lines.push("");
    if (groupedFeatures.length > 1) {
      appendFeatureGroups(lines, groupedFeatures, "####");
    } else {
      for (const feature of sections.newFeatures) {
        lines.push(`- ${feature}`);
      }
      lines.push("");
    }
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

  lines.push("---");
  lines.push("");
  lines.push(
    "_Technical changelog: [`docs/maintainers/CHANGELOG.md`](docs/maintainers/CHANGELOG.md)_"
  );

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

  const taxonomy = loadFeatureTaxonomyForReleaseNotes(args.workspacePath);
  const classifiedTasks = eligibleTasks.map((task) => classifyReleaseNoteTask(task, taxonomy));
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
        changeKind: t.changeKind,
        includedInPublicSections: t.includeInPublicSections
      }))
    }
  };
}
