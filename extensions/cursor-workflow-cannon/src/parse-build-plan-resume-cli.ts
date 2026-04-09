/**
 * Extract JSON args from a `resumeCli` line produced by the planning module
 * (`workspace-kit run build-plan '…'` / `pnpm … build-plan '…'`).
 */
export function parseBuildPlanArgsFromResumeCli(resumeCli: string): Record<string, unknown> | null {
  const trimmed = resumeCli.trim();
  const match = trimmed.match(/build-plan\s+'([\s\S]*)'\s*$/);
  if (!match?.[1]) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
