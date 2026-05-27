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
  var PHASE_READINESS_EXPAND_KEY = 'wc-phase-readiness-expanded';
  var PHASE_PROGRESS_EXPAND_KEY = 'wc-phase-progress-expanded';

  var localUiLocks = {};
  var pendingReplaceRootHtml = null;
  var hostSnapshot = null;
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
    var open = {};
    var editState = capturePhaseDeliverablesEditState(root);
    var configState = captureConfigTabState(root);
    var preservedQueue = captureQueueSectionUiState(root);
    root.querySelectorAll('details[data-wc-track]').forEach(function(d) {
      var k = d.getAttribute('data-wc-track');
      if (k && d.open) open[k] = true;
    });
    capturePhaseCardCollapseState(root);
    root.innerHTML = html;
    Object.keys(open).forEach(function(k) {
      var el = root.querySelector('details[data-wc-track="' + k + '"]');
      if (el) el.open = true;
    });
    restorePhaseCardCollapseState(root);
    restoreConfigTabState(root, configState);
    applyTab(activeTab);
    restoreQueueSectionUiState(root, preservedQueue);
    applyQueueFilters(root);
    reloadOpenLazyQueueBucketsAfterMetaChange(root, preservedQueue.lazyBuckets);
    if (editState) restorePhaseDeliverablesEditState(editState);
    if (typeof window.wcReinitEmbeddedCae === 'function') window.wcReinitEmbeddedCae();
    var refreshBtn = document.getElementById('btn');
    setButtonBusy(refreshBtn, false);
    setUiInteraction('refresh', false);
  }

  function lazyBucketPreserveKey(category, phaseKey) {
    return String(category) + '|' + String(phaseKey);
  }

  function captureQueueSectionUiState(root) {
    var openTracks = {};
    if (root) {
      root.querySelectorAll('details.status-section[open][data-wc-track]').forEach(function(d) {
        var k = d.getAttribute('data-wc-track');
        if (k) openTracks[k] = true;
      });
    }
    return {
      openTracks: openTracks,
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
        if (el) el.open = true;
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
        // Ready tasks change status often; replaying cached row HTML leaves completed work visible as open.
        if (entry.category === 'ready') return;
        var bucket = root.querySelector(lazyQueueBucketSelector(entry.category, entry.phaseKey));
        if (!bucket || !bucketMetaMatches(bucket, entry)) return;
        var body = bucket.querySelector('.wc-lazy-bucket-body');
        if (!body) return;
        body.innerHTML = entry.bodyHtml;
        body.setAttribute('data-wc-lazy-loaded', '1');
        bucket.setAttribute('data-wc-lazy-loaded', '1');
        bucket.removeAttribute('data-wc-lazy-loading');
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
      // Always refetch open Ready buckets after a queue patch (status transitions).
      if (category === 'ready') {
        requestLazyQueueBucketLoad(d);
        return;
      }
      var body = d.querySelector('.wc-lazy-bucket-body');
      if (body && body.getAttribute('data-wc-lazy-loaded') === '1') return;
      var entry = preserved && preserved[lazyBucketPreserveKey(category, phaseKey)];
      if (entry && bucketMetaMatches(d, entry) && entry.bodyHtml) return;
      requestLazyQueueBucketLoad(d);
    });
  }

  function applySectionPatch(sectionId, html, state) {
    var root = document.getElementById('root');
    if (!root || !sectionId) return;
    var el = root.querySelector('[data-wc-section="' + sectionId + '"]');
    if (!el) return;
    var st = state || 'ready';
    if (sectionId === 'queue' && typeof html === 'string' && html.length > 0) {
      var preservedQueue = captureQueueSectionUiState(root);
      el.innerHTML = html;
      restoreQueueSectionUiState(root, preservedQueue);
      applyQueueFilters(root);
      reloadOpenLazyQueueBucketsAfterMetaChange(root, preservedQueue.lazyBuckets);
    } else if (typeof html === 'string' && html.length > 0) {
      el.innerHTML = html;
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

  function persistPhaseCardExpanded(storageKey, expanded) {
    try {
      if (expanded) sessionStorage.setItem(storageKey, '1');
      else sessionStorage.removeItem(storageKey);
    } catch (e) {}
  }

  function capturePhaseCardCollapseState(root) {
    if (!root) return;
    var readiness = root.querySelector('.wc-cae-readiness');
    if (readiness) {
      persistPhaseCardExpanded(
        PHASE_READINESS_EXPAND_KEY,
        !readiness.classList.contains('wc-cae-readiness-collapsed')
      );
    }
    var progress = root.querySelector('.wc-phase-progress');
    if (progress) {
      persistPhaseCardExpanded(
        PHASE_PROGRESS_EXPAND_KEY,
        !progress.classList.contains('wc-phase-progress-collapsed')
      );
    }
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

  function requestLazyQueueBucketLoad(detailsEl, cursor) {
    if (!detailsEl) return;
    if (window.__wcRestoringLazyBuckets) return;
    var category = (detailsEl.getAttribute('data-wc-queue-category') || '').trim();
    if (!category) return;
    var bodyEarly = detailsEl.querySelector('.wc-lazy-bucket-body');
    if (bodyEarly && bodyEarly.getAttribute('data-wc-lazy-loaded') === '1' && !(typeof cursor === 'string' && cursor.trim().length > 0)) {
      return;
    }
    var append = typeof cursor === 'string' && cursor.trim().length > 0;
    if (!append) {
      if (detailsEl.getAttribute('data-wc-lazy-loaded') === '1') return;
      if (detailsEl.getAttribute('data-wc-lazy-loading') === '1') return;
    } else {
      if (detailsEl.getAttribute('data-wc-lazy-more-loading') === '1') return;
      detailsEl.setAttribute('data-wc-lazy-more-loading', '1');
    }
    detailsEl.setAttribute('data-wc-lazy-loading', '1');
    var body = detailsEl.querySelector('.wc-lazy-bucket-body');
    if (body) {
      var hint = body.querySelector('.wc-lazy-bucket-hint');
      if (hint && !append) hint.textContent = 'Loading…';
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
    bucket.removeAttribute('data-wc-lazy-more-loading');
    var body = bucket.querySelector('.wc-lazy-bucket-body');
    if (!body) return;
    if (append) {
      var moreWrap = body.querySelector('.wc-lazy-bucket-more');
      if (moreWrap) moreWrap.remove();
      body.insertAdjacentHTML('beforeend', typeof html === 'string' ? html : '');
    } else {
      bucket.setAttribute('data-wc-lazy-loaded', '1');
      body.innerHTML = typeof html === 'string' ? html : '';
      body.setAttribute('data-wc-lazy-loaded', '1');
    }
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

  function restorePhaseCardCollapseState(root) {
    if (!root) return;
    var readiness = root.querySelector('.wc-cae-readiness');
    if (readiness) {
      var readinessExpanded = false;
      try { readinessExpanded = sessionStorage.getItem(PHASE_READINESS_EXPAND_KEY) === '1'; } catch (e) {}
      readiness.classList.toggle('wc-cae-readiness-collapsed', !readinessExpanded);
      var readinessToggle = readiness.querySelector('[data-wc-action="phase-readiness-toggle"]');
      if (readinessToggle) {
        readinessToggle.setAttribute('aria-expanded', readinessExpanded ? 'true' : 'false');
      }
    }
    var progress = root.querySelector('.wc-phase-progress');
    if (progress) {
      var progressExpanded = false;
      try { progressExpanded = sessionStorage.getItem(PHASE_PROGRESS_EXPAND_KEY) === '1'; } catch (e) {}
      progress.classList.toggle('wc-phase-progress-collapsed', !progressExpanded);
      var progressToggle = progress.querySelector('[data-wc-action="phase-progress-toggle"]');
      if (progressToggle) {
        progressToggle.setAttribute('aria-expanded', progressExpanded ? 'true' : 'false');
      }
    }
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

  function applyTab(tab) {
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
    });
    if (tab === 'config' && window.wcConfigTab) {
      if (window.wcConfigTab.afterDomUpdate) window.wcConfigTab.afterDomUpdate();
      var list = document.getElementById('config-list-root');
      var needsLoad = prevTab !== 'config' || !list || !!list.querySelector('.cfg-loading');
      if (needsLoad && window.wcConfigTab.requestLoad) window.wcConfigTab.requestLoad();
    }
    if (tab !== prevTab) {
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
    if (!m || m.type !== 'wcReplaceRoot' || typeof m.html !== 'string') return;
    if (isLocalUiLocked()) {
      pendingReplaceRootHtml = m.html;
      return;
    }
    applyReplaceRootHtml(m.html);
  });

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

  applyTab(activeTab);
  restorePhaseCardCollapseState(document.getElementById('root'));
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
      persistPhaseCardExpanded(PHASE_READINESS_EXPAND_KEY, readinessExpanded);
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
      persistPhaseCardExpanded(PHASE_PROGRESS_EXPAND_KEY, progressExpanded);
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
    if (act === 'planning-new-plan') { vscode.postMessage({type:'prefillPlanningInterviewChat'}); return; }
    if (act === 'planning-resume-chat') { var rc = (t.getAttribute('data-resume-cli') || '').trim(); vscode.postMessage({type:'prefillPlanningResumeChat',resumeCli:rc}); return; }
    if (act === 'planning-discard') { vscode.postMessage({type:'planningDiscard'}); return; }
    if (act === 'planning-wizard-start') { var sel = document.getElementById('wc-planning-type'); var pt = sel && sel.value ? String(sel.value).trim() : ''; if (pt) vscode.postMessage({type:'planningWizardStart',planningType:pt}); return; }
    if (act === 'planning-wizard-submit') { var ta = document.getElementById('wc-planning-answer'); var txt = ta && typeof ta.value === 'string' ? ta.value.trim() : ''; vscode.postMessage({type:'planningWizardSubmit',answer:txt}); return; }
    if (act === 'planning-wizard-cancel') { vscode.postMessage({type:'planningWizardCancel'}); return; }
    if (act === 'planning-wizard-dismiss') { vscode.postMessage({type:'planningWizardDismiss'});return;}if(act==="collaboration-hub"){vscode.postMessage({type:"prefillCollaborationHubChat"});return;}if(act==="deliver-phase-prompt"){var kp=(t.getAttribute("data-wc-kit-phase")||"").trim();vscode.postMessage({type:"prefillDeliverPhaseChat",kitPhase:kp});return;}if(act==="add-wishlist-item"){vscode.postMessage({type:"addWishlistItem"});return;}if(act==="generate-features-chat"){vscode.postMessage({type:"prefillGenerateFeaturesChat"});return;}if(act==="transcript-churn-research-chat"){var tcTid=(t.getAttribute("data-task-id")||"").trim();vscode.postMessage({type:"prefillTranscriptChurnResearchChat",taskId:tcTid});return;}if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}if(act==="wishlist-page"){var wpp=parseInt(String(t.getAttribute("data-wishlist-page")||"0"),10);if(!Number.isNaN(wpp)&&wpp>=0)vscode.postMessage({type:"wishlistPage",page:wpp});return;}if(act==="wishlist-decline"){var wlTid=(t.getAttribute("data-task-id")||"").trim();if(wlTid)vscode.postMessage({type:"dashboardTransition",taskId:wlTid,action:"reject",transitionKind:"wishlist"});return;}if(act==="phase-complete-release"){var ph=(t.getAttribute("data-wc-phase-phrase")||"").trim();var pk=(t.getAttribute("data-wc-phase-key")||"").trim();var ids=(t.getAttribute("data-wc-phase-task-ids")||"").trim();var wcur=(t.getAttribute("data-wc-workspace-current-phase")||"").trim();var wnxt=(t.getAttribute("data-wc-workspace-next-phase")||"").trim();var rscope=(t.getAttribute("data-wc-release-scope")||"").trim();vscode.postMessage({type:"prefillPhaseCompleteReleaseChat",phasePhrase:ph,phaseKey:pk,seededTaskIdsCsv:ids,workspaceCurrentPhase:wcur,workspaceNextPhase:wnxt,scope:rscope==="current"?"current":rscope==="bucket"?"bucket":undefined});return;}if(act==="proposed-imp-accept-phase"||act==="proposed-exe-accept-phase"){var batch=(t.getAttribute("data-proposed-task-ids")||"").trim();var cat=act==="proposed-exe-accept-phase"?"execution":"improvement";var dpk=(t.getAttribute("data-proposed-phase-key")||"").trim();vscode.postMessage({type:"dashboardAcceptProposedPhase",category:cat,taskIds:batch,phaseKey:dpk});return;}if(act==="phase-notes-chat"){vscode.postMessage({type:"prefillPhaseNotesDiscoveryChat"});return;}if(act==="phase-note-add"){vscode.postMessage({type:"addPhaseNote"});return;}if(act==="phase-note-dismiss"){var dpn=(t.getAttribute("data-note-id")||"").trim();var dpp=(t.getAttribute("data-note-priority")||"").trim();if(dpn)vscode.postMessage({type:"dismissPhaseNote",noteId:dpn,priority:dpp});return;}if(act==="phase-note-convert"){var cpn=(t.getAttribute("data-note-id")||"").trim();if(cpn)vscode.postMessage({type:"convertPhaseNote",noteId:cpn});return;}if(act==="phase-notes-propose-persist"){vscode.postMessage({type:"persistPhaseNoteProposals"});return;}if(act==="register-phase-catalog"){vscode.postMessage({type:"registerPhaseCatalogEntry"});return;}if(act==="phase-mark-complete"){var markPk=(t.getAttribute("data-wc-phase-key")||"").trim();if(markPk)vscode.postMessage({type:"markPhaseComplete",phaseKey:markPk});return;}if(act==="phase-roster-start"){var rosterPk=(t.getAttribute("data-wc-phase-key")||"").trim();if(rosterPk)vscode.postMessage({type:"startPhaseFromRoster",phaseKey:rosterPk});return;}if(act==="team-assignment-register"){vscode.postMessage({type:"registerTeamAssignment"});return;}if(act==="team-execution-chat"){vscode.postMessage({type:"prefillTeamExecutionChat"});return;}if(act==="team-assignment-handoff"){var teamAid=(t.getAttribute("data-assignment-id")||"").trim();var teamWid=(t.getAttribute("data-worker-id")||"").trim();if(teamAid&&teamWid)vscode.postMessage({type:"submitTeamHandoff",assignmentId:teamAid,workerId:teamWid});return;}if(act==="team-assignment-reconcile"){var teamAid2=(t.getAttribute("data-assignment-id")||"").trim();var teamSid=(t.getAttribute("data-supervisor-id")||"").trim();if(teamAid2&&teamSid)vscode.postMessage({type:"reconcileTeamAssignment",assignmentId:teamAid2,supervisorId:teamSid});return;}if(act==="team-assignment-block"){var teamAid3=(t.getAttribute("data-assignment-id")||"").trim();var teamSid2=(t.getAttribute("data-supervisor-id")||"").trim();if(teamAid3&&teamSid2)vscode.postMessage({type:"blockTeamAssignment",assignmentId:teamAid3,supervisorId:teamSid2});return;}if(act==="team-assignment-cancel"){var teamAid4=(t.getAttribute("data-assignment-id")||"").trim();var teamSid3=(t.getAttribute("data-supervisor-id")||"").trim();if(teamAid4)vscode.postMessage({type:"cancelTeamAssignment",assignmentId:teamAid4,supervisorId:teamSid3});return;}if(act==="subagent-register"){vscode.postMessage({type:"registerSubagent"});return;}if(act==="subagent-registry-chat"){vscode.postMessage({type:"prefillSubagentRegistryChat"});return;}if(act==="subagent-spawn"){var subId=(t.getAttribute("data-subagent-id")||"").trim();vscode.postMessage({type:"spawnSubagent",subagentId:subId});return;}if(act==="subagent-session-close"){var subSid=(t.getAttribute("data-session-id")||"").trim();var subDef=(t.getAttribute("data-definition-id")||"").trim();if(subSid&&subDef)vscode.postMessage({type:"closeSubagentSession",sessionId:subSid,definitionId:subDef});return;}if(act==="subagent-retire"){var subRet=(t.getAttribute("data-subagent-id")||"").trim();vscode.postMessage({type:"retireSubagent",subagentId:subRet});return;}if(act==="checkpoint-create-head"){vscode.postMessage({type:"createCheckpoint",mode:"head"});return;}if(act==="checkpoint-create-stash"){vscode.postMessage({type:"createCheckpoint",mode:"stash"});return;}if(act==="checkpoint-recovery-chat"){vscode.postMessage({type:"prefillTaskCheckpointsRecoveryChat"});return;}if(act==="checkpoint-compare"){var ckptCmp=(t.getAttribute("data-checkpoint-id")||"").trim();if(ckptCmp)vscode.postMessage({type:"compareCheckpoint",checkpointId:ckptCmp});return;}if(act==="checkpoint-rewind"){var ckptRw=(t.getAttribute("data-checkpoint-id")||"").trim();var ckptRk=(t.getAttribute("data-ref-kind")||"").trim();var ckptTid=(t.getAttribute("data-task-id")||"").trim();if(ckptRw)vscode.postMessage({type:"rewindCheckpoint",checkpointId:ckptRw,refKind:ckptRk,taskId:ckptTid});return;}if(act==="approval-inbox-chat"){vscode.postMessage({type:"prefillPolicyApprovalInboxChat"});return;}if(act==="approval-review-accept"){var apTid=(t.getAttribute("data-task-id")||"").trim();var apTit=(t.getAttribute("data-task-title")||"").trim();if(apTid)vscode.postMessage({type:"reviewApprovalItem",taskId:apTid,title:apTit,decision:"accept"});return;}if(act==="approval-review-decline"){var apTid2=(t.getAttribute("data-task-id")||"").trim();var apTit2=(t.getAttribute("data-task-title")||"").trim();if(apTid2)vscode.postMessage({type:"reviewApprovalItem",taskId:apTid2,title:apTit2,decision:"decline"});return;}if(act==="approval-review-accept-edited"){var apTid3=(t.getAttribute("data-task-id")||"").trim();var apTit3=(t.getAttribute("data-task-title")||"").trim();if(apTid3)vscode.postMessage({type:"reviewApprovalItem",taskId:apTid3,title:apTit3,decision:"accept_edited"});return;}if(act==="queue-bucket-load-more"){var loadCat=(t.getAttribute("data-wc-queue-category")||"").trim();var loadCursor=(t.getAttribute("data-wc-queue-cursor")||"").trim();var loadBucket=t.closest("details.wc-lazy-queue-bucket");if(loadCat&&loadCursor&&loadBucket)requestLazyQueueBucketLoad(loadBucket,loadCursor);return;}if(act==="assign-phase"){var apTid=(t.getAttribute("data-task-id")||"").trim();if(apTid)vscode.postMessage({type:"assignTaskPhase",taskId:apTid});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="task-detail"){if(tid)vscode.postMessage({type:"openTaskDetail",taskId:tid});return;}if(act==="task-comments-view"){if(tid)vscode.postMessage({type:"viewTaskComments",taskId:tid});return;}if(act==="task-comment-add"){if(tid)vscode.postMessage({type:"addTaskComment",taskId:tid});return;}if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="human-gate-resume-ready"){if(tid)vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"resume_ready",transitionKind:"human-gate"});return;}if(act==="human-gate-resume-work"){if(tid)vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"resume_work",transitionKind:"human-gate"});return;}if(act==="proposed-imp-decline"||act==="proposed-exe-decline"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"reject"});return;}});

  if (rootEl) rootEl.addEventListener('keydown', function(ev) {
    var target = ev.target;
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
    if (!el.classList.contains('wc-lazy-queue-bucket') || !el.open) return;
    requestLazyQueueBucketLoad(el);
  }, true);
})();`;
}
