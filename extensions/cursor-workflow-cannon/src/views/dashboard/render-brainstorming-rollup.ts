function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

type BrainstormScoreFields = {
  valueScore?: number;
  riskScore?: number;
  effortScore?: number;
  confidenceScore?: number;
  priorityScore?: number;
};

type BrainstormSessionRow = BrainstormScoreFields & {
  sessionId?: string;
  sessionIndex?: number;
  startedAt?: string;
  completedAt?: string;
};

type BrainstormSynthesisRow = BrainstormScoreFields & {
  sessionCount?: number;
  readinessPercent?: number;
  readyForPlanning?: boolean;
};

function formatBrainstormScore(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderBrainstormReadinessPill(row: BrainstormSynthesisRow): string {
  if (typeof row.readinessPercent !== "number" || !Number.isFinite(row.readinessPercent)) {
    return "";
  }
  const ready = row.readyForPlanning === true;
  const cls = ready
    ? "wc-brainstorm-score-pill wc-brainstorm-readiness-pill wc-brainstorm-readiness-ready"
    : "wc-brainstorm-score-pill wc-brainstorm-readiness-pill";
  const label = ready ? "Ready to plan" : row.readinessPercent + "% ready";
  return (
    '<span class="' +
    cls +
    '" title="Share of required brainstorm inputs (context + value/risk/effort/confidence) captured for the latest session">' +
    '<span class="wc-brainstorm-score-label">Readiness</span><span class="wc-brainstorm-score-value">' +
    escapeHtml(label) +
    "</span></span>"
  );
}

export function renderBrainstormScorePills(scores: BrainstormSynthesisRow | null | undefined): string {
  if (!scores || typeof scores !== "object") {
    return '<span class="muted">No scores yet</span>';
  }
  const items: Array<[string, string]> = [
    ["Value", formatBrainstormScore(scores.valueScore)],
    ["Risk", formatBrainstormScore(scores.riskScore)],
    ["Effort", formatBrainstormScore(scores.effortScore)],
    ["Confidence", formatBrainstormScore(scores.confidenceScore)],
    ["Priority", formatBrainstormScore(scores.priorityScore)]
  ];
  return (
    '<span class="wc-brainstorm-score-pills">' +
    renderBrainstormReadinessPill(scores) +
    items
      .map(
        ([label, value]) =>
          '<span class="wc-brainstorm-score-pill"><span class="wc-brainstorm-score-label">' +
          escapeHtml(label) +
          '</span><span class="wc-brainstorm-score-value">' +
          escapeHtml(value) +
          "</span></span>"
      )
      .join("") +
    "</span>"
  );
}

function renderBrainstormSessionRow(session: BrainstormSessionRow, label: string): string {
  const sessionIndex =
    typeof session.sessionIndex === "number" && Number.isFinite(session.sessionIndex)
      ? String(session.sessionIndex + 1)
      : "—";
  return (
    '<tr data-wc-brainstorm-session-index="' +
    escapeHtmlAttr(String(session.sessionIndex ?? "")) +
    '"><td>' +
    escapeHtml(label) +
    "</td><td>" +
    escapeHtml(sessionIndex) +
    "</td><td>" +
    escapeHtml(formatBrainstormScore(session.valueScore)) +
    "</td><td>" +
    escapeHtml(formatBrainstormScore(session.riskScore)) +
    "</td><td>" +
    escapeHtml(formatBrainstormScore(session.effortScore)) +
    "</td><td>" +
    escapeHtml(formatBrainstormScore(session.confidenceScore)) +
    "</td><td>" +
    escapeHtml(formatBrainstormScore(session.priorityScore)) +
    "</td></tr>"
  );
}

export function renderBrainstormSessionHistory(args: {
  sessions?: unknown;
  synthesis?: unknown;
  detailKey: string;
  openByDefault?: boolean;
}): string {
  const sessions = Array.isArray(args.sessions)
    ? (args.sessions.filter((row) => row && typeof row === "object") as BrainstormSessionRow[])
    : [];
  const synthesis =
    args.synthesis && typeof args.synthesis === "object" ? (args.synthesis as BrainstormSynthesisRow) : null;
  if (sessions.length === 0 && !synthesis) {
    return "";
  }
  const rows: string[] = sessions.map((session, index) =>
    renderBrainstormSessionRow(session, `Session ${index + 1}`)
  );
  if (synthesis && (synthesis.sessionCount ?? sessions.length) > 1) {
    rows.push(renderBrainstormSessionRow(synthesis, "Synthesized"));
  }
  const openAttr = args.openByDefault ? " open" : "";
  return (
    '<details class="wc-brainstorm-session-history"' +
    ' data-wc-ui-state-key="' +
    escapeHtmlAttr(args.detailKey) +
    '"' +
    openAttr +
    '><summary>Brainstorm session history (' +
    escapeHtml(String(sessions.length)) +
    ")</summary>" +
    '<div class="wc-brainstorm-session-history-body">' +
    '<table class="wc-brainstorm-session-table"><thead><tr>' +
    "<th>Row</th><th>#</th><th>Value</th><th>Risk</th><th>Effort</th><th>Confidence</th><th>Priority</th>" +
    "</tr></thead><tbody>" +
    rows.join("") +
    "</tbody></table></div></details>"
  );
}

export function renderBrainstormingIdeasRollupSection(brainstormingIdeas: unknown): string {
  const rollup =
    brainstormingIdeas && typeof brainstormingIdeas === "object"
      ? (brainstormingIdeas as Record<string, unknown>)
      : null;
  const available = rollup?.available === true;
  const count = typeof rollup?.count === "number" ? rollup.count : 0;
  const top = Array.isArray(rollup?.top) ? rollup.top : [];
  if (!available && top.length === 0) {
    return (
      '<section class="dash-card wc-brainstorming-ideas-section" aria-label="Brainstorming">' +
      "<p><b>Brainstorming</b></p>" +
      '<p class="muted">No ideas in brainstorming state.</p>' +
      "</section>"
    );
  }

  const rows = top
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const row = item as Record<string, unknown>;
      const ideaId = String(row.ideaId ?? "").trim();
      const title = String(row.title ?? ideaId).trim() || ideaId;
      const planRef = String(row.planRef ?? "").trim();
      const synthesis =
        row.synthesis && typeof row.synthesis === "object" ? (row.synthesis as BrainstormSynthesisRow) : null;
      const sessions = row.sessions;
      const sessionCount = Array.isArray(sessions) ? sessions.length : 0;
      const detailKey = "brainstorm-rollup-" + (ideaId.length > 0 ? ideaId : planRef || "row");
      const historyHtml = renderBrainstormSessionHistory({
        sessions,
        synthesis,
        detailKey,
        openByDefault: false
      });
      const brainstormBtnAttrs =
        ' data-plan-ref="' + escapeHtmlAttr(planRef) + '" data-idea-id="' + escapeHtmlAttr(ideaId) + '"';
      const brainstormBtnLabel = sessionCount === 0 ? "Start Brainstorming" : "Continue Brainstorming";
      const brainstormBtnTitle =
        sessionCount === 0
          ? "Run the first brainstorm session for this idea"
          : "Append a new brainstorm session to refine scores";
      const readyForPlanning = synthesis?.readyForPlanning === true;
      const planBtnLabel = readyForPlanning ? "Start Planning" : "Start Planning anyway";
      const planBtnTitle = readyForPlanning
        ? "Operator action: finish brainstorming and start planning"
        : "Operator action: start planning even though brainstorming is not marked ready; plan sections may be based on incomplete scoring";
      return (
        '<article class="wc-brainstorming-idea-row" data-wc-idea-id="' +
        escapeHtmlAttr(ideaId) +
        '" data-wc-idea-title="' +
        escapeHtmlAttr(title) +
        '" data-plan-ref="' +
        escapeHtmlAttr(planRef) +
        '"><div class="wc-brainstorming-idea-head"><p class="wc-brainstorming-idea-title"><b>' +
        escapeHtml(title) +
        '</b><span class="muted wc-brainstorming-idea-id">' +
        escapeHtml(ideaId) +
        "</span></p>" +
        '<div class="wc-brainstorming-idea-actions">' +
        renderBrainstormScorePills(synthesis) +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="plan-artifact-brainstorm"' +
        brainstormBtnAttrs +
        ' title="' +
        escapeHtmlAttr(brainstormBtnTitle) +
        '">' +
        escapeHtml(brainstormBtnLabel) +
        "</button>" +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="idea-plan" title="' +
        escapeHtmlAttr(planBtnTitle) +
        '">' +
        escapeHtml(planBtnLabel) +
        "</button>" +
        "</div></div>" +
        historyHtml +
        "</article>"
      );
    })
    .join("");

  return (
    '<section class="dash-card wc-brainstorming-ideas-section" aria-label="Brainstorming">' +
    "<p><b>Brainstorming</b> · " +
    escapeHtml(String(count)) +
    "</p>" +
    (rows.length > 0
      ? '<div class="wc-brainstorming-ideas-list">' + rows + "</div>"
      : '<p class="muted">No ideas in brainstorming state.</p>') +
    "</section>"
  );
}
