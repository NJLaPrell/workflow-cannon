/**
 * Dashboard in-webview input drawer (Phase 91 contract).
 *
 * Dashboard-originated operator intent for kit mutations should prefer this drawer
 * (`#wc-drawer-host` + `wcDrawerOpen` / `drawerSubmit` messages) over
 * `vscode.window.showInputBox` / `showQuickPick` so users stay inside the sidebar webview.
 */

export function escapeDrawerHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DrawerFormField =
  | {
      id: string;
      kind: "text";
      label: string;
      placeholder?: string;
      required?: boolean;
      value?: string;
    }
  | {
      id: string;
      kind: "textarea";
      label: string;
      placeholder?: string;
      required?: boolean;
      rows?: number;
      value?: string;
    }
  | {
      id: string;
      kind: "select";
      label: string;
      /** First option should use empty value when a placeholder row is desired. */
      options: Array<{ value: string; label: string }>;
      required?: boolean;
    }
  | { id: string; kind: "summary"; label: string; body: string };

export type DrawerFormSpec = {
  /** Stable id echoed on submit for host routing (optional; host may use session instead). */
  workflowId: string;
  title: string;
  descriptionHtml?: string;
  fields: DrawerFormField[];
  primaryLabel: string;
  cancelLabel: string;
};

function renderField(f: DrawerFormField): string {
  const idAttr = escapeDrawerHtml(f.id);
  const lab = escapeDrawerHtml(f.label);
  if (f.kind === "summary") {
    return (
      '<div class="wc-drawer-field wc-drawer-field-summary">' +
      '<div class="wc-drawer-field-label">' +
      lab +
      "</div>" +
      '<div class="wc-drawer-summary-body">' +
      f.body +
      "</div></div>"
    );
  }
  if (f.kind === "select") {
    const req = f.required ? " required" : "";
    const opts = f.options
      .map(
        (o) =>
          '<option value="' +
          escapeDrawerHtml(o.value) +
          '">' +
          escapeDrawerHtml(o.label) +
          "</option>"
      )
      .join("");
    return (
      '<div class="wc-drawer-field">' +
      '<label class="wc-drawer-field-label" for="wc-df-' +
      idAttr +
      '">' +
      lab +
      "</label>" +
      '<select id="wc-df-' +
      idAttr +
      '" class="wc-drawer-select" data-wc-drawer-field="' +
      idAttr +
      '"' +
      req +
      ">" +
      opts +
      "</select></div>"
    );
  }
  const req = f.required ? " required" : "";
  const ph = f.placeholder ? " placeholder=\"" + escapeDrawerHtml(f.placeholder) + "\"" : "";
  const val = f.value ? " value=\"" + escapeDrawerHtml(f.value) + "\"" : "";
  if (f.kind === "text") {
    return (
      '<div class="wc-drawer-field">' +
      '<label class="wc-drawer-field-label" for="wc-df-' +
      idAttr +
      '">' +
      lab +
      "</label>" +
      '<input id="wc-df-' +
      idAttr +
      '" class="wc-drawer-input" type="text" data-wc-drawer-field="' +
      idAttr +
      '"' +
      ph +
      val +
      req +
      " />" +
      "</div>"
    );
  }
  const rows = typeof f.rows === "number" && f.rows > 0 ? f.rows : 4;
  const taVal = f.value ? escapeDrawerHtml(f.value) : "";
  return (
    '<div class="wc-drawer-field">' +
    '<label class="wc-drawer-field-label" for="wc-df-' +
    idAttr +
    '">' +
    lab +
    "</label>" +
    '<textarea id="wc-df-' +
    idAttr +
    '" class="wc-drawer-textarea" data-wc-drawer-field="' +
    idAttr +
    '" rows="' +
    String(rows) +
    '"' +
    ph +
    req +
    ">" +
    taVal +
    "</textarea></div>"
  );
}

