/**
 * Policy-gated `workspace-kit run` commands owned by the documentation module.
 * Keep in sync with instruction names in `documentation/index.ts`.
 */
export const DOCUMENTATION_POLICY_COMMAND_NAMES = [
  ["document-project", "doc.document-project"],
  ["generate-document", "doc.generate-document"]
] as const;
