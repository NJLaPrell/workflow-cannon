import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { CanonicalStateSyncBackend } from "../sync-backends/canonical-state-sync-backend.js";
import { createGitEventLogBackendFromContext } from "../sync-backends/git-event-log-backend.js";
import {
  createLocalOnlyBackend,
  type CreateLocalOnlyBackendOptions
} from "../sync-backends/local-only-backend.js";
import { resolveCanonicalBackend } from "./canonical-backend-config.js";

export function createCanonicalSyncBackendFromContext(
  ctx: ModuleLifecycleContext,
  options: {
    git?: Partial<Parameters<typeof createGitEventLogBackendFromContext>[1]>;
    localOnly?: CreateLocalOnlyBackendOptions;
  } = {}
): CanonicalStateSyncBackend {
  const resolved = resolveCanonicalBackend(ctx.effectiveConfig as Record<string, unknown> | undefined);
  switch (resolved.type) {
    case "git":
      return createGitEventLogBackendFromContext(ctx, options.git ?? {});
    case "local-only":
      return createLocalOnlyBackend(options.localOnly ?? {});
    case "hosted":
      throw new Error(
        "tasks.canonicalBackend.type hosted is not implemented yet (see .ai/adrs/ADR-hosted-api-backend-contract-v1.md)"
      );
    default: {
      const _exhaustive: never = resolved.type;
      throw new Error(`unsupported canonical backend type: ${String(_exhaustive)}`);
    }
  }
}