/** Full inner markup for `#wc-drawer-host` (scrim + panel). */
export function renderDrawerFormHtml(spec: DrawerFormSpec): string {
  const desc =
    spec.descriptionHtml && spec.descriptionHtml.length > 0
      ? '<p class="wc-drawer-desc">' + spec.descriptionHtml + "</p>"
      : "";
  const fields = spec.fields.map(renderField).join("");
  return (
    '<div class="wc-drawer-scrim" data-wc-drawer-action="backdrop" aria-hidden="false"></div>' +
    '<div class="wc-drawer-panel" role="dialog" aria-modal="true" data-wc-drawer-workflow="' +
    escapeDrawerHtml(spec.workflowId) +
    '">' +
    '<header class="wc-drawer-header">' +
    "<h2 class=\"wc-drawer-title\">" +
    escapeDrawerHtml(spec.title) +
    "</h2>" +
    desc +
    "</header>" +
    '<div id="wc-drawer-validation" class="wc-drawer-validation" hidden></div>' +
    '<div class="wc-drawer-fields">' +
    fields +
    "</div>" +
    '<footer class="wc-drawer-footer">' +
    '<button type="button" class="wc-drawer-btn wc-drawer-btn-secondary" data-wc-drawer-action="cancel">' +
    escapeDrawerHtml(spec.cancelLabel) +
    "</button>" +
    '<button type="button" class="wc-drawer-btn wc-drawer-btn-primary" data-wc-drawer-action="submit">' +
    escapeDrawerHtml(spec.primaryLabel) +
    "</button>" +
    "</footer></div>"
  );
}

export function buildRegisterPhaseCatalogDrawerSpec(): DrawerFormSpec {
  return {
    workflowId: "register-phase-catalog",
    title: "Register future phase (catalog)",
    descriptionHtml:
      "Stable <code>phaseKey</code> must not sort before the current workspace phase. " +
      "Mutations still run through <code>upsert-phase-catalog-entry</code> on the host.",
    fields: [
      {
        id: "phaseKey",
        kind: "text",
        label: "Phase key",
        placeholder: "e.g. 92",
        required: true
      },
      {
        id: "shortDescription",
        kind: "textarea",
        label: "Short description (optional)",
        placeholder: "Operator-facing label",
        required: false,
        rows: 3
      }
    ],
    primaryLabel: "Upsert catalog row",
    cancelLabel: "Cancel"
  };
}

export function buildDismissPhaseNoteDrawerSpec(noteId: string, priority: string): DrawerFormSpec {
  const pri = priority.trim() || "normal";
  const crit = pri === "critical";
  return {
    workflowId: "dismiss-phase-note",
    title: "Dismiss phase note",
    descriptionHtml:
      "Audited dismiss — do not paste secrets. " +
      (crit
        ? "<b>Critical:</b> you will confirm in a modal after Submit, then kit runs with <code>policyApproval</code>."
        : ""),
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target",
        body:
          "<div><b>Note id:</b> " +
          escapeDrawerHtml(noteId) +
          "</div>" +
          "<div><b>Priority:</b> " +
          escapeDrawerHtml(pri) +
          "</div>"
      },
      {
        id: "reason",
        kind: "textarea",
        label: "Reason (required)",
        placeholder: "Short operator reason",
        required: true,
        rows: 3
      },
      {
        id: "policyRationale",
        kind: "textarea",
        label: crit ? "Policy rationale (required for critical)" : "Policy rationale (only if kit prompts)",
        placeholder: crit ? "Shown in policy trace / approval" : "Leave blank unless required",
        required: crit,
        rows: crit ? 3 : 2
      }
    ],
    primaryLabel: "Dismiss note",
    cancelLabel: "Cancel"
  };
}

export function buildViewPhaseNoteDrawerSpec(params: {
  noteId: string;
  noteType: string;
  priority: string;
  summary: string;
  details: string;
}): DrawerFormSpec {
  const summary = params.summary.trim();
  const details = params.details.trim();
  return {
    workflowId: "view-phase-note",
    title: "View phase note",
    descriptionHtml: "Read-only view for the selected phase note.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Note",
        body:
          "<div><b>Note id:</b> " +
          escapeDrawerHtml(params.noteId) +
          "</div>" +
          "<div><b>Type:</b> " +
          escapeDrawerHtml(params.noteType.trim() || "unknown") +
          "</div>" +
          "<div><b>Priority:</b> " +
          escapeDrawerHtml(params.priority.trim() || "normal") +
          "</div>"
      },
      {
        id: "summaryView",
        kind: "summary",
        label: "Subject",
        body: "<div>" + escapeDrawerHtml(summary || "(empty)") + "</div>"
      },
      {
        id: "detailsView",
        kind: "summary",
        label: "Body",
        body: "<div>" + escapeDrawerHtml(details || "(empty)") + "</div>"
      }
    ],
    primaryLabel: "Close",
    cancelLabel: "Cancel"
  };
}

