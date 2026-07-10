import { buildDrawerStateApplierScript, buildHostSnapshotApplierScript } from "./drawer-session.js";

/** Dashboard sidebar webview bootstrap (drawer, tabs, refresh, wcReplaceRoot). */
export function buildDashboardWebviewBootstrapScript(embeddedCaeBootstrapSource: string): string {
  const drawerApplier = buildDrawerStateApplierScript();
  const hostSnapshotApplier = buildHostSnapshotApplierScript();
  return `(function(){
  ${drawerApplier}
  ${hostSnapshotApplier}
  var vscode = window.__wfcVscode || (window.__wfcVscode = acquireVsCodeApi());
  window.__wcEmbeddedCaeBootstrapSource = ${embeddedCaeBootstrapSource};
  function wcReinitEmbeddedCae() {
    var root = document.getElementById('root');
    if (!root) return;
    var host = root.querySelector('.wc-dash-cae-host');
    if (!host || !window.__wcEmbeddedCaeBootstrapSource) return;
    host.querySelectorAll('script[data-wc-cae-injected]').forEach(function(s) { s.remove(); });
    var script = document.createElement('script');
    script.setAttribute('data-wc-cae-injected', '1');
    script.textContent = window.__wcEmbeddedCaeBootstrapSource;
    host.appendChild(script);
  }
  window.wcReinitEmbeddedCae = wcReinitEmbeddedCae;
  var activeTab = 'overview';
  var activeFilter = 'all';
  var activePhaseFilter = 'all';

  var localUiLocks = {};
  var pendingReplaceRootHtml = null;
  var lastAppliedRawHtml = null;
  var hostSnapshot = null;

  function applyDashboardReadModeBadge(badge) {
    var el = document.querySelector('[data-wc-read-mode-badge]');
    if (!el || !badge) return;
    el.textContent = typeof badge.label === 'string' ? badge.label : '';
    if (typeof badge.detail === 'string' && badge.detail.trim().length > 0) {
      el.setAttribute('title', badge.detail.trim());
    } else {
      el.removeAttribute('title');
    }
  }

  var pendingSectionPatches = {};

  /** Locks that defer wcReplaceRoot (editing deliverables, drawer, phase filter open, etc.). */
  function isLocalUiLocked() {
    return Object.keys(localUiLocks).some(function(k) {
      return k !== 'refresh';
    });
  }

  function setUiInteraction(source, active) {
    var key = source || 'unknown';
    if (active) localUiLocks[key] = true;
    else delete localUiLocks[key];
    vscode.postMessage({ type: 'wcUiInteraction', source: key, active: !!active });
    if (!isLocalUiLocked() && pendingReplaceRootHtml) {
      var queued = pendingReplaceRootHtml;
      pendingReplaceRootHtml = null;
      applyReplaceRootHtml(queued);
    }
    if (!isLocalUiLocked() && pendingSectionPatches && Object.keys(pendingSectionPatches).length > 0) {
      var queuedPatches = pendingSectionPatches;
      pendingSectionPatches = {};
      Object.keys(queuedPatches).forEach(function(patchKey) {
        var patch = queuedPatches[patchKey];
        if (patch) applySectionPatch(patch.sectionId, patch.html, patch.state);
      });
    }
  }

  function drawerBusyLabelForWorkflow(workflowId, taskCount) {
    if (workflowId === 'assign-task-phase') return 'Updating task phase…';
    if (workflowId === 'accept-proposed') {
      if (typeof taskCount === 'number' && taskCount > 1) {
        return 'Starting batch accept (' + String(taskCount) + ' tasks)…';
      }
      return 'Accepting…';
    }
    if (workflowId === 'register-phase-catalog') return 'Updating phase catalog…';
    if (workflowId === 'add-wishlist') return 'Creating wishlist item…';
    if (workflowId === 'add-idea') return 'Creating idea…';
    if (workflowId === 'add-phase-note') return 'Adding phase note…';
    return 'Saving changes…';
  }

  function drawerSubmitBusyLabel(panel) {
    if (!panel) return null;
    var wf = panel.getAttribute('data-wc-drawer-workflow') || '';
    var tcRaw = panel.getAttribute('data-wc-drawer-task-count');
    var tc = tcRaw ? parseInt(String(tcRaw), 10) : NaN;
    return drawerBusyLabelForWorkflow(wf, Number.isFinite(tc) ? tc : undefined);
  }

  function setDrawerBusy(busy, label) {
    var dh = document.getElementById('wc-drawer-host');
    if (!dh) return;
    var panel = dh.querySelector('.wc-drawer-panel');
    if (!panel) {
      if (!busy) setUiInteraction('drawer-busy', false);
      return;
    }
    var overlay = panel.querySelector('.wc-drawer-loading');
    if (busy) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'wc-drawer-loading';
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML =
          '<div class="wc-spinner" aria-hidden="true"></div>' +
          '<span class="wc-drawer-loading-label"></span>';
        panel.appendChild(overlay);
      }
      var wf = panel.getAttribute('data-wc-drawer-workflow') || '';
      var tcRaw = panel.getAttribute('data-wc-drawer-task-count');
      var tc = tcRaw ? parseInt(String(tcRaw), 10) : NaN;
      var lab = overlay.querySelector('.wc-drawer-loading-label');
      if (lab) lab.textContent = label || drawerBusyLabelForWorkflow(wf, Number.isFinite(tc) ? tc : undefined);
      overlay.hidden = false;
      panel.classList.add('wc-drawer-panel--busy');
      panel.querySelectorAll('[data-wc-drawer-action]').forEach(function(btn) {
        btn.disabled = true;
      });
      setUiInteraction('drawer-busy', true);
      return;
    }
    if (overlay) overlay.hidden = true;
    panel.classList.remove('wc-drawer-panel--busy');
    panel.querySelectorAll('[data-wc-drawer-action]').forEach(function(btn) {
      btn.disabled = false;
    });
    var subBtn = panel.querySelector('[data-wc-drawer-action="submit"]');
    if (subBtn) subBtn.removeAttribute('data-wc-drawer-submitting');
    setUiInteraction('drawer-busy', false);
  }

  function updateDrawerBusyLabel(label) {
    if (!label) return;
    setDrawerBusy(true, label);
  }

  function setButtonBusy(el, busy, label) {
    if (!el) return;
    if (busy) {
      if (!el.getAttribute('data-wc-original-html')) {
        el.setAttribute('data-wc-original-html', el.innerHTML);
      }
      el.disabled = true;
      el.innerHTML =
        '<span class="wc-btn-loading">' +
        '<span class="wc-spinner wc-spinner-inline" aria-hidden="true"></span>' +
        '<span>' + (label || 'Loading…') + '</span></span>';
      return;
    }
    el.disabled = false;
    var original = el.getAttribute('data-wc-original-html');
    if (original) el.innerHTML = original;
  }

  function ideaRowFor(el) {
    return el && el.closest ? el.closest('[data-wc-idea-id]') : null;
  }

  function setIdeaRowStatus(row, message, isError) {
    if (!row) return;
    var status = row.querySelector('[data-wc-idea-row-status]');
    if (!status) return;
    status.textContent = message || '';
    if (isError) status.setAttribute('data-wc-error', '1');
    else status.removeAttribute('data-wc-error');
  }

  function setIdeaRowBusy(row, busy, label) {
    if (!row) return;
    var save = row.querySelector('[data-wc-action="idea-update"]');
    var del = row.querySelector('[data-wc-action="idea-delete"]');
    var plan = row.querySelector('[data-wc-action="idea-plan"]');
    var brainstorm = row.querySelector('[data-wc-action="idea-brainstorm"]');
    if (save) setButtonBusy(save, !!busy, label || 'Saving...');
    if (del) del.disabled = !!busy;
    if (plan) setButtonBusy(plan, !!busy, label || 'Saving...');
    if (brainstorm) setButtonBusy(brainstorm, !!busy, label || 'Saving...');
    row.querySelectorAll('[data-wc-ideas-edit-form] input, [data-wc-ideas-edit-form] textarea, [data-wc-ideas-edit-form] button').forEach(function(el) {
      el.disabled = !!busy;
    });
  }

  function submitIdeaPlan(row) {
    if (!row) return;
    var ideaId = (row.getAttribute('data-wc-idea-id') || '').trim();
    if (!ideaId) return;
    var planBtn = row.querySelector('[data-wc-action="idea-plan"]');
    if (planBtn && planBtn.disabled) return;
    setIdeaRowBusy(row, true, 'Opening...');
    vscode.postMessage({type:'prefillIdeaPlanningChat',ideaId:ideaId,title:row.getAttribute('data-wc-idea-title')||'',note:row.getAttribute('data-wc-idea-note')||''});
  }

  function submitIdeaBrainstorm(row, trigger) {
    if (!row) return;
    var ideaId = (row.getAttribute('data-wc-idea-id') || '').trim();
    if (!ideaId) return;
    var planRef = trigger && trigger.getAttribute ? (trigger.getAttribute('data-plan-ref') || '').trim() : '';
    var brainstormBtn = row.querySelector('[data-wc-action="idea-brainstorm"]');
    if (brainstormBtn && brainstormBtn.disabled) return;
    setIdeaRowBusy(row, true, 'Opening...');
    vscode.postMessage({type:'prefillIdeaBrainstormChat',ideaId:ideaId,planRef:planRef,title:row.getAttribute('data-wc-idea-title')||'',note:row.getAttribute('data-wc-idea-note')||''});
  }

  function submitPlanBrainstorm(trigger) {
    if (!trigger) return;
    var planRef = (trigger.getAttribute('data-plan-ref') || '').trim();
    if (!planRef) return;
    if (trigger.disabled) return;
    setButtonBusy(trigger, true, 'Opening...');
    var ideaId = (trigger.getAttribute('data-idea-id') || '').trim();
    vscode.postMessage({type:'prefillIdeaBrainstormChat',ideaId:ideaId,planRef:planRef,title:'',note:''});
  }

  function setIdeaEditMode(row, editing) {
    if (!row) return;
    var form = row.querySelector('[data-wc-ideas-edit-form]');
    var title = row.querySelector('[data-wc-idea-edit-title]');
    var note = row.querySelector('[data-wc-idea-edit-note]');
    if (title) title.value = row.getAttribute('data-wc-idea-title') || '';
    if (note) note.value = row.getAttribute('data-wc-idea-note') || '';
    if (form) form.hidden = !editing;
    setIdeaRowStatus(row, '', false);
    if (editing && title && title.focus) title.focus();
  }

  function submitIdeaUpdate(row) {
    if (!row) return;
    var ideaId = (row.getAttribute('data-wc-idea-id') || '').trim();
    var titleEl = row.querySelector('[data-wc-idea-edit-title]');
    var noteEl = row.querySelector('[data-wc-idea-edit-note]');
    var title = titleEl && titleEl.value != null ? String(titleEl.value).trim() : '';
    var note = noteEl && noteEl.value != null ? String(noteEl.value).trim() : '';
    if (!ideaId) return;
    if (!title) {
      setIdeaRowStatus(row, 'Title required.', true);
      if (titleEl && titleEl.focus) titleEl.focus();
      return;
    }
    setIdeaRowBusy(row, true, 'Saving...');
    vscode.postMessage({ type: 'updateIdea', ideaId: ideaId, title: title, note: note });
  }

  function submitIdeaDelete(row) {
    if (!row) return;
    var ideaId = (row.getAttribute('data-wc-idea-id') || '').trim();
    if (!ideaId) return;
    setIdeaRowBusy(row, true, 'Deleting...');
    vscode.postMessage({ type: 'deleteIdea', ideaId: ideaId });
  }

  function showIdeasToast(message, undo) {
    var toast = document.querySelector('[data-wc-ideas-toast]');
    if (!toast) return;
    toast.textContent = message || '';
    if (undo) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wc-btn wc-btn-sm wc-btn-secondary';
      btn.setAttribute('data-wc-action', 'idea-undo-delete');
      btn.textContent = 'Undo';
      toast.appendChild(document.createTextNode(' '));
      toast.appendChild(btn);
    }
    toast.hidden = false;
  }

  function capturePhaseDeliverablesEditState(root) {
    if (!root) return null;
    var rows = root.querySelectorAll('[data-wc-phase-row]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var editor = row.querySelector('.dash-phase-deliverables-editor');
      if (!editor || editor.hidden) continue;
      var input = row.querySelector('.dash-phase-deliverables-input');
      var phaseKey = (row.getAttribute('data-wc-phase-row') || '').trim();
      if (!phaseKey) continue;
      return {
        phaseKey: phaseKey,
        value: input && input.value != null ? String(input.value) : '',
        original: input ? input.getAttribute('data-wc-original') || '' : '',
        pending: !!(input && input.getAttribute('data-wc-pending') === '1')
      };
    }
    return null;
  }

  function restorePhaseDeliverablesEditState(state) {
    if (!state || !state.phaseKey) return;
    var row = document.querySelector('[data-wc-phase-row="' + state.phaseKey.replace(/"/g, '\\\\"') + '"]');
    if (!row) return;
    var input = row.querySelector('.dash-phase-deliverables-input');
    if (input) {
      input.value = state.value;
      input.setAttribute('data-wc-original', state.original);
      if (state.pending) {
        input.setAttribute('data-wc-pending', '1');
        input.disabled = true;
      } else {
        input.disabled = false;
        input.removeAttribute('data-wc-pending');
      }
    }
    togglePhaseDeliverablesEdit(row, true);
    if (input && !state.pending) {
      input.setAttribute('data-wc-focus-grace', '1');
      setTimeout(function() {
        if (input) input.removeAttribute('data-wc-focus-grace');
      }, 350);
    }
    setUiInteraction('phase-deliverables', true);
  }

  function captureConfigTabState(root) {
    if (activeTab !== 'config' || !root) return null;
    var list = root.querySelector('#config-list-root');
    if (!list || list.querySelector('.cfg-loading')) return null;
    var filter = root.querySelector('#cfg-filter');
    var maint = root.querySelector('#cfg-maintainer');
    var status = root.querySelector('#cfg-status');
    var explain = root.querySelector('#cfg-explain-host');
    var restart = root.querySelector('#cfg-restart-host');
    return {
      listHtml: list.innerHTML,
      editFocus: window.wcConfigTab && window.wcConfigTab.captureEditFocus
        ? window.wcConfigTab.captureEditFocus()
        : null,
      explainKey: window.wcConfigTab && window.wcConfigTab.getActiveExplainKey
        ? window.wcConfigTab.getActiveExplainKey()
        : '',
      filter: filter ? filter.value : '',
      maintainer: maint ? !!maint.checked : false,
      statusClass: status ? status.className : '',
      statusText: status ? status.textContent : '',
      explainHtml: explain ? explain.innerHTML : '',
      restartHtml: restart ? restart.innerHTML : ''
    };
  }

  function restoreConfigTabState(root, state) {
    if (!state || !root) return;
    var list = root.querySelector('#config-list-root');
    if (!list) return;
    list.innerHTML = state.listHtml;
    list.removeAttribute('data-wc-bound');
    var filter = root.querySelector('#cfg-filter');
    if (filter) filter.value = state.filter || '';
    var maint = root.querySelector('#cfg-maintainer');
    if (maint) maint.checked = !!state.maintainer;
    var status = root.querySelector('#cfg-status');
    if (status) {
      status.className = state.statusClass || 'cfg-status cfg-status-info';
      status.textContent = state.statusText || '';
    }
    var explain = root.querySelector('#cfg-explain-host');
    if (explain) explain.innerHTML = state.explainHtml || '';
    var restart = root.querySelector('#cfg-restart-host');
    if (restart) restart.innerHTML = state.restartHtml || '';
    if (window.wcConfigTab) {
      if (window.wcConfigTab.afterDomUpdate) window.wcConfigTab.afterDomUpdate();
      if (window.wcConfigTab.applyFilter) window.wcConfigTab.applyFilter();
      if (state.editFocus && window.wcConfigTab.restoreEditFocus) {
        window.wcConfigTab.restoreEditFocus(state.editFocus);
      }
      if (state.explainKey && window.wcConfigTab.setExplainActiveKey) {
        window.wcConfigTab.setExplainActiveKey(state.explainKey, false);
      }
    }
  }

  function normalizeBucketTaskIdsAttr(raw) {
    if (!raw || !String(raw).trim()) return '';
    return String(raw)
      .split(',')
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s.length > 0; })
      .sort()
      .join(',');
  }

  function bucketMetaMatches(bucket, entry) {
    if (!bucket || !entry) return false;
    return (
      (bucket.getAttribute('data-wc-bucket-count') || '') === entry.count &&
      normalizeBucketTaskIdsAttr(bucket.getAttribute('data-wc-bucket-task-ids')) ===
        normalizeBucketTaskIdsAttr(entry.taskIds)
    );
  }

  function applyReplaceRootHtml(html) {
    var root = document.getElementById('root');
    if (!root) return;
    if (lastAppliedRawHtml === html) {
      var refreshBtn = document.getElementById('btn');
      setButtonBusy(refreshBtn, false);
      setUiInteraction('refresh', false);
      return;
    }
    lastAppliedRawHtml = html;
    var preservedUi = captureDashboardExpandableUiState(root);
    var editState = capturePhaseDeliverablesEditState(root);
    var configState = captureConfigTabState(root);
    var preservedQueue = captureQueueSectionUiState(root);
    root.innerHTML = html;
    // Defensive: never leave shell-initial after a successful root replace.
    var shell = root.firstElementChild;
    if (shell && shell.classList) {
      shell.classList.remove('wc-dashboard-shell-initial');
    }
    restoreDashboardExpandableUiState(root, preservedUi);
    restoreConfigTabState(root, configState);
    applyTab(activeTab, activeTab === 'task-engine' || activeTab === 'status' || activeTab === 'config' || activeTab === 'cae');
    restoreQueueSectionUiState(root, preservedQueue);
    applyQueueFilters(root);
    reloadOpenLazyQueueBucketsAfterMetaChange(root, preservedQueue.lazyBuckets);
    if (editState) restorePhaseDeliverablesEditState(editState);
    if (typeof window.wcReinitEmbeddedCae === 'function') window.wcReinitEmbeddedCae();
    renderPlanMermaidDiagrams(root);
    var refreshBtn = document.getElementById('btn');
    setButtonBusy(refreshBtn, false);
    setUiInteraction('refresh', false);
  }

  function lazyBucketPreserveKey(category, phaseKey) {
    return String(category) + '|' + String(phaseKey);
  }

  function uiStateKeyFor(el) {
    if (!el || !el.getAttribute) return '';
    return el.getAttribute('data-wc-ui-state-key') || el.getAttribute('data-wc-track') || '';
  }

  function uiStateSelector(tagName, key) {
    return String(tagName) + '[data-wc-ui-state-key="' + String(key).replace(/"/g, '\\\\"') + '"], ' +
      String(tagName) + '[data-wc-track="' + String(key).replace(/"/g, '\\\\"') + '"]';
  }

  function isCustomExpanded(el) {
    if (el.classList && el.classList.contains('wc-agent-card')) {
      return el.classList.contains('wc-agent-card--expanded');
    }
    var kind = el.getAttribute('data-wc-preserve-expanded') || '';
    if (kind === 'phase-readiness') {
      return !el.classList.contains('wc-cae-readiness-collapsed');
    }
    if (kind === 'phase-progress') {
      return !el.classList.contains('wc-phase-progress-collapsed');
    }
    return el.getAttribute('aria-expanded') === 'true';
  }

  function setAgentCardExpanded(card, expanded) {
    if (!card) return;
    card.classList.toggle('wc-agent-card--expanded', !!expanded);
    var tree = card.querySelector('.wc-agent-tree');
    if (tree) {
      tree.hidden = !expanded;
      tree.style.display = expanded ? '' : 'none';
    }
    var toggle = card.querySelector('[data-wc-action="toggle-agent-card"]');
    if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function applyCustomExpandedState(el, expanded) {
    if (el.classList && el.classList.contains('wc-agent-card')) {
      setAgentCardExpanded(el, expanded);
      return;
    }
    var kind = el.getAttribute('data-wc-preserve-expanded') || '';
    if (kind === 'phase-readiness') {
      el.classList.toggle('wc-cae-readiness-collapsed', !expanded);
      var readinessToggle = el.querySelector('[data-wc-action="phase-readiness-toggle"]');
      if (readinessToggle) readinessToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      return;
    }
    if (kind === 'phase-progress') {
      el.classList.toggle('wc-phase-progress-collapsed', !expanded);
      var progressToggle = el.querySelector('[data-wc-action="phase-progress-toggle"]');
      if (progressToggle) progressToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      return;
    }
    el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function captureDashboardExpandableUiState(root) {
    var details = {};
    var custom = {};
    if (!root) return { details: details, custom: custom };
    root.querySelectorAll('details[data-wc-ui-state-key], details[data-wc-track]').forEach(function(d) {
      var k = uiStateKeyFor(d);
      if (k) details[k] = { open: !!d.open };
    });
    root.querySelectorAll('[data-wc-preserve-expanded][data-wc-ui-state-key], [data-wc-preserve-expanded][data-wc-track]').forEach(function(el) {
      var k = uiStateKeyFor(el);
      if (k) custom[k] = { expanded: isCustomExpanded(el) };
    });
    root.querySelectorAll('.wc-agent-card[data-wc-ui-state-key], .wc-agent-card[data-wc-track]').forEach(function(el) {
      var k = uiStateKeyFor(el);
      if (k) custom[k] = { expanded: isCustomExpanded(el) };
    });
    return { details: details, custom: custom };
  }

  function restoreDashboardExpandableUiState(root, state) {
    if (!root || !state) return;
    Object.keys(state.details || {}).forEach(function(k) {
      var el = root.querySelector(uiStateSelector('details', k));
      if (el && state.details[k]) el.open = state.details[k].open === true;
    });
    Object.keys(state.custom || {}).forEach(function(k) {
      var key = String(k).replace(/"/g, '\\\\"');
      var el = root.querySelector('[data-wc-ui-state-key="' + key + '"], [data-wc-track="' + key + '"]');
      if (el && state.custom[k]) applyCustomExpandedState(el, state.custom[k].expanded === true);
    });
  }

  function captureQueueSectionUiState(root) {
    var detailsState = {};
    if (root) {
      root.querySelectorAll('details.status-section[data-wc-ui-state-key], details.status-section[data-wc-track]').forEach(function(d) {
        var k = uiStateKeyFor(d);
        if (k) detailsState[k] = { open: !!d.open };
      });
    }
    return {
      openTracks: detailsState,
      lazyBuckets: captureLazyQueueBucketBodies(root)
    };
  }

  function restoreQueueSectionUiState(root, state) {
    if (!root || !state) return;
    restoreLazyQueueBucketBodies(root, state.lazyBuckets);
    window.__wcRestoringLazyBuckets = true;
    try {
      Object.keys(state.openTracks || {}).forEach(function(k) {
        var el = root.querySelector('details.status-section[data-wc-track="' + k.replace(/"/g, '\\\\"') + '"]');
        if (!el) el = root.querySelector('details.status-section[data-wc-ui-state-key="' + k.replace(/"/g, '\\\\"') + '"]');
        if (el) el.open = state.openTracks[k] && state.openTracks[k].open === true;
      });
    } finally {
      window.__wcRestoringLazyBuckets = false;
    }
  }

  function captureLazyQueueBucketBodies(root) {
    var map = {};
    if (!root) return map;
    root.querySelectorAll('details.wc-lazy-queue-bucket').forEach(function(bucket) {
      var body = bucket.querySelector('.wc-lazy-bucket-body');
      if (!body || body.getAttribute('data-wc-lazy-loaded') !== '1') return;
      var category = bucket.getAttribute('data-wc-queue-category') || '';
      var phaseKey = bucket.getAttribute('data-wc-phase-key') || '';
      map[lazyBucketPreserveKey(category, phaseKey)] = {
        category: category,
        phaseKey: phaseKey,
        count: bucket.getAttribute('data-wc-bucket-count') || '',
        taskIds: bucket.getAttribute('data-wc-bucket-task-ids') || '',
        bodyHtml: body.innerHTML,
        open: bucket.open
      };
    });
    return map;
  }

  function restoreLazyQueueBucketBodies(root, preserved) {
    if (!root || !preserved) return;
    window.__wcRestoringLazyBuckets = true;
    try {
      Object.keys(preserved).forEach(function(key) {
        var entry = preserved[key];
        if (!entry) return;
        var bucket = root.querySelector(lazyQueueBucketSelector(entry.category, entry.phaseKey));
        if (!bucket) return;
        var body = bucket.querySelector('.wc-lazy-bucket-body');
        if (!body) return;
        body.innerHTML = entry.bodyHtml;
        body.setAttribute('data-wc-lazy-loaded', '1');
        bucket.setAttribute('data-wc-lazy-loaded', '1');
        bucket.removeAttribute('data-wc-lazy-loading');
        bucket.removeAttribute('data-wc-lazy-refreshing');
        bucket.removeAttribute('data-wc-lazy-more-loading');
        if (entry.open) bucket.open = true;
      });
    } finally {
      window.__wcRestoringLazyBuckets = false;
    }
  }

  function reloadOpenLazyQueueBucketsAfterMetaChange(root, preserved) {
    if (!root) return;
    root.querySelectorAll('details.wc-lazy-queue-bucket[open]').forEach(function(d) {
      var category = d.getAttribute('data-wc-queue-category') || '';
      var phaseKey = d.getAttribute('data-wc-phase-key') || '';
      var entry = preserved && preserved[lazyBucketPreserveKey(category, phaseKey)];
      var force = false;
      if (category === 'ready') {
        force = true;
      } else if (!entry || !bucketMetaMatches(d, entry)) {
        force = true;
      }
      if (force) {
        requestLazyQueueBucketLoad(d, undefined, true);
      } else {
        var body = d.querySelector('.wc-lazy-bucket-body');
        if (body && body.getAttribute('data-wc-lazy-loaded') === '1') return;
        requestLazyQueueBucketLoad(d);
      }
    });
  }

  function applySectionPatch(sectionId, html, state) {
    var root = document.getElementById('root');
    if (!root || !sectionId) return;
    var el = root.querySelector('[data-wc-section="' + sectionId + '"]');
    if (!el) return;
    var st = state || 'ready';
    if (st === 'loading' && (el.classList.contains('wc-dash-section--ready') || el.classList.contains('wc-dash-section--stale') || el.classList.contains('wc-dash-section--error'))) {
      el.setAttribute('data-wc-section-refreshing', 'true');
      el.setAttribute('aria-busy', 'true');
      return;
    }
    el.removeAttribute('data-wc-section-refreshing');
    if (sectionId === 'queue' && typeof html === 'string' && html.length > 0) {
      var preservedUi = captureDashboardExpandableUiState(el);
      var preservedQueue = captureQueueSectionUiState(root);
      var temp = document.createElement('div');
      temp.innerHTML = html;
      restoreDashboardExpandableUiState(temp, preservedUi);
      restoreLazyQueueBucketBodies(temp, preservedQueue.lazyBuckets);
      Object.keys(preservedQueue.openTracks || {}).forEach(function(k) {
        var elTemp = temp.querySelector('details.status-section[data-wc-track="' + k.replace(/"/g, '\\\\"') + '"]');
        if (!elTemp) elTemp = temp.querySelector('details.status-section[data-wc-ui-state-key="' + k.replace(/"/g, '\\\\"') + '"]');
        if (elTemp) elTemp.open = preservedQueue.openTracks[k] && preservedQueue.openTracks[k].open === true;
      });
      Object.keys(preservedQueue.lazyBuckets).forEach(function(key) {
        var entry = preservedQueue.lazyBuckets[key];
        if (entry && entry.open) {
          var bucketTemp = temp.querySelector(lazyQueueBucketSelector(entry.category, entry.phaseKey));
          if (bucketTemp) bucketTemp.open = true;
        }
      });
      if (el.innerHTML !== temp.innerHTML) {
        el.innerHTML = temp.innerHTML;
        applyQueueFilters(root);
        reloadOpenLazyQueueBucketsAfterMetaChange(root, preservedQueue.lazyBuckets);
      } else {
        reloadOpenLazyQueueBucketsAfterMetaChange(root, preservedQueue.lazyBuckets);
      }
    } else if (typeof html === 'string' && html.length > 0) {
      var preservedGenericUi = captureDashboardExpandableUiState(el);
      var tempGeneric = document.createElement('div');
      tempGeneric.innerHTML = html;
      restoreDashboardExpandableUiState(tempGeneric, preservedGenericUi);
      if (el.innerHTML !== tempGeneric.innerHTML) {
        el.innerHTML = tempGeneric.innerHTML;
      }
    }
    var staleBadge = el.querySelector('.wc-dash-section-stale-badge');
    if (st === 'stale') {
      if (!staleBadge) {
        staleBadge = document.createElement('p');
        staleBadge.className = 'wc-dash-section-status muted wc-dash-section-stale-badge';
        staleBadge.setAttribute('role', 'status');
        staleBadge.textContent = 'Stale — switch away and back or use Refresh';
        el.insertBefore(staleBadge, el.firstChild);
      }
    } else if (staleBadge) {
      staleBadge.remove();
    }
    el.classList.remove(
      'wc-dash-section--loading',
      'wc-dash-section--ready',
      'wc-dash-section--stale',
      'wc-dash-section--error'
    );
    el.classList.add('wc-dash-section--' + st);
    el.setAttribute('aria-busy', st === 'loading' ? 'true' : 'false');
    // Section patches can hydrate content while the outer shell still carries
    // wc-dashboard-shell-initial (lost wcReplaceRoot). Clear it so the startup
    // timeout probe does not treat a usable dashboard as still loading.
    if (st === 'ready' || st === 'stale' || st === 'error') {
      var shell = root.firstElementChild;
      if (shell && shell.classList && shell.classList.contains('wc-dashboard-shell-initial')) {
        shell.classList.remove('wc-dashboard-shell-initial');
      }
    }
    if (sectionId === 'plan-artifact' || sectionId === 'ideas' || sectionId === 'planning-roster') {
      renderPlanMermaidDiagrams(el);
    }
    if (sectionId === 'cae' && typeof window.wcReinitEmbeddedCae === 'function') {
      window.wcReinitEmbeddedCae();
    }
  }

  function setMarkPhaseBusy(active) {
    var root = document.getElementById('root');
    if (!root) return;
    root.classList.toggle('wc-mark-phase-busy', !!active);
    var btn = root.querySelector('.dash-phase-mark-complete-btn');
    if (btn) setButtonBusy(btn, !!active, active ? 'Marking…' : null);
  }

  function hidePhaseCardsNow() {
    var root = document.getElementById('root');
    if (!root) return;
    root.querySelectorAll('.wc-cae-readiness, .wc-phase-progress').forEach(function(el) { el.remove(); });
  }

  function escPhaseDeliverablesHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function applyPhaseDeliverablesSaved(phaseKey, deliverables) {
    var input = phaseDeliverablesInputFromPhase(phaseKey);
    if (!input) return;
    var row = input.closest('[data-wc-phase-row]');
    if (!row) return;
    var text = row.querySelector('.dash-phase-deliverables-text');
    var saving = row.querySelector('.dash-phase-saving');
    var val = deliverables == null ? '' : String(deliverables).trim();
    if (text) {
      text.innerHTML = val.length > 0 ? escPhaseDeliverablesHtml(val) : '<span class="muted">—</span>';
    }
    input.value = val;
    input.setAttribute('data-wc-original', val);
    input.disabled = false;
    input.removeAttribute('data-wc-pending');
    input.removeAttribute('data-wc-mutation-id');
    if (saving) saving.hidden = true;
    togglePhaseDeliverablesEdit(row, false);
    setUiInteraction('phase-deliverables', false);
  }

  function lazyQueueBucketSelector(category, phaseKey) {
    var pk = phaseKey != null ? String(phaseKey) : '';
    return 'details.wc-lazy-queue-bucket[data-wc-queue-category="' +
      String(category).replace(/"/g, '\\\\"') +
      '"][data-wc-phase-key="' +
      pk.replace(/"/g, '\\\\"') +
      '"]';
  }

  function lazyTerminalBucketSelector(terminalStatus, phaseKey) {
    return lazyQueueBucketSelector(terminalStatus, phaseKey);
  }

  function requestLazyQueueBucketLoad(detailsEl, cursor, force) {
    if (!detailsEl) return;
    if (window.__wcRestoringLazyBuckets) return;
    var category = (detailsEl.getAttribute('data-wc-queue-category') || '').trim();
    if (!category) return;
    var bodyEarly = detailsEl.querySelector('.wc-lazy-bucket-body');
    var append = typeof cursor === 'string' && cursor.trim().length > 0;
    if (!force && !append) {
      if (bodyEarly && bodyEarly.getAttribute('data-wc-lazy-loaded') === '1') {
        return;
      }
      if (detailsEl.getAttribute('data-wc-lazy-loading') === '1') return;
    }
    if (!append) {
      var isLoaded = bodyEarly && bodyEarly.getAttribute('data-wc-lazy-loaded') === '1';
      if (!isLoaded) {
        detailsEl.setAttribute('data-wc-lazy-loading', '1');
        var body = detailsEl.querySelector('.wc-lazy-bucket-body');
        if (body) {
          var hint = body.querySelector('.wc-lazy-bucket-hint');
          if (hint) hint.textContent = 'Loading…';
        }
      } else {
        detailsEl.setAttribute('data-wc-lazy-refreshing', '1');
      }
    } else {
      if (detailsEl.getAttribute('data-wc-lazy-more-loading') === '1') return;
      detailsEl.setAttribute('data-wc-lazy-more-loading', '1');
    }
    vscode.postMessage({
      type: 'loadQueueBucketRows',
      category: category,
      phaseKey: detailsEl.getAttribute('data-wc-phase-key') || '',
      cursor: append ? cursor : undefined
    });
  }

  function requestLazyTerminalBucketLoad(detailsEl) {
    requestLazyQueueBucketLoad(detailsEl);
  }

  function applyQueueBucketRowsHtml(category, phaseKey, html, append) {
    var root = document.getElementById('root');
    if (!root) return;
    var bucket = root.querySelector(lazyQueueBucketSelector(category, phaseKey));
    if (!bucket) return;
    bucket.removeAttribute('data-wc-lazy-loading');
    bucket.removeAttribute('data-wc-lazy-refreshing');
    bucket.removeAttribute('data-wc-lazy-more-loading');
    var body = bucket.querySelector('.wc-lazy-bucket-body');
    if (!body) return;
    if (append) {
      var moreWrap = body.querySelector('.wc-lazy-bucket-more');
      if (moreWrap) moreWrap.remove();
      body.insertAdjacentHTML('beforeend', typeof html === 'string' ? html : '');
    } else {
      var newHtml = typeof html === 'string' ? html : '';
      if (body.innerHTML !== newHtml) {
        body.innerHTML = newHtml;
      }
      body.setAttribute('data-wc-lazy-loaded', '1');
      bucket.setAttribute('data-wc-lazy-loaded', '1');
    }
    if (pendingQueueTaskReveal && pendingQueueTaskReveal.taskId) {
      var revealTaskId = pendingQueueTaskReveal.taskId;
      setTimeout(function() {
        completeRevealQueueTask(revealTaskId);
      }, 0);
    }
  }

  var pendingQueueTaskReveal = null;
  var planMermaidInitialized = false;

  function cssEscapeAttrValue(value) {
    return String(value).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
  }

  function findQueueTaskRow(root, taskId) {
    if (!root || !taskId) return null;
    var esc = cssEscapeAttrValue(taskId);
    var row = root.querySelector('.dash-row[data-wc-queue-task-id="' + esc + '"]');
    if (row) return row;
    var btn = root.querySelector('[data-task-id="' + esc + '"]');
    return btn ? btn.closest('.dash-row') : null;
  }

  function highlightQueueTaskRow(row) {
    if (!row) return;
    row.classList.add('wc-queue-task-highlight');
    setTimeout(function() {
      row.classList.remove('wc-queue-task-highlight');
    }, 1800);
  }

  function openQueueAncestorsForRow(row) {
    if (!row) return;
    var bucket = row.closest('details.wc-lazy-queue-bucket');
    if (bucket && !bucket.open) {
      bucket.setAttribute('open', '');
      requestLazyQueueBucketLoad(bucket);
    }
    var section = row.closest('details.status-section');
    if (section && !section.open) section.setAttribute('open', '');
  }

  function bucketContainsTaskId(bucket, taskId) {
    var csv = bucket.getAttribute('data-wc-bucket-task-ids') || '';
    if (!csv) return false;
    var parts = csv.split(',');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].trim() === taskId) return true;
    }
    return false;
  }

  function findQueueBucketsForTaskId(root, taskId) {
    var matches = [];
    if (!root || !taskId) return matches;
    root.querySelectorAll('details.wc-lazy-queue-bucket').forEach(function(bucket) {
      if (bucketContainsTaskId(bucket, taskId)) matches.push(bucket);
    });
    return matches;
  }

  function completeRevealQueueTask(taskId) {
    var root = document.getElementById('root');
    if (!root || !taskId) return false;
    var row = findQueueTaskRow(root, taskId);
    if (!row) return false;
    openQueueAncestorsForRow(row);
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    highlightQueueTaskRow(row);
    pendingQueueTaskReveal = null;
    return true;
  }

  function requestRevealQueueTask(taskId, phaseKey) {
    var root = document.getElementById('root');
    if (!root || !taskId) return;
    applyTab('task-engine');
    activeFilter = 'all';
    if (phaseKey && phaseKey.length > 0) activePhaseFilter = phaseKey;
    applyQueueFilters(root);
    if (completeRevealQueueTask(taskId)) return;
    pendingQueueTaskReveal = { taskId: taskId, phaseKey: phaseKey || '' };
    var buckets = findQueueBucketsForTaskId(root, taskId);
    if (buckets.length === 0 && phaseKey && phaseKey.length > 0) {
      root.querySelectorAll('details.wc-lazy-queue-bucket').forEach(function(bucket) {
        if ((bucket.getAttribute('data-wc-phase-key') || '').trim() === phaseKey) {
          buckets.push(bucket);
        }
      });
    }
    for (var i = 0; i < buckets.length; i++) {
      var bucket = buckets[i];
      if (!bucket.open) bucket.setAttribute('open', '');
      if (bucket.getAttribute('data-wc-lazy-loaded') !== '1') {
        requestLazyQueueBucketLoad(bucket);
      }
    }
    setTimeout(function() {
      completeRevealQueueTask(taskId);
    }, 150);
  }

  function renderPlanMermaidDiagrams(scope) {
    var root = scope && scope.querySelector ? scope : document.getElementById('root');
    if (!root || typeof window.mermaid === 'undefined') return;
    if (!planMermaidInitialized) {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: 'var(--vscode-font-family, sans-serif)'
        });
      } catch (e) {}
      planMermaidInitialized = true;
    }
    root.querySelectorAll('.wc-plan-mermaid-render[data-wc-mermaid-source]').forEach(function(node, index) {
      if (node.getAttribute('data-wc-mermaid-rendered') === '1') return;
      var src = (node.getAttribute('data-wc-mermaid-source') || '').trim();
      if (!src) return;
      var renderId = node.id || ('wc-plan-mermaid-render-' + String(index));
      if (!node.id) node.id = renderId;
      node.setAttribute('data-wc-mermaid-rendered', '1');
      var loading = node.querySelector('.wc-plan-mermaid-loading');
      try {
        window.mermaid
          .render(renderId + '-svg', src)
          .then(function(result) {
            node.innerHTML = result.svg;
          })
          .catch(function() {
            node.innerHTML =
              '<pre class="wc-plan-mermaid-source"><code>' +
              src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
              '</code></pre>';
          });
      } catch (e) {
        if (loading) loading.textContent = 'Could not render diagram.';
      }
    });
  }

  function findQueueBucket(category, phaseKey) {
    var root = document.getElementById('root');
    if (!root) return null;
    return root.querySelector(lazyQueueBucketSelector(category, phaseKey));
  }

  function queueCategoryStatusFilter(category) {
    if (category === 'ready') return 'ready';
    if (category === 'proposed-improvement' || category === 'proposed-execution') return 'proposed';
    if (category === 'blocked') return 'blocked';
    if (category === 'transcript-churn') return 'research';
    return 'ready';
  }

  function ensurePhaseStackInStatusSection(sectionBody) {
    if (!sectionBody) return null;
    var stack = sectionBody.querySelector('.phase-stack');
    if (stack) return stack;
    var mutedOnly = sectionBody.querySelector('p.muted');
    var flatList = sectionBody.querySelector('.dash-row-list');
    if (mutedOnly || flatList || sectionBody.childElementCount === 0) {
      sectionBody.innerHTML = '<div class="phase-stack"></div>';
      return sectionBody.querySelector('.phase-stack');
    }
    stack = document.createElement('div');
    stack.className = 'phase-stack';
    sectionBody.appendChild(stack);
    return stack;
  }

  function parseLeadingPhaseOrdinalDom(key) {
    if (key == null || typeof key !== 'string') return null;
    var m = key.trim().match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function comparePhaseBucketDomOrder(aKey, bKey) {
    var a = aKey != null ? String(aKey) : '';
    var b = bKey != null ? String(bKey) : '';
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    var oa = parseLeadingPhaseOrdinalDom(a);
    var ob = parseLeadingPhaseOrdinalDom(b);
    if (oa !== null && ob !== null) return ob - oa;
    if (oa !== null) return -1;
    if (ob !== null) return 1;
    return b.localeCompare(a, undefined, { numeric: true });
  }

  function insertBucketSortedInStack(stack, detailsEl) {
    if (!stack || !detailsEl) return;
    var newPk = detailsEl.getAttribute('data-wc-phase-key') || '';
    var children = stack.querySelectorAll(':scope > details.wc-lazy-queue-bucket');
    for (var i = 0; i < children.length; i++) {
      var existingPk = children[i].getAttribute('data-wc-phase-key') || '';
      if (comparePhaseBucketDomOrder(newPk, existingPk) < 0) {
        stack.insertBefore(detailsEl, children[i]);
        return;
      }
    }
    stack.appendChild(detailsEl);
  }

  function insertQueueBucketShell(root, category, shellHtml) {
    if (!root || typeof shellHtml !== 'string' || shellHtml.length === 0) return null;
    var filter = queueCategoryStatusFilter(category);
    var section = root.querySelector('details.status-section[data-wc-filter="' + filter.replace(/"/g, '\\"') + '"]');
    if (!section) return null;
    section.classList.remove('wc-section-empty');
    if (filter === 'ready' && !section.hasAttribute('open')) {
      section.setAttribute('open', '');
    }
    var sectionBody = section.querySelector('.status-section-body');
    var stack = ensurePhaseStackInStatusSection(sectionBody);
    if (!stack) return null;
    var tmp = document.createElement('div');
    tmp.innerHTML = shellHtml;
    var details = tmp.querySelector('details.wc-lazy-queue-bucket');
    if (!details) return null;
    insertBucketSortedInStack(stack, details);
    return details;
  }

  function resolveTargetQueueBucket(root, category, phaseKey, msg) {
    var bucket = findQueueBucket(category, phaseKey);
    if (bucket) return bucket;
    var shellHtml = typeof msg.toBucketShellHtml === 'string' ? msg.toBucketShellHtml : '';
    if (shellHtml.length === 0) return null;
    return insertQueueBucketShell(root, category, shellHtml);
  }

  function applyQueueTargetPhaseMoveDom(root, msg, options) {
    var opts = options || {};
    var category = typeof msg.category === 'string' ? msg.category : '';
    var taskId = typeof msg.taskId === 'string' ? msg.taskId.trim() : '';
    var fromPk = typeof msg.fromPhaseKey === 'string' ? msg.fromPhaseKey : '';
    var toPk = typeof msg.toPhaseKey === 'string' ? msg.toPhaseKey : '';
    var rowHtml = typeof msg.taskRowHtml === 'string' ? msg.taskRowHtml : '';
    if (!root || !category || !taskId) return false;
    if (!opts.skipRemoveTaskRow) {
      removeQueueTaskRowById(taskId);
    }
    if (fromPk.length > 0 || typeof msg.fromBucketCount === 'number') {
      var fromBucket = findQueueBucket(category, fromPk);
      if (fromBucket) {
        updateQueueBucketMeta(
          fromBucket,
          typeof msg.fromBucketCount === 'number' ? msg.fromBucketCount : null,
          typeof msg.fromBucketTaskIds === 'string' ? msg.fromBucketTaskIds : ''
        );
      }
    }
    var toBucket = resolveTargetQueueBucket(root, category, toPk, msg);
    if (!toBucket && typeof msg.toBucketCount === 'number' && msg.toBucketCount > 0) {
      return false;
    }
    if (toBucket) {
      updateQueueBucketMeta(
        toBucket,
        typeof msg.toBucketCount === 'number' ? msg.toBucketCount : null,
        typeof msg.toBucketTaskIds === 'string' ? msg.toBucketTaskIds : ''
      );
      var body = toBucket.querySelector('.wc-lazy-bucket-body');
      if (body && rowHtml.length > 0) {
        if (!toBucket.hasAttribute('open')) {
          toBucket.setAttribute('open', '');
        }
        if (body.getAttribute('data-wc-lazy-loaded') !== '1') {
          body.setAttribute('data-wc-lazy-loaded', '1');
          toBucket.setAttribute('data-wc-lazy-loaded', '1');
        }
        if (!body.querySelector('.dash-row-list .dash-row, .dash-row')) {
          insertQueueRowsIntoBucketBody(body, rowHtml);
        }
      }
    }
    return true;
  }

  function removeHumanGateRowById(taskId) {
    if (!taskId) return;
    var root = document.getElementById('root');
    if (!root) return;
    var esc = String(taskId).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
    var row = root.querySelector('.dash-human-gate-row [data-task-id="' + esc + '"]');
    if (!row) return;
    var gateRow = row.closest('.dash-human-gate-row');
    if (gateRow && gateRow.parentNode) gateRow.parentNode.removeChild(gateRow);
  }

  function updateHumanGateCountChrome(root, count) {
    if (typeof count !== 'number' || !Number.isFinite(count)) return;
    var n = Math.max(0, Math.floor(count));
    var chip = document.querySelector('.wc-filter-chip-human-gates');
    if (chip) {
      chip.textContent = n > 0 ? 'Human review (' + String(n) + ')' : 'Human review';
    }
    var humanNum = document.querySelector('.wc-pill-human .wc-stat-num-human');
    if (humanNum) {
      humanNum.textContent = String(n);
    }
    if (root) {
      updateHumanGateSectionMeta(root, n);
    }
  }

  function updateHumanGateSectionMeta(root, count) {
    if (!root) return;
    var section = root.querySelector('details.status-section[data-wc-filter="human-gates"]');
    if (!section) return;
    var summary = section.querySelector(':scope > summary');
    if (summary) {
      summary.innerHTML = '<b>Human Review</b> (' + String(count) + ')';
    }
    var body = section.querySelector('.status-section-body');
    if (count <= 0) {
      section.classList.add('wc-section-empty');
      if (body) {
        body.innerHTML = '<p class="muted">No human-gated tasks in the current phase.</p>';
      }
    } else {
      section.classList.remove('wc-section-empty');
      if (body) {
        var list = body.querySelector('.dash-row-list');
        if (list && list.childElementCount === 0) {
          body.innerHTML = '<p class="muted">No human-gated tasks in the current phase.</p>';
        }
      }
    }
  }

  function applyQueueHumanGateResume(msg) {
    var taskId = typeof msg.taskId === 'string' ? msg.taskId.trim() : '';
    var root = document.getElementById('root');
    if (!root || !taskId) {
      vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-args' });
      return;
    }
    removeHumanGateRowById(taskId);
    if (typeof msg.humanGateCount === 'number') {
      updateHumanGateCountChrome(root, msg.humanGateCount);
    }
    var readyMove = msg.readyMove;
    if (readyMove && typeof readyMove === 'object') {
      var ok = applyQueueTargetPhaseMoveDom(root, readyMove, { skipRemoveTaskRow: true });
      if (!ok) {
        vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-target-bucket', taskId: taskId });
        applyQueueFilters(root);
        return;
      }
    }
    applyQueueFilters(root);
    vscode.postMessage({ type: 'queuePhasePatchApplied', taskId: taskId });
  }

  function removeQueueTaskRowById(taskId) {
    if (!taskId) return;
    var root = document.getElementById('root');
    if (!root) return;
    var esc = String(taskId).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
    var btn = root.querySelector('[data-task-id="' + esc + '"]');
    if (!btn) return;
    var row = btn.closest('.dash-row');
    if (row && row.parentNode) row.parentNode.removeChild(row);
  }

  function updateQueueBucketMeta(detailsEl, count, taskIdsCsv) {
    if (!detailsEl) return;
    if (typeof count === 'number' && count >= 0) {
      detailsEl.setAttribute('data-wc-bucket-count', String(count));
      var countEl = detailsEl.querySelector('.phase-bucket-summary-count');
      if (countEl) countEl.textContent = '(' + String(count) + ')';
    }
    if (typeof taskIdsCsv === 'string') {
      if (taskIdsCsv.length > 0) {
        detailsEl.setAttribute('data-wc-bucket-task-ids', taskIdsCsv);
      } else {
        detailsEl.removeAttribute('data-wc-bucket-task-ids');
      }
    }
  }

  function insertQueueRowsIntoBucketBody(body, rowsHtml) {
    if (!body || typeof rowsHtml !== 'string' || rowsHtml.length === 0) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = rowsHtml;
    var newList = tmp.querySelector('.dash-row-list');
    var list = body.querySelector('.dash-row-list');
    if (newList && list) {
      while (newList.firstChild) {
        list.appendChild(newList.firstChild);
      }
    } else if (newList) {
      body.insertAdjacentHTML('beforeend', rowsHtml);
    } else {
      body.insertAdjacentHTML('beforeend', rowsHtml);
    }
    var muted = body.querySelector('p.muted');
    if (muted && body.querySelector('.dash-row-list .dash-row')) {
      muted.remove();
    }
    body.setAttribute('data-wc-lazy-loaded', '1');
    var bucket = body.closest('details.wc-lazy-queue-bucket');
    if (bucket) bucket.setAttribute('data-wc-lazy-loaded', '1');
  }

  function applyQueueTaskPhaseMove(msg) {
    var category = typeof msg.category === 'string' ? msg.category : '';
    var taskId = typeof msg.taskId === 'string' ? msg.taskId.trim() : '';
    var root = document.getElementById('root');
    if (!root || !category || !taskId) {
      vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-args' });
      return;
    }
    var ok = applyQueueTargetPhaseMoveDom(root, msg, {});
    if (!ok) {
      vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-target-bucket', taskId: taskId });
      applyQueueFilters(root);
      return;
    }
    applyQueueFilters(root);
    vscode.postMessage({ type: 'queuePhasePatchApplied', taskId: taskId });
  }

  function applyQueueTaskCategoryMove(msg) {
    var fromCategory = typeof msg.fromCategory === 'string' ? msg.fromCategory : '';
    var toCategory = typeof msg.toCategory === 'string' ? msg.toCategory : '';
    var taskId = typeof msg.taskId === 'string' ? msg.taskId.trim() : '';
    var fromPk = typeof msg.fromPhaseKey === 'string' ? msg.fromPhaseKey : '';
    var toPk = typeof msg.toPhaseKey === 'string' ? msg.toPhaseKey : '';
    var rowHtml = typeof msg.taskRowHtml === 'string' ? msg.taskRowHtml : '';
    var root = document.getElementById('root');
    if (!root || !fromCategory || !toCategory || !taskId) {
      vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-args' });
      return;
    }
    removeQueueTaskRowById(taskId);
    var fromBucket = findQueueBucket(fromCategory, fromPk);
    if (fromBucket) {
      updateQueueBucketMeta(
        fromBucket,
        typeof msg.fromBucketCount === 'number' ? msg.fromBucketCount : null,
        typeof msg.fromBucketTaskIds === 'string' ? msg.fromBucketTaskIds : ''
      );
    }
    var toBucket = resolveTargetQueueBucket(root, toCategory, toPk, msg);
    if (!toBucket && typeof msg.toBucketCount === 'number' && msg.toBucketCount > 0) {
      vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-target-bucket', taskId: taskId });
      applyQueueFilters(root);
      return;
    }
    if (toBucket) {
      updateQueueBucketMeta(
        toBucket,
        typeof msg.toBucketCount === 'number' ? msg.toBucketCount : null,
        typeof msg.toBucketTaskIds === 'string' ? msg.toBucketTaskIds : ''
      );
      var body = toBucket.querySelector('.wc-lazy-bucket-body');
      if (body && rowHtml.length > 0) {
        if (!toBucket.hasAttribute('open')) {
          toBucket.setAttribute('open', '');
        }
        if (body.getAttribute('data-wc-lazy-loaded') !== '1') {
          body.setAttribute('data-wc-lazy-loaded', '1');
          toBucket.setAttribute('data-wc-lazy-loaded', '1');
        }
        if (!body.querySelector('.dash-row-list .dash-row, .dash-row')) {
          insertQueueRowsIntoBucketBody(body, rowHtml);
        }
      }
    }
    applyQueueFilters(root);
    vscode.postMessage({ type: 'queuePhasePatchApplied', taskId: taskId });
  }

  function applyQueueTaskRemoval(msg) {
    var category = typeof msg.category === 'string' ? msg.category : '';
    var taskId = typeof msg.taskId === 'string' ? msg.taskId.trim() : '';
    var phaseKey = typeof msg.phaseKey === 'string' ? msg.phaseKey : '';
    var root = document.getElementById('root');
    if (!root || !category || !taskId) {
      vscode.postMessage({ type: 'queuePhasePatchFailed', reason: 'missing-args' });
      return;
    }
    removeQueueTaskRowById(taskId);
    var bucket = findQueueBucket(category, phaseKey);
    if (bucket) {
      updateQueueBucketMeta(
        bucket,
        typeof msg.bucketCount === 'number' ? msg.bucketCount : null,
        typeof msg.bucketTaskIds === 'string' ? msg.bucketTaskIds : ''
      );
    }
    applyQueueFilters(root);
    vscode.postMessage({ type: 'queuePhasePatchApplied', taskId: taskId });
  }

  function applyLazyTerminalBucketHtml(terminalStatus, phaseKey, html) {
    applyQueueBucketRowsHtml(terminalStatus, phaseKey, html, false);
  }

  function reloadOpenLazyQueueBuckets(root) {
    if (!root) return;
    root.querySelectorAll('details.wc-lazy-queue-bucket[open]').forEach(function(d) {
      if (d.getAttribute('data-wc-lazy-loaded') !== '1') requestLazyQueueBucketLoad(d);
    });
  }

  function reloadOpenLazyTerminalBuckets(root) {
    reloadOpenLazyQueueBuckets(root);
  }

  function togglePhaseDeliverablesEdit(row, editing) {
    if (!row) return;
    var text = row.querySelector('.dash-phase-deliverables-text');
    var editBtn = row.querySelector('.dash-phase-edit-anchor');
    var editor = row.querySelector('.dash-phase-deliverables-editor');
    var saving = row.querySelector('.dash-phase-saving');
    var error = row.querySelector('.dash-phase-deliverables-error');
    if (text) text.hidden = !!editing;
    if (editBtn) editBtn.hidden = !!editing;
    if (editor) editor.hidden = !editing;
    if (saving) saving.hidden = true;
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    if (editing && editor) {
      var input = editor.querySelector('input');
      if (input && input.focus) {
        input.focus();
        if (input.select) input.select();
      }
    }
  }

  function phaseDeliverablesInputFromPhase(phaseKey) {
    if (!phaseKey) return null;
    return document.querySelector('[data-wc-phase-input="' + phaseKey.replace(/"/g, '\\"') + '"]');
  }

  function submitPhaseDeliverablesInput(input) {
    if (!input) return;
    var phaseKey = (input.getAttribute('data-wc-phase-input') || '').trim();
    if (!phaseKey) return;
    var row = input.closest('[data-wc-phase-row]');
    if (!row) return;
    var saving = row.querySelector('.dash-phase-saving');
    var error = row.querySelector('.dash-phase-deliverables-error');
    var original = input.getAttribute('data-wc-original') || '';
    var current = input.value != null ? String(input.value).trim() : '';
    if (current === original) {
      togglePhaseDeliverablesEdit(row, false);
      setUiInteraction('phase-deliverables', false);
      return;
    }
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    var mutationId = 'dashboard-phase-deliverables-' + phaseKey + '-' + Date.now().toString(36);
    input.setAttribute('data-wc-pending', '1');
    input.setAttribute('data-wc-mutation-id', mutationId);
    if (saving) saving.hidden = false;
    input.disabled = true;
    var rowEdit = row.querySelector('.dash-phase-deliverables-editor');
    if (rowEdit) rowEdit.hidden = true;
    vscode.postMessage({
      type: 'updatePhaseDeliverables',
      phaseKey: phaseKey,
      deliverables: current.length > 0 ? current : null,
      clientMutationId: mutationId
    });
  }

  function restorePhaseDeliverablesFromError(phaseKey, message) {
    var input = phaseDeliverablesInputFromPhase(phaseKey);
    if (!input) return;
    var row = input.closest('[data-wc-phase-row]');
    if (!row) return;
    var original = input.getAttribute('data-wc-original') || '';
    input.value = original;
    input.disabled = false;
    input.removeAttribute('data-wc-pending');
    input.removeAttribute('data-wc-mutation-id');
    togglePhaseDeliverablesEdit(row, false);
    var err = row.querySelector('.dash-phase-deliverables-error');
    if (err) {
      err.textContent = message || 'Unable to save deliverables.';
      err.hidden = false;
    }
    setUiInteraction('phase-deliverables', false);
  }

  function updateTaskEngineTabBadges(readyCount, blockedCount, humanGateCount) {
    var btn = document.querySelector('.wc-tab-btn[data-wc-tab="task-engine"]');
    if (!btn) return;
    var existing = btn.querySelector('.wc-tab-badge');
    if (existing) existing.remove();
    var ready = typeof readyCount === 'number' && readyCount > 0 ? readyCount : 0;
    var blocked = typeof blockedCount === 'number' && blockedCount > 0 ? blockedCount : 0;
    if (ready > 0) {
      var readyBadge = document.createElement('span');
      readyBadge.className = 'wc-tab-badge wc-tab-badge-ready';
      readyBadge.textContent = String(ready);
      btn.appendChild(readyBadge);
    } else if (blocked > 0) {
      var blockedBadge = document.createElement('span');
      blockedBadge.className = 'wc-tab-badge wc-tab-badge-blocked';
      blockedBadge.textContent = String(blocked);
      btn.appendChild(blockedBadge);
    }
    if (typeof humanGateCount === 'number') {
      var root = document.getElementById('root');
      updateHumanGateCountChrome(root, humanGateCount);
    }
  }

  function applyTab(tab, forceNotify) {
    if (!tab) return;
    var prevTab = activeTab;
    activeTab = tab;
    document.querySelectorAll('.wc-tab-panel').forEach(function(p) {
      p.style.display = p.getAttribute('data-wc-tab') === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.wc-tab-btn').forEach(function(b) {
      var isActive = b.getAttribute('data-wc-tab') === tab;
      if (isActive) b.classList.add('wc-tab-active');
      else b.classList.remove('wc-tab-active');
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    if (tab === 'config' && window.wcConfigTab) {
      if (window.wcConfigTab.afterDomUpdate) window.wcConfigTab.afterDomUpdate();
      var list = document.getElementById('config-list-root');
      var needsLoad = prevTab !== 'config' || !list || !!list.querySelector('.cfg-loading');
      if (needsLoad && window.wcConfigTab.requestLoad) window.wcConfigTab.requestLoad();
    }
    if (tab !== prevTab || forceNotify === true) {
      vscode.postMessage({ type: 'dashboardTabActivated', tabId: tab });
    }
  }

  function syncQueueFiltersUi(root) {
    if (!root) return;
    root.querySelectorAll('.wc-filter-chip').forEach(function(c) {
      c.classList.toggle('wc-filter-active', c.getAttribute('data-wc-filter-btn') === activeFilter);
    });
    var phaseSelect = root.querySelector('[data-wc-phase-filter]');
    if (!phaseSelect) return;
    var hasOption = false;
    phaseSelect.querySelectorAll('option').forEach(function(opt) {
      if (opt.value === activePhaseFilter) hasOption = true;
    });
    if (!hasOption) activePhaseFilter = 'all';
    if (phaseSelect.value !== activePhaseFilter) {
      phaseSelect.value = activePhaseFilter;
    }
  }

  function wirePhaseFilterSelect(root) {
    if (!root) return;
    var phaseSelect = root.querySelector('[data-wc-phase-filter]');
    if (!phaseSelect || phaseSelect.getAttribute('data-wc-phase-wired') === '1') return;
    phaseSelect.setAttribute('data-wc-phase-wired', '1');
    phaseSelect.addEventListener('mousedown', function(ev) {
      ev.stopPropagation();
      setUiInteraction('phase-filter', true);
    });
    phaseSelect.addEventListener('click', function(ev) { ev.stopPropagation(); });
    phaseSelect.addEventListener('change', function() {
      setTimeout(function() { setUiInteraction('phase-filter', false); }, 0);
    });
    phaseSelect.addEventListener('blur', function() {
      setTimeout(function() { setUiInteraction('phase-filter', false); }, 200);
    });
  }

  function applyQueueFilters(root) {
    if (!root) return;
    root.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) {
      var sf = s.getAttribute('data-wc-filter');
      s.style.display = (activeFilter === 'all' || sf === activeFilter) ? '' : 'none';
    });
    var termHost = root.querySelector('.dashboard-terminal-tasks');
    if (termHost) termHost.style.display = (activeFilter === 'all') ? '' : 'none';

    root.querySelectorAll('details.phase-bucket[data-wc-phase-bucket]').forEach(function(b) {
      var pk = b.getAttribute('data-wc-phase-bucket') || '__no_phase__';
      b.style.display = (activePhaseFilter === 'all' || pk === activePhaseFilter) ? '' : 'none';
    });

    root.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) {
      if (s.style.display === 'none') return;
      var buckets = s.querySelectorAll('details.phase-bucket[data-wc-phase-bucket]');
      if (!buckets.length) return;
      var visible = false;
      buckets.forEach(function(b) { if (b.style.display !== 'none') visible = true; });
      s.style.display = visible ? '' : 'none';
    });

    syncQueueFiltersUi(root);
    wirePhaseFilterSelect(root);
  }

  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'wcDrawerOpen' && typeof m.html === 'string') {
      var dh = document.getElementById('wc-drawer-host');
      if (!dh) return;
      if (!String(m.html).trim()) return;
      dh.innerHTML = m.html;
      dh.classList.remove('wc-drawer-host--hidden');
      dh.setAttribute('aria-hidden','false');
      var ve = document.getElementById('wc-drawer-validation');
      if (ve) { ve.textContent=''; ve.hidden=true; }
      var prim = dh.querySelector('[data-wc-drawer-action="submit"]');
      if (prim && prim.focus) prim.focus();
      return;
    }
    if (m && m.type === 'wcHostSnapshot' && m.snapshot) {
      applyHostSnapshot(m.snapshot);
      return;
    }
    if (m && m.type === 'wcDashboardReadMode' && m.badge) {
      applyDashboardReadModeBadge(m.badge);
      return;
    }
    if (m && m.type === 'wcIdeaMutationResult') {
      var op = typeof m.operation === 'string' ? m.operation : '';
      var mutRow = typeof m.ideaId === 'string' ? document.querySelector('[data-wc-idea-id="' + m.ideaId.replace(/"/g, '\\"') + '"]') : null;
      if (mutRow) setIdeaRowBusy(mutRow, false);
      document.querySelectorAll('[data-wc-action="plan-artifact-brainstorm"]').forEach(function(btn) {
        setButtonBusy(btn, false);
      });
      if (m.ok !== true) {
        if (mutRow) setIdeaRowStatus(mutRow, typeof m.message === 'string' ? m.message : 'Unable to save idea.', true);
        else showIdeasToast(typeof m.message === 'string' ? m.message : 'Unable to save idea.', false);
        return;
      }
      if (op === 'delete') showIdeasToast('Idea deleted.', true);
      else if (op === 'undo-delete') showIdeasToast('Idea restored.', false);
      else if (op === 'plan') showIdeasToast(typeof m.message === 'string' && m.message ? m.message : 'Planning prompt opened.', false);
      else if (op === 'brainstorm') showIdeasToast(typeof m.message === 'string' && m.message ? m.message : 'Brainstorm prompt opened.', false);
      return;
    }
    if (m && m.type === 'wcPhaseDeliverablesSaved') {
      var savedPk = typeof m.phaseKey === 'string' ? m.phaseKey.trim() : '';
      if (savedPk) {
        applyPhaseDeliverablesSaved(savedPk, m.deliverables == null ? null : m.deliverables);
      }
      return;
    }
    if (m && m.type === 'wcPhaseDeliverablesError') {
      var pk = typeof m.phaseKey === 'string' ? m.phaseKey.trim() : '';
      var msg = typeof m.message === 'string' ? m.message : 'Unable to save deliverables.';
      if (pk) restorePhaseDeliverablesFromError(pk, msg);
      return;
    }
    if (m && m.type === 'wcQueueBucketRowsHtml') {
      var queueCat = typeof m.category === 'string' ? m.category : '';
      var queuePk = typeof m.phaseKey === 'string' ? m.phaseKey : '';
      applyQueueBucketRowsHtml(queueCat, queuePk, m.html, m.append === true);
      return;
    }
    if (m && m.type === 'wcQueueTaskPhaseMove') {
      applyQueueTaskPhaseMove(m);
      return;
    }
    if (m && m.type === 'wcQueueTaskCategoryMove') {
      applyQueueTaskCategoryMove(m);
      return;
    }
    if (m && m.type === 'wcQueueTaskRemoval') {
      applyQueueTaskRemoval(m);
      return;
    }
    if (m && m.type === 'wcQueueHumanGateResume') {
      applyQueueHumanGateResume(m);
      return;
    }
    if (m && m.type === 'wcOpenQueueForPhase') {
      var openPk = typeof m.phaseKey === 'string' ? m.phaseKey.trim() : '';
      var openRoot = document.getElementById('root');
      if (openRoot) {
        applyTab('task-engine');
        activeFilter = 'all';
        activePhaseFilter = openPk.length > 0 ? openPk : 'all';
        applyQueueFilters(openRoot);
      }
      return;
    }
    if (m && m.type === 'wcLazyTerminalBucketHtml') {
      var lazyStatus = typeof m.terminalStatus === 'string' ? m.terminalStatus : '';
      var lazyPk = typeof m.phaseKey === 'string' ? m.phaseKey : '';
      applyLazyTerminalBucketHtml(lazyStatus, lazyPk, m.html);
      return;
    }
    if (m && m.type === 'wcMarkPhaseBusy') {
      setMarkPhaseBusy(m.active === true);
      return;
    }
    if (m && m.type === 'wcHidePhaseCards') {
      hidePhaseCardsNow();
      return;
    }
    if (m && m.type === 'wcReleaseRefreshBlock') {
      delete localUiLocks['refresh'];
      if (pendingReplaceRootHtml && !isLocalUiLocked()) {
        var pendingHtml = pendingReplaceRootHtml;
        pendingReplaceRootHtml = null;
        applyReplaceRootHtml(pendingHtml);
      }
      if (!isLocalUiLocked() && pendingSectionPatches && Object.keys(pendingSectionPatches).length > 0) {
        var pendingPatchQueue = pendingSectionPatches;
        pendingSectionPatches = {};
        Object.keys(pendingPatchQueue).forEach(function(patchKey) {
          var patch = pendingPatchQueue[patchKey];
          if (patch) applySectionPatch(patch.sectionId, patch.html, patch.state);
        });
      }
      return;
    }
    if (m && m.type === 'wcSectionPatch') {
      var sectionId = typeof m.sectionId === 'string' ? m.sectionId.trim() : '';
      if (!sectionId) return;
      if (isLocalUiLocked()) {
        pendingSectionPatches[sectionId] = {
          sectionId: sectionId,
          html: typeof m.html === 'string' ? m.html : '',
          state: typeof m.state === 'string' ? m.state : 'ready'
        };
        return;
      }
      applySectionPatch(sectionId, m.html, m.state);
      return;
    }
    if (m && m.type === 'wcUpdateTabBadges') {
      updateTaskEngineTabBadges(m.readyCount, m.blockedCount, m.humanGateCount);
      return;
    }
    if (m && m.type === 'wcBannerPatch') {
      if (typeof m.html === 'string') {
        var bannerEl = document.querySelector('.wc-banner');
        if (bannerEl && bannerEl.parentNode) {
          var tmp = document.createElement('div');
          tmp.innerHTML = m.html;
          var newBanner = tmp.firstElementChild;
          if (newBanner) {
            bannerEl.parentNode.replaceChild(newBanner, bannerEl);
          }
        }
      }
      return;
    }
    if (!m || m.type !== 'wcReplaceRoot' || typeof m.html !== 'string') return;
    if (isLocalUiLocked()) {
      pendingReplaceRootHtml = m.html;
      return;
    }
    applyReplaceRootHtml(m.html);
  });

  vscode.postMessage({ type: 'dashboardWebviewReady' });

  var contextHelpPopover = document.getElementById('wc-context-help-popover');
  var contextHelpHideTimer = null;
  var contextHelpActiveEl = null;

  function positionContextHelpPopover(el) {
    if (!contextHelpPopover || !el) return;
    var r = el.getBoundingClientRect();
    var pad = 12;
    contextHelpPopover.hidden = false;
    contextHelpPopover.style.visibility = 'hidden';
    contextHelpPopover.style.transform = 'none';
    contextHelpPopover.style.left = '0px';
    contextHelpPopover.style.top = '0px';
    var popW = contextHelpPopover.offsetWidth || 280;
    var popH = contextHelpPopover.offsetHeight || 80;
    var left = r.left + r.width / 2 - popW / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - pad - popW));
    var top = r.bottom + 6;
    if (top + popH > window.innerHeight - pad) {
      top = Math.max(pad, r.top - popH - 6);
    }
    contextHelpPopover.style.left = left + 'px';
    contextHelpPopover.style.top = top + 'px';
    contextHelpPopover.style.visibility = '';
  }

  function showContextHelpPopover(el) {
    if (!contextHelpPopover || !el) return;
    var text = el.getAttribute('data-wc-help-text') || '';
    if (!String(text).trim()) return;
    if (contextHelpHideTimer) {
      clearTimeout(contextHelpHideTimer);
      contextHelpHideTimer = null;
    }
    contextHelpActiveEl = el;
    contextHelpPopover.textContent = text;
    contextHelpPopover.hidden = false;
    positionContextHelpPopover(el);
    setUiInteraction('context-help', true);
  }

  function hideContextHelpPopoverSoon() {
    if (contextHelpHideTimer) clearTimeout(contextHelpHideTimer);
    contextHelpHideTimer = setTimeout(function() {
      contextHelpHideTimer = null;
      var hovered = document.querySelector('.wc-context-help:hover');
      var focused = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('.wc-context-help')
        : null;
      if (hovered || focused) return;
      contextHelpActiveEl = null;
      if (contextHelpPopover) {
        contextHelpPopover.hidden = true;
        contextHelpPopover.textContent = '';
      }
      setUiInteraction('context-help', false);
    }, 120);
  }

  function wireContextHelpPopover() {
    if (window.__wcContextHelpPopoverWired) return;
    window.__wcContextHelpPopoverWired = true;
    document.addEventListener('mouseover', function(ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.wc-context-help') : null;
      if (el) showContextHelpPopover(el);
    });
    document.addEventListener('mouseout', function(ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.wc-context-help') : null;
      if (!el) return;
      var rel = ev.relatedTarget;
      if (rel && el.contains(rel)) return;
      if (rel && rel.closest && rel.closest('.wc-context-help')) return;
      hideContextHelpPopoverSoon();
    });
    document.addEventListener('focusin', function(ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.wc-context-help') : null;
      if (el) showContextHelpPopover(el);
    });
    document.addEventListener('focusout', function(ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.wc-context-help') : null;
      if (!el) return;
      hideContextHelpPopoverSoon();
    });
    window.addEventListener('scroll', function() {
      if (contextHelpActiveEl && contextHelpPopover && !contextHelpPopover.hidden) {
        positionContextHelpPopover(contextHelpActiveEl);
      }
    }, true);
    window.addEventListener('resize', function() {
      if (contextHelpActiveEl && contextHelpPopover && !contextHelpPopover.hidden) {
        positionContextHelpPopover(contextHelpActiveEl);
      }
    });
  }
  wireContextHelpPopover();
  if (typeof window.wcReinitEmbeddedCae === 'function') window.wcReinitEmbeddedCae();

    applyTab(activeTab, activeTab === 'task-engine' || activeTab === 'status' || activeTab === 'config' || activeTab === 'cae');
  applyQueueFilters(document.getElementById('root'));

  document.addEventListener('click', function(ev) {
    var dh = document.getElementById('wc-drawer-host');
    if (!dh || dh.classList.contains('wc-drawer-host--hidden')) return;
    var panel = dh.querySelector('.wc-drawer-panel');
    if (panel && panel.classList.contains('wc-drawer-panel--busy')) return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-wc-drawer-action]') : null;
    if (!t || !dh.contains(t)) return;
    var act = t.getAttribute('data-wc-drawer-action');
    if (act === 'backdrop' || act === 'cancel') { vscode.postMessage({type:'drawerCancel'}); return; }
    if (act === 'submit') {
      if (hostSnapshot && hostSnapshot.drawer && hostSnapshot.drawer.busy) return;
      if (hostSnapshot && hostSnapshot.interaction && hostSnapshot.interaction.mutationActive) return;
      if (t.disabled || t.getAttribute('data-wc-drawer-submitting') === '1') return;
      t.setAttribute('data-wc-drawer-submitting', '1');
      t.disabled = true;
      var vals = {};
      dh.querySelectorAll('[data-wc-drawer-field]').forEach(function(el) {
        var id = el.getAttribute('data-wc-drawer-field');
        if (!id) return;
        vals[id] = ('value' in el && el.value != null) ? String(el.value) : '';
      });
      vscode.postMessage({type:'drawerSubmit', values: vals});
    }
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape') return;
    var dh = document.getElementById('wc-drawer-host');
    if (!dh || dh.classList.contains('wc-drawer-host--hidden')) return;
    var panel = dh.querySelector('.wc-drawer-panel');
    if (panel && panel.classList.contains('wc-drawer-panel--busy')) return;
    ev.preventDefault();
    vscode.postMessage({type:'drawerCancel'});
  });

  var btn = document.getElementById('btn');
  var rootEl = document.getElementById('root');
  if (btn) btn.addEventListener('click', function() {
    vscode.postMessage({type:'refresh'});
  });
  if (rootEl) rootEl.addEventListener('click', function(ev) {
    var rawTarget = ev.target;
    var el = rawTarget;
    while (el && el.nodeType !== 1) el = el.parentElement;
    if (el && typeof el.closest === 'function' && el.closest('.wc-phase-filter-wrap')) return;
    var tabBtn = el && el.closest ? el.closest('.wc-tab-btn') : null;
    if (tabBtn && rootEl.contains(tabBtn) && !tabBtn.disabled) {
      applyTab(tabBtn.getAttribute('data-wc-tab'));
      return;
    }
    var agentCardToggle = el && typeof el.closest === 'function' ? el.closest('[data-wc-action="toggle-agent-card"]') : null;
    if (agentCardToggle && rootEl.contains(agentCardToggle)) {
      if (agentCardToggle.closest && agentCardToggle.closest('.wc-dash-cae-host')) return;
      var agentCard = agentCardToggle.closest('.wc-agent-card');
      if (!agentCard || agentCardToggle.classList.contains('wc-agent-card-header--no-expand')) return;
      ev.preventDefault();
      ev.stopPropagation();
      agentCard.classList.toggle('wc-agent-card--expanded');
      setAgentCardExpanded(agentCard, agentCard.classList.contains('wc-agent-card--expanded'));
      return;
    }
    var t = el && typeof el.closest === 'function' ? el.closest('button') : null;
    if (!t || t.tagName !== 'BUTTON' || !rootEl.contains(t) || t.disabled) return;
    if (t.closest && t.closest('.wc-dash-cae-host')) return;
    if (t.classList.contains('wc-filter-chip')) {
      var f = t.getAttribute('data-wc-filter-btn') || 'all';
      activeFilter = f;
      if (f === 'all') activePhaseFilter = 'all';
      applyQueueFilters(rootEl);
      return;
    }
    if (t.classList.contains('wc-stat-pill')) {
      var navTab = t.getAttribute('data-wc-pill-nav');
      var navFilter = t.getAttribute('data-wc-pill-filter') || 'all';
      if (navTab) applyTab(navTab);
      activeFilter = navFilter;
      applyQueueFilters(rootEl);
      return;
    }
    var gpTab = t.getAttribute('data-gp-tab');
    if (gpTab) {
      var gpRoot = t.closest('.gp-root') || rootEl;
      gpRoot.querySelectorAll('[data-gp-tab]').forEach(function(btn) {
        if (btn === t) btn.classList.add('is-active');
        else btn.classList.remove('is-active');
      });
      gpRoot.querySelectorAll('.gp-tab-panel').forEach(function(panel) {
        var ok = panel.getAttribute('data-gp-panel') === gpTab;
        if (ok) panel.classList.add('is-active');
        else panel.classList.remove('is-active');
      });
      return;
    }
    var gpAction = t.getAttribute('data-gp-action');
    if (gpAction) {
      var gpTabTarget = t.getAttribute('data-gp-tab-target');
      if (gpTabTarget) {
        var gpScope = t.closest('.gp-root') || rootEl;
        var gpBtn = gpScope.querySelector('[data-gp-tab="' + gpTabTarget + '"]');
        if (gpBtn && gpBtn.click) gpBtn.click();
      }
      var gpPayload = {
        activationId: t.getAttribute('data-gp-activation-id') || '',
        artifactId: t.getAttribute('data-gp-artifact-id') || '',
        versionId: t.getAttribute('data-version-id') || '',
        commandName: t.getAttribute('data-gp-command-name') || ''
      };
      vscode.postMessage({ type: 'embeddedCaeAction', action: gpAction, payload: gpPayload });
      return;
    }
    var act = t.getAttribute('data-wc-action');
    if (!act) return;
    if (act.indexOf('config-') === 0) {
      ev.preventDefault();
      if (act === 'config-jump-key' && window.wcConfigTab && window.wcConfigTab.jumpToConfigKey) {
        window.wcConfigTab.jumpToConfigKey(t.getAttribute('data-key') || '');
        return;
      }
      if (t.closest('#config-list-root') && window.wcConfigTab) {
        if (act === 'config-explain') {
          var explainKey = t.getAttribute('data-key') || '';
          if (explainKey) vscode.postMessage({ type: 'explain', key: explainKey });
          return;
        }
        if (act === 'config-save' || act === 'config-unset' || act === 'config-reload-window') {
          return;
        }
      }
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (act === 'phase-readiness-toggle') {
      var readinessCard = t.closest('.wc-cae-readiness');
      if (!readinessCard) return;
      readinessCard.classList.toggle('wc-cae-readiness-collapsed');
      var readinessExpanded = !readinessCard.classList.contains('wc-cae-readiness-collapsed');
      var readinessToggle = readinessCard.querySelector('[data-wc-action="phase-readiness-toggle"]');
      if (readinessToggle) {
        readinessToggle.setAttribute('aria-expanded', readinessExpanded ? 'true' : 'false');
      }
      return;
    }
    if (act === 'phase-progress-toggle') {
      var progressCard = t.closest('.wc-phase-progress');
      if (!progressCard) return;
      progressCard.classList.toggle('wc-phase-progress-collapsed');
      var progressExpanded = !progressCard.classList.contains('wc-phase-progress-collapsed');
      var progressToggle = progressCard.querySelector('[data-wc-action="phase-progress-toggle"]');
      if (progressToggle) {
        progressToggle.setAttribute('aria-expanded', progressExpanded ? 'true' : 'false');
      }
      return;
    }
    if (act === 'focus-phase-roster') {
      var rosterEl = document.getElementById('wc-phase-roster');
      if (rosterEl && typeof rosterEl.scrollIntoView === 'function') {
        rosterEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (act === 'open-queue-for-phase') {
      var phasePk = (t.getAttribute('data-wc-phase-key') || '').trim();
      applyTab('task-engine');
      activeFilter = 'all';
      activePhaseFilter = phasePk.length > 0 ? phasePk : 'all';
      applyQueueFilters(rootEl);
      return;
    }
    if (act === 'open-queue-task') {
      var queueJumpTaskId = (t.getAttribute('data-task-id') || '').trim();
      var queueJumpPhaseKey = (t.getAttribute('data-wc-phase-key') || '').trim();
      if (queueJumpTaskId) requestRevealQueueTask(queueJumpTaskId, queueJumpPhaseKey);
      return;
    }
    if (act === 'phase-deliverables-edit') {
      var row = t.closest('[data-wc-phase-row]');
      if (!row) return;
      var input = row.querySelector('.dash-phase-deliverables-input');
      setUiInteraction('phase-deliverables', true);
      if (input) {
        input.disabled = false;
        input.removeAttribute('data-wc-pending');
        input.removeAttribute('data-wc-mutation-id');
        input.setAttribute('data-wc-original', input.value != null ? String(input.value).trim() : '');
      }
      togglePhaseDeliverablesEdit(row, true);
      if (input) {
        input.setAttribute('data-wc-focus-grace', '1');
        setTimeout(function() {
          if (input) input.removeAttribute('data-wc-focus-grace');
        }, 350);
      }
      return;
    }
    if (act === 'phase-note-view') {
      var viewId = (t.getAttribute('data-note-id') || '').trim();
      if (!viewId) return;
      vscode.postMessage({
        type: 'viewPhaseNote',
        noteId: viewId,
        noteType: t.getAttribute('data-note-type') || '',
        priority: t.getAttribute('data-note-priority') || '',
        summary: t.getAttribute('data-note-summary') || '',
        details: t.getAttribute('data-note-details') || ''
      });
      return;
    }
    if (act === 'phase-note-edit') {
      var editId = (t.getAttribute('data-note-id') || '').trim();
      if (!editId) return;
      vscode.postMessage({
        type: 'editPhaseNote',
        noteId: editId,
        summary: t.getAttribute('data-note-summary') || '',
        details: t.getAttribute('data-note-details') || ''
      });
      return;
    }
    if (act === 'phase-note-delete') {
      var delId = (t.getAttribute('data-note-id') || '').trim();
      if (!delId) return;
      vscode.postMessage({
        type: 'deletePhaseNote',
        noteId: delId,
        priority: t.getAttribute('data-note-priority') || ''
      });
      return;
    }
    if (act === 'wishlist-view') { var wv = (t.getAttribute('data-wishlist-id') || '').trim(); if (wv) vscode.postMessage({type:'openWishlistDetail',wishlistId:wv}); return; }
    if (act === 'idea-add') { vscode.postMessage({ type: 'addIdea' }); return; }
    if (act === 'idea-edit') { setIdeaEditMode(ideaRowFor(t), true); return; }
    if (act === 'idea-edit-cancel') { setIdeaEditMode(ideaRowFor(t), false); return; }
    if (act === 'idea-update') { submitIdeaUpdate(ideaRowFor(t)); return; }
    if (act === 'idea-delete') { submitIdeaDelete(ideaRowFor(t)); return; }
    if (act === 'idea-plan') { submitIdeaPlan(ideaRowFor(t)); return; }
    if (act === 'idea-brainstorm') { submitIdeaBrainstorm(ideaRowFor(t), t); return; }
    if (act === 'plan-artifact-brainstorm') { submitPlanBrainstorm(t); return; }
    if (act === 'idea-check-delivery') { var deliveryPlanRef=(t.getAttribute('data-plan-ref')||'').trim(); if(deliveryPlanRef){setButtonBusy(t,true,'Checking...');vscode.postMessage({type:'checkIdeaDelivery',planRef:deliveryPlanRef});} return; }
    if (act === 'idea-undo-delete') { vscode.postMessage({type:'undoDeleteIdea'}); return; }
    if (act === 'planning-new-plan') { vscode.postMessage({type:'prefillPlanningInterviewChat'}); return; }
    if (act === 'planning-resume-chat') { var rc = (t.getAttribute('data-resume-cli') || '').trim(); vscode.postMessage({type:'prefillPlanningResumeChat',resumeCli:rc}); return; }
    if (act === 'planning-discard') { vscode.postMessage({type:'planningDiscard'}); return; }
    if (act === 'planning-wizard-start') { var sel = document.getElementById('wc-planning-type'); var pt = sel && sel.value ? String(sel.value).trim() : ''; if (pt) vscode.postMessage({type:'planningWizardStart',planningType:pt}); return; }
    if (act === 'planning-wizard-submit') { var ta = document.getElementById('wc-planning-answer'); var txt = ta && typeof ta.value === 'string' ? ta.value.trim() : ''; vscode.postMessage({type:'planningWizardSubmit',answer:txt}); return; }
    if (act === 'planning-wizard-cancel') { vscode.postMessage({type:'planningWizardCancel'}); return; }
    if (act === 'plan-artifact-review') { var revPlanId=(t.getAttribute('data-plan-id')||'').trim(); var revPlanVersion=(t.getAttribute('data-plan-version')||'').trim(); if(revPlanId&&revPlanVersion){setButtonBusy(t,true,'Reviewing...');vscode.postMessage({type:'reviewPlanArtifact',planId:revPlanId,version:revPlanVersion});}else{vscode.postMessage({type:'invalidPlanArtifactAction',action:'review',reason:'missing-plan-identity'});} return; }
    if (act === 'plan-artifact-accept') { var planId=(t.getAttribute('data-plan-id')||'').trim(); var planRef=(t.getAttribute('data-plan-ref')||'').trim(); var planVersion=(t.getAttribute('data-plan-version')||'').trim(); if(planId&&planRef&&planVersion)vscode.postMessage({type:'acceptPlanArtifact',planId:planId,planRef:planRef,version:planVersion}); return; }
    if (act === 'plan-artifact-finalize') { var finPlanId=(t.getAttribute('data-plan-id')||'').trim(); var finPlanVersion=(t.getAttribute('data-plan-version')||'').trim(); if(finPlanId&&finPlanVersion)vscode.postMessage({type:'finalizePlanArtifact',planId:finPlanId,version:finPlanVersion}); return; }
    if (act === 'idea-view-plan') { var viewPlanId=(t.getAttribute('data-plan-id')||'').trim(); var viewPlanVersion=(t.getAttribute('data-plan-version')||'').trim(); if(viewPlanId&&viewPlanVersion)vscode.postMessage({type:'viewPlanArtifact',planId:viewPlanId,version:viewPlanVersion}); return; }
    if (act === 'plan-artifact-resume') { var resumeIdeaId=(t.getAttribute('data-idea-id')||'').trim(); if(resumeIdeaId)vscode.postMessage({type:'prefillIdeaPlanningChat',ideaId:resumeIdeaId,title:'',note:''}); return; }
    if (act === 'idea-open-plan-card') { var jumpPlanId=(t.getAttribute('data-plan-id')||'').trim(); if(jumpPlanId){ var planCard=document.querySelector('[data-wc-plan-card-id="'+jumpPlanId.replace(/"/g,'\\"')+'"]'); if(planCard){ var planCardDetails=planCard.closest('details'); if(planCardDetails)planCardDetails.open=true; if(typeof planCard.scrollIntoView==='function')planCard.scrollIntoView({behavior:'smooth',block:'center'}); planCard.classList.add('wc-plan-card-highlight'); setTimeout(function(){planCard.classList.remove('wc-plan-card-highlight');},1600); } } return; }
    if (act === 'plan-open-idea') { var jumpIdeaId=(t.getAttribute('data-idea-id')||'').trim(); if(jumpIdeaId){ var ideaRow=document.querySelector('[data-wc-idea-id="'+jumpIdeaId.replace(/"/g,'\\"')+'"]'); if(ideaRow){ if(typeof ideaRow.scrollIntoView==='function')ideaRow.scrollIntoView({behavior:'smooth',block:'center'}); ideaRow.classList.add('wc-plan-card-highlight'); setTimeout(function(){ideaRow.classList.remove('wc-plan-card-highlight');},1600); } } return; }
    if (act === 'planning-wizard-dismiss') { vscode.postMessage({type:'planningWizardDismiss'});return;}if(act==="collaboration-hub"){vscode.postMessage({type:"prefillCollaborationHubChat"});return;}if(act==="deliver-phase-prompt"){var kp=(t.getAttribute("data-wc-kit-phase")||"").trim();vscode.postMessage({type:"prefillDeliverPhaseChat",kitPhase:kp});return;}if(act==="add-wishlist-item"){vscode.postMessage({type:"addWishlistItem"});return;}if(act==="generate-features-chat"){vscode.postMessage({type:"prefillGenerateFeaturesChat"});return;}if(act==="transcript-churn-research-chat"){var tcTid=(t.getAttribute("data-task-id")||"").trim();vscode.postMessage({type:"prefillTranscriptChurnResearchChat",taskId:tcTid});return;}if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}if(act==="wishlist-page"){var wpp=parseInt(String(t.getAttribute("data-wishlist-page")||"0"),10);if(!Number.isNaN(wpp)&&wpp>=0)vscode.postMessage({type:"wishlistPage",page:wpp});return;}if(act==="wishlist-decline"){var wlTid=(t.getAttribute("data-task-id")||"").trim();if(wlTid)vscode.postMessage({type:"dashboardTransition",taskId:wlTid,action:"reject",transitionKind:"wishlist"});return;}if(act==="phase-complete-release"){var ph=(t.getAttribute("data-wc-phase-phrase")||"").trim();var pk=(t.getAttribute("data-wc-phase-key")||"").trim();var ids=(t.getAttribute("data-wc-phase-task-ids")||"").trim();var wcur=(t.getAttribute("data-wc-workspace-current-phase")||"").trim();var wnxt=(t.getAttribute("data-wc-workspace-next-phase")||"").trim();var rscope=(t.getAttribute("data-wc-release-scope")||"").trim();var laterPh=(t.getAttribute("data-wc-later-delivered-phases")||"").trim();vscode.postMessage({type:"prefillPhaseCompleteReleaseChat",phasePhrase:ph,phaseKey:pk,seededTaskIdsCsv:ids,workspaceCurrentPhase:wcur,workspaceNextPhase:wnxt,laterDeliveredPhases:laterPh,scope:rscope==="current"?"current":rscope==="bucket"?"bucket":undefined});return;}if(act==="proposed-imp-accept-phase"||act==="proposed-exe-accept-phase"){var batch=(t.getAttribute("data-proposed-task-ids")||"").trim();var cat=act==="proposed-exe-accept-phase"?"execution":"improvement";var dpk=(t.getAttribute("data-proposed-phase-key")||"").trim();vscode.postMessage({type:"dashboardAcceptProposedPhase",category:cat,taskIds:batch,phaseKey:dpk});return;}if(act==="phase-notes-chat"){vscode.postMessage({type:"prefillPhaseNotesDiscoveryChat"});return;}if(act==="phase-note-add"){vscode.postMessage({type:"addPhaseNote"});return;}if(act==="phase-note-dismiss"){var dpn=(t.getAttribute("data-note-id")||"").trim();var dpp=(t.getAttribute("data-note-priority")||"").trim();if(dpn)vscode.postMessage({type:"dismissPhaseNote",noteId:dpn,priority:dpp});return;}if(act==="phase-note-convert"){var cpn=(t.getAttribute("data-note-id")||"").trim();if(cpn)vscode.postMessage({type:"convertPhaseNote",noteId:cpn});return;}if(act==="phase-notes-propose-persist"){vscode.postMessage({type:"persistPhaseNoteProposals"});return;}if(act==="register-phase-catalog"){vscode.postMessage({type:"registerPhaseCatalogEntry"});return;}if(act==="phase-mark-complete"){var markPk=(t.getAttribute("data-wc-phase-key")||"").trim();if(markPk)vscode.postMessage({type:"markPhaseComplete",phaseKey:markPk});return;}if(act==="phase-roster-start"){var rosterPk=(t.getAttribute("data-wc-phase-key")||"").trim();if(rosterPk)vscode.postMessage({type:"startPhaseFromRoster",phaseKey:rosterPk});return;}if(act==="team-assignment-register"){vscode.postMessage({type:"registerTeamAssignment"});return;}if(act==="team-execution-chat"){vscode.postMessage({type:"prefillTeamExecutionChat"});return;}if(act==="team-assignment-handoff"){var teamAid=(t.getAttribute("data-assignment-id")||"").trim();var teamWid=(t.getAttribute("data-worker-id")||"").trim();if(teamAid&&teamWid)vscode.postMessage({type:"submitTeamHandoff",assignmentId:teamAid,workerId:teamWid});return;}if(act==="team-assignment-reconcile"){var teamAid2=(t.getAttribute("data-assignment-id")||"").trim();var teamSid=(t.getAttribute("data-supervisor-id")||"").trim();if(teamAid2&&teamSid)vscode.postMessage({type:"reconcileTeamAssignment",assignmentId:teamAid2,supervisorId:teamSid});return;}if(act==="team-assignment-block"){var teamAid3=(t.getAttribute("data-assignment-id")||"").trim();var teamSid2=(t.getAttribute("data-supervisor-id")||"").trim();if(teamAid3&&teamSid2)vscode.postMessage({type:"blockTeamAssignment",assignmentId:teamAid3,supervisorId:teamSid2});return;}if(act==="team-assignment-cancel"){var teamAid4=(t.getAttribute("data-assignment-id")||"").trim();var teamSid3=(t.getAttribute("data-supervisor-id")||"").trim();if(teamAid4)vscode.postMessage({type:"cancelTeamAssignment",assignmentId:teamAid4,supervisorId:teamSid3});return;}if(act==="subagent-register"){vscode.postMessage({type:"registerSubagent"});return;}if(act==="subagent-registry-chat"){vscode.postMessage({type:"prefillSubagentRegistryChat"});return;}if(act==="subagent-spawn"){var subId=(t.getAttribute("data-subagent-id")||"").trim();vscode.postMessage({type:"spawnSubagent",subagentId:subId});return;}if(act==="subagent-session-close"){var subSid=(t.getAttribute("data-session-id")||"").trim();var subDef=(t.getAttribute("data-definition-id")||"").trim();if(subSid&&subDef)vscode.postMessage({type:"closeSubagentSession",sessionId:subSid,definitionId:subDef});return;}if(act==="subagent-retire"){var subRet=(t.getAttribute("data-subagent-id")||"").trim();vscode.postMessage({type:"retireSubagent",subagentId:subRet});return;}if(act==="checkpoint-create-head"){vscode.postMessage({type:"createCheckpoint",mode:"head"});return;}if(act==="checkpoint-create-stash"){vscode.postMessage({type:"createCheckpoint",mode:"stash"});return;}if(act==="checkpoint-recovery-chat"){vscode.postMessage({type:"prefillTaskCheckpointsRecoveryChat"});return;}if(act==="checkpoint-compare"){var ckptCmp=(t.getAttribute("data-checkpoint-id")||"").trim();if(ckptCmp)vscode.postMessage({type:"compareCheckpoint",checkpointId:ckptCmp});return;}if(act==="checkpoint-rewind"){var ckptRw=(t.getAttribute("data-checkpoint-id")||"").trim();var ckptRk=(t.getAttribute("data-ref-kind")||"").trim();var ckptTid=(t.getAttribute("data-task-id")||"").trim();if(ckptRw)vscode.postMessage({type:"rewindCheckpoint",checkpointId:ckptRw,refKind:ckptRk,taskId:ckptTid});return;}if(act==="queue-bucket-load-more"){var loadCat=(t.getAttribute("data-wc-queue-category")||"").trim();var loadCursor=(t.getAttribute("data-wc-queue-cursor")||"").trim();var loadBucket=t.closest("details.wc-lazy-queue-bucket");if(loadCat&&loadCursor&&loadBucket)requestLazyQueueBucketLoad(loadBucket,loadCursor);return;}if(act==="assign-phase"){var apTid=(t.getAttribute("data-task-id")||"").trim();if(apTid)vscode.postMessage({type:"assignTaskPhase",taskId:apTid});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="task-detail"){if(tid)vscode.postMessage({type:"openTaskDetail",taskId:tid});return;}if(act==="task-comments-view"){if(tid)vscode.postMessage({type:"viewTaskComments",taskId:tid});return;}if(act==="task-comment-add"){if(tid)vscode.postMessage({type:"addTaskComment",taskId:tid});return;}if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="human-gate-resume-ready"){if(tid)vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"resume_ready",transitionKind:"human-gate"});return;}if(act==="human-gate-resume-work"){if(tid)vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"resume_work",transitionKind:"human-gate"});return;}if(act==="proposed-imp-decline"||act==="proposed-exe-decline"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"reject"});return;}});

  if (rootEl) rootEl.addEventListener('keydown', function(ev) {
    var target = ev.target;
    if (target && target.matches && target.matches('[data-wc-idea-edit-title]')) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitIdeaUpdate(ideaRowFor(target));
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        setIdeaEditMode(ideaRowFor(target), false);
        return;
      }
    }
    if (!target || !target.classList || !target.classList.contains('dash-phase-deliverables-input')) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      submitPhaseDeliverablesInput(target);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      var row = target.closest('[data-wc-phase-row]');
      if (!row) return;
      var original = target.getAttribute('data-wc-original') || '';
      target.value = original;
      target.disabled = false;
      target.removeAttribute('data-wc-pending');
      target.removeAttribute('data-wc-mutation-id');
      togglePhaseDeliverablesEdit(row, false);
      setUiInteraction('phase-deliverables', false);
    }
  });
  if (rootEl) rootEl.addEventListener('change', function(ev) {
    var target = ev.target;
    if (!target || !target.matches || !target.matches('[data-wc-phase-filter]')) return;
    activePhaseFilter = target.value || 'all';
    applyQueueFilters(rootEl);
  });

  if (rootEl) rootEl.addEventListener('focusout', function(ev) {
    var target = ev.target;
    if (!target || !target.classList || !target.classList.contains('dash-phase-deliverables-input')) return;
    if (target.getAttribute('data-wc-pending') === '1') return;
    if (target.getAttribute('data-wc-focus-grace') === '1') return;
    var row = target.closest('[data-wc-phase-row]');
    if (!row) return;
    var editor = row.querySelector('.dash-phase-deliverables-editor');
    if (!editor || editor.hidden) return;
    var next = ev.relatedTarget;
    if (next && row.contains(next)) return;
    submitPhaseDeliverablesInput(target);
  });

  if (rootEl) rootEl.addEventListener('toggle', function(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'DETAILS' || !rootEl.contains(el)) return;
    if (el.classList && el.classList.contains('wc-agent-card')) {
      setAgentCardExpanded(el, !!el.open);
      return;
    }
    if (el.classList && el.classList.contains('wc-plan-card-architecture-diagrams') && el.open) {
      renderPlanMermaidDiagrams(el);
      return;
    }
    if (!el.classList.contains('wc-lazy-queue-bucket') || !el.open) return;
    requestLazyQueueBucketLoad(el);
  }, true);
})();`;
}
