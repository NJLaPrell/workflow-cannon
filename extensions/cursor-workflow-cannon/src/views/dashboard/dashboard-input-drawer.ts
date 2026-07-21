/**
 * Dashboard in-webview input drawer (Phase 91 contract).
 *
 * Dashboard-originated operator intent for kit mutations should prefer this drawer
 * (`#wc-drawer-host` + `wcDrawerOpen` / `drawerSubmit` messages) over
 * `vscode.window.showInputBox` / `showQuickPick` so users stay inside the sidebar webview.
 */

import { appendElevatedPolicyExplainer } from "../../policy/dashboard-policy-tier.js";
import { shouldCollectPolicyRationaleInDrawer } from "../../policy/dashboard-policy-path.js";
import {
  ASSIGN_PHASE_BACKLOG,
  ASSIGN_PHASE_CUSTOM,
  buildPhaseKeySuggestion,
  sortPhaseKeySuggestions,
  type PhaseKeySuggestion
} from "../phase-select-options.js";

export type { PhaseKeySuggestion };

export function escapeDrawerHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function titleCaseWords(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
      value?: string;
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
  /** When set, webview uses this for batch drawer busy labels (accept-all, etc.). */
  taskCount?: number;
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
    const selectedValue = (f.value ?? "").trim();
    const opts = f.options
      .map((o) => {
        const selected = selectedValue.length > 0 && o.value === selectedValue ? " selected" : "";
        return (
          '<option value="' +
          escapeDrawerHtml(o.value) +
          '"' +
          selected +
          ">" +
          escapeDrawerHtml(o.label) +
          "</option>"
        );
      })
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
  const taskCountAttr =
    typeof spec.taskCount === "number" && Number.isFinite(spec.taskCount) && spec.taskCount > 0
      ? ' data-wc-drawer-task-count="' + String(Math.floor(spec.taskCount)) + '"'
      : "";
  return (
    '<div class="wc-drawer-scrim" data-wc-drawer-action="backdrop" aria-hidden="false"></div>' +
    '<div class="wc-drawer-panel" role="dialog" aria-modal="true" data-wc-drawer-workflow="' +
    escapeDrawerHtml(spec.workflowId) +
    '"' +
    taskCountAttr +
    ">" +
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
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-drawer-action="cancel">' +
    escapeDrawerHtml(spec.cancelLabel) +
    "</button>" +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-drawer-action="submit">' +
    escapeDrawerHtml(spec.primaryLabel) +
    "</button>" +
    "</footer></div>"
  );
}

export function buildRegisterPhaseCatalogDrawerSpec(): DrawerFormSpec {
  return {
    workflowId: "register-phase-catalog",
    title: "Register Phase",
    descriptionHtml:
      "Add a phase to the roster. The phase number must not be earlier than your current phase.",
    fields: [
      {
        id: "phaseKey",
        kind: "text",
        label: "Phase",
        placeholder: "e.g. 92",
        required: true
      },
      {
        id: "shortDescription",
        kind: "textarea",
        label: "Deliverables (Optional)",
        placeholder: "Short description for this phase",
        required: false,
        rows: 3
      }
    ],
    primaryLabel: "Save Phase",
    cancelLabel: "Cancel"
  };
}

