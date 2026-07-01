import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readAndValidateFeatureTaxonomyData,
  type FeatureTaxonomyData
} from "./data-schema-validate.js";

export const RELEASE_NOTES_STYLE_SCHEMA_VERSION = 1 as const;

export type ReleaseNotesStyle = {
  schemaVersion: number;
  audience: string;
  sourcePriority: string[];
  excludeChangeKinds: string[];
  includeWhenMetadata: string[];
  internalKeywords: string[];
  stripPatterns: string[];
  leadingVerbReplacements: Array<{ pattern: string; replacement: string }>;
  phraseCleanup: Array<{ pattern: string; replacement: string }>;
  technicalDensityThreshold: number;
  minPublicDescriptionLength: number;
  maxDescriptionLength: number;
};

export type ReleaseNoteTaskInput = {
  id: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  type?: string | null;
  acceptanceCriteria?: string[];
  features?: string[];
  metadata?: Record<string, unknown> | null;
};

export type ReleaseNoteChangeKind = "breaking" | "feature" | "improvement" | "fix" | "chore" | "unknown";

export type ClassifiedReleaseNoteTask = {
  taskId: string;
  title: string;
  changeKind: ReleaseNoteChangeKind;
  userFacingDescription: string;
  featureSlug: string | null;
  featureLabel: string | null;
  isBreaking: boolean;
  migrationNote: string | null;
  includeInPublicSections: boolean;
  explicitUserFacing: boolean;
};

export type ReleaseNoteFeatureGroup = {
  slug: string;
  label: string;
  items: string[];
};

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveStylePath(): string {
  const nextToDist = join(moduleDir, "data", "release-notes-style.json");
  if (existsSync(nextToDist)) {
    return nextToDist;
  }
  return join(moduleDir, "..", "..", "..", "src", "modules", "documentation", "data", "release-notes-style.json");
}

let cachedStyle: ReleaseNotesStyle | null = null;
let cachedStripPatterns: RegExp[] | null = null;
let cachedLeadingPatterns: Array<{ pattern: RegExp; replacement: string }> | null = null;
let cachedPhrasePatterns: Array<{ pattern: RegExp; replacement: string }> | null = null;

export function loadReleaseNotesStyle(): ReleaseNotesStyle {
  if (cachedStyle) {
    return cachedStyle;
  }
  const parsed = JSON.parse(readFileSync(resolveStylePath(), "utf8")) as ReleaseNotesStyle;
  cachedStyle = parsed;
  return parsed;
}

function getStripPatterns(style: ReleaseNotesStyle): RegExp[] {
  if (!cachedStripPatterns) {
    cachedStripPatterns = style.stripPatterns.map((pattern) => new RegExp(pattern, "gi"));
  }
  return cachedStripPatterns;
}

function getLeadingPatterns(style: ReleaseNotesStyle): Array<{ pattern: RegExp; replacement: string }> {
  if (!cachedLeadingPatterns) {
    cachedLeadingPatterns = style.leadingVerbReplacements.map((entry) => ({
      pattern: new RegExp(entry.pattern, "i"),
      replacement: entry.replacement
    }));
  }
  return cachedLeadingPatterns;
}

