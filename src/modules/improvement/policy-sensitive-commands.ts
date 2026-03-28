/**
 * Policy-gated `workspace-kit run` commands owned by the improvement module.
 */
export const IMPROVEMENT_POLICY_COMMAND_NAMES = [
  ["generate-recommendations", "improvement.generate-recommendations"],
  ["ingest-transcripts", "improvement.ingest-transcripts"]
] as const;