export function buildDismissPhaseNoteDrawerSpec(noteId: string, priority: string): DrawerFormSpec {
  const pri = priority.trim() || "normal";
  const crit = pri === "critical";
  return {
    workflowId: "dismiss-phase-note",
    title: "Dismiss phase note",
    descriptionHtml: appendElevatedPolicyExplainer(
      "Audited dismiss — do not paste secrets. " +
        (crit
          ? "You will confirm in a modal after Submit, then kit runs with <code>policyApproval</code>."
          : "Routine tier: policy rationale is filled automatically on submit."),
      "dismiss-phase-note",
      crit ? "critical" : "normal"
    ),
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
      ...(crit
        ? policyRationaleDrawerFields(
            "dismiss-phase-note",
            "critical",
            "Policy rationale (required for critical)",
            "Shown in policy trace / approval"
          )
        : [])
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
    title: "Add Wishlist Item",
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

const IDEA_TITLE_MAX = 180;
const IDEA_NOTE_MAX = 1200;

/** New Idea drawer — same fields as the former inline Ideas create form. */
export function buildAddIdeaDrawerSpec(): DrawerFormSpec {
  return {
    workflowId: "add-idea",
    title: "New Idea",
    descriptionHtml: "Capture a short idea title and optional note. Do not paste secrets.",
    fields: [
      {
        id: "title",
        kind: "text",
        label: "Title",
        placeholder: "Title",
        required: true
      },
      {
        id: "note",
        kind: "textarea",
        label: "Note (optional)",
        placeholder: "Optional note",
        required: false,
        rows: 3
      }
    ],
    primaryLabel: "Add idea",
    cancelLabel: "Cancel"
  };
}

export function validateAddIdeaSubmit(values: Record<string, string>): DrawerValidationResult {
  const title = (values.title ?? "").trim();
  if (!title) {
    return { ok: false, error: "Title is required." };
  }
  if (title.length > IDEA_TITLE_MAX) {
    return { ok: false, error: `Title must be at most ${String(IDEA_TITLE_MAX)} characters.` };
  }
  const note = (values.note ?? "").trim();
  if (note.length > IDEA_NOTE_MAX) {
    return { ok: false, error: `Note must be at most ${String(IDEA_NOTE_MAX)} characters.` };
  }
  return { ok: true, values: { title, note } };
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
    title: "Add Phase Note",
    descriptionHtml:
      "Add a note for phase <code>" +
      escapeDrawerHtml(pk) +
      "</code>. Do not paste secrets or credentials.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target Phase",
        body: "<div><b>Phase:</b> " + escapeDrawerHtml(pk) + "</div>"
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
    primaryLabel: "Add Note",
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

export function buildAssignTaskPhaseDrawerSpec(
  taskId: string,
  suggestions: PhaseKeySuggestion[],
  defaultPhaseKey?: string
): DrawerFormSpec {
  const defaultPk = (defaultPhaseKey ?? "").trim();
  let sorted = sortPhaseKeySuggestions(suggestions);
  if (defaultPk && !sorted.some((s) => s.phaseKey === defaultPk)) {
    sorted = sortPhaseKeySuggestions([...sorted, buildPhaseKeySuggestion(defaultPk)]);
  }
  const options: Array<{ value: string; label: string }> = [
    ...(defaultPk ? [] : [{ value: "", label: "Choose phase target…" }]),
    { value: ASSIGN_PHASE_BACKLOG, label: "Move to Backlog" },
    ...sorted.map((s) => ({ value: s.phaseKey, label: s.label }))
  ];
  return {
    workflowId: "assign-task-phase",
    title: `Set Phase for ${taskId}`,
    descriptionHtml: "Choose a phase for this task, or move it to the backlog.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Scope",
        body: escapeDrawerHtml(taskId)
      },
      {
        id: "phaseSelect",
        kind: "select",
        label: "Phase",
        options,
        required: false,
        value: defaultPk || undefined
      }
    ],
    primaryLabel: "Set Phase",
    cancelLabel: "Cancel"
  };
}

export function validateAssignTaskPhaseSubmit(values: Record<string, string>): DrawerValidationResult {
  const sel = (values.phaseSelect ?? "").trim();
  if (!sel) {
    return {
      ok: false,
      error: 'Choose a phase or "Move to Backlog".'
    };
  }
  if (sel === ASSIGN_PHASE_BACKLOG) {
    return { ok: true, values: { moveToBacklog: "true" } };
  }
  if (sel === ASSIGN_PHASE_CUSTOM) {
    return { ok: false, error: "Choose a listed phase or Move to Backlog." };
  }
  return { ok: true, values: { phaseKey: sel } };
}

export type AcceptProposedDrawerParams = {
  taskIds: string[];
  /** Proposed-row category label (batch only); may be empty for single-task flow. */
  categoryLabel: string;
  suggestions: PhaseKeySuggestion[];
  /** Pre-select target phase from the proposal bucket or task row. */
  defaultPhaseKey?: string;
};

export function buildAcceptProposedDrawerSpec(params: AcceptProposedDrawerParams): DrawerFormSpec {
  const { taskIds, categoryLabel, suggestions, defaultPhaseKey } = params;
  const n = taskIds.length;
  const defaultPk = (defaultPhaseKey ?? "").trim();
  let sorted = sortPhaseKeySuggestions(suggestions);
  if (defaultPk && !sorted.some((s) => s.phaseKey === defaultPk)) {
    sorted = sortPhaseKeySuggestions([...sorted, buildPhaseKeySuggestion(defaultPk)]);
  }
  const options: Array<{ value: string; label: string }> = [
    ...(defaultPk ? [] : [{ value: "", label: "Choose phase target…" }]),
    ...sorted.map((s) => ({ value: s.phaseKey, label: s.label }))
  ];
  const cat = categoryLabel.trim() || "proposed";
  const catTitle = titleCaseWords(cat);
  const idsBody =
    n === 1
      ? "<div><b>Task:</b> " + escapeDrawerHtml(taskIds[0] ?? "") + "</div>"
      : "<div>Tasks (" +
        String(n) +
        ", " +
        escapeDrawerHtml(cat) +
        "): " +
        escapeDrawerHtml(taskIds.join(", ")) +
        "</div>";
  const safeTitle =
    n === 1
      ? `Accept Proposed Task ${taskIds[0] ?? ""}`
      : `Accept ${String(n)} Proposed ${catTitle} Tasks`;
  const descriptionHtml =
    n > 1
      ? "<p><b>Batch accept.</b> You are promoting multiple proposed tasks in one submit.</p>"
      : undefined;
  return {
    workflowId: "accept-proposed",
    title: safeTitle,
    descriptionHtml,
    taskCount: n,
    fields: [
      { id: "ctx", kind: "summary", label: "Scope", body: idsBody },
      {
        id: "phaseSelect",
        kind: "select",
        label: "Target phase",
        options,
        required: false,
        value: defaultPk || undefined
      }
    ],
    primaryLabel: n === 1 ? "Accept" : "Accept All",
    cancelLabel: "Cancel"
  };
}

export function validateAcceptProposedSubmit(values: Record<string, string>): DrawerValidationResult {
  const phase = validateAssignTaskPhaseSubmit(values);
  if (!phase.ok) {
    return phase;
  }
  if (phase.values.moveToBacklog === "true") {
    return {
      ok: false,
      error: "Accept requires a target phase. Use Set Phase on the task row to move it to backlog."
    };
  }
  return {
    ok: true,
    values: { phaseKey: phase.values.phaseKey }
  };
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
  const policyErr =
    pri === "critical" ? validateDrawerPolicyRationale("dismiss-phase-note", "critical", values) : null;
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const rationale = (values.policyRationale ?? "").trim();
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

export type GuidanceLibraryIdentityDrawerMode = "create" | "duplicate";

const GUIDANCE_LIBRARY_ARTIFACT_TYPE_OPTIONS = [
  "playbook",
  "runbook",
  "checklist",
  "review-template",
  "reasoning-template",
  "policy-doc"
] as const;

export type GuidanceLibraryIdentityDrawerParams = {
  mode: GuidanceLibraryIdentityDrawerMode;
  sourceArtifactId?: string;
  defaultArtifactType?: string;
  defaultArtifactId?: string;
  defaultTitle?: string;
  defaultSlug?: string;
};

/** Dashboard CAE Library — identity-only create/duplicate (no markdown body field). */
export function buildGuidanceLibraryIdentityDrawerSpec(p: GuidanceLibraryIdentityDrawerParams): DrawerFormSpec {
  const isDuplicate = p.mode === "duplicate";
  const fields: DrawerFormField[] = [];
  if (isDuplicate && p.sourceArtifactId) {
    fields.push({
      id: "sourceArtifactId",
      kind: "summary",
      label: "Source",
      body: `<code>${escapeDrawerHtml(p.sourceArtifactId)}</code>`
    });
  }
  if (!isDuplicate) {
    fields.push({
      id: "artifactType",
      kind: "select",
      label: "Type",
      required: true,
      value: p.defaultArtifactType ?? "playbook",
      options: GUIDANCE_LIBRARY_ARTIFACT_TYPE_OPTIONS.map((artifactType) => ({
        value: artifactType,
        label: artifactType
      }))
    });
  }
  fields.push(
    {
      id: "artifactId",
      kind: "text",
      label: "Artifact ID",
      required: true,
      placeholder: "workspace.example.playbook",
      value: p.defaultArtifactId ?? ""
    },
    {
      id: "title",
      kind: "text",
      label: isDuplicate ? "Title (optional)" : "Title",
      required: !isDuplicate,
      placeholder: "Example Playbook",
      value: p.defaultTitle ?? ""
    },
    {
      id: "slug",
      kind: "text",
      label: "Path slug (optional)",
      placeholder: "example-playbook",
      value: p.defaultSlug ?? ""
    }
  );
  return {
    workflowId: isDuplicate ? "guidance-library-duplicate" : "guidance-library-create",
    title: isDuplicate ? "Duplicate to workspace" : "Create workspace artifact",
    descriptionHtml: isDuplicate
      ? "Copy the source body into a new <code>workspace.*</code> artifact. Markdown editing stays on disk after create — no webview body field."
      : "Create a new <code>workspace.*</code> artifact with a default <code># title</code> body. Edit markdown in the editor after create — no webview body field.",
    fields,
    primaryLabel: "Continue",
    cancelLabel: "Cancel"
  };
}

export function validateGuidanceLibraryIdentitySubmit(
  mode: GuidanceLibraryIdentityDrawerMode,
  values: Record<string, string>
): DrawerValidationResult {
  const artifactId = (values.artifactId ?? "").trim();
  if (!artifactId) {
    return { ok: false, error: "Artifact ID is required." };
  }
  if (!artifactId.startsWith("workspace.")) {
    return { ok: false, error: "Artifact ID must start with workspace." };
  }
  const slug = (values.slug ?? "").trim();
  if (mode === "create") {
    const artifactType = (values.artifactType ?? "").trim();
    if (!artifactType) {
      return { ok: false, error: "Artifact type is required." };
    }
    if (!GUIDANCE_LIBRARY_ARTIFACT_TYPE_OPTIONS.includes(artifactType as (typeof GUIDANCE_LIBRARY_ARTIFACT_TYPE_OPTIONS)[number])) {
      return { ok: false, error: "Choose a supported workspace artifact type." };
    }
    const title = (values.title ?? "").trim();
    if (!title) {
      return { ok: false, error: "Title is required." };
    }
    return { ok: true, values: { artifactId, artifactType, title, slug } };
  }
  const title = (values.title ?? "").trim();
  return { ok: true, values: { artifactId, title, slug } };
}

/** Guidance acknowledge trace read (drawer spec; optional host surfaces). */
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

/** Guidance shadow feedback (cae-record-shadow-feedback uses command policy approval). */
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

const TEAM_TASK_ID_RE = /^T\d+$/i;
const TEAM_POLICY_RATIONALE_MIN = 8;

function validateTeamPolicyRationale(values: Record<string, string>): string | null {
  const rationale = (values.policyRationale ?? "").trim();
  if (rationale.length < TEAM_POLICY_RATIONALE_MIN) {
    return `Policy rationale must be at least ${String(TEAM_POLICY_RATIONALE_MIN)} characters.`;
  }
  return null;
}

function policyRationaleDrawerFields(
  workflowId: string,
  action: string,
  label = "Policy rationale",
  placeholder = "Shown in policy trace / approval"
): DrawerFormField[] {
  if (!shouldCollectPolicyRationaleInDrawer(workflowId, action)) {
    return [];
  }
  return [
    {
      id: "policyRationale",
      kind: "textarea",
      label,
      placeholder,
      required: true,
      rows: 3
    }
  ];
}

function validateDrawerPolicyRationale(
  workflowId: string,
  action: string,
  values: Record<string, string>
): string | null {
  if (!shouldCollectPolicyRationaleInDrawer(workflowId, action)) {
    return null;
  }
  return validateTeamPolicyRationale(values);
}

export function buildRegisterTeamAssignmentDrawerSpec(): DrawerFormSpec {
  return {
    workflowId: "register-team-assignment",
    title: "Create team assignment",
    descriptionHtml:
      "Runs <code>register-assignment</code>. The execution task must already exist in the task store. " +
      "Supervisor and worker ids are stable handles (e.g. <code>operator</code>, agent tab id).",
    fields: [
      {
        id: "executionTaskId",
        kind: "text",
        label: "Execution task id",
        placeholder: "T665",
        required: true
      },
      {
        id: "supervisorId",
        kind: "text",
        label: "Supervisor id",
        placeholder: "operator",
        required: true,
        value: "operator"
      },
      {
        id: "workerId",
        kind: "text",
        label: "Worker id",
        placeholder: "agent-tab-1",
        required: true
      },
      ...policyRationaleDrawerFields(
        "register-team-assignment",
        "register",
        "Policy rationale",
        "Why this handoff is being registered"
      )
    ],
    primaryLabel: "Register assignment",
    cancelLabel: "Cancel"
  };
}

export function validateRegisterTeamAssignmentSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("register-team-assignment", "register", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const executionTaskId = (values.executionTaskId ?? "").trim().toUpperCase();
  if (!TEAM_TASK_ID_RE.test(executionTaskId)) {
    return { ok: false, error: "Execution task id must look like T###." };
  }
  const supervisorId = (values.supervisorId ?? "").trim();
  const workerId = (values.workerId ?? "").trim();
  if (!supervisorId || !workerId) {
    return { ok: false, error: "Supervisor id and worker id are required." };
  }
  return {
    ok: true,
    values: {
      executionTaskId,
      supervisorId,
      workerId,
      policyRationale: (values.policyRationale ?? "").trim()
    }
  };
}

export function buildSubmitTeamHandoffDrawerSpec(p: {
  assignmentId: string;
  workerId: string;
}): DrawerFormSpec {
  return {
    workflowId: "submit-team-handoff",
    title: "Submit worker handoff",
    descriptionHtml:
      "Runs <code>submit-assignment-handoff</code> for assignment <code>" +
      escapeDrawerHtml(p.assignmentId) +
      "</code> (worker <code>" +
      escapeDrawerHtml(p.workerId) +
      "</code>).",
    fields: [
      {
        id: "summary",
        kind: "textarea",
        label: "Handoff summary",
        placeholder: "What the worker completed",
        required: true,
        rows: 4
      },
      {
        id: "evidenceRefs",
        kind: "textarea",
        label: "Evidence refs (optional, one per line)",
        placeholder: "PR URL, file path, …",
        rows: 2
      },
      ...policyRationaleDrawerFields("submit-team-handoff", "handoff")
    ],
    primaryLabel: "Submit handoff",
    cancelLabel: "Cancel"
  };
}

export function validateSubmitTeamHandoffSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("submit-team-handoff", "handoff", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const summary = (values.summary ?? "").trim();
  if (!summary) {
    return { ok: false, error: "Handoff summary is required." };
  }
  const evidenceRaw = (values.evidenceRefs ?? "").trim();
  const evidenceRefs = evidenceRaw
    ? evidenceRaw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  return {
    ok: true,
    values: {
      summary,
      evidenceRefs: evidenceRefs.join("\n"),
      policyRationale: (values.policyRationale ?? "").trim()
    }
  };
}

export function buildReconcileTeamAssignmentDrawerSpec(p: {
  assignmentId: string;
  supervisorId: string;
}): DrawerFormSpec {
  return {
    workflowId: "reconcile-team-assignment",
    title: "Reconcile submitted handoff",
    descriptionHtml:
      "Runs <code>reconcile-assignment</code> for assignment <code>" +
      escapeDrawerHtml(p.assignmentId) +
      "</code> (supervisor <code>" +
      escapeDrawerHtml(p.supervisorId) +
      "</code>).",
    fields: [
      {
        id: "mergedSummary",
        kind: "textarea",
        label: "Merged summary",
        placeholder: "Accepted worker summary plus supervisor edits",
        required: true,
        rows: 4
      },
      ...policyRationaleDrawerFields("reconcile-team-assignment", "reconcile")
    ],
    primaryLabel: "Reconcile",
    cancelLabel: "Cancel"
  };
}

export function validateReconcileTeamAssignmentSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("reconcile-team-assignment", "reconcile", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const mergedSummary = (values.mergedSummary ?? "").trim();
  if (!mergedSummary) {
    return { ok: false, error: "Merged summary is required." };
  }
  return {
    ok: true,
    values: { mergedSummary, policyRationale: (values.policyRationale ?? "").trim() }
  };
}

export function buildBlockTeamAssignmentDrawerSpec(p: {
  assignmentId: string;
  supervisorId: string;
}): DrawerFormSpec {
  return {
    workflowId: "block-team-assignment",
    title: "Block assignment",
    descriptionHtml: appendElevatedPolicyExplainer(
      "Runs <code>block-assignment</code> for assignment <code>" +
        escapeDrawerHtml(p.assignmentId) +
        "</code>.",
      "block-team-assignment",
      "block"
    ),
    fields: [
      {
        id: "reason",
        kind: "textarea",
        label: "Block reason",
        required: true,
        rows: 3
      },
      ...policyRationaleDrawerFields("block-team-assignment", "block")
    ],
    primaryLabel: "Block",
    cancelLabel: "Cancel"
  };
}

export function validateBlockTeamAssignmentSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("block-team-assignment", "block", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const reason = (values.reason ?? "").trim();
  if (!reason) {
    return { ok: false, error: "Block reason is required." };
  }
  return { ok: true, values: { reason, policyRationale: (values.policyRationale ?? "").trim() } };
}

export function buildCancelTeamAssignmentDrawerSpec(p: {
  assignmentId: string;
  supervisorId?: string;
}): DrawerFormSpec {
  return {
    workflowId: "cancel-team-assignment",
    title: "Cancel assignment",
    descriptionHtml: appendElevatedPolicyExplainer(
      "Runs <code>cancel-assignment</code> for assignment <code>" +
        escapeDrawerHtml(p.assignmentId) +
        "</code>.",
      "cancel-team-assignment",
      "cancel"
    ),
    fields: [
      {
        id: "supervisorId",
        kind: "text",
        label: "Supervisor id",
        required: true,
        value: p.supervisorId || "operator"
      },
      ...policyRationaleDrawerFields("cancel-team-assignment", "cancel")
    ],
    primaryLabel: "Cancel assignment",
    cancelLabel: "Keep"
  };
}

export function validateCancelTeamAssignmentSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("cancel-team-assignment", "cancel", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const supervisorId = (values.supervisorId ?? "").trim();
  if (!supervisorId) {
    return { ok: false, error: "Supervisor id is required." };
  }
  return { ok: true, values: { supervisorId, policyRationale: (values.policyRationale ?? "").trim() } };
}

const SUBAGENT_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/i;

function parseAllowedCommandsField(raw: string): string[] | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const parts = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : null;
}

export function buildRegisterSubagentDrawerSpec(): DrawerFormSpec {
  return {
    workflowId: "register-subagent",
    title: "Register subagent role",
    descriptionHtml: appendElevatedPolicyExplainer(
      "Runs <code>register-subagent</code>. <code>subagentId</code> must start with a letter " +
        "(lowercase id: <code>a-z0-9._-</code>). List explicit kit command names in allowed commands.",
      "register-subagent",
      "register"
    ),
    fields: [
      {
        id: "subagentId",
        kind: "text",
        label: "Subagent id",
        placeholder: "reviewer",
        required: true
      },
      {
        id: "displayName",
        kind: "text",
        label: "Display name",
        placeholder: "Reviewer agent",
        required: true
      },
      {
        id: "description",
        kind: "textarea",
        label: "Description",
        placeholder: "What this subagent is for",
        rows: 2
      },
      {
        id: "allowedCommands",
        kind: "textarea",
        label: "Allowed commands (comma or newline separated)",
        placeholder: "list-tasks, get-task, get-next-actions",
        required: true,
        value: "list-tasks, get-task, get-next-actions",
        rows: 2
      },
      ...policyRationaleDrawerFields("register-subagent", "register")
    ],
    primaryLabel: "Register",
    cancelLabel: "Cancel"
  };
}

export function validateRegisterSubagentSubmit(values: Record<string, string>): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("register-subagent", "register", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const subagentId = (values.subagentId ?? "").trim().toLowerCase();
  if (!SUBAGENT_ID_RE.test(subagentId)) {
    return {
      ok: false,
      error: "Subagent id must start with a letter and use only a-z, 0-9, ., _, - (max 64 chars)."
    };
  }
  const displayName = (values.displayName ?? "").trim();
  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }
  const allowedCommands = parseAllowedCommandsField(values.allowedCommands ?? "");
  if (!allowedCommands) {
    return { ok: false, error: "At least one allowed command is required." };
  }
  return {
    ok: true,
    values: {
      subagentId,
      displayName,
      description: (values.description ?? "").trim(),
      allowedCommands: allowedCommands.join("\n"),
      policyRationale: (values.policyRationale ?? "").trim()
    }
  };
}

