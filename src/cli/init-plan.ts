import fs from "node:fs/promises";
import path from "node:path";
import { defaultWorkspaceKitPaths } from "./default-workspace-kit-paths.js";
import type { WorkspaceKitProfile } from "./profile-support.js";
import { validateProfile } from "./profile-support.js";
import type { InitProjectDetection } from "./init-detection.js";

export type InitMode = "fresh-install" | "already-initialized" | "partial-repair";

export type PlannedWriteKind = "create" | "update" | "preserve" | "skip-conflict";

export type PlannedWrite = {
  path: string;
  kind: PlannedWriteKind;
  reason: string;
};

export type InitPlan = {
  schemaVersion: 1;
  mode: InitMode;
  detection: InitProjectDetection;
  synthesizedProfile: WorkspaceKitProfile;
  profileValidationErrors?: string[];
  plannedWrites: PlannedWrite[];
  warnings: string[];
  notes: string[];
};

export type BuildInitPlanOptions = {
  /** Reserved for future hints (e.g. repair-only). */
  force?: boolean;
};

async function fileMissing(cwd: string, rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(cwd, rel));
    return false;
  } catch {
    return true;
  }
}

function synthesizeProfile(detection: InitProjectDetection): WorkspaceKitProfile {
  const name =
    detection.packageJsonName && detection.packageJsonName.length > 0
      ? detection.packageJsonName
      : detection.cwdBasename;
  return {
    project: { name },
    packageManager: detection.inferredPackageManager,
    commands: {
      test: detection.scripts.test.value,
      lint: detection.scripts.lint.value,
      typecheck: detection.scripts.typecheck.value
    },
    github: { defaultBranch: detection.githubDefaultBranch }
  };
}

function pushPlan(planned: PlannedWrite[], rel: string, kind: PlannedWriteKind, reason: string): void {
  planned.push({ path: rel, kind, reason });
}

/**
 * Build a dry-run init plan: modes, warnings, and planned kit-owned paths (no I/O writes).
 */
export async function buildInitPlan(
  cwd: string,
  detection: InitProjectDetection,
  _options: BuildInitPlanOptions = {}
): Promise<InitPlan> {
  const warnings = [...detection.warnings];
  const notes: string[] = [];
  const plannedWrites: PlannedWrite[] = [];

  const synthesizedProfile = synthesizeProfile(detection);

  const profilePath = defaultWorkspaceKitPaths.profile;
  const profileMissing = await fileMissing(cwd, profilePath);
  const profileCheck = await validateProfile(cwd);
  const hasValidProfile = profileCheck.errors.length === 0 && Boolean(profileCheck.profile);

  let profileValidationErrors: string[] | undefined;
  if (!profileMissing && !hasValidProfile) {
    profileValidationErrors = [...profileCheck.errors];
    warnings.push(
      "workspace-kit.profile.json exists but failed validation; attach/repair requires fixing the profile or removing it for a freshly generated profile."
    );
  }

  const manifestMissing = await fileMissing(cwd, defaultWorkspaceKitPaths.manifest);
  const ownedMissing = await fileMissing(cwd, defaultWorkspaceKitPaths.ownedPaths);
  const schemaMissing = await fileMissing(cwd, defaultWorkspaceKitPaths.profileSchema);
  const pointerMissing = await fileMissing(cwd, ".cursor/rules/workspace-kit-profile-pointer.mdc");
  const generatedJsonMissing = await fileMissing(cwd, ".workspace-kit/generated/project-context.json");
  const generatedRuleMissing = await fileMissing(cwd, ".cursor/rules/workspace-kit-project-context.mdc");
  const configMissing = await fileMissing(cwd, ".workspace-kit/config.json");

  let mode: InitMode;

  if (profileMissing || (!hasValidProfile && profileValidationErrors)) {
    mode = profileMissing ? "fresh-install" : "partial-repair";
    if (mode === "fresh-install") {
      notes.push("No workspace kit profile yet — init will synthesize workspace-kit.profile.json from detection.");
    } else {
      notes.push("Profile on disk is invalid — repair manually before applying init writes.");
    }
  } else if (
    !manifestMissing &&
    !ownedMissing &&
    !schemaMissing &&
    !pointerMissing &&
    !generatedJsonMissing &&
    !generatedRuleMissing
  ) {
    mode = "already-initialized";
    notes.push(
      "Baseline kit paths look present; applying init refreshes drifted kit-owned assets (use --force to overwrite mismatched kit-owned files)."
    );
  } else {
    mode = "partial-repair";
    notes.push("Some kit-managed files are missing — init will restore kit-owned baselines.");
  }

  if (profileMissing) {
    pushPlan(plannedWrites, profilePath, "create", "Synthesize workspace-kit.profile.json from detection.");
  } else if (hasValidProfile) {
    pushPlan(plannedWrites, profilePath, "preserve", "Keep existing validated profile.");
  } else {
    pushPlan(plannedWrites, profilePath, "skip-conflict", "Profile invalid — manual repair required before writes.");
  }

  pushPlan(
    plannedWrites,
    defaultWorkspaceKitPaths.profileSchema,
    schemaMissing ? "create" : "update",
    "Ensure JSON Schema baseline for the profile."
  );
  pushPlan(
    plannedWrites,
    defaultWorkspaceKitPaths.manifest,
    manifestMissing ? "create" : "update",
    "Kit install manifest with versions and ownership pointer."
  );
  pushPlan(
    plannedWrites,
    defaultWorkspaceKitPaths.ownedPaths,
    ownedMissing ? "create" : "update",
    "Owned-path policy document."
  );
  pushPlan(
    plannedWrites,
    ".cursor/rules/workspace-kit-profile-pointer.mdc",
    pointerMissing ? "create" : "update",
    "Cursor rule linking generated profile context."
  );
  pushPlan(
    plannedWrites,
    ".workspace-kit/generated/project-context.json",
    generatedJsonMissing ? "create" : "update",
    "Generated JSON context from profile."
  );
  pushPlan(
    plannedWrites,
    ".cursor/rules/workspace-kit-project-context.mdc",
    generatedRuleMissing ? "create" : "update",
    "Generated Cursor rule with project commands."
  );
  pushPlan(
    plannedWrites,
    ".workspace-kit/config.json",
    configMissing ? "create" : "update",
    "Workspace kit config (task SQLite paths)."
  );
  pushPlan(
    plannedWrites,
    ".workspace-kit/tasks/workspace-kit.db",
    "create",
    "SQLite planning database via kit preparation (created if missing)."
  );

  return {
    schemaVersion: 1,
    mode,
    detection,
    synthesizedProfile,
    ...(profileValidationErrors ? { profileValidationErrors } : {}),
    plannedWrites,
    warnings,
    notes
  };
}