export function buildEditPhaseNoteDrawerSpec(params: {
  noteId: string;
  summary: string;
  details: string;
}): DrawerFormSpec {
  return {
    workflowId: "edit-phase-note",
    title: "Edit phase note",
    descriptionHtml:
      "Runs <code>update-phase-note</code> for this note. Do not paste secrets — kit enforces secret-shaped validation.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target",
        body: "<div><b>Note id:</b> " + escapeDrawerHtml(params.noteId) + "</div>"
      },
      {
        id: "summary",
        kind: "textarea",
        label: "Subject (required)",
        placeholder: "Short note subject",
        required: true,
        rows: 3,
        value: params.summary
      },
      {
        id: "details",
        kind: "textarea",
        label: "Body (optional)",
        placeholder: "Additional details",
        required: false,
        rows: 4,
        value: params.details
      }
    ],
    primaryLabel: "Save",
    cancelLabel: "Cancel"
  };
}

export type DrawerValidationResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string };

/** Read values from drawer field ids; trim strings. */
export function normalizeDrawerValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    out[k] = typeof v === "string" ? v.trim() : String(v ?? "").trim();
  }
  return out;
}

export function validateRegisterPhaseCatalogSubmit(values: Record<string, string>): DrawerValidationResult {
  const phaseKey = (values.phaseKey ?? "").trim();
  if (!phaseKey) {
    return { ok: false, error: "Phase key is required." };
  }
  return {
    ok: true,
    values: { phaseKey, shortDescription: (values.shortDescription ?? "").trim() }
  };
}

/** Keys sent to `create-wishlist` (all required, non-empty). */
export const ADD_WISHLIST_FIELD_KEYS = [
  "title",
  "problemStatement",
  "expectedOutcome",
  "impact",
  "constraints",
  "successSignals",
  "requestor",
  "evidenceRef"
] as const;

export type AddWishlistFieldKey = (typeof ADD_WISHLIST_FIELD_KEYS)[number];

const ADD_WISHLIST_FIELD_SPECS: readonly {
  key: AddWishlistFieldKey;
  label: string;
  placeholder: string;
  /** Short title uses single-line input; the rest get a little vertical room. */
  kind: "text" | "textarea";
  rows?: number;
}[] = [
  { key: "title", label: "Short label", placeholder: "e.g. Faster cold start", kind: "text" },
  {
    key: "problemStatement",
    label: "What problem or gap this addresses",
    placeholder: "Problem / gap",
    kind: "textarea",
    rows: 2
  },
  {
    key: "expectedOutcome",
    label: "What done looks like",
    placeholder: "Expected outcome",
    kind: "textarea",
    rows: 2
  },
  { key: "impact", label: "Why it matters", placeholder: "Impact", kind: "textarea", rows: 2 },
  {
    key: "constraints",
    label: "Hard limits (time, compatibility, policy)",
    placeholder: "Constraints",
    kind: "textarea",
    rows: 2
  },
  {
    key: "successSignals",
    label: "Observable signals of success",
    placeholder: "Success signals",
    kind: "textarea",
    rows: 2
  },
  {
    key: "requestor",
    label: "Who is asking / accountable",
    placeholder: "Team or handle",
    kind: "textarea",
    rows: 2
  },
  {
    key: "evidenceRef",
    label: "Link or pointer to supporting context",
    placeholder: "Issue URL, doc path, …",
    kind: "textarea",
    rows: 2
  }
] as const;