export function buildSpawnSubagentDrawerSpec(p?: { subagentId?: string; executionTaskId?: string }): DrawerFormSpec {
  return {
    workflowId: "spawn-subagent",
    title: "Start subagent session",
    descriptionHtml:
      "Runs <code>spawn-subagent</code> (records an open session; does not launch Cursor). " +
      "Register the subagent role first if it does not exist.",
    fields: [
      {
        id: "subagentId",
        kind: "text",
        label: "Subagent id",
        placeholder: "reviewer",
        required: true,
        value: p?.subagentId ?? ""
      },
      {
        id: "executionTaskId",
        kind: "text",
        label: "Execution task id (optional)",
        placeholder: "T662",
        value: p?.executionTaskId ?? ""
      },
      {
        id: "hostHint",
        kind: "text",
        label: "Host hint",
        placeholder: "cursor",
        value: "cursor"
      },
      {
        id: "promptSummary",
        kind: "textarea",
        label: "Prompt summary",
        placeholder: "What the subagent should investigate",
        required: true,
        rows: 3
      },
      ...policyRationaleDrawerFields("spawn-subagent", "spawn")
    ],
    primaryLabel: "Start session",
    cancelLabel: "Cancel"
  };
}

export function validateSpawnSubagentSubmit(values: Record<string, string>): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("spawn-subagent", "spawn", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const subagentId = (values.subagentId ?? "").trim().toLowerCase();
  if (!SUBAGENT_ID_RE.test(subagentId)) {
    return { ok: false, error: "Subagent id is invalid." };
  }
  const promptSummary = (values.promptSummary ?? "").trim();
  if (!promptSummary) {
    return { ok: false, error: "Prompt summary is required." };
  }
  const executionTaskId = (values.executionTaskId ?? "").trim().toUpperCase();
  if (executionTaskId && !TEAM_TASK_ID_RE.test(executionTaskId)) {
    return { ok: false, error: "Execution task id must look like T### when provided." };
  }
  return {
    ok: true,
    values: {
      subagentId,
      executionTaskId,
      hostHint: (values.hostHint ?? "").trim() || "cursor",
      promptSummary,
      policyRationale: (values.policyRationale ?? "").trim()
    }
  };
}

