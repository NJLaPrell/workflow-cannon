/**
 * Workspace-owned CAE artifact conventions for dashboard authoring.
 *
 * Runtime CAE defaults keep their existing `cae.*` ids and refs. User-authored
 * artifacts use `workspace.*` ids and markdown files under `.ai/cae/artifacts/`.
 */

const ARTIFACT_ID_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const WORKSPACE_ARTIFACT_ID_RE = /^workspace\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const WORKSPACE_ARTIFACT_SLUG_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const CAE_DEFAULT_ARTIFACT_ID_PREFIX = "cae.";
export const CAE_WORKSPACE_ARTIFACT_ID_PREFIX = "workspace.";
export const CAE_WORKSPACE_ARTIFACT_ROOT = ".ai/cae/artifacts";

/** Retired workspace markdown files archived under the artifacts tree (not loaded as active Guidance). */
export const CAE_WORKSPACE_ARTIFACT_ARCHIVE_ROOT = `${CAE_WORKSPACE_ARTIFACT_ROOT}/_archive`;

export const CAE_WORKSPACE_ARTIFACT_TYPES = [
  "playbook",
  "runbook",
  "checklist",
  "review-template",
  "reasoning-template",
  "policy-doc"
] as const;

export type CaeWorkspaceArtifactType = (typeof CAE_WORKSPACE_ARTIFACT_TYPES)[number];

export const CAE_WORKSPACE_ARTIFACT_DIRECTORIES: Record<CaeWorkspaceArtifactType, string> = {
  playbook: "playbooks",
  runbook: "runbooks",
  checklist: "checklists",
  "review-template": "review-templates",
  "reasoning-template": "reasoning-templates",
  "policy-doc": "policy-docs"
};

export type CaeArtifactIdNamespace = "default" | "workspace" | "other" | "invalid";

export type CaeConventionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

export type CaeWorkspaceArtifactPath = {
  artifactType: CaeWorkspaceArtifactType;
  directory: string;
  slug: string;
  path: string;
};

export function isCaeWorkspaceArtifactType(value: unknown): value is CaeWorkspaceArtifactType {
  return typeof value === "string" && CAE_WORKSPACE_ARTIFACT_TYPES.includes(value as CaeWorkspaceArtifactType);
}

export function getCaeWorkspaceArtifactDirectory(artifactType: string): string | null {
  if (!isCaeWorkspaceArtifactType(artifactType)) return null;
  return `${CAE_WORKSPACE_ARTIFACT_ROOT}/${CAE_WORKSPACE_ARTIFACT_DIRECTORIES[artifactType]}`;
}

export function validateCaeWorkspaceArtifactSlug(slug: string): CaeConventionResult<string> {
  const normalized = slug.trim();
  if (!normalized) {
    return { ok: false, code: "cae-workspace-artifact-slug-empty", message: "Workspace artifact slug is required" };
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    return {
      ok: false,
      code: "cae-workspace-artifact-slug-path-separator",
      message: "Workspace artifact slug must be a file stem, not a path"
    };
  }
  if (normalized === "." || normalized === ".." || normalized.includes("..")) {
    return {
      ok: false,
      code: "cae-workspace-artifact-slug-traversal",
      message: "Workspace artifact slug must not contain traversal segments"
    };
  }
  if (!WORKSPACE_ARTIFACT_SLUG_RE.test(normalized)) {
    return {
      ok: false,
      code: "cae-workspace-artifact-slug-invalid",
      message: "Workspace artifact slug must use lowercase letters, digits, dot, underscore, or hyphen separators"
    };
  }
  return { ok: true, value: normalized };
}

export function validateCaeWorkspaceArtifactId(artifactId: string): CaeConventionResult<string> {
  const normalized = artifactId.trim();
  if (!normalized) {
    return { ok: false, code: "cae-workspace-artifact-id-empty", message: "Workspace artifact id is required" };
  }
  if (!WORKSPACE_ARTIFACT_ID_RE.test(normalized)) {
    return {
      ok: false,
      code: "cae-workspace-artifact-id-invalid",
      message: "Workspace artifact ids must start with 'workspace.' and follow the CAE registry id pattern"
    };
  }
  return { ok: true, value: normalized };
}

export function classifyCaeRegistryIdNamespace(id: string): CaeArtifactIdNamespace {
  const normalized = id.trim();
  if (!ARTIFACT_ID_RE.test(normalized)) return "invalid";
  if (normalized.startsWith(CAE_DEFAULT_ARTIFACT_ID_PREFIX)) return "default";
  if (normalized.startsWith(CAE_WORKSPACE_ARTIFACT_ID_PREFIX) && WORKSPACE_ARTIFACT_ID_RE.test(normalized)) {
    return "workspace";
  }
  return "other";
}

export function classifyCaeArtifactIdNamespace(artifactId: string): CaeArtifactIdNamespace {
  return classifyCaeRegistryIdNamespace(artifactId);
}

/** Relative path for an archived copy of a workspace artifact markdown file (under `_archive/<typeDir>/`). */
export function buildCaeWorkspaceArtifactArchiveRelativePath(
  artifactType: string,
  slug: string
): CaeConventionResult<string> {
  if (!isCaeWorkspaceArtifactType(artifactType)) {
    return {
      ok: false,
      code: "cae-workspace-artifact-type-invalid",
      message: `Unsupported CAE workspace artifact type: ${artifactType}`
    };
  }
  const validSlug = validateCaeWorkspaceArtifactSlug(slug);
  if (!validSlug.ok) return validSlug;
  const sub = CAE_WORKSPACE_ARTIFACT_DIRECTORIES[artifactType];
  return {
    ok: true,
    value: `${CAE_WORKSPACE_ARTIFACT_ARCHIVE_ROOT}/${sub}/${validSlug.value}.md`
  };
}

/** Tombstone markdown path for a hard-deleted retired workspace artifact (audit-friendly stub file). */
export function buildCaeWorkspaceArtifactHardDeleteTombstoneRelativePath(artifactId: string): string {
  const normalized = artifactId.trim().replace(/[^a-z0-9._-]+/gi, "_");
  return `${CAE_WORKSPACE_ARTIFACT_ARCHIVE_ROOT}/_tombstones/${normalized}.md`;
}

export function buildCaeWorkspaceArtifactPath(
  artifactType: string,
  slug: string
): CaeConventionResult<CaeWorkspaceArtifactPath> {
  if (!isCaeWorkspaceArtifactType(artifactType)) {
    return {
      ok: false,
      code: "cae-workspace-artifact-type-invalid",
      message: `Unsupported CAE workspace artifact type: ${artifactType}`
    };
  }
  const validSlug = validateCaeWorkspaceArtifactSlug(slug);
  if (!validSlug.ok) return validSlug;
  const directory = `${CAE_WORKSPACE_ARTIFACT_ROOT}/${CAE_WORKSPACE_ARTIFACT_DIRECTORIES[artifactType]}`;
  return {
    ok: true,
    value: {
      artifactType,
      directory,
      slug: validSlug.value,
      path: `${directory}/${validSlug.value}.md`
    }
  };
}