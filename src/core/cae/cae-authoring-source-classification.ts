import fs from "node:fs";
import path from "node:path";

import type { CaeRegistryActivationDbRow, CaeRegistryArtifactDbRow } from "./persistence/cae-kit-sqlite.js";
import { CAE_WORKSPACE_ARTIFACT_ROOT, classifyCaeRegistryIdNamespace } from "./workspace-artifact-conventions.js";

export type CaeAuthoringArtifactSource = "default" | "workspace" | "override";
export type CaeAuthoringLifecycleStatus = "active" | "hidden" | "retired";
export type CaeAuthoringArtifactStatus =
  | "active"
  | "hidden"
  | "retired"
  | "missing-file"
  | "external-allowed";
export type CaeAuthoringActivationStatus = "active" | "draft" | "disabled" | "hidden" | "retired";
export type CaeAuthoringFileOwnershipStatus =
  | "workspace-owned"
  | "default-owned"
  | "external-allowed"
  | "missing-file";

export type CaeAuthoringOverlayState = {
  hidden?: boolean;
  overrideOfId?: string | null;
};

export type CaeAuthoringArtifactRefSummary = {
  artifactId: string;
  source: CaeAuthoringArtifactSource | null;
  status: CaeAuthoringArtifactStatus | "missing-artifact-row";
  fileOwnershipStatus: CaeAuthoringFileOwnershipStatus | null;
};

export type CaeAuthoringArtifactSummary = {
  schemaVersion: 1;
  activeVersionId: string | null;
  registryDigest: string;
  artifactId: string;
  artifactType: string;
  title: string | null;
  path: string;
  source: CaeAuthoringArtifactSource;
  lifecycleStatus: CaeAuthoringLifecycleStatus;
  status: CaeAuthoringArtifactStatus;
  fileOwnershipStatus: CaeAuthoringFileOwnershipStatus;
  fileExists: boolean;
  overrideOfId: string | null;
};

export type CaeAuthoringActivationSummary = {
  schemaVersion: 1;
  activeVersionId: string | null;
  registryDigest: string;
  activationId: string;
  family: string;
  priority: number;
  scopeJson: string;
  scopeSummary: string;
  lifecycleState: string;
  source: CaeAuthoringArtifactSource;
  lifecycleStatus: CaeAuthoringLifecycleStatus;
  status: CaeAuthoringActivationStatus;
  overrideOfId: string | null;
  acknowledgement: { strength: string; token: string | null } | null;
  artifactRefs: CaeAuthoringArtifactRefSummary[];
  statusWarnings: string[];
};

export type BuildCaeAuthoringClassificationInput = {
  workspaceRoot: string;
  activeVersionId: string | null;
  registryDigest: string;
  artifactRows: CaeRegistryArtifactDbRow[];
  activationRows: CaeRegistryActivationDbRow[];
  artifactOverlayById?: Record<string, CaeAuthoringOverlayState>;
  activationOverlayById?: Record<string, CaeAuthoringOverlayState>;
};

export type CaeAuthoringClassificationSnapshot = {
  schemaVersion: 1;
  activeVersionId: string | null;
  registryDigest: string;
  artifacts: CaeAuthoringArtifactSummary[];
  activations: CaeAuthoringActivationSummary[];
};