export function buildCloseSubagentSessionDrawerSpec(p: { sessionId: string; definitionId: string }): DrawerFormSpec {
  return {
    workflowId: "close-subagent-session",
    title: "Close subagent session",
    descriptionHtml:
      "Runs <code>close-subagent-session</code> for session <code>" +
      escapeDrawerHtml(p.sessionId) +
      "</code> (<code>" +
      escapeDrawerHtml(p.definitionId) +
      "</code>).",
    fields: [...policyRationaleDrawerFields("close-subagent-session", "close")],
    primaryLabel: "Close session",
    cancelLabel: "Keep open"
  };
}

export function validateCloseSubagentSessionSubmit(values: Record<string, string>): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("close-subagent-session", "close", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  return { ok: true, values: { policyRationale: (values.policyRationale ?? "").trim() } };
}

export function buildRetireSubagentDrawerSpec(p?: { subagentId?: string }): DrawerFormSpec {
  return {
    workflowId: "retire-subagent",
    title: "Retire subagent role",
    descriptionHtml:
      "Runs <code>retire-subagent</code>. Retired roles cannot spawn new sessions; close open sessions first.",
    fields: [
      {
        id: "subagentId",
        kind: "text",
        label: "Subagent id",
        required: true,
        value: p?.subagentId ?? ""
      },
      ...policyRationaleDrawerFields("retire-subagent", "retire")
    ],
    primaryLabel: "Retire",
    cancelLabel: "Cancel"
  };
}

