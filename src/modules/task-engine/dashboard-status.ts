import fs from "node:fs/promises";
import path from "node:path";

/** Best-effort parse of maintainer status YAML for dashboard UIs (no full YAML dependency). */
export type WorkspaceStatusSnapshot = {
  currentKitPhase: string | null;
  /** Maintainer-maintained `next_kit_phase` in workspace-kit-status.yaml; null when unset. */
  nextKitPhase: string | null;
  activeFocus: string | null;
  lastUpdated: string | null;
};

export async function readWorkspaceStatusSnapshot(
  workspacePath: string
): Promise<WorkspaceStatusSnapshot | null> {
  const filePath = path.join(workspacePath, "docs/maintainers/data/workspace-kit-status.yaml");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const phaseMatch = raw.match(/^\s*current_kit_phase:\s*["']?([^"'\n#]+?)["']?\s*$/m);
    const nextPhaseMatch = raw.match(/^\s*next_kit_phase:\s*["']?([^"'\n#]+?)["']?\s*$/m);
    const focusMatch = raw.match(/^\s*active_focus:\s*"([^"]*)"\s*$/m);
    const updatedMatch = raw.match(/^\s*last_updated:\s*["']?([^"'\n#]+?)["']?\s*$/m);
    return {
      currentKitPhase: phaseMatch?.[1]?.trim() ?? null,
      nextKitPhase: nextPhaseMatch?.[1]?.trim() ?? null,
      activeFocus: focusMatch?.[1] ?? null,
      lastUpdated: updatedMatch?.[1]?.trim() ?? null
    };
  } catch {
    return null;
  }
}