export function buildAddWishlistDrawerSpec(): DrawerFormSpec {
  const fields: DrawerFormField[] = ADD_WISHLIST_FIELD_SPECS.map((f) =>
    f.kind === "text"
      ? {
          id: f.key,
          kind: "text" as const,
          label: f.label,
          placeholder: f.placeholder,
          required: true
        }
      : {
          id: f.key,
          kind: "textarea" as const,
          label: f.label,
          placeholder: f.placeholder,
          required: true,
          rows: f.rows ?? 3
        }
  );
  return {
    workflowId: "add-wishlist",
    title: "Add wishlist item",
    descriptionHtml:
      "All eight fields are required (same contract as <code>create-wishlist</code>). " +
      "Do not paste secrets — this is operator-facing intake.",
    fields,
    primaryLabel: "Create wishlist",
    cancelLabel: "Cancel"
  };
}

export function validateAddWishlistSubmit(values: Record<string, string>): DrawerValidationResult {
  const out: Record<string, string> = {};
  for (const key of ADD_WISHLIST_FIELD_KEYS) {
    const v = (values[key] ?? "").trim();
    if (!v) {
      return { ok: false, error: `Field "${key}" is required (non-empty).` };
    }
    out[key] = v;
  }
  return { ok: true, values: out };
}

/** Mirrors kit `PHASE_NOTE_TYPES` / `PHASE_NOTE_PRIORITIES` (phase-journal-constants). */
export const ADD_PHASE_NOTE_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Choose note type…" },
  { value: "finding", label: "finding — observed fact or outcome" },
  { value: "gotcha", label: "gotcha — operational caution" },
  { value: "decision", label: "decision — recorded decision" },
  { value: "blocker", label: "blocker — blocking issue" },
  { value: "follow-up", label: "follow-up — follow-up work or decision" },
  { value: "task-suggestion", label: "task-suggestion — candidate task from phase context" },
  { value: "risk", label: "risk — release or execution risk" },
  { value: "reusable-context", label: "reusable-context — durable context pointer" }
];

const ADD_PHASE_NOTE_PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Choose priority…" },
  { value: "low", label: "low" },
  { value: "normal", label: "normal" },
  { value: "high", label: "high" },
  { value: "critical", label: "critical" }
];

const PHASE_NOTE_SUMMARY_MAX = 280;
const PHASE_NOTE_DETAILS_MAX = 1200;

const ALLOWED_ADD_PHASE_NOTE_TYPES = new Set(
  ADD_PHASE_NOTE_TYPE_OPTIONS.map((o) => o.value).filter((v) => v.length > 0)
);
const ALLOWED_ADD_PHASE_NOTE_PRIORITIES = new Set(
  ADD_PHASE_NOTE_PRIORITY_OPTIONS.map((o) => o.value).filter((v) => v.length > 0)
);

export function buildAddPhaseNoteDrawerSpec(phaseKey: string): DrawerFormSpec {
  const pk = phaseKey.trim();
  return {
    workflowId: "add-phase-note",
    title: "Add phase note",
    descriptionHtml:
      "Runs <code>add-phase-note</code> for phase <code>" +
      escapeDrawerHtml(pk) +
      "</code>. Do not paste secrets — kit rejects secret-shaped patterns.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target phase",
        body: "<div><b>phaseKey:</b> " + escapeDrawerHtml(pk) + "</div>"
      },
      {
        id: "noteType",
        kind: "select",
        label: "Note type",
        options: [...ADD_PHASE_NOTE_TYPE_OPTIONS],
        required: false
      },
      {
        id: "summary",
        kind: "textarea",
        label: "Summary (required)",
        placeholder: "Short note for the current phase",
        required: true,
        rows: 3
      },
      {
        id: "priority",
        kind: "select",
        label: "Priority",
        options: [...ADD_PHASE_NOTE_PRIORITY_OPTIONS],
        required: false
      },
      {
        id: "details",
        kind: "textarea",
        label: "Details (optional)",
        placeholder: "Leave blank for summary-only note",
        required: false,
        rows: 4
      }
    ],
    primaryLabel: "Add note",
    cancelLabel: "Cancel"
  };
}

