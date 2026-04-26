/**
 * Pure HTML for the Guidance webview. Keep it small and boring; the command
 * contract does the heavy lifting so the webview does not become a CAE parser.
 */

import { escapeHtml, escapeHtmlAttr } from "../dashboard/render-dashboard.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function statusClass(ok: boolean): string {
  return ok ? "gd-pill gd-ok" : "gd-pill gd-warn";
}

function boolLabel(value: unknown): string {
  return value === true ? "on" : "off";
}

function renderFamilyCounts(counts: UnknownRecord): string {
  const parts = [
    ["Rules", counts.policy],
    ["Consider", counts.think],
    ["Steps", counts.do],
    ["Review", counts.review]
  ];
  return parts
    .map(([label, value]) => `<span class="gd-chip">${escapeHtml(String(label))}: ${escapeHtml(String(value ?? 0))}</span>`)
    .join("");
}

function renderTraceRows(rows: unknown): string {
  const list = asArray(rows);
  if (list.length === 0) {
    return '<p class="gd-muted">No durable Guidance checks yet. Run a preview with persistence enabled to create one.</p>';
  }
  return (
    '<div class="gd-list">' +
    list
      .map((item) => {
        const row = asRecord(item);
        const traceId = String(row.traceId ?? "");
        const counts = asRecord(row.familyCounts);
        return `<div class="gd-row">
  <div>
    <b>${escapeHtml(traceId)}</b>
    <div class="gd-muted">${escapeHtml(String(row.createdAt ?? ""))} · ${escapeHtml(String(row.evalMode ?? ""))} · ${escapeHtml(String(row.storage ?? ""))}</div>
    <div class="gd-counts">${renderFamilyCounts(counts)}</div>
  </div>
  <button type="button" class="gd-btn" data-wc-action="guidance-explain" data-trace-id="${escapeHtmlAttr(traceId)}">Explain</button>
</div>`;
      })
      .join("") +
    "</div>"
  );
}

function renderAckRows(rows: unknown): string {
  const list = asArray(rows);
  if (list.length === 0) {
    return '<p class="gd-muted">No acknowledgements recorded.</p>';
  }
  return (
    '<div class="gd-list">' +
    list
      .map((item) => {
        const row = asRecord(item);
        return `<div class="gd-row gd-row-compact">
  <span><b>${escapeHtml(String(row.activationId ?? ""))}</b><br><span class="gd-muted">${escapeHtml(String(row.actor ?? ""))} · ${escapeHtml(String(row.satisfiedAt ?? ""))}</span></span>
</div>`;
      })
      .join("") +
    "</div>"
  );
}

function renderFeedbackSummary(feedback: UnknownRecord): string {
  const summary = asRecord(feedback.summary);
  return `<div class="gd-counts">
    <span class="gd-chip">Total: ${escapeHtml(String(summary.total ?? 0))}</span>
    <span class="gd-chip">Useful: ${escapeHtml(String(summary.useful ?? 0))}</span>
    <span class="gd-chip">Noisy: ${escapeHtml(String(summary.noisy ?? 0))}</span>
  </div>`;
}

function renderRecoveryCards(health: UnknownRecord, validation: UnknownRecord, recent: UnknownRecord): string {
  const cards: Array<{ title: string; body: string; action: string }> = [];
  if (health.caeEnabled !== true) {
    cards.push({
      title: "Turn on the Guidance system",
      body: "Guidance is disabled, so previews and recovery checks cannot use CAE context.",
      action: "Enable kit.cae.enabled, then reload this view."
    });
  }
  if (health.registryStatus !== "ok" || validation.ok === false) {
    cards.push({
      title: "Fix the Guidance registry",
      body: "The active Guidance registry could not be loaded or validated, so Guidance cards may be missing.",
      action: 'Run `workspace-kit run cae-registry-validate {"schemaVersion":1}` or import a valid active registry, then reload.'
    });
  }
  if (recent.available === false) {
    const disabled = recent.code === "cae-persistence-disabled";
    cards.push({
      title: disabled ? "Enable Guidance history" : "Repair Guidance history storage",
      body: disabled
        ? "Recent checks are unavailable because CAE persistence is off. Previews can still run, but trace history will be ephemeral."
        : "Recent checks are unavailable because the workspace database could not be opened.",
      action: disabled
        ? "Set kit.cae.persistence to true when you want durable Guidance trace history."
        : "Run workspace-kit doctor and repair the configured planning SQLite database."
    });
  }
  if (cards.length === 0) return "";
  return `<section class="gd-card gd-warn-card">
  <h2>How to recover</h2>
  ${cards
    .map(
      (card) => `<div class="gd-guidance-card">
    <h3>${escapeHtml(card.title)}</h3>
    <p>${escapeHtml(card.body)}</p>
    <p class="gd-muted">${escapeHtml(card.action)}</p>
  </div>`
    )
    .join("")}
</section>`;
}