function getPhrasePatterns(style: ReleaseNotesStyle): Array<{ pattern: RegExp; replacement: string }> {
  if (!cachedPhrasePatterns) {
    cachedPhrasePatterns = style.phraseCleanup.map((entry) => ({
      pattern: new RegExp(entry.pattern, "gi"),
      replacement: entry.replacement
    }));
  }
  return cachedPhrasePatterns;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readMetadataString(task: ReleaseNoteTaskInput, key: string): string | null {
  const meta = task.metadata;
  if (!isRecord(meta)) {
    return null;
  }
  const value = meta[key];
  return nonEmptyString(value) ? value.trim() : null;
}

function hasIncludeOverride(task: ReleaseNoteTaskInput, style: ReleaseNotesStyle): boolean {
  const meta = task.metadata;
  if (!isRecord(meta)) {
    return false;
  }
  if (meta.includeInReleaseNotes === true) {
    return true;
  }
  return style.includeWhenMetadata.some((key) => nonEmptyString(meta[key]));
}

export function extractChangeKind(task: ReleaseNoteTaskInput): ReleaseNoteChangeKind {
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
  if (taskType === "execution") return "improvement";
  return "unknown";
}

export function isBreakingChange(task: ReleaseNoteTaskInput): boolean {
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

export function extractMigrationNote(task: ReleaseNoteTaskInput): string | null {
  const meta = task.metadata;
  if (isRecord(meta)) {
    if (nonEmptyString(meta.migrationNote)) return humanizeMigrationNote(meta.migrationNote.trim());
    if (nonEmptyString(meta.migration)) return humanizeMigrationNote(meta.migration.trim());
  }
  return null;
}

function humanizeMigrationNote(note: string): string {
  const style = loadReleaseNotesStyle();
  let cleaned = note;
  for (const pattern of getStripPatterns(style)) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function stripTitlePrefixes(title: string): string {
  return title.replace(/^(T\d+[-:\s]*|Phase\s*\d+[-:\s]*)/i, "").trim();
}

function applyPatternReplacements(text: string, style: ReleaseNotesStyle): string {
  let cleaned = text;
  for (const pattern of getStripPatterns(style)) {
    cleaned = cleaned.replace(pattern, " ");
  }
  for (const entry of getPhrasePatterns(style)) {
    cleaned = cleaned.replace(entry.pattern, entry.replacement);
  }
  for (const entry of getLeadingPatterns(style)) {
    cleaned = cleaned.replace(entry.pattern, entry.replacement);
  }
  cleaned = cleaned.replace(/\s+([,.;:!?])/g, "$1");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function technicalDensity(text: string, style: ReleaseNotesStyle): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 0;
  }
  const internal = new Set(style.internalKeywords.map((word) => word.toLowerCase()));
  let hits = 0;
  for (const word of words) {
    if (internal.has(word)) {
      hits += 1;
      continue;
    }
    for (const keyword of internal) {
      if (keyword.includes(" ") && text.toLowerCase().includes(keyword)) {
        hits += 1;
        break;
      }
    }
  }
  return hits / words.length;
}

function looksTechnical(text: string, style: ReleaseNotesStyle): boolean {
  if (/[`/\\]|(?:src|docs|\.ai)\/|workspace-kit|schema v\d|sqlite/i.test(text)) {
    return true;
  }
  if (/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/.test(text)) {
    return true;
  }
  if (/\b(?:refactor|implement|wire|integrate|migrate|runtime|module|command|schema)\b/i.test(text)) {
    return true;
  }
  return technicalDensity(text, style) >= style.technicalDensityThreshold;
}

function pickAcceptanceCriterion(task: ReleaseNoteTaskInput, style: ReleaseNotesStyle): string | null {
  for (const criterion of task.acceptanceCriteria ?? []) {
    if (!nonEmptyString(criterion)) {
      continue;
    }
    const cleaned = applyPatternReplacements(normalizeWhitespace(criterion), style);
    if (cleaned.length >= style.minPublicDescriptionLength && !looksTechnical(cleaned, style)) {
      return sentenceCase(cleaned);
    }
  }
  return null;
}

function fallbackFromFeatureLabel(
  task: ReleaseNoteTaskInput,
  taxonomy: FeatureTaxonomyData | null,
  changeKind: ReleaseNoteChangeKind
): string | null {
  const slug = task.features?.find(nonEmptyString) ?? null;
  if (!slug || !taxonomy) {
    return null;
  }
  const feature = taxonomy.features.find((entry) => entry.slug === slug);
  if (!feature) {
    return null;
  }
  if (changeKind === "fix") {
    return `Fixes in ${feature.name.toLowerCase()}`;
  }
  if (changeKind === "improvement") {
    return `Improvements to ${feature.name.toLowerCase()}`;
  }
  return `Updates to ${feature.name.toLowerCase()}`;
}

export function resolveUserFacingDescription(
  task: ReleaseNoteTaskInput,
  changeKind: ReleaseNoteChangeKind,
  taxonomy: FeatureTaxonomyData | null
): { description: string; explicitUserFacing: boolean } {
  const style = loadReleaseNotesStyle();
  const explicit =
    readMetadataString(task, "releaseNoteSummary") ?? readMetadataString(task, "userFacingSummary");

  if (explicit) {
    const cleaned = sentenceCase(applyPatternReplacements(normalizeWhitespace(explicit), style));
    return {
      description: cleaned.slice(0, style.maxDescriptionLength),
      explicitUserFacing: true
    };
  }

  const fromCriteria = pickAcceptanceCriterion(task, style);
  if (fromCriteria) {
    return {
      description: fromCriteria.slice(0, style.maxDescriptionLength),
      explicitUserFacing: false
    };
  }

  const rawSummary = nonEmptyString(task.summary) ? task.summary : "";
  const rawTitle = nonEmptyString(task.title) ? stripTitlePrefixes(task.title) : "";
  const cleanedSummary = rawSummary
    ? sentenceCase(applyPatternReplacements(normalizeWhitespace(rawSummary), style))
    : "";
  const cleanedTitle = rawTitle
    ? sentenceCase(applyPatternReplacements(normalizeWhitespace(rawTitle), style))
    : "";

  let cleaned = "";
  if (cleanedSummary && !looksTechnical(cleanedSummary, style)) {
    cleaned = cleanedSummary;
  } else if (cleanedTitle && !looksTechnical(cleanedTitle, style)) {
    cleaned = cleanedTitle;
  } else if (cleanedSummary) {
    cleaned = cleanedSummary;
  } else {
    cleaned = cleanedTitle;
  }

  if (cleaned.length < style.minPublicDescriptionLength || looksTechnical(cleaned, style)) {
    const fallback = fallbackFromFeatureLabel(task, taxonomy, changeKind);
    if (fallback) {
      cleaned = fallback;
    }
  }

  if (!cleaned) {
    cleaned = "General improvements and updates";
  }

  return {
    description: cleaned.slice(0, style.maxDescriptionLength),
    explicitUserFacing: false
  };
}

export function shouldIncludeInPublicSections(
  task: ReleaseNoteTaskInput,
  changeKind: ReleaseNoteChangeKind,
  explicitUserFacing: boolean,
  description: string
): boolean {
  const style = loadReleaseNotesStyle();
  if (hasIncludeOverride(task, style)) {
    return true;
  }
  if (explicitUserFacing) {
    return true;
  }
  if (style.excludeChangeKinds.includes(changeKind)) {
    return false;
  }
  if (changeKind === "unknown" && looksTechnical(description, style)) {
    return false;
  }
  if (looksTechnical(description, style) && changeKind !== "breaking") {
    return false;
  }
  return description.trim().length >= style.minPublicDescriptionLength;
}

function resolveFeatureLabel(
  slug: string | null,
  taxonomy: FeatureTaxonomyData | null
): { slug: string | null; label: string | null } {
  if (!slug || !taxonomy) {
    return { slug: null, label: null };
  }
  const feature = taxonomy.features.find((entry) => entry.slug === slug);
  if (!feature) {
    return { slug, label: sentenceCase(slug.replace(/-/g, " ")) };
  }
  return { slug, label: feature.name };
}

export function classifyReleaseNoteTask(
  task: ReleaseNoteTaskInput,
  taxonomy: FeatureTaxonomyData | null
): ClassifiedReleaseNoteTask {
  const changeKind = extractChangeKind(task);
  const { description, explicitUserFacing } = resolveUserFacingDescription(task, changeKind, taxonomy);
  const primarySlug = task.features?.find(nonEmptyString) ?? null;
  const feature = resolveFeatureLabel(primarySlug, taxonomy);
  const includeInPublicSections = shouldIncludeInPublicSections(
    task,
    changeKind,
    explicitUserFacing,
    description
  );

  return {
    taskId: task.id,
    title: task.title,
    changeKind,
    userFacingDescription: description,
    featureSlug: feature.slug,
    featureLabel: feature.label,
    isBreaking: isBreakingChange(task),
    migrationNote: extractMigrationNote(task),
    includeInPublicSections,
    explicitUserFacing
  };
}

export function dedupeBullets(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function buildFeatureGroups(tasks: ClassifiedReleaseNoteTask[]): ReleaseNoteFeatureGroup[] {
  const grouped = new Map<string, ReleaseNoteFeatureGroup>();
  for (const task of tasks) {
    if (!task.includeInPublicSections || task.changeKind === "fix" || task.isBreaking) {
      continue;
    }
    const slug = task.featureSlug ?? "general";
    const label = task.featureLabel ?? "General";
    const existing = grouped.get(slug) ?? { slug, label, items: [] };
    existing.items.push(task.userFacingDescription);
    grouped.set(slug, existing);
  }

  return [...grouped.values()]
    .map((group) => ({ ...group, items: dedupeBullets(group.items) }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function loadFeatureTaxonomyForReleaseNotes(
  workspacePath: string
): FeatureTaxonomyData | null {
  const result = readAndValidateFeatureTaxonomyData(workspacePath, "feature-taxonomy.json");
  return result.ok ? result.data : null;
}

export function generateBenefitOverview(
  tasks: ClassifiedReleaseNoteTask[],
  releaseName: string | null
): string {
  const publicTasks = tasks.filter((task) => task.includeInPublicSections);
  const featureCount = publicTasks.filter((task) => task.changeKind === "feature" && !task.isBreaking).length;
  const fixCount = publicTasks.filter((task) => task.changeKind === "fix").length;
  const improvementCount = publicTasks.filter((task) => task.changeKind === "improvement" && !task.isBreaking).length;
  const breakingCount = publicTasks.filter((task) => task.isBreaking).length;
  const groups = buildFeatureGroups(publicTasks);
  const parts: string[] = [];

  if (releaseName) {
    parts.push(`This release delivers **${releaseName}**.`);
  } else if (groups.length === 1) {
    parts.push(`This release focuses on **${groups[0].label}**.`);
  } else if (groups.length > 1) {
    const labels = groups.slice(0, 3).map((group) => group.label);
    parts.push(`This release improves ${labels.join(", ")}${groups.length > 3 ? ", and more" : ""}.`);
  } else if (featureCount > 0) {
    parts.push("This release adds new capabilities and quality-of-life improvements.");
  } else if (fixCount > 0) {
    parts.push("This release focuses on reliability and bug fixes.");
  } else {
    parts.push("This release includes updates and improvements.");
  }

  if (breakingCount > 0) {
    parts.push(`**Heads up:** Review the breaking changes and migration notes before upgrading.`);
  } else {
    const summaryParts: string[] = [];
    if (featureCount > 0) {
      summaryParts.push(`${featureCount} new ${featureCount === 1 ? "capability" : "capabilities"}`);
    }
    if (improvementCount > 0) {
      summaryParts.push(`${improvementCount} ${improvementCount === 1 ? "improvement" : "improvements"}`);
    }
    if (fixCount > 0) {
      summaryParts.push(`${fixCount} bug ${fixCount === 1 ? "fix" : "fixes"}`);
    }
    if (summaryParts.length > 0) {
      parts.push(`Includes ${summaryParts.join(", ")}.`);
    }
  }

  return parts.join(" ");
}

export function generateHeadline(
  tasks: ClassifiedReleaseNoteTask[],
  releaseName: string | null
): string {
  if (releaseName) {
    return releaseName;
  }
  const publicTasks = tasks.filter((task) => task.includeInPublicSections);
  const featureCount = publicTasks.filter((task) => task.changeKind === "feature").length;
  const fixCount = publicTasks.filter((task) => task.changeKind === "fix").length;
  const breakingCount = publicTasks.filter((task) => task.isBreaking).length;
  const groups = buildFeatureGroups(publicTasks);

  if (breakingCount > 0) {
    return "Important upgrade with breaking changes";
  }
  if (groups.length === 1 && featureCount > 0) {
    return `${groups[0].label} updates`;
  }
  if (featureCount >= 3) {
    return "Feature-packed release";
  }
  if (featureCount > 0 && fixCount > 0) {
    return "New features and fixes";
  }
  if (fixCount >= 3) {
    return "Stability and bug fixes";
  }
  if (featureCount > 0) {
    return "New capabilities";
  }
  return "Quality and reliability updates";
}

export function generateHighlights(
  tasks: ClassifiedReleaseNoteTask[],
  maxHighlights: number
): string[] {
  const publicTasks = tasks.filter((task) => task.includeInPublicSections);
  const highlights: string[] = [];

  for (const task of publicTasks.filter((entry) => entry.isBreaking).slice(0, 2)) {
    highlights.push(`**Breaking:** ${task.userFacingDescription}`);
  }

  const prioritized = [
    ...publicTasks.filter((entry) => entry.explicitUserFacing),
    ...publicTasks.filter((entry) => entry.changeKind === "feature" && !entry.isBreaking),
    ...publicTasks.filter((entry) => entry.changeKind === "improvement" && !entry.isBreaking),
    ...publicTasks.filter((entry) => entry.changeKind === "fix")
  ];

  for (const task of prioritized) {
    if (highlights.length >= maxHighlights) {
      break;
    }
    if (highlights.some((item) => item.includes(task.userFacingDescription))) {
      continue;
    }
    highlights.push(task.userFacingDescription);
  }

  return dedupeBullets(highlights).slice(0, maxHighlights);
}

export function collectPublicSectionItems(
  tasks: ClassifiedReleaseNoteTask[],
  kind: ReleaseNoteChangeKind,
  maxItems: number,
  options?: { includeBreaking?: boolean }
): string[] {
  const includeBreaking = options?.includeBreaking ?? false;
  const items = tasks
    .filter((task) => {
      if (!task.includeInPublicSections) {
        return false;
      }
      if (task.changeKind !== kind) {
        return false;
      }
      if (task.isBreaking && !includeBreaking) {
        return false;
      }
      return true;
    })
    .map((task) => task.userFacingDescription);

  return dedupeBullets(items).slice(0, maxItems);
}
