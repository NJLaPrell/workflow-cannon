export type DocumentationGenerateOptions = {
  dryRun?: boolean;
  overwrite?: boolean;
  strict?: boolean;
  maxValidationAttempts?: number;
  allowWithoutTemplate?: boolean;
};

export type DocumentationConflict = {
  source: string;
  reason: string;
  severity: "warn" | "stop";
};

export type DocumentationValidationIssue = {
  check: "schema" | "section-coverage" | "template-resolution" | "write-boundary" | "conflict";
  message: string;
  resolved: boolean;
};

export type DocumentationGenerationEvidence = {
  documentType: string;
  filesRead: string[];
  filesWritten: string[];
  validationIssues: DocumentationValidationIssue[];
  conflicts: DocumentationConflict[];
  attemptsUsed: number;
  timestamp: string;
};

export type DocumentationGenerateResult = {
  ok: boolean;
  aiOutputPath?: string;
  humanOutputPath?: string;
  evidence: DocumentationGenerationEvidence;
};
