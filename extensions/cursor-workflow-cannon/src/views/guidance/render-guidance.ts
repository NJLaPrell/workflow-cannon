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

function userFacingTerm(value: string): string {
  return value
    .replace(/\bregistry\b/gi, "guidance set")
    .replace(/\bactivation\b/gi, "trigger")
    .replace(/\bartifact\b/gi, "source")
    .replace(/\btrace\b/gi, "check record")
    .replace(/\bshadow tuning\b/gi, "guidance feedback");
}

function shortTraceId(traceId: string): string {
  if (traceId.length <= 18) return traceId;
  return `${traceId.slice(0, 12)}...${traceId.slice(-6)}`;
}

function mutationFailureRemediation(code: unknown): string | null {
  const c = String(code ?? "");
  switch (c) {
    case "cae-mutation-disabled":
      return "Turn on Guidance: set kit.cae.enabled to true, then reload this view.";
    case "cae-mutation-json-store":
      return "Use SQLite for the registry: set kit.cae.registryStore to \"sqlite\", then reload (JSON is bootstrap/read-only for mutations).";
    case "cae-mutation-admin-off":
      return "Enable kit.cae.adminMutations for this workspace, then reload.";
    case "cae-mutation-approval-missing":
      return "Approve via caeMutationApproval in the CAE command — this is not Tier A/B policyApproval on workspace-kit run. If the UI sent a bad payload, file a bug.";
    case "invalid-args":
      return "Often a missing actor or invalid field — set WORKSPACE_KIT_ACTOR / Git identity, fix inputs, retry.";
    case "cae-registry-version-not-found":
      return "That version id is not in the SQLite registry — reload, pick a listed version, or clone from active.";
    case "cae-rollback-impossible":
      return "No older version exists — create a draft or import before rolling back.";
    case "cae-registry-sqlite-no-active-version":
      return "No active guidance set — run cae-registry-validate / fix health before version actions.";
    default:
      return null;
  }
}