export function validateAddPhaseNoteSubmit(values: Record<string, string>): DrawerValidationResult {
  const noteType = (values.noteType ?? "").trim();
  if (!noteType || !ALLOWED_ADD_PHASE_NOTE_TYPES.has(noteType)) {
    return { ok: false, error: "Choose a valid note type." };
  }
  const priority = (values.priority ?? "").trim();
  if (!priority || !ALLOWED_ADD_PHASE_NOTE_PRIORITIES.has(priority)) {
    return { ok: false, error: "Choose a valid priority." };
  }
  const summary = (values.summary ?? "").trim();
  if (!summary) {
    return { ok: false, error: "Summary is required." };
  }
  if (summary.length > PHASE_NOTE_SUMMARY_MAX) {
    return { ok: false, error: `Summary must be at most ${String(PHASE_NOTE_SUMMARY_MAX)} characters.` };
  }
  const details = (values.details ?? "").trim();
  if (details.length > PHASE_NOTE_DETAILS_MAX) {
    return { ok: false, error: `Details must be at most ${String(PHASE_NOTE_DETAILS_MAX)} characters.` };
  }
  return { ok: true, values: { noteType, summary, priority, details } };
}

export function buildConvertPhaseNoteDrawerSpec(noteId: string): DrawerFormSpec {
  return {
    workflowId: "convert-phase-note",
    title: "Convert phase note to proposed task",
    descriptionHtml:
      "Runs <code>convert-phase-note-to-task</code> on the host. <b>Cancel</b> leaves the note unchanged.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target",
        body:
          "<div><b>Note id:</b> " +
          escapeDrawerHtml(noteId) +
          "</div>" +
          "<p style=\"margin:8px 0 0 0\">Creates a <b>proposed</b> task when this note type is eligible.</p>"
      }
    ],
    primaryLabel: "Convert to task",
    cancelLabel: "Cancel"
  };
}

export function buildPersistPhaseNoteProposalsDrawerSpec(): DrawerFormSpec {
  return {
    workflowId: "persist-phase-note-proposals",
    title: "Persist phase note proposals",
    descriptionHtml:
      "Runs <code>propose-tasks-from-phase-notes</code> with <code>persist:true</code>. " +
      "<b>Cancel</b> performs no kit mutation.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Effect",
        body:
          "<p>Writable kit task suggestions are created from convertible active phase notes " +
          "(for example <code>task-suggestion</code> / <code>follow-up</code>).</p>"
      }
    ],
    primaryLabel: "Persist proposals",
    cancelLabel: "Cancel"
  };
}

const ASSIGN_PHASE_CUSTOM = "__custom__";

export type PhaseKeySuggestion = { label: string; phaseKey: string };

export function buildAssignTaskPhaseDrawerSpec(
  taskId: string,
  suggestions: PhaseKeySuggestion[],
  valueHint?: string
): DrawerFormSpec {
  const options: Array<{ value: string; label: string }> = [
    { value: "", label: "Choose phase target…" },
    ...suggestions.map((s) => ({ value: s.phaseKey, label: `${s.label} (${s.phaseKey})` })),
    { value: ASSIGN_PHASE_CUSTOM, label: "Enter another phase key…" }
  ];
  return {
    workflowId: "assign-task-phase",
    title: `Set phase for ${taskId}`,
    descriptionHtml:
      "Runs <code>assign-task-phase</code> on the host with the current planning generation. " +
      "Pick a suggested key or choose custom. Optionally record the phase deliverable; " +
      "if the phase has no catalog row yet, one will be created.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Task",
        body: "<div><b>Task id:</b> " + escapeDrawerHtml(taskId) + "</div>"
      },
      {
        id: "phaseSelect",
        kind: "select",
        label: "Phase",
        options,
        required: false
      },
      {
        id: "phaseKeyCustom",
        kind: "text",
        label: "Custom phase key",
        placeholder: "Stable kit phase key",
        required: false,
        value: valueHint?.trim() ?? ""
      },
      {
        id: "shortDescription",
        kind: "text",
        label: "Phase deliverable (optional)",
        placeholder: "Short description; creates/updates kit_phase_catalog row",
        required: false,
        value: ""
      }
    ],
    primaryLabel: "Assign phase",
    cancelLabel: "Cancel"
  };
}