export function validateRetireSubagentSubmit(values: Record<string, string>): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("retire-subagent", "retire", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const subagentId = (values.subagentId ?? "").trim().toLowerCase();
  if (!SUBAGENT_ID_RE.test(subagentId)) {
    return { ok: false, error: "Subagent id is invalid." };
  }
  return { ok: true, values: { subagentId, policyRationale: (values.policyRationale ?? "").trim() } };
}

export function buildCreateCheckpointDrawerSpec(p: {
  mode: "head" | "stash";
  taskId?: string;
}): DrawerFormSpec {
  const modeLabel = p.mode === "stash" ? "stash (dirty tree)" : "head (pointer)";
  return {
    workflowId: "create-checkpoint",
    title: p.mode === "stash" ? "Create stash checkpoint" : "Create head checkpoint",
    descriptionHtml:
      "Runs <code>create-checkpoint</code> with mode <b>" +
      escapeDrawerHtml(modeLabel) +
      "</b>. Records git state in kit SQLite before risky task work.",
    fields: [
      {
        id: "taskId",
        kind: "text",
        label: "Task id (optional)",
        placeholder: "T662",
        value: p.taskId ?? ""
      },
      {
        id: "label",
        kind: "text",
        label: "Label (optional)",
        placeholder: "before risky edit"
      },
      ...policyRationaleDrawerFields("create-checkpoint", "create")
    ],
    primaryLabel: "Create checkpoint",
    cancelLabel: "Cancel"
  };
}

