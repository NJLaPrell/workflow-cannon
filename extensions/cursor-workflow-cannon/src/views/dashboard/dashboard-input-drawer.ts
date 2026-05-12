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