export function validateAssignTaskPhaseSubmit(values: Record<string, string>): DrawerValidationResult {
  const sel = (values.phaseSelect ?? "").trim();
  const custom = (values.phaseKeyCustom ?? "").trim();
  const shortDescription = (values.shortDescription ?? "").trim();
  if (!sel) {
    return { ok: false, error: 'Choose a phase target or select "Enter another phase key…".' };
  }
  let phaseKey: string;
  if (sel === ASSIGN_PHASE_CUSTOM) {
    if (!custom) {
      return { ok: false, error: "Enter a non-empty custom phase key." };
    }
    phaseKey = custom;
  } else {
    phaseKey = sel;
  }
  const out: Record<string, string> = { phaseKey };
  if (shortDescription) {
    out.shortDescription = shortDescription;
  }
  return { ok: true, values: out };
}

export type AcceptProposedDrawerParams = {
  taskIds: string[];
  /** Proposed-row category label (batch only); may be empty for single-task flow. */
  categoryLabel: string;
  suggestions: PhaseKeySuggestion[];
};

export function buildAcceptProposedDrawerSpec(params: AcceptProposedDrawerParams): DrawerFormSpec {
  const { taskIds, categoryLabel, suggestions } = params;
  const n = taskIds.length;
  const options: Array<{ value: string; label: string }> = [
    { value: "", label: "Choose phase target…" },
    ...suggestions.map((s) => ({ value: s.phaseKey, label: `${s.label} (${s.phaseKey})` })),
    { value: ASSIGN_PHASE_CUSTOM, label: "Enter another phase key…" }
  ];
  const cat = categoryLabel.trim() || "proposed";
  const idsBody =
    n === 1
      ? "<div><b>Task:</b> " + escapeDrawerHtml(taskIds[0] ?? "") + "</div>"
      : "<div><b>Tasks (" +
        String(n) +
        ", " +
        escapeDrawerHtml(cat) +
        "):</b> " +
        escapeDrawerHtml(taskIds.join(", ")) +
        "</div>";
  const safeTitle =
    n === 1
      ? `Accept proposed task ${taskIds[0] ?? ""}`
      : `Accept ${String(n)} proposed ${cat} tasks`;
  return {
    workflowId: "accept-proposed",
    title: safeTitle,
    descriptionHtml:
      "Runs <code>run-transition</code> <code>accept</code> then <code>assign-task-phase</code> for each row. " +
      (n > 1
        ? "One shared policy rationale is used for every <code>accept</code> in this batch."
        : "Requires a non-empty policy rationale for the transition."),
    fields: [
      { id: "ctx", kind: "summary", label: "Scope", body: idsBody },
      {
        id: "phaseSelect",
        kind: "select",
        label: "Target phase",
        options,
        required: false
      },
      {
        id: "phaseKeyCustom",
        kind: "text",
        label: "Custom phase key",
        placeholder: 'When using "Enter another phase key…"',
        required: false,
        value: ""
      },
      {
        id: "policyRationale",
        kind: "textarea",
        label: "Policy rationale (required)",
        placeholder: "Shown in policy trace / approval for run-transition accept",
        required: true,
        rows: 3
      }
    ],
    primaryLabel: n === 1 ? "Accept and assign phase" : "Accept all and assign phase",
    cancelLabel: "Cancel"
  };
}

export function validateAcceptProposedSubmit(values: Record<string, string>): DrawerValidationResult {
  const phase = validateAssignTaskPhaseSubmit(values);
  if (!phase.ok) {
    return phase;
  }
  const policyRationale = (values.policyRationale ?? "").trim();
  if (!policyRationale) {
    return {
      ok: false,
      error: "Policy rationale is required for accept (shown in policy trace / approval)."
    };
  }
  return { ok: true, values: { phaseKey: phase.values.phaseKey, policyRationale } };
}

