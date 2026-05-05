const RUNBOOK = "docs/maintainers/runbooks/native-sqlite-consumer-install.md";

export function nodeRuntimeIdentity() {
  return {
    execPath: process.execPath,
    version: process.version,
    arch: process.arch,
    platform: process.platform,
    modules: process.versions.modules || "unknown"
  };
}

export function formatNodeRuntimeIdentity(identity = nodeRuntimeIdentity()) {
  return `node=${identity.execPath} version=${identity.version} arch=${identity.arch} platform=${identity.platform} abi=${identity.modules}`;
}

export function classifyNativeSqliteErrorMessage(message) {
  const lower = String(message).toLowerCase();
  const archMatch = String(message).match(/incompatible architecture[\s\S]*?have ['"]?([^,'")\s]+)['"]?, need ['"]?([^,'")\s]+)['"]?/i);
  if (archMatch) {
    return {
      kind: "architecture-mismatch",
      rebuildRecommended: true,
      architecture: { have: archMatch[1], need: archMatch[2] }
    };
  }
  if (String(message).includes("NODE_MODULE_VERSION") || lower.includes("was compiled against a different node.js")) {
    return { kind: "abi-mismatch", rebuildRecommended: true };
  }
  if (
    lower.includes("cannot find module") ||
    lower.includes("module not found") ||
    lower.includes("no such file") ||
    lower.includes("enoent")
  ) {
    return { kind: "missing-binding", rebuildRecommended: true };
  }
  if (lower.includes("gyp") || lower.includes("make failed") || lower.includes("xcode") || lower.includes("compiler")) {
    return { kind: "toolchain-build-failed", rebuildRecommended: false };
  }
  if (lower.includes("better_sqlite3.node") || lower.includes("better-sqlite3")) {
    return { kind: "native-load-failed", rebuildRecommended: true };
  }
  return { kind: "unknown", rebuildRecommended: false };
}

export function nativeSqliteRecoveryHint(classification, identity = nodeRuntimeIdentity()) {
  const runtime = formatNodeRuntimeIdentity(identity);
  switch (classification.kind) {
    case "architecture-mismatch": {
      const arch = classification.architecture;
      const archText = arch?.have && arch?.need ? ` binding architecture ${arch.have}, runtime needs ${arch.need};` : "";
      return `native-sqlite-architecture-mismatch:${archText} ${runtime}. Use the same Node architecture that installed node_modules, then run pnpm rebuild better-sqlite3 or npm rebuild better-sqlite3. Full ladder: ${RUNBOOK}.`;
    }
    case "abi-mismatch":
      return `native-sqlite-abi-mismatch: ${runtime}. Rebuild the native addon for this Node runtime: pnpm rebuild better-sqlite3 or npm rebuild better-sqlite3. Full ladder: ${RUNBOOK}.`;
    case "missing-binding":
      return `native-sqlite-binding-missing: ${runtime}. Reinstall dependencies or rebuild better-sqlite3 from the install root. Full ladder: ${RUNBOOK}.`;
    case "toolchain-build-failed":
      return `native-sqlite-toolchain-build-failed: ${runtime}. Install the native build toolchain or use a supported prebuild, then rebuild better-sqlite3. Full ladder: ${RUNBOOK}.`;
    case "native-load-failed":
      return `native-sqlite-load-failed: ${runtime}. Rebuild better-sqlite3 in the install root; if it still fails, check architecture and toolchain. Full ladder: ${RUNBOOK}.`;
    default:
      return `native-sqlite-load-failed: ${runtime}. Install / toolchain / permissions checklist: ${RUNBOOK}.`;
  }
}