export function renderGuidanceSummaryInnerHtml(payload: unknown): string {
  const root = asRecord(payload);
  if (root.ok === false) {
    return `<section class="gd-card gd-danger"><h2>Guidance unavailable</h2><p>${escapeHtml(String(root.message ?? root.code ?? "Unknown error"))}</p></section>`;
  }
  const data = asRecord(root.data ?? root);
  const health = asRecord(data.health);
  const validation = asRecord(data.validation);
  const recent = asRecord(data.recentTraces);
  const acks = asRecord(data.acknowledgements);
  const feedback = asRecord(data.feedback);
  const healthy = health.registryStatus === "ok" && validation.ok === true && health.caeEnabled === true;
  const issues = asArray(health.issues);

  return `<section class="gd-card">
  <div class="gd-card-head">
    <h2>Guidance status</h2>
    <span class="${statusClass(healthy)}">${healthy ? "Ready" : "Needs attention"}</span>
  </div>
  <dl class="gd-meta">
    <div><dt>Guidance system</dt><dd>${escapeHtml(boolLabel(health.caeEnabled))}</dd></div>
    <div><dt>Registry</dt><dd>${escapeHtml(String(health.registryStatus ?? "unknown"))}</dd></div>
    <div><dt>Active version</dt><dd><code>${escapeHtml(String(health.activeRegistryVersionId ?? "n/a"))}</code></dd></div>
    <div><dt>Persistence</dt><dd>${escapeHtml(boolLabel(health.persistenceEnabled))}</dd></div>
    <div><dt>Recent checks</dt><dd>${escapeHtml(String(health.traceRowCount ?? recent.count ?? 0))}</dd></div>
    <div><dt>Acknowledgements</dt><dd>${escapeHtml(String(acks.count ?? 0))}</dd></div>
  </dl>
  ${health.lastEvalAtNote ? `<p class="gd-muted">${escapeHtml(String(health.lastEvalAtNote))}</p>` : ""}
  ${
    issues.length
      ? `<details><summary>Needs attention</summary><pre>${escapeHtml(JSON.stringify(issues, null, 2))}</pre></details>`
      : ""
  }
</section>
${renderRecoveryCards(health, validation, recent)}

<section class="gd-card">
  <div class="gd-card-head"><h2>Recent checks</h2><span class="gd-pill">${recent.available === false ? "Persistence off" : "Stored"}</span></div>
  ${renderTraceRows(recent.rows)}
</section>

<section class="gd-card">
  <div class="gd-card-head"><h2>Acknowledgements</h2><span class="gd-pill">${escapeHtml(String(acks.count ?? 0))}</span></div>
  ${renderAckRows(acks.rows)}
  <p class="gd-muted">Acknowledgement means “I read this guidance.” It is not permission to run a sensitive command.</p>
</section>

<section class="gd-card">
  <div class="gd-card-head"><h2>Feedback</h2><span class="gd-pill">Shadow tuning</span></div>
  ${renderFeedbackSummary(feedback)}
</section>

<details class="gd-card">
  <summary>Advanced details</summary>
  <pre>${escapeHtml(JSON.stringify(data, null, 2).slice(0, 12000))}</pre>
</details>`;
}

