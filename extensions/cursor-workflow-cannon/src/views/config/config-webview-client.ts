/**
 * Shared in-webview script for sidebar Config and dashboard Config tab (T100384+).
 * Host pages postMessage with types: load, set, unset, explain, validate, reloadWindow.
 */

export type ConfigWebviewClientOptions = {
  /** When false, host or tab switch must call wcConfigTab.requestLoad() (dashboard). */
  autoLoad?: boolean;
};

export function buildConfigWebviewBootstrapScript(options: ConfigWebviewClientOptions = {}): string {
  const autoLoad = options.autoLoad !== false;
  const autoLoadLine = autoLoad ? "  requestLoad();" : "";
  return `(function(){
  var vscode = window.__wfcVscode || (window.__wfcVscode = acquireVsCodeApi());
  function cfgEl(id) { return document.getElementById(id); }
  function showStatus(kind, text) {
    var statusEl = cfgEl('cfg-status');
    if (!statusEl) return;
    statusEl.className = 'cfg-status cfg-status-' + (kind || 'info');
    statusEl.textContent = text || '';
  }
  function currentIncludeAll() {
    var maintainerEl = cfgEl('cfg-maintainer');
    return maintainerEl && maintainerEl.checked;
  }
  var lastConfigListHtml = '';
  var configLoadDebounceTimer = null;
  var localConfigLocks = {};
  var pendingSetListHtml = null;
  var pendingSetListMeta = null;

  function isConfigUiLocked() {
    return Object.keys(localConfigLocks).length > 0;
  }

  function setConfigUiLock(source, active) {
    var key = source || 'config-edit';
    if (active) localConfigLocks[key] = true;
    else delete localConfigLocks[key];
    vscode.postMessage({ type: 'wcUiInteraction', source: key, active: !!active });
    if (!isConfigUiLocked() && pendingSetListHtml) {
      var html = pendingSetListHtml;
      var meta = pendingSetListMeta || {};
      pendingSetListHtml = null;
      pendingSetListMeta = null;
      applyConfigSetList(html, meta);
    }
  }

  function captureConfigEditFocus() {
    var active = document.activeElement;
    if (!active || !active.getAttribute) return null;
    var role = active.getAttribute('data-role');
    if (role !== 'value') return null;
    var details = active.closest('details.cfg-details');
    if (!details) return null;
    var id = active.id || '';
    var state = {
      id: id,
      value: ('value' in active && active.value != null) ? String(active.value) : '',
      selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      track: details.getAttribute('data-wc-track') || '',
      open: details.open
    };
    return state;
  }

  function restoreConfigEditFocus(state) {
    if (!state) return;
    var listRoot = cfgEl('config-list-root');
    if (!listRoot) return;
    var details = state.track
      ? listRoot.querySelector('details[data-wc-track="' + state.track.replace(/"/g, '\\\\"') + '"]')
      : null;
    if (details && state.open) details.open = true;
    var el = state.id ? document.getElementById(state.id) : null;
    if (!el && details) el = details.querySelector('[data-role="value"]');
    if (!el) return;
    if ('value' in el && state.value != null) el.value = state.value;
    if (el.focus) {
      el.focus();
      if (typeof state.selectionStart === 'number' && typeof state.selectionEnd === 'number' && el.setSelectionRange) {
        try { el.setSelectionRange(state.selectionStart, state.selectionEnd); } catch (e) {}
      }
    }
    setConfigUiLock('config-edit', true);
    el.setAttribute('data-wc-focus-grace', '1');
    setTimeout(function() {
      if (el) el.removeAttribute('data-wc-focus-grace');
    }, 400);
  }

  var activeExplainKey = '';
  var validateSeq = 0;

  function findCfgRow(key) {
    if (!key) return null;
    var listRoot = cfgEl('config-list-root');
    if (!listRoot) return null;
    return listRoot.querySelector('.cfg-row[data-config-key="' + key.replace(/"/g, '\\\\"') + '"]');
  }

  function findCfgDetails(key) {
    var row = findCfgRow(key);
    return row ? row.querySelector('details.cfg-details') : null;
  }

  function syncRowBaseline(details) {
    if (!details) return;
    var v = readRowValue(details);
    if (v != null) details.setAttribute('data-wc-baseline', v);
  }

  function isRowDirty(details) {
    if (!details) return false;
    var base = details.getAttribute('data-wc-baseline');
    if (base == null) return false;
    var cur = readRowValue(details);
    if (cur == null) return false;
    return cur !== base;
  }

  function setFieldHint(details, state, message) {
    if (!details) return;
    var hint = details.querySelector('.cfg-field-hint');
    if (!hint) return;
    hint.className = 'cfg-field-hint' + (state ? ' cfg-field-hint--' + state : '');
    hint.textContent = message || '';
    hint.hidden = !message;
  }

  function updateRowDirtyUI(details) {
    if (!details) return;
    var row = details.closest('.cfg-row');
    var dirty = isRowDirty(details);
    var pill = row && row.querySelector('.cfg-dirty-pill');
    if (pill) pill.hidden = !dirty;
    var saveBtn = details.querySelector('button[data-wc-action="config-save"]');
    if (saveBtn) saveBtn.disabled = !dirty;
    details.classList.toggle('cfg-details--dirty', dirty);
    if (!dirty) setFieldHint(details, '', '');
  }

  function setExplainActiveKey(key, scrollRow) {
    activeExplainKey = key || '';
    var label = cfgEl('cfg-explain-active-key');
    var panel = cfgEl('cfg-explain-panel');
    var dismiss = cfgEl('cfg-explain-dismiss');
    if (label) label.textContent = key || 'No key selected';
    if (panel) panel.classList.toggle('cfg-explain-panel--empty', !key);
    if (dismiss) dismiss.hidden = !key;
    var listRoot = cfgEl('config-list-root');
    if (listRoot) {
      listRoot.querySelectorAll('.cfg-row--explain-active').forEach(function(r) {
        r.classList.remove('cfg-row--explain-active');
      });
      if (key) {
        var row = findCfgRow(key);
        if (row) {
          row.classList.add('cfg-row--explain-active');
          var det = row.querySelector('details');
          if (det) det.open = true;
          if (scrollRow) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }

  function clearExplainPanel() {
    var host = cfgEl('cfg-explain-host');
    if (host) host.innerHTML = '<p class="cfg-muted">Expand a key and choose <b>Explain Layers</b> to see project vs user vs default.</p>';
    setExplainActiveKey('', false);
  }

  function applyConfigRowPatch(patch) {
    if (!patch || !patch.key) return;
    var details = findCfgDetails(patch.key);
    if (!details) return;
    if (typeof patch.baseline === 'string') {
      details.setAttribute('data-wc-baseline', patch.baseline);
    }
    var row = details.closest('.cfg-row');
    if (row && typeof patch.preview === 'string') {
      var prev = row.querySelector('.cfg-preview');
      if (prev) prev.textContent = patch.preview;
    }
    updateRowDirtyUI(details);
    setFieldHint(details, 'ok', 'Saved — effective value updated.');
  }

  function requestValidateRow(details) {
    if (!details) return;
    var key = details.closest('.cfg-row') && details.closest('.cfg-row').getAttribute('data-config-key');
    if (!key) return;
    var value = readRowValue(details);
    if (value == null) return;
    var seq = ++validateSeq;
    details.setAttribute('data-wc-validate-seq', String(seq));
    setFieldHint(details, 'info', 'Checking value…');
    vscode.postMessage({
      type: 'validateKey',
      key: key,
      value: value,
      editorKind: details.getAttribute('data-editor-kind') || 'json',
      includeAll: currentIncludeAll(),
      seq: seq
    });
  }

  function wireConfigRowEditors(details) {
    if (!details || details.getAttribute('data-wc-row-wired') === '1') return;
    details.setAttribute('data-wc-row-wired', '1');
    syncRowBaseline(details);
    updateRowDirtyUI(details);
    details.querySelectorAll('[data-role="value"]').forEach(function(el) {
      if (el.getAttribute('data-wc-focus-wired') === '1') return;
      el.setAttribute('data-wc-focus-wired', '1');
      var markDirty = function() { updateRowDirtyUI(details); };
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
      el.addEventListener('focusin', function() {
        setConfigUiLock('config-edit', true);
      });
      el.addEventListener('focusout', function() {
        if (el.getAttribute('data-wc-focus-grace') === '1') return;
        setTimeout(function() {
          if (document.activeElement && document.activeElement.getAttribute &&
              document.activeElement.getAttribute('data-role') === 'value') return;
          setConfigUiLock('config-edit', false);
          if (isRowDirty(details)) requestValidateRow(details);
          else setFieldHint(details, '', '');
        }, 120);
      });
    });
  }

  function wireAllConfigRows() {
    var listRoot = cfgEl('config-list-root');
    if (!listRoot) return;
    listRoot.querySelectorAll('details.cfg-details--editable').forEach(wireConfigRowEditors);
  }

  function applyConfigSetList(html, meta) {
    var listRoot = cfgEl('config-list-root');
    if (!listRoot || typeof html !== 'string') return;
    var editFocus = captureConfigEditFocus();
    if (html === lastConfigListHtml) {
      if (meta && meta.statusText) showStatus(meta.statusKind || 'info', meta.statusText);
      restoreConfigEditFocus(editFocus);
      return;
    }
    lastConfigListHtml = html;
    var open = {};
    listRoot.querySelectorAll('details[data-wc-track]').forEach(function(d) {
      var k = d.getAttribute('data-wc-track');
      if (k && d.open) open[k] = true;
    });
    listRoot.innerHTML = html;
    Object.keys(open).forEach(function(k) {
      var el = listRoot.querySelector('details[data-wc-track="' + k + '"]');
      if (el) el.open = true;
    });
    wireAllConfigRows();
    applyFilter();
    restoreConfigEditFocus(editFocus);
    if (activeExplainKey) setExplainActiveKey(activeExplainKey, false);
    if (meta && meta.statusText) showStatus(meta.statusKind || 'info', meta.statusText);
    else {
      var n = listRoot.querySelectorAll('.cfg-row').length;
      showStatus('info', n + ' keys · edit a value, then Apply when marked Unsaved.');
    }
  }
  function requestLoad() {
    if (configLoadDebounceTimer) {
      clearTimeout(configLoadDebounceTimer);
      configLoadDebounceTimer = null;
    }
    vscode.postMessage({ type: 'load', includeAll: currentIncludeAll() });
  }
  function requestLoadDebounced(delayMs) {
    if (configLoadDebounceTimer) clearTimeout(configLoadDebounceTimer);
    configLoadDebounceTimer = setTimeout(function() {
      configLoadDebounceTimer = null;
      requestLoad();
    }, delayMs == null ? 600 : delayMs);
  }
  function applyFilter() {
    var listRoot = cfgEl('config-list-root');
    var q = (cfgEl('cfg-filter') && cfgEl('cfg-filter').value || '').trim().toLowerCase();
    if (!listRoot) return;
    listRoot.querySelectorAll('.cfg-row').forEach(function(row) {
      var hay = row.getAttribute('data-search') || '';
      row.style.display = !q || hay.indexOf(q) !== -1 ? '' : 'none';
    });
    listRoot.querySelectorAll('.cfg-section').forEach(function(section) {
      var visible = false;
      section.querySelectorAll('.cfg-row').forEach(function(row) {
        if (row.style.display !== 'none') visible = true;
      });
      section.style.display = visible ? '' : 'none';
    });
  }
  function readRowValue(details) {
    var kind = details.getAttribute('data-editor-kind') || 'json';
    if (kind === 'toggle') {
      var cb = details.querySelector('input[data-role="value"][type="checkbox"]');
      if (!cb) return null;
      return JSON.stringify(cb.checked);
    }
    if (kind === 'select') {
      var selVal = details.querySelector('select[data-role="value"]');
      if (!selVal) return null;
      return selVal.value;
    }
    if (kind === 'text') {
      var txt = details.querySelector('input[data-role="value"][data-value-kind="text"]');
      if (!txt) return null;
      return JSON.stringify(txt.value);
    }
    if (kind === 'number') {
      var num = details.querySelector('input[data-role="value"][data-value-kind="number"]');
      if (!num || num.value === '') return null;
      return JSON.stringify(Number(num.value));
    }
    var ta = details.querySelector('textarea[data-role="value"]');
    return ta ? ta.value : null;
  }
  function rowContext(btn) {
    var d = btn.closest('details');
    if (!d) return null;
    var sc = d.querySelector('select[data-role="scope"]');
    var key = btn.getAttribute('data-key');
    var value = readRowValue(d);
    if (!key || value == null) return null;
    return { key: key, value: value, scope: sc && sc.value ? sc.value : 'project', editorKind: d.getAttribute('data-editor-kind') || 'json' };
  }
  function bindConfigToolbar() {
    var refreshBtn = cfgEl('cfg-refresh');
    if (refreshBtn && !refreshBtn.getAttribute('data-wc-bound')) {
      refreshBtn.setAttribute('data-wc-bound', '1');
      refreshBtn.addEventListener('click', requestLoad);
    }
    var validateBtn = cfgEl('cfg-validate');
    if (validateBtn && !validateBtn.getAttribute('data-wc-bound')) {
      validateBtn.setAttribute('data-wc-bound', '1');
      validateBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'validate' });
      });
    }
    var maintainerEl = cfgEl('cfg-maintainer');
    if (maintainerEl && !maintainerEl.getAttribute('data-wc-bound')) {
      maintainerEl.setAttribute('data-wc-bound', '1');
      maintainerEl.addEventListener('change', requestLoad);
    }
    var filterEl = cfgEl('cfg-filter');
    if (filterEl && !filterEl.getAttribute('data-wc-bound')) {
      filterEl.setAttribute('data-wc-bound', '1');
      filterEl.addEventListener('input', applyFilter);
    }
  }
  function jumpToConfigKey(key) {
    var listRoot = cfgEl('config-list-root');
    if (!listRoot || !key) return;
    var filterEl = cfgEl('cfg-filter');
    if (filterEl && filterEl.value) {
      filterEl.value = '';
      applyFilter();
    }
    var target = null;
    listRoot.querySelectorAll('.cfg-row').forEach(function(r) {
      var code = r.querySelector('code.cfg-key');
      if (code && code.textContent === key) target = r;
    });
    if (!target) {
      showStatus('warn', 'Key not in current list: ' + key + ' (try Maintainer keys or Reload).');
      return;
    }
    var det = target.querySelector('details');
    if (det) det.open = true;
    target.style.display = '';
    var section = target.closest('.cfg-section');
    if (section) section.style.display = '';
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    showStatus('info', 'Jumped to ' + key);
  }
  function handleConfigListButtonClick(t) {
    var act = t.getAttribute('data-wc-action');
    if (!act) return false;
    if (act === 'config-explain') {
      var ek = t.getAttribute('data-key');
      if (ek) {
        setExplainActiveKey(ek, true);
        showStatus('info', 'Loading layer explanation for ' + ek + '…');
        vscode.postMessage({ type: 'explain', key: ek });
      }
      return true;
    }
    if (act === 'config-save') {
      var c = rowContext(t);
      if (!c) return true;
      var detSave = t.closest('details');
      if (detSave) setFieldHint(detSave, 'info', 'Applying…');
      vscode.postMessage({
        type: 'set',
        key: c.key,
        value: c.value,
        scope: c.scope,
        editorKind: c.editorKind,
        reloadIncludeAll: currentIncludeAll()
      });
      return true;
    }
    if (act === 'config-unset') {
      var c2 = rowContext(t);
      if (!c2) return true;
      if (!confirm('Unset ' + c2.key + ' on layer ' + c2.scope + '?')) return true;
      vscode.postMessage({
        type: 'unset',
        key: c2.key,
        scope: c2.scope,
        reloadIncludeAll: currentIncludeAll()
      });
      return true;
    }
    if (act === 'config-reload-window') {
      vscode.postMessage({ type: 'reloadWindow' });
      return true;
    }
    return false;
  }

  function bindGlobalConfigActions() {
    if (document.body.getAttribute('data-wc-cfg-global-bound')) return;
    document.body.setAttribute('data-wc-cfg-global-bound', '1');
    document.addEventListener('click', function(ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('button[data-wc-action]') : null;
      if (!t) return;
      var act = t.getAttribute('data-wc-action');
      if (act === 'config-jump-key') {
        ev.preventDefault();
        jumpToConfigKey(t.getAttribute('data-key') || '');
        return;
      }
      if (act === 'config-retry') {
        ev.preventDefault();
        requestLoad();
        return;
      }
      if (!act || act.indexOf('config-') !== 0) return;
      var inList = t.closest('#config-list-root');
      if (!inList) return;
      ev.preventDefault();
      handleConfigListButtonClick(t);
    });
  }
  function bindConfigListActions() {
    wireAllConfigRows();
  }
  function afterDomUpdate() {
    bindConfigToolbar();
    bindGlobalConfigActions();
    bindConfigListActions();
    clearExplainPanel();
    var dismiss = cfgEl('cfg-explain-dismiss');
    if (dismiss && !dismiss.getAttribute('data-wc-bound')) {
      dismiss.setAttribute('data-wc-bound', '1');
      dismiss.addEventListener('click', clearExplainPanel);
    }
  }
  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'poke') {
      requestLoadDebounced(600);
      return;
    }
    if (m && m.type === 'setList') {
      var listRoot = cfgEl('config-list-root');
      if (listRoot && typeof m.html === 'string' && !m.error) {
        var meta = { statusText: m.statusText, statusKind: m.statusKind };
        if (isConfigUiLocked()) {
          pendingSetListHtml = m.html;
          pendingSetListMeta = meta;
          return;
        }
        applyConfigSetList(m.html, meta);
      }
      var n = cfgEl('config-list-root') ? cfgEl('config-list-root').querySelectorAll('.cfg-row').length : 0;
      if (m.error && listRoot) {
        lastConfigListHtml = '';
        listRoot.innerHTML =
          '<p class="cfg-muted">Could not load the full config catalog.</p>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="config-retry">Retry</button>';
        listRoot.removeAttribute('data-wc-bound');
        showStatus('warn', m.error);
      } else if (m.statusText) {
        showStatus(m.statusKind || 'info', m.statusText);
      } else {
        showStatus('info', n + ' keys · expand a row to view or edit one value at a time.');
      }
      return;
    }
    if (m && m.type === 'explainResult') {
      var explainHost = cfgEl('cfg-explain-host');
      var explainKey = typeof m.key === 'string' ? m.key : activeExplainKey;
      if (explainHost && typeof m.html === 'string' && m.html.trim()) {
        explainHost.innerHTML = m.html;
        setExplainActiveKey(explainKey, false);
        var panel = cfgEl('cfg-explain-panel');
        if (panel) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        showStatus('info', explainKey ? 'Layer breakdown for ' + explainKey + '.' : 'Layer explanation ready.');
      } else {
        showStatus('warn', 'No layer explanation returned for that key.');
      }
      return;
    }
    if (m && m.type === 'validateKeyResult') {
      var vKey = typeof m.key === 'string' ? m.key : '';
      var detV = findCfgDetails(vKey);
      if (!detV) return;
      var seqWanted = detV.getAttribute('data-wc-validate-seq');
      if (seqWanted && m.seq && String(m.seq) !== seqWanted) return;
      if (m.ok) {
        setFieldHint(detV, 'ok', 'Value looks valid. Click Apply value to save.');
      } else {
        setFieldHint(detV, 'err', m.message || 'Invalid value.');
      }
      return;
    }
    if (m && m.type === 'configRowPatched') {
      applyConfigRowPatch(m);
      setConfigUiLock('config-edit', false);
      return;
    }
    if (m && m.type === 'validateResult') {
      showStatus(m.payload.code === 0 ? 'ok' : 'err', 'validate exit ' + m.payload.code + '\\n' + m.payload.text);
      return;
    }
    if (m && m.type === 'configMutationResult') {
      var p = m.payload || {};
      showStatus(p.statusKind || (p.statusKind === 'ok' ? 'ok' : 'err'), p.statusText || '');
      var restartHost = cfgEl('cfg-restart-host');
      if (restartHost) {
        restartHost.innerHTML = p.restartBannerHtml || '';
      }
      if (p.statusKind !== 'ok') {
        var listRootErr = cfgEl('config-list-root');
        if (listRootErr) {
          listRootErr.querySelectorAll('details.cfg-details--dirty').forEach(function(det) {
            requestValidateRow(det);
          });
        }
      }
      return;
    }
    if ((m && m.type === 'setResult') || (m && m.type === 'unsetResult')) {
      var p2 = m.payload;
      showStatus(p2.code === 0 ? 'ok' : 'err', 'exit ' + p2.code + '\\n' + p2.text);
    }
  });
  window.wcConfigTab = {
    requestLoad: requestLoad,
    requestLoadDebounced: requestLoadDebounced,
    applyFilter: applyFilter,
    afterDomUpdate: afterDomUpdate,
    jumpToConfigKey: jumpToConfigKey,
    captureEditFocus: captureConfigEditFocus,
    restoreEditFocus: restoreConfigEditFocus,
    getActiveExplainKey: function() { return activeExplainKey; },
    setExplainActiveKey: setExplainActiveKey
  };
  afterDomUpdate();
${autoLoadLine}
})();`;
}