export function validateDismissPhaseNoteSubmit(
  priority: string,
  values: Record<string, string>
): DrawerValidationResult {
  const reason = (values.reason ?? "").trim();
  if (!reason) {
    return { ok: false, error: "Reason is required." };
  }
  const pri = priority.trim() || "normal";
  const rationale = (values.policyRationale ?? "").trim();
  if (pri === "critical" && !rationale) {
    return { ok: false, error: "Critical dismiss requires a non-empty policy rationale." };
  }
  return { ok: true, values: { reason, policyRationale: rationale } };
}

export function validateEditPhaseNoteSubmit(values: Record<string, string>): DrawerValidationResult {
  const summary = (values.summary ?? "").trim();
  if (!summary) {
    return { ok: false, error: "Subject is required." };
  }
  if (summary.length > PHASE_NOTE_SUMMARY_MAX) {
    return { ok: false, error: `Subject must be at most ${String(PHASE_NOTE_SUMMARY_MAX)} characters.` };
  }
  const details = (values.details ?? "").trim();
  if (details.length > PHASE_NOTE_DETAILS_MAX) {
    return { ok: false, error: `Body must be at most ${String(PHASE_NOTE_DETAILS_MAX)} characters.` };
  }
  return { ok: true, values: { summary, details } };
}

export type GuidanceCaeMutationDrawerParams = {
  command: string;
  target: string;
  fallbackNote: string;
  defaultActor: string;
};

/** CAE authoring panel — confirm rationale + single primary action (replaces native input + modal). */
export function buildGuidanceCaeMutationDrawerSpec(p: GuidanceCaeMutationDrawerParams): DrawerFormSpec {
  const body =
    "<b>Command</b> <code>" +
    escapeDrawerHtml(p.command) +
    "</code> · <b>Target</b> <code>" +
    escapeDrawerHtml(p.target) +
    "</code><br/>" +
    "This records <code>caeMutationApproval</code> for the CAE registry mutation — <em>not</em> Tier A/B <code>policyApproval</code> on <code>wk run</code>.<br/>" +
    "<b>Actor</b> <code>" +
    escapeDrawerHtml(p.defaultActor) +
    "</code> (from environment; included on the payload).";
  return {
    workflowId: "guidance-cae-mutation",
    title: "Confirm CAE mutation",
    descriptionHtml: body,
    fields: [
      {
        id: "rationale",
        kind: "textarea",
        label: "Rationale (required)",
        placeholder: "Why should this command run?",
        required: true,
        rows: 4,
        value: p.fallbackNote
      }
    ],
    primaryLabel: "Run mutation",
    cancelLabel: "Cancel"
  };
}

export function validateGuidanceCaeMutationSubmit(values: Record<string, string>): DrawerValidationResult {
  const rationale = (values.rationale ?? "").trim();
  if (!rationale) {
    return { ok: false, error: "Rationale is required before running the CAE mutation." };
  }
  return { ok: true, values: { rationale } };
}

/** CAE sidebar (Guidance view) — acknowledge trace read. */
export function buildGuidanceAckDrawerSpec(p: {
  traceId: string;
  activationId: string;
  defaultActor: string;
}): DrawerFormSpec {
  return {
    workflowId: "guidance-sidebar-ack",
    title: "Record acknowledgement",
    descriptionHtml:
      "Records that you read this guidance. It is <b>not</b> Tier A/B <code>policyApproval</code> for another sensitive <code>wk run</code>.<br/>" +
      "<b>Trace</b> <code>" +
      escapeDrawerHtml(p.traceId) +
      "</code> · <b>Activation</b> <code>" +
      escapeDrawerHtml(p.activationId) +
      "</code>",
    fields: [
      {
        id: "actor",
        kind: "text",
        label: "Actor",
        required: true,
        value: p.defaultActor
      }
    ],
    primaryLabel: "Record acknowledgement",
    cancelLabel: "Cancel"
  };
}

export function validateGuidanceAckSubmit(values: Record<string, string>): DrawerValidationResult {
  const actor = (values.actor ?? "").trim();
  if (!actor) {
    return { ok: false, error: "Actor is required." };
  }
  return { ok: true, values: { actor } };
}