function commandLabel(value: unknown): string {
  const commandName = String(value ?? "").trim();
  if (!commandName) return "Guidance check";
  return commandName
    .replace(/^cae-/, "Guidance ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function activationTitle(row: UnknownRecord): string {
  const candidates = [row.title, row.activationTitle, row.sourceTitle, row.activationId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "Guidance item";
}

function renderRawDetails(summary: string, payload: unknown, limit: number): string {
  const raw = JSON.stringify(payload, null, 2);
  const shown = raw.slice(0, limit);
  const truncated = raw.length > shown.length;
  return `<details class="gd-card gd-raw-block gd-debug">
  <summary>${escapeHtml(summary)}</summary>
  <p class="gd-muted">${truncated ? `Showing the first ${shown.length} of ${raw.length} characters.` : "Showing the full JSON payload."} Copy grabs exactly what is visible below.</p>
  <button type="button" class="gd-btn" data-wc-action="guidance-copy-block">Copy shown JSON</button>
  <pre>${escapeHtml(shown)}</pre>
</details>`;
}

function renderFamilyCounts(counts: UnknownRecord): string {
  const parts = [
    ["Required rules", counts.policy],
    ["Recommendations", counts.think],
    ["Suggested steps", counts.do],
    ["Review checks", counts.review]
  ];
  return parts
    .map(([label, value]) => `<span class="gd-chip">${escapeHtml(String(label))}: ${escapeHtml(String(value ?? 0))}</span>`)
    .join("");
}

function activityKey(row: UnknownRecord): string {
  const counts = asRecord(row.familyCounts);
  return [
    row.commandName ?? row.command ?? "",
    row.taskId ?? "",
    row.evalMode ?? "",
    counts.policy ?? 0,
    counts.think ?? 0,
    counts.do ?? 0,
    counts.review ?? 0,
    row.pendingAcknowledgementCount ?? 0,
    row.conflictCount ?? 0
  ].join("|");
}

function renderActivityRows(rows: unknown): string {
  const list = asArray(rows);
  if (list.length === 0) {
    return '<p class="gd-muted">No checks yet. Choose a task and workflow above, then run your first pre-flight check.</p>';
  }
  const groups: Array<{ key: string; rows: UnknownRecord[] }> = [];
  for (const item of list) {
    const row = asRecord(item);
    const key = activityKey(row);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, rows: [row] });
    }
  }
  return (
    '<div class="gd-list">' +
    groups
      .map((group) => {
        const row = group.rows[0];
        const traceId = String(row.traceId ?? "");
        const commandName = String(row.commandName ?? row.command ?? "");
        const mode = String(row.evalMode ?? "");
        const storage = String(row.storage ?? "");
        const counts = asRecord(row.familyCounts);
        const taskId = typeof row.taskId === "string" ? row.taskId : "";
        const repeated = group.rows.length > 1;
        return `<div class="gd-row gd-activity-row">
  <div>
    <b>${escapeHtml(commandLabel(commandName))}</b>
    <div class="gd-muted">${taskId ? `${escapeHtml(taskId)} · ` : ""}${escapeHtml(String(row.createdAt ?? ""))}${mode ? ` · ${escapeHtml(mode)}` : ""}</div>
    <div class="gd-muted">${repeated ? `${group.rows.length} unchanged checks collapsed. ` : "Single check. "}Use Review why when you need the evidence.</div>
    <div class="gd-counts">${renderFamilyCounts(counts)}</div>
    <details class="gd-debug"><summary>Debug check record</summary><p class="gd-muted">${storage ? `${escapeHtml(storage)} · ` : ""}check record <code>${escapeHtml(shortTraceId(traceId))}</code></p></details>
  </div>
  <div class="gd-actions">
    <button type="button" class="gd-btn" data-wc-action="guidance-explain" data-trace-id="${escapeHtmlAttr(traceId)}">Review why</button>
    <button type="button" class="gd-btn" data-wc-action="guidance-improve" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="" data-command-name="${escapeHtmlAttr(commandName)}">Improve guidance</button>
  </div>
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
        const title = activationTitle(row);
        const activationId = String(row.activationId ?? "");
        return `<div class="gd-row gd-row-compact">
  <span><b>${escapeHtml(title)}</b><br><span class="gd-muted">${escapeHtml(String(row.actor ?? ""))} · ${escapeHtml(String(row.satisfiedAt ?? ""))}${activationId && activationId !== title ? ` · ${escapeHtml(activationId)}` : ""}</span></span>
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
      title: "Guidance is turned off",
      body: "Pre-flight checks are unavailable until Guidance is enabled for this workspace.",
      action: "For maintainers: enable kit.cae.enabled, then reload this view."
    });
  }
  if (health.registryStatus !== "ok" || validation.ok === false) {
    cards.push({
      title: "Guidance rules need repair",
      body: "The active guidance set could not be loaded or validated, so some cards may be missing or stale.",
      action: 'For maintainers: run `workspace-kit run cae-registry-validate {"schemaVersion":1}` or import a valid active registry, then reload.'
    });
  }
  if (recent.available === false) {
    const disabled = recent.code === "cae-persistence-disabled";
    cards.push({
      title: disabled ? "Guidance history is off" : "Guidance history needs repair",
      body: disabled
        ? "Recent checks are unavailable because durable history is off. Previews can still run, but the history disappears after the session."
        : "Recent checks are unavailable because the workspace database could not be opened.",
      action: disabled
        ? "For maintainers: set kit.cae.persistence to true when you want durable Guidance history."
        : "For maintainers: run workspace-kit doctor and repair the configured planning SQLite database."
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

function renderManageGuidance(data: UnknownRecord): string {
  const health = asRecord(data.health);
  const validation = asRecord(data.validation);
  const product = asRecord(data.guidanceProduct);
  const productRegistry = asRecord(product.registry);
  const productVersions = asRecord(product.versions);
  const versionsRoot = asRecord(data.registryVersions);
  const versionsData = asRecord(productVersions.versions ? productVersions : versionsRoot.data ?? versionsRoot);
  const versions = asArray(versionsData.versions).map(asRecord);
  const active = versions.find((row) => row.isActive === true);
  const mutationCapability = asRecord(product.mutationCapability);
  const library = asRecord(product.library ?? data.library);
  const artifactIds = asArray(asRecord(library.artifacts).artifactIds).map(String);
  const activationIds = asArray(asRecord(library.activations).activationIds).map(String);
  const canMutate = mutationCapability.canMutate === true;
  const denial =
    typeof mutationCapability.denialReason === "string"
      ? mutationCapability.denialReason
      : "Admin updates are not available. Inspect guidance and use draft preview / copy JSON for handoff.";
  const registryStore = String(mutationCapability.registryStore ?? productRegistry.store ?? health.registryStore ?? "sqlite");
  const mutDisabledAttrs = canMutate
    ? ""
    : ` disabled title="${escapeHtmlAttr(denial)}"`;
  const activeVersionId = String(active?.versionId ?? productRegistry.activeVersionId ?? health.activeRegistryVersionId ?? "n/a");
  const sourceCount = productRegistry.artifactCount ?? health.artifactCount ?? artifactIds.length ?? 0;
  const triggerCount = productRegistry.activationCount ?? health.activationCount ?? activationIds.length ?? 0;
  return `<section class="gd-card gd-manage">
  <div class="gd-card-head">
    <h2>Manage Guidance</h2>
    <span class="${statusClass(validation.ok === true && health.registryStatus === "ok")}">${validation.ok === true ? "Valid" : "Needs repair"}</span>
  </div>
  <p class="gd-muted">Guidance is made from sources plus triggers. Checking guidance is read-only; changing the active guidance set is versioned and audited.</p>
  <dl class="gd-meta">
    <div><dt>Active guidance set</dt><dd><code>${escapeHtml(activeVersionId)}</code></dd></div>
    <div><dt>Registry backend</dt><dd><code>${escapeHtml(registryStore)}</code></dd></div>
    <div><dt>Sources</dt><dd>${escapeHtml(String(sourceCount))}</dd></div>
    <div><dt>Triggers</dt><dd>${escapeHtml(String(triggerCount))}</dd></div>
    <div><dt>Versioned mutations</dt><dd>${canMutate ? "allowed" : "blocked"}</dd></div>
  </dl>
  ${
    canMutate
      ? '<p class="gd-muted">Confirm in the editor before running a mutation. You must supply <code>actor</code>, rationale, and <code>caeMutationApproval</code>. That approval is <strong>only</strong> for CAE registry commands — it is <strong>not</strong> Tier A/B <code>policyApproval</code> on other kit runs.</p>'
      : `<p class="gd-muted">${escapeHtml(denial)}</p><p class="gd-muted">When versioned mutations are enabled, the extension uses <code>caeMutationApproval</code> in CAE commands — separate from Tier A/B <code>policyApproval</code> on <code>run</code> / <code>run-transition</code>.</p>`
  }
  <div class="gd-actions">
    <button type="button" class="gd-btn"${mutDisabledAttrs} data-wc-action="guidance-version-clone" data-version-id="${escapeHtmlAttr(activeVersionId)}">Create draft from active set</button>
    <button type="button" class="gd-btn"${mutDisabledAttrs} data-wc-action="guidance-version-rollback">Roll back to previous set</button>
  </div>
  <details>
    <summary>Guidance Library</summary>
    <div class="gd-library">
      <div>
        <h3>Sources</h3>
        ${artifactIds.length ? artifactIds.slice(0, 8).map((id) => `<p><code>${escapeHtml(id)}</code></p>`).join("") : '<p class="gd-muted">No sources returned.</p>'}
      </div>
      <div>
        <h3>Triggers</h3>
        ${activationIds.length ? activationIds.slice(0, 8).map((id) => `<p><code>${escapeHtml(id)}</code></p>`).join("") : '<p class="gd-muted">No triggers returned.</p>'}
      </div>
    </div>
  </details>
  <details>
    <summary>Versions and rollback</summary>
    <div class="gd-list">
      ${
        versions.length
          ? versions
              .map((row) => {
                const versionId = String(row.versionId ?? "");
                return `<div class="gd-row gd-row-compact">
  <span><b>${escapeHtml(versionId)}</b><br><span class="gd-muted">${row.isActive === true ? "Active" : "Inactive"} · ${escapeHtml(String(row.createdAt ?? ""))} · ${escapeHtml(String(row.artifactCount ?? 0))} sources · ${escapeHtml(String(row.activationCount ?? 0))} triggers</span></span>
  ${
    row.isActive === true
      ? '<span class="gd-pill">Active</span>'
      : `<button type="button" class="gd-btn"${mutDisabledAttrs} data-wc-action="guidance-version-activate" data-version-id="${escapeHtmlAttr(versionId)}">Activate</button>`
  }
</div>`;
              })
              .join("")
          : '<p class="gd-muted">No guidance-set versions returned.</p>'
      }
    </div>
  </details>
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

  return `<section class="gd-card gd-status-card">
  <div class="gd-card-head">
    <h2>Guidance System</h2>
    <span class="${statusClass(healthy)}">${healthy ? "Ready" : "Needs attention"}</span>
  </div>
  <p class="gd-muted">Read-only pre-flight checks use the active guidance set. Sensitive command approval is handled separately when a workflow asks for it.</p>
  <dl class="gd-meta">
    <div><dt>Guidance system</dt><dd>${escapeHtml(boolLabel(health.caeEnabled))}</dd></div>
    <div><dt>Guidance set</dt><dd>${escapeHtml(String(health.registryStatus ?? "unknown"))}</dd></div>
    <div><dt>Active set</dt><dd><code>${escapeHtml(String(health.activeRegistryVersionId ?? "n/a"))}</code></dd></div>
    <div><dt>Check history</dt><dd>${escapeHtml(boolLabel(health.persistenceEnabled))}</dd></div>
    <div><dt>Check records</dt><dd>${escapeHtml(String(health.traceRowCount ?? recent.count ?? 0))}</dd></div>
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
  <div class="gd-card-head"><h2>Recent Activity</h2><span class="gd-pill">${recent.available === false ? "History off" : "Grouped"}</span></div>
  ${renderActivityRows(recent.rows)}
</section>

${renderManageGuidance(data)}

<section class="gd-card">
  <div class="gd-card-head"><h2>Acknowledgements</h2><span class="gd-pill">${escapeHtml(String(acks.count ?? 0))}</span></div>
  ${renderAckRows(acks.rows)}
  <p class="gd-muted">Acknowledgement means “I read this guidance.” It is not permission to run a sensitive command.</p>
</section>

<section class="gd-card">
  <div class="gd-card-head"><h2>Guidance Feedback</h2><span class="gd-pill">Local tuning signal</span></div>
  ${renderFeedbackSummary(feedback)}
  <p class="gd-muted">Useful/noisy feedback records a signal. It does not change the active guidance set unless you create and activate a versioned update.</p>
</section>

${renderRawDetails("Debug details JSON", data, 12000)}`;
}

function renderGuidanceCard(cardRaw: unknown, traceId: string, commandName: string): string {
  const card = asRecord(cardRaw);
  const activationId = String(card.activationId ?? "");
  const artifactIds = asArray(card.artifactIds).map((x) => String(x));
  const titles = asArray(card.sourceTitles).map((x) => String(x));
  const matchReason =
    typeof card.matchReason === "string" && card.matchReason
      ? card.matchReason
      : `Matched ${titles.length ? titles.slice(0, 2).join(", ") : activationId}; priority ${String(card.priority ?? 0)}, fit ${String(card.aggregateTightness ?? 0)}.`;
  return `<div class="gd-guidance-card">
  <div class="gd-card-head">
    <h3>${escapeHtml(String(card.title ?? activationId))}</h3>
    <span class="gd-pill">${escapeHtml(String(card.attention ?? "advisory"))}</span>
  </div>
  <p class="gd-muted">${escapeHtml(String(card.familyLabel ?? card.family ?? "Guidance item"))}</p>
  <p><b>Why this appeared:</b> ${escapeHtml(matchReason)}</p>
  <p><b>Sources:</b> ${titles.map(escapeHtml).join(", ") || "No source title returned."}</p>
  <details class="gd-debug">
    <summary>Debug source ids</summary>
    <p><code>${escapeHtml(activationId)}</code></p>
    <p>${artifactIds.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}</p>
  </details>
  <div class="gd-actions">
    <button type="button" class="gd-btn" data-wc-action="guidance-explain" data-trace-id="${escapeHtmlAttr(traceId)}">Review why</button>
    <button type="button" class="gd-btn" data-wc-action="guidance-improve" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-command-name="${escapeHtmlAttr(commandName)}">Improve this guidance</button>
    <button type="button" class="gd-btn" data-wc-action="guidance-feedback" data-signal="useful" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-command-name="${escapeHtmlAttr(commandName)}">Useful</button>
    <button type="button" class="gd-btn" data-wc-action="guidance-feedback" data-signal="noisy" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-command-name="${escapeHtmlAttr(commandName)}">Noisy</button>
  </div>
</div>`;
}

function renderConflictSummary(conflictShadowSummary: unknown): string {
  const summary = asRecord(conflictShadowSummary);
  const entries = asArray(summary.entries);
  if (entries.length === 0) return "";
  return `<section class="gd-card gd-warn-card"><h2>Possible guidance conflicts</h2>${entries
    .map((raw) => {
      const entry = asRecord(raw);
      const activationIds = asArray(entry.activationIds).map((id) => String(id));
      return `<div class="gd-guidance-card">
  <div class="gd-card-head">
    <h3>${escapeHtml(String(entry.kind ?? "conflict"))}</h3>
    <span class="gd-pill">${escapeHtml(String(entry.resolution ?? "shadow"))}</span>
  </div>
  <p>${escapeHtml(userFacingTerm(String(entry.detail ?? "Guidance candidates overlapped; review the involved trigger ids before treating either as final.")))}</p>
  <details class="gd-debug"><summary>Debug trigger ids</summary><p class="gd-muted">${activationIds.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}</p></details>
</div>`;
    })
    .join("")}<p class="gd-muted">Conflict cards are advisory in Preview mode; use them to decide whether the registry needs cleanup.</p></section>`;
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
      const title = activationTitle(row);
      return `<div class="gd-row">
  <span><b>${escapeHtml(title)}</b><br><span class="gd-muted">${escapeHtml(String(row.strength ?? ""))}${activationId && activationId !== title ? ` · ${escapeHtml(activationId)}` : ""}</span></span>
  <button type="button" class="gd-btn gd-primary" data-wc-action="guidance-ack" data-trace-id="${escapeHtmlAttr(traceId)}" data-activation-id="${escapeHtmlAttr(activationId)}" data-ack-token="${escapeHtmlAttr(ackToken)}">Acknowledge</button>
</div>`;
    })
    .join("")}<p class="gd-muted">This records “I read this guidance.” It does not grant policy approval for another command or change agent behavior settings.</p></section>`;
}

function renderDraftImpactSummaryPanel(raw: unknown): string {
  const di = asRecord(raw);
  const samples = asArray(di.samples);
  if (!samples.length) {
    return '<section class="gd-card gd-warn-card"><h2>Draft impact</h2><p>No sample matrix rows produced.</p></section>';
  }
  const readinessRaw = di.activationReadiness;
  const readiness = readinessRaw !== undefined && readinessRaw !== null ? asRecord(readinessRaw) : null;
  const blastRaw = di.blastRadiusSummary;
  const blast = blastRaw !== undefined && blastRaw !== null ? asRecord(blastRaw) : null;
  const level = readiness ? String(readiness.level ?? "ok") : "";
  const levelPillClass =
    level === "stop_confirm"
      ? "gd-pill gd-readiness-danger"
      : level === "warning"
        ? "gd-pill gd-readiness-warn"
        : "gd-pill gd-readiness-ok";
  const levelLabel =
    level === "stop_confirm" ? "Stop and confirm" : level === "warning" ? "Review warnings" : "Looks OK";

  let readinessBlock = "";
  if (readiness) {
    const reasons = asArray(readiness.reasons);
    const conflictN = Number(readiness.conflictEntryCount ?? 0);
    const subset = readiness.sameFamilyConflictSubset ? asArray(readiness.sameFamilyConflictSubset) : [];
    const reasonList =
      reasons.length > 0
        ? `<ul class="gd-readiness-list">${reasons
            .map((r) => {
              const row = asRecord(r);
              const sev = String(row.severity ?? "info");
              return `<li class="gd-sev-${escapeHtml(sev)}">${escapeHtml(String(row.message ?? row.code ?? ""))}</li>`;
            })
            .join("")}</ul>`
        : "";
    readinessBlock = `<div class="gd-readiness-banner">
  <div class="gd-card-head gd-readiness-head"><h3>Activation readiness</h3><span class="${levelPillClass}">${escapeHtml(levelLabel)}</span></div>
  <dl class="gd-meta gd-meta-tight">
    <div><dt>Preview trace id</dt><dd><code>${escapeHtml(String(readiness.primaryPreviewTraceId ?? ""))}</code></dd></div>
    <div><dt>Usefulness signal</dt><dd>${escapeHtml(String(readiness.usefulnessSignal ?? "?"))}</dd></div>
    <div><dt>Conflicts</dt><dd>${escapeHtml(String(conflictN))} · draft in ${escapeHtml(String(readiness.conflictsInvolvingDraft ?? 0))}</dd></div>
    <div><dt>Acknowledgements Δ</dt><dd>${escapeHtml(String(readiness.acknowledgementDelta ?? 0))}</dd></div>
  </dl>
  ${reasonList}
  ${
    subset.length > 0
      ? `<details class="gd-debug"><summary>Conflict detail (truncated)</summary><pre>${escapeHtml(
          JSON.stringify(subset.slice(0, 5), null, 2).slice(0, 4800)
        )}</pre></details>`
      : ""
  }</div>`;
  }

  let blastBlock = "";
  if (blast) {
    const tally = blast.tallyBySampleKindWhereDraftMatched
      ? asRecord(blast.tallyBySampleKindWhereDraftMatched)
      : null;
    const tallyRows = tally
      ? Object.entries(tally)
          .filter(([, v]) => typeof v === "number" && (v as number) > 0)
          .map(([k, v]) => `<tr><td><code>${escapeHtml(k)}</code></td><td>${escapeHtml(String(v))}</td></tr>`)
          .join("")
      : "";
    const examples = blast.representativeMatchedLabels ? asArray(blast.representativeMatchedLabels) : [];
    const exBlock =
      examples.length > 0
        ? `<ul class="gd-blast-examples">${examples
            .map((x) => `<li>${escapeHtml(String(x ?? ""))}</li>`)
            .join("")}</ul>`
        : "";
    blastBlock = `<section class="gd-card gd-blast gd-warn-card">
<h3>Blast radius (sampled)</h3>
<p class="gd-muted">Draft scope bucket <strong>${escapeHtml(String(blast.draftScopeCategory ?? ""))}</strong> · Samples where draft surfaced: ${escapeHtml(
      String(blast.samplesWhereDraftMatched ?? 0)
    )}/${escapeHtml(String(blast.totalSamplesEvaluated ?? 0))}; planning-queue rows sampled: ${escapeHtml(String(blast.planningTasksIncluded ?? 0))}</p>
${exBlock}
${tallyRows ? `<table class="gd-draft-table"><thead><tr><th>Sample kind</th><th>Matches</th></tr></thead><tbody>${tallyRows}</tbody></table>` : "<p class=\"gd-muted\">No kind-specific tally (draft invisible on sampled rows).</p>"}</section>`;
  }

  const broadBlock = asArray(di.broadScopeWarnings);
  const broadList = broadBlock
    .map((w) => {
      const row = asRecord(w);
      return `<li>${escapeHtml(String(row.message ?? row.code ?? "warning"))}</li>`;
    })
    .join("");
  const warnBlock =
    broadList.length > 0 ? `<div class="gd-warning gd-warn-card"><ul>${broadList}</ul></div>` : "";
  const tableRows = samples
    .map((sampleRaw) => {
      const sample = asRecord(sampleRaw);
      const baseline = asRecord(sample.baselineFamilyCounts);
      const overlay = asRecord(sample.overlayFamilyCounts);
      const lbl = escapeHtml(String(sample.label ?? ""));
      const cmd = escapeHtml(String(sample.commandName ?? ""));
      const tk = sample.taskId ? ` · ${escapeHtml(String(sample.taskId))}` : "";
      const vis = sample.draftVisibleInOverlay === true ? "Visible" : "Not shown";
      const kind = sample.sampleKind ? `<span class="gd-muted"><code>${escapeHtml(String(sample.sampleKind))}</code></span>` : "";
      return `<tr><td>${lbl} ${kind}</td><td><code>${cmd}</code>${tk}</td><td>${escapeHtml(
        `p${String(baseline.policy ?? 0)} t${String(baseline.think ?? 0)} d${String(baseline.do ?? 0)} r${String(
          baseline.review ?? 0
        )}`
      )}</td><td>${escapeHtml(
        `p${String(overlay.policy ?? 0)} t${String(overlay.think ?? 0)} d${String(overlay.do ?? 0)} r${String(
          overlay.review ?? 0
        )}`
      )}</td><td>${escapeHtml(vis)}</td></tr>`;
    })
    .join("");
  return `<section class="gd-card gd-draft-impact">
  <h2>Draft impact sampling</h2>
  <p class="gd-muted">${escapeHtml(String(di.scopePlainSummary ?? ""))}</p>
  ${readinessBlock}
  ${blastBlock}
  ${warnBlock}
  <table class="gd-draft-table"><thead><tr><th>Context</th><th>Selection</th><th>Baseline families</th><th>With draft</th><th>Draft</th></tr></thead><tbody>${tableRows}</tbody></table>
  <p class="gd-muted">Preset <code>${escapeHtml(String(di.scopePreset ?? ""))}</code> · Overlay digest <code>${escapeHtml(
    String(di.overlayRegistryDigestSnippet ?? "")
  )}</code></p>
</section>`;
}

function renderEnforcementReadinessPanel(raw: unknown): string {
  const er = asRecord(raw);
  if (Number(er.schemaVersion) !== 1) return "";
  const pill =
    er.governanceEvidenceComplete === true
      ? "gd-pill gd-readiness-ok"
      : er.previewGatesSatisfied === true
        ? "gd-pill gd-readiness-warn"
        : "gd-pill gd-readiness-danger";
  const pillLabel =
    er.governanceEvidenceComplete === true
      ? "Governance evidence OK"
      : er.previewGatesSatisfied === true
        ? "Preview gates OK"
        : "Not promotion-ready";
  const codes = asArray(er.blockingCodes).map((c) => String(c));
  const notes = asArray(er.notes).map((n) => String(n));
  const codesBlock =
    codes.length > 0
      ? `<p class="gd-muted"><strong>Codes:</strong> ${codes.map((c) => `<code>${escapeHtml(c)}</code>`).join(", ")}</p>`
      : "";
  const notesBlock =
    notes.length > 0
      ? `<ul class="gd-readiness-list">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
      : "";
  return `<section class="gd-card gd-warn-card gd-enforcement-readiness">
  <div class="gd-card-head gd-readiness-head">
    <h2>Enforcement readiness (contract)</h2>
    <span class="${pill}">${escapeHtml(pillLabel)}</span>
  </div>
  <p class="gd-muted">Hard-stop CAE enforcement stays opt-in (<code>kit.cae.enforcement.enabled</code> + allowlist). This card is the authoring gate — separate from <code>policyApproval</code> and <code>caeMutationApproval</code>.</p>
  <dl class="gd-meta gd-meta-tight">
    <div><dt>Family hard-stop capable</dt><dd>${er.familyHardStopCapable === true ? "yes (policy only)" : "no"}</dd></div>
    <div><dt>Conflict posture</dt><dd><code>${escapeHtml(String(er.conflictStatus ?? ""))}</code></dd></div>
    <div><dt>Activation readiness</dt><dd><code>${escapeHtml(String(er.activationReadinessLevel ?? ""))}</code></dd></div>
    <div><dt>Preview digest</dt><dd><code>${escapeHtml(String(er.previewDigest ?? ""))}</code></dd></div>
  </dl>
  ${codesBlock}
  ${notesBlock}
</section>`;
}

export function renderGuidancePreviewInnerHtml(payload: unknown): string {
  const root = asRecord(payload);
  if (Object.keys(root).length === 0) {
    return '<section class="gd-card gd-empty"><h2>No check yet</h2><p class="gd-muted">Choose a task and workflow, then run a read-only pre-flight check.</p></section>';
  }
  if (root.ok === false) {
    return `<section class="gd-card gd-danger"><h2>Preview failed</h2><p>${escapeHtml(String(root.message ?? root.code ?? "Unknown error"))}</p></section>`;
  }
  const data = asRecord(root.data ?? root);
  const traceId = String(data.traceId ?? "");
  const commandName = String(asRecord(data.evaluationContext).command ? asRecord(asRecord(data.evaluationContext).command).name ?? "" : "");
  const cards = asRecord(data.guidanceCards);
  const counts = asRecord(data.familyCounts);
  const totalCards = Number(counts.policy ?? 0) + Number(counts.think ?? 0) + Number(counts.do ?? 0) + Number(counts.review ?? 0);
  return `<section class="gd-card gd-result-card">
  <div class="gd-card-head">
    <h2>Pre-flight result</h2>
    <span class="gd-pill">${escapeHtml(String(data.modeLabel ?? data.evalMode ?? "Preview mode"))}</span>
  </div>
  <p>${totalCards > 0 ? `Review ${escapeHtml(String(totalCards))} guidance item${totalCards === 1 ? "" : "s"} before running this workflow.` : "No special guidance items matched this workflow."}</p>
  <div class="gd-counts">${renderFamilyCounts(counts)}</div>
  <details class="gd-debug"><summary>Debug check record</summary><p class="gd-muted">Check record <code>${escapeHtml(traceId)}</code>${data.ephemeral ? " · stored in memory only (draft impact preview skips durable trace writes)" : " · stored in workspace database"}</p></details>
</section>
${data.draftImpact ? renderDraftImpactSummaryPanel(data.draftImpact) : ""}
${data.enforcementReadiness ? renderEnforcementReadinessPanel(data.enforcementReadiness) : ""}
${renderPendingAcks(data.pendingAcknowledgements, traceId)}
${renderConflictSummary(data.conflictShadowSummary)}
${renderFamilySection("Rules to follow", cards.policy, traceId, commandName)}
${renderFamilySection("Things to consider", cards.think, traceId, commandName)}
${renderFamilySection("Suggested steps", cards.do, traceId, commandName)}
${renderFamilySection("Review checks", cards.review, traceId, commandName)}
${renderRawDetails("Raw preview JSON", data, 16000)}`;
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
    <h2>Why this guidance appeared</h2>
    <span class="gd-pill">${explainData.ephemeral ? "Temporary" : "Stored"}</span>
  </div>
  <p>${escapeHtml(userFacingTerm(String(explanation.summaryText ?? "No explanation summary available.")))}</p>
  <dl class="gd-meta">
    <div><dt>Check record</dt><dd><code>${escapeHtml(traceId || "unknown")}</code></dd></div>
    <div><dt>Guidance result</dt><dd><code>${escapeHtml(String(trace.bundleId ?? "unknown"))}</code></dd></div>
    <div><dt>Mode</dt><dd>${escapeHtml(String(evalSummary.evalMode ?? "unknown"))}</dd></div>
    <div><dt>Conflicts</dt><dd>${escapeHtml(String(evalSummary.conflictCount ?? 0))}</dd></div>
    <div><dt>Pending acknowledgements</dt><dd>${escapeHtml(String(ackSummary.pendingAckCount ?? 0))}</dd></div>
  </dl>
  <div class="gd-counts">${renderFamilyCounts(counts)}</div>
</section>
${traceFetchMissing ? `<section class="gd-card gd-warn-card"><h2>Stored check not found</h2><p>${escapeHtml(String(traceFetch.message ?? traceFetch.code ?? "This check is no longer available in the durable store."))}</p><p class="gd-muted">Run a fresh Guidance preview with history enabled to capture a new durable check.</p></section>` : ""}
${renderRawDetails("Raw trace JSON", { explain, traceFetch }, 20000)}`;
}

export function renderGuidanceActionResultInnerHtml(payload: unknown): string {
  const root = asRecord(payload);
  const action = String(root.action ?? "Guidance action");
  const result = asRecord(root.result);
  const ctx = root.mutationContext && typeof root.mutationContext === "object" ? asRecord(root.mutationContext) : null;
  const ok = result.ok !== false;
  const title = ok ? `${action} recorded` : `${action} failed`;
  const code = result.code;
  const msg = String(result.message ?? result.code ?? (ok ? "The Guidance action completed." : "The Guidance action did not complete."));
  const remed = !ok ? mutationFailureRemediation(code) : null;
  const data = result.data && typeof result.data === "object" ? asRecord(result.data) : null;
  let auditBlock = "";
  if (ok && ctx?.kind === "registry-mutation" && data) {
    const cmd = typeof ctx.commandName === "string" ? ctx.commandName : "";
    const actor = typeof ctx.actor === "string" ? ctx.actor : "";
    const vid =
      typeof data.versionId === "string"
        ? data.versionId
        : typeof data.toVersionId === "string"
          ? data.toVersionId
          : typeof data.activatedVersionId === "string"
            ? data.activatedVersionId
            : "";
    const fromV = typeof data.fromVersionId === "string" ? data.fromVersionId : "";
    const verifyCmd = `pnpm exec wk run cae-dashboard-summary '{"schemaVersion":1}'`;
    auditBlock = `<div class="gd-card" style="margin-top:8px;padding:8px;border:1px dashed var(--vscode-widget-border)">
  <h3 style="margin:0 0 6px;font-size:12px">Audit trail (local)</h3>
  <dl class="gd-meta">
    <div><dt>Kit command</dt><dd><code>${escapeHtml(cmd)}</code></dd></div>
    ${actor ? `<div><dt>Actor</dt><dd><code>${escapeHtml(actor)}</code></dd></div>` : ""}
    ${vid ? `<div><dt>Version</dt><dd><code>${escapeHtml(vid)}</code></dd></div>` : ""}
    ${fromV ? `<div><dt>Cloned from</dt><dd><code>${escapeHtml(fromV)}</code></dd></div>` : ""}
    <div><dt>Verify</dt><dd><code>${escapeHtml(verifyCmd)}</code></dd></div>
  </dl>
  <p class="gd-muted" style="margin:6px 0 0">Timestamp and audit row id are stored in workspace SQLite (<code>cae_registry_mutation_audit</code>) when mutations succeed.</p>
</div>`;
  }
  return `<section class="gd-card ${ok ? "" : "gd-danger"}">
  <div class="gd-card-head">
    <h2>${escapeHtml(title)}</h2>
    <span class="${statusClass(ok)}">${ok ? "Done" : "Needs attention"}</span>
  </div>
  <p>${escapeHtml(msg)}</p>
  ${
    remed
      ? `<div class="gd-warn-card" style="padding:8px;margin:8px 0;border-radius:3px"><strong>What to do:</strong> ${escapeHtml(remed)}</div>`
      : ""
  }
  ${ok && action.toLowerCase().includes("noisy") ? '<p class="gd-muted">Next step: use “Improve this guidance” to create a draft update from the noisy item.</p>' : ""}
  ${result.code ? `<p class="gd-muted">Result code: <code>${escapeHtml(String(result.code))}</code></p>` : ""}
  ${auditBlock}
  ${renderRawDetails("Raw action result JSON", result, 12000)}
</section>`;
}
