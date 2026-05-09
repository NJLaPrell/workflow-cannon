import { inferTaskPhaseKey } from "./phase-resolution.js";
import type {
  DeliveryEvidenceModeV2,
  EvaluateDeliveryEvidenceOptions
} from "./delivery-evidence.js";
import type {
  MaintainerDeliveryOverride,
  MaintainerDeliveryPolicyConfig,
  MaintainerDeliveryProfile,
  TaskPolicyEnforcementMode
} from "./policy-config.js";
import {
  DEFAULT_MAINTAINER_DELIVERY_POLICY,
  TASK_POLICY_OVERRIDE_PRECEDENCE
} from "./policy-config.js";
import type { TaskEntity } from "./types.js";
import {
  MAINTAINER_DELIVERY_PROFILE_METADATA_KEY,
  REQUIRES_PHASE_BRANCH_METADATA_KEY
} from "./maintainer-delivery-hints.js";
import { readDeliveryEvidenceEnforcementMode } from "./delivery-evidence.js";

export type MaintainerDeliveryExplainSource =
  | "task-metadata"
  | "module-override"
  | "workspace-default"
  | "built-in-default";

export type MaintainerDeliveryExplainEntry = {
  key: string;
  value: unknown;
  source: MaintainerDeliveryExplainSource;
};

export type MaintainerDeliveryPolicyWarning = {
  code: string;
  message: string;
};

const TOKEN_KEYS = new Set(["taskId", "slug", "phaseKey", "moduleId", "version"]);

export type ResolveMaintainerDeliveryPolicyArgs = {
  effectiveConfig: Record<string, unknown> | undefined;
  /** Loaded task when resolving by id. */
  task?: TaskEntity | null;
  /** When set without task, enough prospective context to expand patterns. */
  taskId?: string | null;
  phaseKey?: string | null;
  moduleId?: string | null;
  slug?: string | null;
  version?: string | null;
};

export type ResolvedMaintainerDeliveryPolicyV1 = {
  schemaVersion: 1;
  profileName: string;
  maintainerDeliveryEnforcementMode: TaskPolicyEnforcementMode;
  deliveryEvidenceEnforcementMode: TaskPolicyEnforcementMode;
  requiresPhaseBranch: boolean;
  phaseBranchPattern: string;
  phaseIntegrationBranch: string | null;
  taskBranchPattern: string;
  taskBranchExample: string | null;
  releaseTagPattern: string | null;
  releaseTagExample: string | null;
  reviewMode: MaintainerDeliveryProfile["review"];
  evidenceMode: MaintainerDeliveryProfile["evidenceKind"];
  prProvider: string;
  mergeStrategy: string;
  phaseToMainMode: string;
  mergeTarget: {
    kind: "phase-integration-branch";
    pattern: string;
    branch: string | null;
  };
  playbookPath: string;
  playbookCursorRulePath: string;
  machinePlaybooksPath: string;
};

export function deliveryEvidenceModesForMaintainerEvidenceKind(
  evidenceKind: MaintainerDeliveryProfile["evidenceKind"]
): DeliveryEvidenceModeV2[] | undefined {
  if (evidenceKind === "github-pr") {
    return ["github-pr"];
  }
  if (evidenceKind === "manual") {
    return ["local-reviewed-merge", "direct-reviewed-merge", "external-review"];
  }
  return undefined;
}

export function buildDeliveryEvidencePolicyContext(input: {
  resolvedPolicy: Pick<ResolvedMaintainerDeliveryPolicyV1, "evidenceMode" | "profileName">;
  warnings?: readonly MaintainerDeliveryPolicyWarning[];
}): EvaluateDeliveryEvidenceOptions {
  return {
    allowedEvidenceModes: deliveryEvidenceModesForMaintainerEvidenceKind(input.resolvedPolicy.evidenceMode),
    requiredEvidenceMode: input.resolvedPolicy.evidenceMode,
    policyProfile: input.resolvedPolicy.profileName,
    policyWarnings: input.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEnforcement(raw: unknown): TaskPolicyEnforcementMode | undefined {
  if (raw === "off" || raw === "advisory" || raw === "enforce") {
    return raw;
  }
  return undefined;
}

/** Merge persisted maintainerDelivery with shipped defaults (profiles + overrides). */
export function parseMaintainerDeliveryPolicyConfig(
  effective: Record<string, unknown> | undefined
): MaintainerDeliveryPolicyConfig {
  const raw = effective?.maintainerDelivery;
  if (!isRecord(raw)) {
    return JSON.parse(JSON.stringify(DEFAULT_MAINTAINER_DELIVERY_POLICY)) as MaintainerDeliveryPolicyConfig;
  }
  const baseProfiles = {
    ...DEFAULT_MAINTAINER_DELIVERY_POLICY.profiles,
    ...(isRecord(raw.profiles) ? (raw.profiles as Record<string, MaintainerDeliveryProfile>) : {})
  };
  const moduleOverrides: Record<string, MaintainerDeliveryOverride> = {};
  if (isRecord(raw.moduleOverrides)) {
    for (const [k, v] of Object.entries(raw.moduleOverrides)) {
      if (isRecord(v) && typeof v.profile === "string") {
        moduleOverrides[k] = v as MaintainerDeliveryOverride;
      }
    }
  }
  return {
    defaultProfile:
      typeof raw.defaultProfile === "string"
        ? raw.defaultProfile
        : DEFAULT_MAINTAINER_DELIVERY_POLICY.defaultProfile,
    enforcementMode:
      parseEnforcement(raw.enforcementMode) ?? DEFAULT_MAINTAINER_DELIVERY_POLICY.enforcementMode,
    profiles: baseProfiles,
    moduleOverrides
  };
}

export function slugifyTaskTitle(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "task";
}

function expandTokens(pattern: string, ctx: Record<string, string>): string {
  return pattern.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key: string) => {
    if (!TOKEN_KEYS.has(key)) {
      return full;
    }
    return ctx[key] ?? "";
  });
}