/** CAE sidebar — shadow feedback (cae-record-shadow-feedback uses command policy approval). */
export function buildGuidanceShadowFeedbackDrawerSpec(p: {
  signal: "useful" | "noisy";
  traceId: string;
  activationId: string;
  commandName: string;
  defaultActor: string;
}): DrawerFormSpec {
  const lab = p.signal === "useful" ? "Useful" : "Noisy";
  return {
    workflowId: "guidance-sidebar-feedback",
    title: `Mark Guidance ${lab} (shadow)`,
    descriptionHtml:
      "Records shadow feedback for CAE tuning. The kit command may require its own <code>policyApproval</code> envelope — separate from CAE registry <code>caeMutationApproval</code>.<br/>" +
      "<b>Trace</b> <code>" +
      escapeDrawerHtml(p.traceId) +
      "</code> · <b>Activation</b> <code>" +
      escapeDrawerHtml(p.activationId) +
      "</code> · <b>Command</b> <code>" +
      escapeDrawerHtml(p.commandName) +
      "</code>",
    fields: [
      { id: "actor", kind: "text", label: "Actor", required: true, value: p.defaultActor },
      {
        id: "note",
        kind: "textarea",
        label: "Optional note",
        required: false,
        rows: 3,
        value: "",
        placeholder: "What made this Guidance useful or noisy?"
      }
    ],
    primaryLabel: `Mark ${lab}`,
    cancelLabel: "Cancel"
  };
}

export function validateGuidanceShadowFeedbackSubmit(values: Record<string, string>): DrawerValidationResult {
  const actor = (values.actor ?? "").trim();
  if (!actor) {
    return { ok: false, error: "Actor is required." };
  }
  const note = (values.note ?? "").trim();
  return { ok: true, values: { actor, note } };
}

export type GuidanceRegistryVersionDrawerParams = {
  command: string;
  actionLabel: string;
  targetSummaryPlain: string;
  needsDraftVersionId: boolean;
  draftVersionDefault: string;
  defaultActor: string;
};

export function buildGuidanceRegistryVersionMutationDrawerSpec(
  p: GuidanceRegistryVersionDrawerParams
): DrawerFormSpec {
  const fields: DrawerFormField[] = [
    {
      id: "rationale",
      kind: "textarea",
      label: "Rationale (required)",
      required: true,
      rows: 4,
      placeholder: "Why is this guidance-set change needed?",
      value: ""
    },
    {
      id: "actor",
      kind: "text",
      label: "Actor",
      required: true,
      value: p.defaultActor
    }
  ];
  if (p.needsDraftVersionId) {
    fields.push({
      id: "draftVersionId",
      kind: "text",
      label: "New draft version id",
      required: true,
      value: p.draftVersionDefault,
      placeholder: "cae.reg.draft.…"
    });
  }
  return {
    workflowId: "guidance-sidebar-registry-version",
    title: "Confirm CAE guidance-set change",
    descriptionHtml:
      "<b>Action</b> " +
      escapeDrawerHtml(p.actionLabel) +
      " · <b>Command</b> <code>" +
      escapeDrawerHtml(p.command) +
      "</code><br/>" +
      escapeDrawerHtml(p.targetSummaryPlain) +
      "<br/>Payload uses <code>caeMutationApproval</code> (CAE governance lane) — <em>not</em> Tier A/B <code>policyApproval</code> on arbitrary <code>wk run</code>.",
    fields,
    primaryLabel: "Run mutation",
    cancelLabel: "Cancel"
  };
}

export function validateGuidanceRegistryVersionMutationSubmit(
  values: Record<string, string>,
  needsDraft: boolean
): DrawerValidationResult {
  const rationale = (values.rationale ?? "").trim();
  if (!rationale) {
    return { ok: false, error: "Rationale is required." };
  }
  const actor = (values.actor ?? "").trim();
  if (!actor) {
    return { ok: false, error: "Actor is required." };
  }
  if (needsDraft) {
    const draftVersionId = (values.draftVersionId ?? "").trim();
    if (!draftVersionId) {
      return { ok: false, error: "Draft version id is required for clone." };
    }
    return { ok: true, values: { rationale, actor, draftVersionId } };
  }
  return { ok: true, values: { rationale, actor } };
}