function renderGuidanceCard(cardRaw: unknown, traceId: string, commandName: string): string {
  const card = asRecord(cardRaw);
  const activationId = String(card.activationId ?? "");
  const artifactIds = asArray(card.artifactIds).map((x) => String(x));
  const titles = asArray(card.sourceTitles).map((x) => String(x));
  return `<div class="gd-guidance-card">
  <div class="gd-card-head">
    <h3>${escapeHtml(String(card.title ?? activationId))}</h3>
    <span class="gd-pill">${escapeHtml(String(card.attention ?? "advisory"))}</span>
  </div>
  <p class="gd-muted">${escapeHtml(String(card.familyLabel ?? card.family ?? "Guidance item"))}</p>
  <p>${titles.map(escapeHtml).join(", ")}</p>
  <details>
    <summary>Source ids</summary>
    <p><code>${escapeHtml(activationId)}</code></p>
    <p>${artifactIds.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}</p>
  </details>
  <div class="gd-actions">
    <button type="button" class="gd-btn" data-wc-action="guidance-explain" data-trace-id="${escapeHtmlAttr(traceId)}">Explain</button>
    <button type="button" class="gd-btn" data-wc-action="guidance-feedback" data-signal="useful" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-command-name="${escapeHtmlAttr(commandName)}">Useful</button>
    <button type="button" class="gd-btn" data-wc-action="guidance-feedback" data-signal="noisy" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-command-name="${escapeHtmlAttr(commandName)}">Noisy</button>
  </div>
</div>`;
}

function renderFamilySection(title: string, cards: unknown, traceId: string, commandName: string): string {
  const rows = asArray(cards);
  if (rows.length === 0) {
    return "";
  }
  return `<section class="gd-card"><h2>${escapeHtml(title)}</h2>${rows
    .map((card) => renderGuidanceCard(card, traceId, commandName))
    .join("")}</section>`;
}

function renderPendingAcks(rows: unknown, traceId: string): string {
  const list = asArray(rows);
  if (list.length === 0) return "";
  return `<section class="gd-card gd-warn-card"><h2>Acknowledgement needed</h2>${list
    .map((item) => {
      const row = asRecord(item);
      const activationId = String(row.activationId ?? "");
      const ackToken = String(row.ackToken ?? "");
      return `<div class="gd-row">
  <span><b>${escapeHtml(activationId)}</b><br><span class="gd-muted">${escapeHtml(String(row.strength ?? ""))}</span></span>
  <button type="button" class="gd-btn gd-primary" data-wc-action="guidance-ack" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-ack-token="${escapeHtmlAttr(ackToken)}">Acknowledge</button>
</div>`;
    })
    .join("")}<p class="gd-muted">This records “I read this guidance.” It does not grant policy approval for another command.</p></section>`;
}

export function renderGuidancePreviewInnerHtml(payload: unknown): string {
  const root = asRecord(payload);
  if (Object.keys(root).length === 0) {
    return '<p class="gd-muted">Pick a task and workflow, then run a preview.</p>';
  }
  if (root.ok === false) {
    return `<section class="gd-card gd-danger"><h2>Preview failed</h2><p>${escapeHtml(String(root.message ?? root.code ?? "Unknown error"))}</p></section>`;
  }
  const data = asRecord(root.data ?? root);
  const traceId = String(data.traceId ?? "");
  const commandName = String(asRecord(data.evaluationContext).command ? asRecord(asRecord(data.evaluationContext).command).name ?? "" : "");
  const cards = asRecord(data.guidanceCards);
  const counts = asRecord(data.familyCounts);
  return `<section class="gd-card">
  <div class="gd-card-head">
    <h2>Guidance that would apply</h2>
    <span class="gd-pill">${escapeHtml(String(data.modeLabel ?? data.evalMode ?? "Preview mode"))}</span>
  </div>
  <div class="gd-counts">${renderFamilyCounts(counts)}</div>
  <p class="gd-muted">Trace <code>${escapeHtml(traceId)}</code>${data.ephemeral ? " · stored in memory only" : " · stored in workspace database"}</p>
</section>
${renderPendingAcks(data.pendingAcknowledgements, traceId)}
${renderFamilySection("Rules to follow", cards.policy, traceId, commandName)}
${renderFamilySection("Things to consider", cards.think, traceId, commandName)}
${renderFamilySection("Suggested steps", cards.do, traceId, commandName)}
${renderFamilySection("Review checks", cards.review, traceId, commandName)}
<details class="gd-card">
  <summary>Raw result</summary>
  <pre>${escapeHtml(JSON.stringify(data, null, 2).slice(0, 16000))}</pre>
</details>`;
}