/** CSS fragment shared by sidebar Config webview and dashboard Config tab panel. */
export const CONFIG_WEBVIEW_STYLES = `
    .cfg-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    .cfg-toolbar label { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
    .cfg-filter { flex: 1; min-width: 120px; padding: 4px 6px; box-sizing: border-box; }
    .cfg-status { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px 8px; margin-bottom: 8px; border-radius: 2px; }
    .cfg-status-info { background: var(--vscode-textCodeBlock-background); }
    .cfg-status-ok { background: rgba(0, 160, 0, 0.15); }
    .cfg-status-warn { background: rgba(200, 150, 0, 0.2); }
    .cfg-status-err { background: rgba(200, 60, 60, 0.2); }
    .cfg-muted { opacity: 0.8; margin: 8px 0; }
    .cfg-sections { display: flex; flex-direction: column; gap: 16px; }
    .cfg-section-heading { font-size: 13px; font-weight: 600; margin: 0 0 8px; opacity: 0.95; }
    .cfg-rows { display: flex; flex-direction: column; gap: 4px; }
    .cfg-details { border: 1px solid var(--vscode-widget-border); border-radius: 2px; background: var(--vscode-editor-background); }
    .cfg-summary { cursor: pointer; padding: 6px 8px; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .cfg-summary::-webkit-details-marker { display: none; }
    .cfg-key { font-weight: 600; }
    .cfg-type { opacity: 0.85; font-size: 11px; }
    .cfg-preview { flex: 1; min-width: 120px; font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.9; text-align: right; }
    .cfg-pill { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .cfg-pill-warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); }
    .cfg-body { padding: 0 8px 10px; border-top: 1px solid var(--vscode-widget-border); }
    .cfg-desc { margin: 8px 0; line-height: 1.35; }
    .cfg-meta { margin: 0; font-size: 11px; }
    .cfg-meta dt { font-weight: 600; margin-top: 6px; }
    .cfg-meta dd { margin: 2px 0 0 12px; }
    .cfg-label { display: block; margin-top: 8px; font-weight: 600; }
    .cfg-textarea { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px; margin-top: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .cfg-input { width: 100%; max-width: 420px; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px; margin-top: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .cfg-value-select { max-width: 420px; width: 100%; }
    .cfg-toggle-wrap { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-weight: normal; }
    .cfg-toggle { margin: 0; }
    .cfg-restart-banner { padding: 8px 10px; margin-bottom: 8px; border-radius: 2px; background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); }
    .cfg-restart-banner p { margin: 0 0 8px; }
    .cfg-select { margin-top: 4px; padding: 4px; max-width: 200px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-widget-border); }
    .cfg-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
    .cfg-row-btns { margin-top: 6px; }
    .cfg-footnote { font-size: 11px; opacity: 0.8; margin-top: 10px; line-height: 1.4; }
    .wc-config-panel .cfg-toolbar { margin-top: 8px; }
    .cfg-loading { font-style: italic; }
    .cfg-quick-settings { margin: 8px 0 12px; padding: 8px 10px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .cfg-quick-settings-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .cfg-explain-panel {
      position: sticky;
      top: 0;
      z-index: 2;
      margin-bottom: 12px;
      padding: 10px 12px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      background: var(--vscode-editor-background);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    .cfg-explain-panel--empty .cfg-explain-host { opacity: 0.85; }
    .cfg-explain-panel-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .cfg-explain-panel-title { margin: 0; font-size: 13px; font-weight: 600; }
    .cfg-explain-active-key { font-size: 11px; flex: 1; min-width: 120px; }
    .cfg-explain-host { margin: 0; max-height: 220px; overflow: auto; }
    .cfg-dirty-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    .cfg-details--dirty { border-color: var(--vscode-inputValidation-warningBorder, #b89500); }
    .cfg-row--explain-active {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
      border-radius: 2px;
    }
    .cfg-field-hint {
      margin: 6px 0 0;
      font-size: 11px;
      line-height: 1.35;
      min-height: 1.35em;
    }
    .cfg-field-hint[hidden] { display: none; }
    .cfg-field-hint--ok { color: var(--vscode-testing-iconPassed, #3fb950); }
    .cfg-field-hint--err { color: var(--vscode-errorForeground, #f85149); }
    .cfg-field-hint--info { opacity: 0.85; }
    .cfg-explain-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
    .cfg-explain-table th, .cfg-explain-table td { border: 1px solid var(--vscode-widget-border); padding: 4px 6px; text-align: left; vertical-align: top; }
    .cfg-explain-table tr.cfg-explain-win td { background: rgba(0, 120, 200, 0.12); }
    .cfg-explain-panel p { margin: 0 0 6px; }
`;