function normalizeProfileRecord(p: MaintainerDeliveryProfile): MaintainerDeliveryProfile {
  const base = DEFAULT_MAINTAINER_DELIVERY_POLICY.profiles["github-pr"];
  return {
    requiresPhaseBranch: p.requiresPhaseBranch ?? base.requiresPhaseBranch,
    branchPattern: p.branchPattern ?? base.branchPattern,
    taskBranchPattern: p.taskBranchPattern ?? base.taskBranchPattern,
    releaseTagPattern: p.releaseTagPattern ?? base.releaseTagPattern,
    review: p.review ?? base.review,
    evidenceKind: p.evidenceKind ?? base.evidenceKind,
    prProvider: p.prProvider ?? base.prProvider,
    mergeStrategy: p.mergeStrategy ?? base.mergeStrategy,
    phaseToMainMode: p.phaseToMainMode ?? base.phaseToMainMode
  };
}

/**
 * Read-only resolver: workspace + module + task metadata → concrete delivery instructions.
 */
export function resolveMaintainerDeliveryPolicy(
  input: ResolveMaintainerDeliveryPolicyArgs
): {
  resolvedPolicy: ResolvedMaintainerDeliveryPolicyV1;
  explain: MaintainerDeliveryExplainEntry[];
  warnings: MaintainerDeliveryPolicyWarning[];
  precedenceOrder: typeof TASK_POLICY_OVERRIDE_PRECEDENCE;
} {
  const warnings: MaintainerDeliveryPolicyWarning[] = [];
  const explain: MaintainerDeliveryExplainEntry[] = [];
  const cfg = parseMaintainerDeliveryPolicyConfig(input.effectiveConfig);

  const task = input.task ?? undefined;
  const taskId =
    (typeof input.taskId === "string" && input.taskId.trim().length > 0 ? input.taskId.trim() : null) ??
    task?.id ??
    null;

  const phaseKeyRaw =
    (typeof input.phaseKey === "string" && input.phaseKey.trim().length > 0
      ? input.phaseKey.trim()
      : null) ?? (task ? inferTaskPhaseKey(task) : null);

  const moduleId =
    typeof input.moduleId === "string" && input.moduleId.trim().length > 0
      ? input.moduleId.trim()
      : null;

  const slug =
    (typeof input.slug === "string" && input.slug.trim().length > 0
      ? input.slug.trim()
      : null) ?? (task ? slugifyTaskTitle(task.title) : null);

  const version =
    typeof input.version === "string" && input.version.trim().length > 0 ? input.version.trim() : "";

  const metaProfileRaw =
    task?.metadata && typeof task.metadata[MAINTAINER_DELIVERY_PROFILE_METADATA_KEY] === "string"
      ? String(task.metadata[MAINTAINER_DELIVERY_PROFILE_METADATA_KEY]).trim()
      : null;

  const moduleOverride = moduleId ? cfg.moduleOverrides[moduleId] : undefined;

  let profileName = cfg.defaultProfile;
  let profileSource: MaintainerDeliveryExplainSource = "workspace-default";
  if (metaProfileRaw && cfg.profiles[metaProfileRaw]) {
    profileName = metaProfileRaw;
    profileSource = "task-metadata";
  } else if (metaProfileRaw && !cfg.profiles[metaProfileRaw]) {
    warnings.push({
      code: "unknown-task-metadata-profile",
      message: `metadata.${MAINTAINER_DELIVERY_PROFILE_METADATA_KEY} '${metaProfileRaw}' is not defined in maintainerDelivery.profiles — falling back to workspace default`
    });
  }

  if (profileSource !== "task-metadata" && moduleOverride?.profile && cfg.profiles[moduleOverride.profile]) {
    profileName = moduleOverride.profile;
    profileSource = "module-override";
  }

  if (!cfg.profiles[profileName]) {
    profileName = "github-pr";
    profileSource = "built-in-default";
    warnings.push({
      code: "unknown-effective-profile",
      message: `Resolved profile missing from config — using built-in 'github-pr'`
    });
  }

  const rawProf = cfg.profiles[profileName]!;
  const profile = normalizeProfileRecord(rawProf);

  explain.push({ key: "profileName", value: profileName, source: profileSource });

  let maintainerDeliveryEnforcementMode: TaskPolicyEnforcementMode = cfg.enforcementMode;
  explain.push({
    key: "maintainerDelivery.enforcementMode",
    value: maintainerDeliveryEnforcementMode,
    source: "workspace-default"
  });
  if (moduleOverride?.enforcementMode) {
    maintainerDeliveryEnforcementMode = moduleOverride.enforcementMode;
    explain.push({
      key: "maintainerDelivery.enforcementMode",
      value: maintainerDeliveryEnforcementMode,
      source: "module-override"
    });
  }

  const metaRequires =
    task?.metadata && task.metadata[REQUIRES_PHASE_BRANCH_METADATA_KEY] === true ? true : false;
  const metaRequiresFalse =
    task?.metadata && task.metadata[REQUIRES_PHASE_BRANCH_METADATA_KEY] === false ? true : false;

  let requiresPhaseBranch = profile.requiresPhaseBranch;
  let requiresSource: MaintainerDeliveryExplainSource =
    profileSource === "task-metadata"
      ? "workspace-default"
      : profileSource === "module-override"
        ? "module-override"
        : "workspace-default";

  if (metaRequires) {
    requiresPhaseBranch = true;
    requiresSource = "task-metadata";
  }
  if (metaRequiresFalse && profile.requiresPhaseBranch) {
    warnings.push({
      code: "requires-phase-branch-conflict",
      message:
        "metadata.requiresPhaseBranch is false but the resolved delivery profile expects a phase integration branch — metadata does not downgrade profile.requiresPhaseBranch"
    });
    explain.push({
      key: "requiresPhaseBranchConflict",
      value: true,
      source: "task-metadata"
    });
  }

  explain.push({ key: "requiresPhaseBranch", value: requiresPhaseBranch, source: requiresSource });

  const tokenCtx: Record<string, string> = {
    taskId: taskId ?? "",
    slug: slug ?? "",
    phaseKey: phaseKeyRaw ?? "",
    moduleId: moduleId ?? "",
    version
  };

  const phaseBranchPattern = profile.branchPattern;
  const phaseIntegrationBranch =
    phaseKeyRaw && phaseBranchPattern.includes("{phaseKey}")
      ? expandTokens(phaseBranchPattern, tokenCtx)
      : null;

  const taskBranchPattern =
    profile.taskBranchPattern ?? DEFAULT_MAINTAINER_DELIVERY_POLICY.profiles["github-pr"].taskBranchPattern!;
  const taskBranchExample =
    taskId && slug && phaseKeyRaw
      ? expandTokens(taskBranchPattern, tokenCtx)
      : taskId && slug
        ? expandTokens(taskBranchPattern, tokenCtx)
        : null;

  const releaseTagPattern = profile.releaseTagPattern ?? null;
  const releaseTagExample =
    releaseTagPattern && version ? expandTokens(releaseTagPattern, tokenCtx) : null;

  explain.push({ key: "phaseBranchPattern", value: phaseBranchPattern, source: "workspace-default" });
  explain.push({ key: "taskBranchPattern", value: taskBranchPattern, source: "workspace-default" });
  if (releaseTagPattern) {
    explain.push({ key: "releaseTagPattern", value: releaseTagPattern, source: "workspace-default" });
  }

  const deliveryEvidenceEnforcementMode = readDeliveryEvidenceEnforcementMode(input.effectiveConfig);
  explain.push({
    key: "tasks.deliveryEvidence.enforcementMode",
    value: deliveryEvidenceEnforcementMode,
    source: "workspace-default"
  });

  const resolvedPolicy: ResolvedMaintainerDeliveryPolicyV1 = {
    schemaVersion: 1,
    profileName,
    maintainerDeliveryEnforcementMode,
    deliveryEvidenceEnforcementMode,
    requiresPhaseBranch,
    phaseBranchPattern,
    phaseIntegrationBranch,
    taskBranchPattern,
    taskBranchExample,
    releaseTagPattern,
    releaseTagExample,
    reviewMode: profile.review,
    evidenceMode: profile.evidenceKind,
    prProvider: profile.prProvider ?? "github",
    mergeStrategy: profile.mergeStrategy ?? "merge",
    phaseToMainMode: profile.phaseToMainMode ?? "phase-closeout",
    mergeTarget: {
      kind: "phase-integration-branch",
      pattern: phaseBranchPattern,
      branch: phaseIntegrationBranch
    },
    playbookPath: ".ai/playbooks/task-to-phase-branch.md",
    playbookCursorRulePath: ".cursor/rules/playbook-task-to-phase-branch.mdc",
    machinePlaybooksPath: ".ai/MACHINE-PLAYBOOKS.md"
  };

  return {
    resolvedPolicy,
    explain,
    warnings,
    precedenceOrder: [...TASK_POLICY_OVERRIDE_PRECEDENCE]
  };
}
