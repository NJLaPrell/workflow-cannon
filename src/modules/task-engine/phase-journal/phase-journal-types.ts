/** Internal types for Phase Journal persistence (planning SQLite). */

export type PhaseNoteStatus =
  | "active"
  | "converted"
  | "superseded"
  | "dismissed"
  | "expired";

export type PhaseNotePriority = "low" | "normal" | "high" | "critical";

export type PhaseNoteRefInput = {
  refType: string;
  refValue: string;
};

export type CreatePhaseNoteInput = {
  phaseKey: string;
  phaseLabel?: string | null;
  taskId?: string | null;
  author?: string | null;
  authorKind?: string | null;
  sessionId?: string | null;
  sourceCommand?: string | null;
  planningGeneration?: number | null;
  policyTraceId?: string | null;
  noteType: string;
  summary: string;
  details?: string | null;
  status?: PhaseNoteStatus;
  priority?: PhaseNotePriority;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
  refs?: PhaseNoteRefInput[];
};

export type ListPhaseNotesFilter = {
  phaseKey: string;
  /** When omitted, all statuses match (internal store; command layer defaults to active). */
  status?: PhaseNoteStatus | PhaseNoteStatus[];
  limit?: number;
};

export type PhaseNoteRefRow = {
  id: string;
  noteId: string;
  refType: string;
  refValue: string;
};

export type PhaseNoteRow = {
  id: string;
  phaseKey: string;
  phaseLabel: string | null;
  taskId: string | null;
  author: string | null;
  authorKind: string | null;
  sessionId: string | null;
  sourceCommand: string | null;
  planningGeneration: number | null;
  policyTraceId: string | null;
  noteType: string;
  summary: string;
  details: string | null;
  status: PhaseNoteStatus;
  priority: PhaseNotePriority;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  supersededBy: string | null;
  convertedTaskId: string | null;
  idempotencyKey: string | null;
  refs: PhaseNoteRefRow[];
};

export type CreatePhaseNoteResult = {
  created: boolean;
  note: PhaseNoteRow;
};
