import type { DashboardFeatureDetail, DashboardTaskRow } from "../../contracts/dashboard-summary-run.js";
import type { FeatureEnrichment } from "./persistence/feature-registry-queries.js";
import type { TaskEntity } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringList(values: unknown): string[] {
  if (typeof values === "string") {
    const trimmed = values.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(values)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      out.push(trimmed);
    }
  }
  return Array.from(new Set(out));
}

export function featureDetailsForTask(
  slugs: string[] | undefined,
  enrich: Map<string, FeatureEnrichment>
): DashboardFeatureDetail[] | null {
  if (!slugs?.length) {
    return null;
  }
  const out: DashboardFeatureDetail[] = [];
  for (const slug of slugs) {
    const row = enrich.get(slug);
    if (row) {
      out.push({
        slug: row.slug,
        name: row.name,
        componentId: row.componentId,
        componentDisplayName: row.componentDisplayName
      });
    }
  }
  return out.length > 0 ? out : null;
}

export function readTaskSeverity(task: TaskEntity): string | null {
  if (!isRecord(task.metadata)) {
    return null;
  }
  const severity = task.metadata.severity;
  return typeof severity === "string" && severity.trim().length > 0 ? severity.trim() : null;
}

export function readTaskComponents(
  task: TaskEntity,
  featureDetails?: DashboardFeatureDetail[] | null
): string[] {
  if (isRecord(task.metadata)) {
    const explicit = normalizeStringList(task.metadata.components);
    if (explicit.length > 0) {
      return explicit;
    }
  }
  if (!featureDetails?.length) {
    return [];
  }
  return Array.from(
    new Set(
      featureDetails
        .map((detail) => detail.componentDisplayName || detail.componentId)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );
}

export type TaskReadProjection = TaskEntity & {
  severity: string | null;
  components: string[];
};

export function projectTaskReadEntity(
  task: TaskEntity,
  enrich: Map<string, FeatureEnrichment>
): TaskReadProjection {
  const featureDetails = featureDetailsForTask(task.features, enrich);
  return {
    ...task,
    severity: readTaskSeverity(task),
    components: readTaskComponents(task, featureDetails)
  };
}

export function projectDashboardTaskRow(
  task: TaskEntity,
  enrich: Map<string, FeatureEnrichment>,
  options?: { includePriority?: boolean }
): DashboardTaskRow {
  const featureDetails = featureDetailsForTask(task.features, enrich);
  const row: DashboardTaskRow = {
    id: task.id,
    title: task.title,
    phase: task.phase ?? null,
    severity: readTaskSeverity(task),
    components: readTaskComponents(task, featureDetails),
    features: task.features?.length ? task.features : null,
    featureDetails
  };
  if (options?.includePriority !== false) {
    row.priority = task.priority ?? null;
  }
  return row;
}