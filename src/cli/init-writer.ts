import path from "node:path";
import fs from "node:fs/promises";
import { CANONICAL_KIT_NAME, defaultWorkspaceKitPaths } from "./default-workspace-kit-paths.js";
import {
  createDriftExpectedAssets,
  driftContentMatches,
  parseJsonFile,
  readCliBundledPackageVersion,
  resolvePackageVersion,
  toJsonWithTrailingNewline,
  validateProfile,
  writeFileWithBackupIfChanged,
  type WorkspaceKitProfile
} from "./profile-support.js";
import { currentOwnedPaths, pointerRuleContent, profileSchemaContent } from "./profile-baseline-content.js";
import type { InitPlan } from "./init-plan.js";

export type ApplyInitPlanOptions = {
  dryRun?: boolean;
  force?: boolean;
  backupRoot?: string;
};

export type ApplyInitPlanResult = {
  ok: boolean;
  filesCreated: string[];
  filesUpdated: string[];
  filesPreserved: string[];
  filesSkippedDueToDrift: string[];
  backupsWritten: string[];
  warnings: string[];
  message?: string;
};

const DEFAULT_TASKS_CONFIG = {
  persistenceBackend: "sqlite",
  sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
} as const;

/**
 * Apply or simulate kit baseline writes for attach/init. Never deletes files; existing profile content is never overwritten.
 */