function firstTraceEventPayload(trace: UnknownRecord, eventType: string): UnknownRecord {
  const events = asArray(trace.events);
  for (const raw of events) {
    const event = asRecord(raw);
    if (event.eventType === eventType) return asRecord(event.payload);
  }
  return {};
}

export function renderGuidanceTraceDetailInnerHtml(payload: unknown): string {
  const root = asRecord(payload);
  const explain = asRecord(root.explain);
  const traceFetch = asRecord(root.traceFetch);
  if (explain.ok === false) {
    return `<section class="gd-card gd-danger"><h2>Trace detail unavailable</h2><p>${escapeHtml(String(explain.message ?? explain.code ?? "Unknown error"))}</p></section>`;
  }
  const explainData = asRecord(explain.data);
  const explanation = asRecord(explainData.explanation);
  const trace = asRecord(explainData.trace ?? asRecord(traceFetch.data).trace);
  const traceId = String(explanation.traceId ?? trace.traceId ?? "");
  const evalSummary = firstTraceEventPayload(trace, "cae.trace.eval.summary");
  const ackSummary = firstTraceEventPayload(trace, "cae.trace.ack.summary");
  const counts = asRecord(evalSummary.familyCounts);
  const traceFetchMissing = traceFetch.ok === false;
  return `<section class="gd-card">
  <div class="gd-card-head">
    <h2>Trace detail</h2>
    <span class="gd-pill">${escapeHtml(String(explainData.storage ?? "memory"))}${explainData.ephemeral ? " · ephemeral" : ""}</span>
  </div>
  <p>${escapeHtml(String(explanation.summaryText ?? "No explanation summary available."))}</p>
  <dl class="gd-meta">
    <div><dt>Trace</dt><dd><code>${escapeHtml(traceId || "unknown")}</code></dd></div>
    <div><dt>Bundle</dt><dd><code>${escapeHtml(String(trace.bundleId ?? "unknown"))}</code></dd></div>
    <div><dt>Mode</dt><dd>${escapeHtml(String(evalSummary.evalMode ?? "unknown"))}</dd></div>
    <div><dt>Conflicts</dt><dd>${escapeHtml(String(evalSummary.conflictCount ?? 0))}</dd></div>
    <div><dt>Pending acknowledgements</dt><dd>${escapeHtml(String(ackSummary.pendingAckCount ?? 0))}</dd></div>
  </dl>
  <div class="gd-counts">${renderFamilyCounts(counts)}</div>
</section>
${traceFetchMissing ? `<section class="gd-card gd-warn-card"><h2>Stored trace not found</h2><p>${escapeHtml(String(traceFetch.message ?? traceFetch.code ?? "Trace is no longer available in the durable store."))}</p><p class="gd-muted">Run a fresh Guidance preview with CAE persistence enabled to capture a new durable trace.</p></section>` : ""}
<details class="gd-card">
  <summary>Raw trace JSON</summary>
  <pre>${escapeHtml(JSON.stringify({ explain, traceFetch }, null, 2).slice(0, 20000))}</pre>
</details>`;
}

export function renderGuidanceActionResultInnerHtml(payload: unknown): string {
  const root = asRecord(payload);
  const action = String(root.action ?? "Guidance action");
  const result = asRecord(root.result);
  const ok = result.ok !== false;
  const title = ok ? `${action} recorded` : `${action} failed`;
  return `<section class="gd-card ${ok ? "" : "gd-danger"}">
  <div class="gd-card-head">
    <h2>${escapeHtml(title)}</h2>
    <span class="${statusClass(ok)}">${ok ? "Done" : "Needs attention"}</span>
  </div>
  <p>${escapeHtml(String(result.message ?? result.code ?? (ok ? "The Guidance action completed." : "The Guidance action did not complete.")))}</p>
  ${
    result.code
      ? `<p class="gd-muted">Result code: <code>${escapeHtml(String(result.code))}</code></p>`
      : ""
  }
  <details>
    <summary>Raw result</summary>
    <pre>${escapeHtml(JSON.stringify(result, null, 2).slice(0, 12000))}</pre>
  </details>
</section>`;
}
