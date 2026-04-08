export type DocumentationGenerateOptions = {
  dryRun?: boolean;
  overwrite?: boolean;
  overwriteAi?: boolean;
  overwriteHuman?: boolean;
  /** When `documentType` is `README.md`, also write repo-root `README.md` (default: same as `overwrite`) */
  overwriteRepoRootReadme?: boolean;
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
  check:
    | "schema"
    | "section-coverage"
    | "template-resolution"
    | "write-boundary"
    | "conflict"
    | "documentation-data";
  message: string;
  resolved: boolean;
};

export type DocumentationGenerationEvidence = {
  documentType: string;
  filesRead: string[];
  filesWritten: string[];
  filesSkipped: string[];
  validationIssues: DocumentationValidationIssue[];
  conflicts: DocumentationConflict[];
  attemptsUsed: number;
  timestamp: string;
};

export type DocumentationGenerateResult = {
  ok: boolean;
  aiOutputPath?: string;
  humanOutputPath?: string;
  /** Set when `README.md` generation also targets the repository root copy */
  repoRootReadmePath?: string;
  evidence: DocumentationGenerationEvidence;
};

export type DocumentationBatchResult = {
  ok: boolean;
  results: DocumentationGenerateResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    timestamp: string;
  };
};

export type NormalizedRecordStatus = "active" | "deprecated" | "draft" | "observed" | "planned";

export type NormalizedBaseRecord = {
  id?: string;
  status?: NormalizedRecordStatus;
  refs?: string[];
};

export type NormalizedMeta = NormalizedBaseRecord & {
  schema: "base.v2";
  doc: string;
  truth: "canonical" | "observed" | "planned";
  profile?: "core" | "runbook" | "workbook";
  title?: string;
  owner?: string;
  tags?: string[];
};

export type NormalizedRef = NormalizedBaseRecord & {
  id: string;
  type: "adr" | "file" | "code" | "doc" | "issue" | "pr" | "test" | "external";
  target: string;
  anchor?: string;
  label?: string;
  note?: string;
};

export type NormalizedRule = NormalizedBaseRecord & {
  id: string;
  level: "must" | "must_not" | "should" | "may";
  scope: string;
  scope_kind?: string;
  kind?: string;
  directive: string;
  why: string;
  unless?: string;
  also?: string[];
  risk?: "low" | "medium" | "high" | "critical";
  approval?: "none" | "prompt" | "required";
  override?: "auto" | "warn" | "prompt" | "stop";
};

export type NormalizedCheck = NormalizedBaseRecord & {
  id: string;
  scope: string;
  assertion: string;
  when?: string;
  onFail?: "auto" | "warn" | "prompt" | "stop";
};

export type NormalizedDecision = NormalizedBaseRecord & {
  id: string;
  topic: string;
  choice: string;
  why: string;
  consequence?: string;
};

export type NormalizedExample = NormalizedBaseRecord & {
  id: string;
  for: string;
  kind: "good" | "bad" | "edge";
  text: string;
};

export type NormalizedTerm = NormalizedBaseRecord & {
  name: string;
  definition: string;
};

export type NormalizedCommand = NormalizedBaseRecord & {
  id: string;
  name: string;
  use: string;
  scope: string;
  expectation: string;
  risk?: "low" | "medium" | "high" | "critical";
  sensitivity?: "non_sensitive" | "policy_sensitive";
};

export type NormalizedWorkflow = NormalizedBaseRecord & {
  id: string;
  name: string;
  when: string;
  steps: string[];
  done: string[];
  forbid?: string[];
  askIf?: string;
  haltIf?: string;
  approval?: "none" | "prompt" | "required";
  risk?: "low" | "medium" | "high" | "critical";
};

export type NormalizedRunbook = NormalizedBaseRecord & {
  name: string;
  scope: string;
  owner: string;
};

export type NormalizedWorkbook = NormalizedBaseRecord & {
  name: string;
  phase: string;
  state: string;
};

export type NormalizedChain = NormalizedBaseRecord & {
  step: string;
  command: string;
  expectExit: number;
};

export type NormalizedState = NormalizedBaseRecord & {
  name: string;
  distTag: string;
  intent: string;
};

export type NormalizedTransition = NormalizedBaseRecord & {
  from: string;
  to: string;
  requires: string[];
};

export type NormalizedPromotion = NormalizedBaseRecord & {
  from: string;
  to: string;
  requires: string[];
};

export type NormalizedRollback = NormalizedBaseRecord & {
  strategy: string;
  note: string;
};

export type NormalizedArtifact = NormalizedBaseRecord & {
  path: string;
  schema: string;
};

export type NormalizedConfig = NormalizedBaseRecord & {
  key: string;
  default: string;
};

export type NormalizedCadence = NormalizedBaseRecord & {
  rule: string;
};

export type NormalizedGuardrail = NormalizedBaseRecord & {
  id: string;
  level: "must" | "must_not" | "should" | "may";
  directive: string;
  why: string;
};

/** Chat-shaped usage guides for README (steps use `>` in keyed source lines). */
export type NormalizedChatFeature = NormalizedBaseRecord & {
  id: string;
  title: string;
  summary: string;
  steps: string[];
};

export type NormalizedDocument = {
  meta: NormalizedMeta | null;
  refs: NormalizedRef[];
  rules: NormalizedRule[];
  checks: NormalizedCheck[];
  decisions: NormalizedDecision[];
  examples: NormalizedExample[];
  terms: NormalizedTerm[];
  commands: NormalizedCommand[];
  workflows: NormalizedWorkflow[];
  chatFeatures: NormalizedChatFeature[];
  runbooks: NormalizedRunbook[];
  workbooks: NormalizedWorkbook[];
  chains: NormalizedChain[];
  states: NormalizedState[];
  transitions: NormalizedTransition[];
  promotions: NormalizedPromotion[];
  rollbacks: NormalizedRollback[];
  artifacts: NormalizedArtifact[];
  configs: NormalizedConfig[];
  cadences: NormalizedCadence[];
  guardrails: NormalizedGuardrail[];
  refsById: Map<string, NormalizedRef>;
  examplesByParent: Map<string, NormalizedExample[]>;
  profileRecords: Map<"core" | "runbook" | "workbook", Array<NormalizedBaseRecord>>;
};

export type ViewModelSection = {
  id: string;
  title?: string;
  description?: string;
  renderer: string;
  source:
    | "meta"
    | "refs"
    | "rules"
    | "checks"
    | "decisions"
    | "examples"
    | "terms"
    | "commands"
    | "workflows"
    | "runbooks"
    | "workbooks"
    | "chains"
    | "states"
    | "transitions"
    | "promotions"
    | "rollbacks"
    | "artifacts"
    | "configs"
    | "cadences"
    | "guardrails"
    | "chat_features";
  where?: Record<string, string | number | boolean>;
  sortBy?: string[];
  template?: string;
};

export type ViewRenderPolicy = {
  id: string;
  mode: "append" | "replace" | "fallback";
  when?: string;
};

export type ViewModelDefinition = {
  id: string;
  version: number;
  docType: string;
  target: string;
  profile?: "core" | "runbook" | "workbook";
  sections: ViewModelSection[];
  renderPolicies?: ViewRenderPolicy[];
};