function parseMetadata(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferOverrideOfId(metadata: Record<string, unknown>, overlay?: CaeAuthoringOverlayState): string | null {
  const explicit = trimString(overlay?.overrideOfId);
  if (explicit) return explicit;
  const candidates = [
    metadata.overrideOfId,
    metadata.sourceDefaultArtifactId,
    metadata.sourceArtifactId,
    metadata.clonedFromArtifactId,
    metadata.copiedFromArtifactId,
    metadata.baseArtifactId
  ];
  for (const candidate of candidates) {
    const normalized = trimString(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function inferLifecycleStatus(retiredAt: string | null, overlay?: CaeAuthoringOverlayState): CaeAuthoringLifecycleStatus {
  if (overlay?.hidden === true) return "hidden";
  if (typeof retiredAt === "string" && retiredAt.trim().length > 0) return "retired";
  return "active";
}

function isWorkspaceArtifactPath(refPath: string): boolean {
  return refPath === CAE_WORKSPACE_ARTIFACT_ROOT || refPath.startsWith(`${CAE_WORKSPACE_ARTIFACT_ROOT}/`);
}

function resolveArtifactFileState(
  workspaceRoot: string,
  refPath: string,
  source: CaeAuthoringArtifactSource
): { fileExists: boolean; fileOwnershipStatus: CaeAuthoringFileOwnershipStatus } {
  const absolutePath = path.resolve(workspaceRoot, refPath);
  const fileExists = fs.existsSync(absolutePath);
  if (!fileExists) {
    return { fileExists: false, fileOwnershipStatus: "missing-file" };
  }
  if (isWorkspaceArtifactPath(refPath)) {
    return { fileExists: true, fileOwnershipStatus: "workspace-owned" };
  }
  if (source === "default") {
    return { fileExists: true, fileOwnershipStatus: "default-owned" };
  }
  return { fileExists: true, fileOwnershipStatus: "external-allowed" };
}

function deriveArtifactSource(artifactId: string, overrideOfId: string | null): CaeAuthoringArtifactSource {
  if (overrideOfId) return "override";
  const namespace = classifyCaeRegistryIdNamespace(artifactId);
  if (namespace === "workspace") return "workspace";
  return "default";
}

function deriveArtifactStatus(
  lifecycleStatus: CaeAuthoringLifecycleStatus,
  fileOwnershipStatus: CaeAuthoringFileOwnershipStatus,
  fileExists: boolean
): CaeAuthoringArtifactStatus {
  if (lifecycleStatus === "hidden") return "hidden";
  if (lifecycleStatus === "retired") return "retired";
  if (!fileExists) return "missing-file";
  if (fileOwnershipStatus === "external-allowed") return "external-allowed";
  return "active";
}

function parseArtifactRefs(raw: string): Array<{ artifactId: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const refs: Array<{ artifactId: string }> = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const artifactId = trimString((item as Record<string, unknown>).artifactId);
      if (artifactId) refs.push({ artifactId });
    }
    return refs;
  } catch {
    return [];
  }
}

function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function summarizeScope(raw: string): string {
  const scope = parseJsonRecord(raw);
  const conditions = Array.isArray(scope?.conditions) ? scope.conditions : [];
  if (conditions.length === 0) return "Always";
  return conditions
    .map((condition) => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) return "unknown condition";
      const row = condition as Record<string, unknown>;
      const kind = String(row.kind ?? "condition");
      if (kind === "always") return "Always";
      if (kind === "phaseKey") return `Phase ${String(row.value ?? "")}`.trim();
      if (kind === "commandName") return `Command ${String(row.match ?? "is")} ${String(row.value ?? "")}`.trim();
      if (kind === "commandArgEquals") return `Arg ${String(row.path ?? "")} equals ${String(row.value ?? "")}`.trim();
      if (kind === "taskIdPattern") return `Task ID ${String(row.pattern ?? "")}`.trim();
      if (kind === "taskTag") {
        const values = Array.isArray(row.values) ? row.values.map((value) => String(value)).join(", ") : String(row.value ?? "");
        return `Task tag ${String(row.match ?? "has")} ${values}`.trim();
      }
      return `${kind} ${String(row.value ?? "")}`.trim();
    })
    .filter(Boolean)
    .join("; ");
}

function summarizeAcknowledgement(raw: string | null): { strength: string; token: string | null } | null {
  const ack = parseJsonRecord(raw);
  const strength = trimString(ack?.strength);
  if (!strength || strength === "none") return null;
  return { strength, token: trimString(ack?.token) };
}

function deriveActivationSource(activationId: string, overrideOfId: string | null): CaeAuthoringArtifactSource {
  if (overrideOfId) return "override";
  const namespace = classifyCaeRegistryIdNamespace(activationId);
  if (namespace === "workspace") return "workspace";
  return "default";
}

function deriveActivationStatus(
  lifecycleStatus: CaeAuthoringLifecycleStatus,
  lifecycleState: string
): CaeAuthoringActivationStatus {
  if (lifecycleStatus === "hidden") return "hidden";
  if (lifecycleStatus === "retired") return "retired";
  const normalized = lifecycleState.trim().toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "disabled") return "disabled";
  return "active";
}