export async function applyInitPlan(
  cwd: string,
  plan: InitPlan,
  options: ApplyInitPlanOptions = {}
): Promise<ApplyInitPlanResult> {
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const warnings = [...plan.warnings];
  const filesCreated: string[] = [];
  const filesUpdated: string[] = [];
  const filesPreserved: string[] = [];
  const filesSkippedDueToDrift: string[] = [];
  const backupsWritten: string[] = [];

  if (plan.profileValidationErrors && plan.profileValidationErrors.length > 0) {
    return {
      ok: false,
      filesCreated,
      filesUpdated,
      filesPreserved,
      filesSkippedDueToDrift,
      backupsWritten,
      warnings,
      message: "workspace-kit.profile.json is invalid; fix or remove it before running init."
    };
  }

  const backupRoot =
    options.backupRoot ?? path.join(cwd, ".workspace-kit", "backups", new Date().toISOString());

  const applyKitTextFile = async (
    relativePath: string,
    desiredContent: string,
    driftLabel: string
  ): Promise<void> => {
    const abs = path.join(cwd, relativePath);
    let existing: string | undefined;
    try {
      existing = await fs.readFile(abs, "utf8");
    } catch {
      existing = undefined;
    }

    if (existing !== undefined && !driftContentMatches(relativePath, existing, desiredContent)) {
      if (!force) {
        warnings.push(
          `Skipped ${relativePath}: content drift (${driftLabel}). Re-run with --force to refresh kit-owned files (creates backups first).`
        );
        filesSkippedDueToDrift.push(relativePath);
        return;
      }
    }

    if (dryRun) {
      if (existing === undefined) {
        filesCreated.push(relativePath);
      } else if (!driftContentMatches(relativePath, existing, desiredContent)) {
        filesUpdated.push(relativePath);
      } else {
        filesPreserved.push(relativePath);
      }
      return;
    }

    const changed = await writeFileWithBackupIfChanged(cwd, relativePath, desiredContent, backupRoot);
    if (!changed) {
      filesPreserved.push(relativePath);
      return;
    }

    if (existing === undefined) {
      filesCreated.push(relativePath);
    } else {
      filesUpdated.push(relativePath);
      backupsWritten.push(path.relative(cwd, path.join(backupRoot, `${relativePath}.bak`)) || `${relativePath}.bak`);
    }
  };

  // --- Profile (create only when absent — never overwrite existing file via init)
  const profileRel = defaultWorkspaceKitPaths.profile;
  const profileAbs = path.join(cwd, profileRel);
  try {
    await fs.access(profileAbs);
  } catch {
    if (dryRun) {
      filesCreated.push(profileRel);
    } else {
      await fs.mkdir(path.dirname(profileAbs), { recursive: true });
      await fs.writeFile(profileAbs, toJsonWithTrailingNewline(plan.synthesizedProfile), "utf8");
      filesCreated.push(profileRel);
    }
  }

  const validated = await validateProfile(cwd);
  if (validated.errors.length > 0 || !validated.profile) {
    return {
      ok: false,
      filesCreated,
      filesUpdated,
      filesPreserved,
      filesSkippedDueToDrift,
      backupsWritten,
      warnings: [...warnings, ...validated.errors],
      message: "Profile validation failed during init."
    };
  }
  const profile: WorkspaceKitProfile = validated.profile;

  // --- Merge .workspace-kit/config.json tasks.* defaults without clobbering unrelated keys
  const configRel = ".workspace-kit/config.json";
  const configAbs = path.join(cwd, configRel);
  let baseConfig: Record<string, unknown> = { schemaVersion: 1 };
  try {
    const raw = await fs.readFile(configAbs, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      baseConfig = parsed as Record<string, unknown>;
    } else {
      warnings.push(".workspace-kit/config.json was not an object; resetting structure while merging safe task defaults.");
    }
  } catch {
    /* missing */
  }

  const tasksExisting =
    baseConfig.tasks && typeof baseConfig.tasks === "object" && !Array.isArray(baseConfig.tasks)
      ? ({ ...(baseConfig.tasks as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  let tasksTouched = false;
  if (tasksExisting.persistenceBackend === undefined) {
    tasksExisting.persistenceBackend = DEFAULT_TASKS_CONFIG.persistenceBackend;
    tasksTouched = true;
  }
  if (tasksExisting.sqliteDatabaseRelativePath === undefined) {
    tasksExisting.sqliteDatabaseRelativePath = DEFAULT_TASKS_CONFIG.sqliteDatabaseRelativePath;
    tasksTouched = true;
  }
  const mergedConfig = { ...baseConfig, tasks: tasksExisting };
  const desiredConfigText = toJsonWithTrailingNewline(mergedConfig);

  let existingConfigText: string | undefined;
  try {
    existingConfigText = await fs.readFile(configAbs, "utf8");
  } catch {
    existingConfigText = undefined;
  }

  const configDiffers =
    existingConfigText === undefined ||
    !driftContentMatches(configRel, existingConfigText, desiredConfigText);

  if (configDiffers || tasksTouched) {
    if (dryRun) {
      if (existingConfigText === undefined) {
        filesCreated.push(configRel);
      } else {
        filesUpdated.push(configRel);
      }
    } else {
      const changed = await writeFileWithBackupIfChanged(cwd, configRel, desiredConfigText, backupRoot);
      if (changed) {
        if (existingConfigText === undefined) {
          filesCreated.push(configRel);
        } else {
          filesUpdated.push(configRel);
          backupsWritten.push(
            path.relative(cwd, path.join(backupRoot, `${configRel}.bak`)) || `${configRel}.bak`
          );
        }
      } else {
        filesPreserved.push(configRel);
      }
    }
  } else {
    filesPreserved.push(configRel);
  }

  // --- Manifest (matches workspace-kit upgrade semantics)
  const existingManifestValue = await parseJsonFile(path.join(cwd, defaultWorkspaceKitPaths.manifest)).catch(
    () => ({})
  );
  const existingManifest =
    existingManifestValue &&
    typeof existingManifestValue === "object" &&
    !Array.isArray(existingManifestValue)
      ? (existingManifestValue as Record<string, unknown>)
      : {};

  const nowIso = new Date().toISOString();
  const resolvedKitVersion =
    (await resolvePackageVersion(cwd)) ?? (await readCliBundledPackageVersion()) ?? "0.0.0";
  const mergedManifest = {
    schemaVersion: 1,
    kit: {
      name: CANONICAL_KIT_NAME,
      version: resolvedKitVersion
    },
    installedAt:
      typeof existingManifest.installedAt === "string" && existingManifest.installedAt.length > 0
        ? existingManifest.installedAt
        : nowIso,
    lastUpgrade: nowIso,
    ownershipPolicyPath: defaultWorkspaceKitPaths.ownedPaths
  };

  await applyKitTextFile(
    defaultWorkspaceKitPaths.ownedPaths,
    toJsonWithTrailingNewline({
      schemaVersion: 1,
      ownedPaths: currentOwnedPaths,
      notes:
        "Managed kit-owned paths — updated by workspace-kit init/upgrade with backup safety when kit-owned content changes."
    }),
    "owned-paths"
  );

  await applyKitTextFile(defaultWorkspaceKitPaths.manifest, toJsonWithTrailingNewline(mergedManifest), "manifest");

  const driftAssets = createDriftExpectedAssets(profile);
  driftAssets.set(defaultWorkspaceKitPaths.profileSchema, toJsonWithTrailingNewline(profileSchemaContent));
  driftAssets.set(".cursor/rules/workspace-kit-profile-pointer.mdc", pointerRuleContent);

  const orderedKeys = [...driftAssets.keys()].sort((a, b) => a.localeCompare(b));
  for (const rel of orderedKeys) {
    const content = driftAssets.get(rel);
    if (content === undefined) {
      continue;
    }
    await applyKitTextFile(rel, content, "kit-owned");
  }

  return {
    ok: true,
    filesCreated,
    filesUpdated,
    filesPreserved,
    filesSkippedDueToDrift,
    backupsWritten,
    warnings
  };
}