export function validateCreateCheckpointSubmit(values: Record<string, string>): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("create-checkpoint", "create", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const taskId = (values.taskId ?? "").trim().toUpperCase();
  if (taskId && !TEAM_TASK_ID_RE.test(taskId)) {
    return { ok: false, error: "Task id must look like T### when provided." };
  }
  return {
    ok: true,
    values: {
      taskId,
      label: (values.label ?? "").trim(),
      policyRationale: (values.policyRationale ?? "").trim()
    }
  };
}

export function buildRewindCheckpointDrawerSpec(p: {
  checkpointId: string;
  refKind: string;
  taskId?: string | null;
}): DrawerFormSpec {
  const taskLine =
    p.taskId != null && String(p.taskId).trim()
      ? " · task <code>" + escapeDrawerHtml(String(p.taskId)) + "</code>"
      : "";
  return {
    workflowId: "rewind-to-checkpoint",
    title: "Rewind to checkpoint (destructive)",
    descriptionHtml: appendElevatedPolicyExplainer(
      "<p>Runs <code>rewind-to-checkpoint</code> for <code>" +
        escapeDrawerHtml(p.checkpointId) +
        "</code> (" +
        escapeDrawerHtml(p.refKind) +
        " ref)" +
        taskLine +
        ".</p>" +
        "<p class=\"muted\">Refuses vendor/node_modules paths. Use force only when you accept rewinding on a dirty worktree.</p>",
      "rewind-to-checkpoint",
      "rewind"
    ),
    fields: [
      {
        id: "force",
        kind: "select",
        label: "Dirty worktree",
        required: true,
        options: [
          { value: "", label: "No — require clean worktree (recommended)" },
          { value: "yes", label: "Yes — force destructive rewind" }
        ]
      },
      ...policyRationaleDrawerFields(
        "rewind-to-checkpoint",
        "rewind",
        "Policy rationale (describe why you are rewinding)",
        "At least 12 characters — destructive rewind"
      )
    ],
    primaryLabel: "Rewind now",
    cancelLabel: "Cancel"
  };
}