export function classifyCaeAuthoringArtifactRow(input: {
  workspaceRoot: string;
  activeVersionId: string | null;
  registryDigest: string;
  row: CaeRegistryArtifactDbRow;
  overlay?: CaeAuthoringOverlayState;
}): CaeAuthoringArtifactSummary {
  const metadata = parseMetadata(input.row.metadata_json || "{}");
  const overrideOfId = inferOverrideOfId(metadata, input.overlay);
  const source = deriveArtifactSource(input.row.artifact_id, overrideOfId);
  const lifecycleStatus = inferLifecycleStatus(input.row.retired_at, input.overlay);
  const fileState = resolveArtifactFileState(input.workspaceRoot, input.row.path, source);
  return {
    schemaVersion: 1,
    activeVersionId: input.activeVersionId,
    registryDigest: input.registryDigest,
    artifactId: input.row.artifact_id,
    artifactType: input.row.artifact_type,
    title: input.row.title,
    path: input.row.path,
    source,
    lifecycleStatus,
    status: deriveArtifactStatus(lifecycleStatus, fileState.fileOwnershipStatus, fileState.fileExists),
    fileOwnershipStatus: fileState.fileOwnershipStatus,
    fileExists: fileState.fileExists,
    overrideOfId
  };
}

export function classifyCaeAuthoringActivationRow(input: {
  activeVersionId: string | null;
  registryDigest: string;
  row: CaeRegistryActivationDbRow;
  overlay?: CaeAuthoringOverlayState;
  artifactsById?: ReadonlyMap<string, CaeAuthoringArtifactSummary>;
}): CaeAuthoringActivationSummary {
  const metadata = parseMetadata(input.row.metadata_json || "{}");
  const overrideOfId = inferOverrideOfId(metadata, input.overlay);
  const source = deriveActivationSource(input.row.activation_id, overrideOfId);
  const lifecycleStatus = inferLifecycleStatus(input.row.retired_at, input.overlay);
  const artifactRefs: CaeAuthoringArtifactRefSummary[] = parseArtifactRefs(input.row.artifact_refs_json).map((ref) => {
    const artifact = input.artifactsById?.get(ref.artifactId) ?? null;
    return {
      artifactId: ref.artifactId,
      source: artifact?.source ?? null,
      status: artifact?.status ?? "missing-artifact-row",
      fileOwnershipStatus: artifact?.fileOwnershipStatus ?? null
    };
  });
  const statusWarnings = artifactRefs.flatMap((ref) => {
    if (ref.status === "missing-artifact-row") return [`Missing artifact ${ref.artifactId}`];
    if (ref.status !== "active") return [`Artifact ${ref.artifactId} is ${ref.status}`];
    return [];
  });
  const scopeSummary = summarizeScope(input.row.scope_json);
  if (scopeSummary === "Always" && input.row.family === "policy") {
    statusWarnings.push("Policy applies broadly");
  }
  return {
    schemaVersion: 1,
    activeVersionId: input.activeVersionId,
    registryDigest: input.registryDigest,
    activationId: input.row.activation_id,
    family: input.row.family,
    priority: input.row.priority,
    scopeJson: input.row.scope_json,
    scopeSummary,
    lifecycleState: input.row.lifecycle_state,
    source,
    lifecycleStatus,
    status: deriveActivationStatus(lifecycleStatus, input.row.lifecycle_state),
    overrideOfId,
    acknowledgement: summarizeAcknowledgement(input.row.acknowledgement_json),
    artifactRefs,
    statusWarnings
  };
}

export function buildCaeAuthoringClassificationSnapshot(
  input: BuildCaeAuthoringClassificationInput
): CaeAuthoringClassificationSnapshot {
  const artifacts = [...input.artifactRows]
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id))
    .map((row) =>
      classifyCaeAuthoringArtifactRow({
        workspaceRoot: input.workspaceRoot,
        activeVersionId: input.activeVersionId,
        registryDigest: input.registryDigest,
        row,
        overlay: input.artifactOverlayById?.[row.artifact_id]
      })
    );
  const artifactMap = new Map(artifacts.map((artifact) => [artifact.artifactId, artifact]));
  const activations = [...input.activationRows]
    .sort((left, right) => left.activation_id.localeCompare(right.activation_id))
    .map((row) =>
      classifyCaeAuthoringActivationRow({
        activeVersionId: input.activeVersionId,
        registryDigest: input.registryDigest,
        row,
        overlay: input.activationOverlayById?.[row.activation_id],
        artifactsById: artifactMap
      })
    );
  return {
    schemaVersion: 1,
    activeVersionId: input.activeVersionId,
    registryDigest: input.registryDigest,
    artifacts,
    activations
  };
}