export function validateRewindCheckpointSubmit(values: Record<string, string>): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("rewind-to-checkpoint", "rewind", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  const rationale = (values.policyRationale ?? "").trim();
  if (shouldCollectPolicyRationaleInDrawer("rewind-to-checkpoint", "rewind") && rationale.length < 12) {
    return { ok: false, error: "Rewind rationale must be at least 12 characters." };
  }
  return {
    ok: true,
    values: {
      force: (values.force ?? "").trim() === "yes" ? "yes" : "",
      policyRationale: rationale
    }
  };
}

export function buildViewCheckpointCompareDrawerSpec(p: {
  checkpointId: string;
  refKind: string;
  compareFrom: string;
  compareTo: string;
  nameStatusLines: string[];
}): DrawerFormSpec {
  const lines = p.nameStatusLines.length > 0 ? p.nameStatusLines : ["(no file changes vs HEAD)"];
  const body =
    "<div><b>From</b> <code>" +
    escapeDrawerHtml(p.compareFrom.slice(0, 12)) +
    "…</code> → <b>HEAD</b> <code>" +
    escapeDrawerHtml(p.compareTo.slice(0, 12)) +
    "…</code></div>" +
    "<pre class=\"wc-drawer-pre\">" +
    escapeDrawerHtml(lines.slice(0, 80).join("\n")) +
    (lines.length > 80 ? "\n… (truncated)" : "") +
    "</pre>";
  return {
    workflowId: "view-checkpoint-compare",
    title: "Compare checkpoint",
    descriptionHtml:
      "Read-only <code>compare-checkpoint</code> output for <code>" +
      escapeDrawerHtml(p.checkpointId) +
      "</code> (" +
      escapeDrawerHtml(p.refKind) +
      ").",
    fields: [{ id: "diff", kind: "summary", label: "git diff --name-status", body }],
    primaryLabel: "Close",
    cancelLabel: "Cancel"
  };
}

export function buildCancelPlanArtifactDrawerSpec(p: {
  planId: string;
  planRef: string;
  ideaId?: string;
  title?: string;
}): DrawerFormSpec {
  const title = (p.title ?? "").trim() || "Untitled plan";
  const ideaLine =
    p.ideaId && p.ideaId.trim().length > 0
      ? "<div><b>Idea:</b> " + escapeDrawerHtml(p.ideaId.trim()) + "</div>"
      : "";
  return {
    workflowId: "cancel-plan-artifact",
    title: "Cancel plan",
    descriptionHtml:
      "Moves this plan into the <b>Cancelled</b> rollup. Artifacts stay on disk so Brainstorm/Plan can revive the same document.",
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target",
        body:
          "<div><b>Title:</b> " +
          escapeDrawerHtml(title) +
          "</div>" +
          "<div><b>Plan ref:</b> " +
          escapeDrawerHtml(p.planRef) +
          "</div>" +
          ideaLine
      },
      {
        id: "rationale",
        kind: "textarea",
        label: "Reason (optional)",
        placeholder: "Why cancel this plan?",
        required: false,
        rows: 3
      }
    ],
    primaryLabel: "Cancel plan",
    cancelLabel: "Keep"
  };
}

export function validateCancelPlanArtifactSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  return { ok: true, values: { rationale: (values.rationale ?? "").trim() } };
}

export function buildDeletePlanArtifactDrawerSpec(p: {
  planId: string;
  planRef: string;
  ideaId?: string;
  title?: string;
}): DrawerFormSpec {
  const title = (p.title ?? "").trim() || "Untitled plan";
  const ideaId = (p.ideaId ?? "").trim();
  const ideaLine =
    ideaId.length > 0
      ? "<div><b>Idea:</b> " + escapeDrawerHtml(ideaId) + " (will also be deleted)</div>"
      : "<div><b>Idea:</b> (unresolved — delete will fail closed)</div>";
  return {
    workflowId: "delete-plan-artifact",
    title: "Delete plan",
    descriptionHtml: appendElevatedPolicyExplainer(
      "This permanently removes plan files, the plan index, and the linked idea row. There is no undo.",
      "plan-artifact",
      "delete"
    ),
    fields: [
      {
        id: "ctx",
        kind: "summary",
        label: "Target",
        body:
          "<div><b>Title:</b> " +
          escapeDrawerHtml(title) +
          "</div>" +
          "<div><b>Plan ref:</b> " +
          escapeDrawerHtml(p.planRef) +
          "</div>" +
          ideaLine
      },
      ...policyRationaleDrawerFields(
        "plan-artifact",
        "delete",
        "Policy rationale (required)",
        "Shown in policy trace / approval"
      )
    ],
    primaryLabel: "Delete plan and idea",
    cancelLabel: "Keep"
  };
}

export function validateDeletePlanArtifactSubmit(
  values: Record<string, string>
): DrawerValidationResult {
  const policyErr = validateDrawerPolicyRationale("plan-artifact", "delete", values);
  if (policyErr) {
    return { ok: false, error: policyErr };
  }
  return { ok: true, values: { policyRationale: (values.policyRationale ?? "").trim() } };
}
