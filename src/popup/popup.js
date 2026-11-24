/**
 * @file Extension Popup Script (Workspace) for AEM Orbit.
 * @module popup/popup
 *
 * Provides page information, multi-environment content comparison (hash fingerprints),
 * version creation & history, quick console navigation links, bulk replication,
 * recent & favourite page management, and device-local action logs.
 */

import { createMessenger, failToast, escHtml, confirmDestructive as confirmShared, runReplication, runDelete, ui } from '../ui/page-actions.js';
import { syncTheme } from '../shared/theme-dom.js';
import { logoSpiralPaths } from '../shared/spiral.js';
import { firstConfiguredEnv, getEdsVariants, getUniversalEditorUrl } from '../shared/url-utils.js';
import { isControlAllowed } from '../shared/control-policy.js';
import { loginTarget } from '../shared/auth-error.js';

const BUILTIN_ENVS = ['local', 'dev', 'stage', 'prod'];

let currentJcrPath = null;
let tabJcrPath     = null;  // JCR path of the active tab (search results can temporarily override currentJcrPath)
let currentTab     = null;
let currentConfig  = null;  // credential-free config cached after loadPageInfo
let currentEnv     = null;  // env of the current tab (or default if tab matches none)
let currentStatus  = null;  // last GET_PAGE_STATUS result (rich status)
let loginPrompted  = false; // the "log in" toast was already shown for this popup

// Follows the browser theme until the saved choice (Settings theme button) arrives with the config.
const popupTheme = syncTheme(null);
document.getElementById('logoSpiral').innerHTML = logoSpiralPaths();

// ─── Messaging ────────────────────────────────────────────────────────────────

/** Every request carries the popup's resolved env so it targets the right author. */
const msg = createMessenger(() => currentEnv);

// ─── Toast ────────────────────────────────────────────────────────────────────

let _toastTimer = null;
/** `actions` (optional): [{label, onClick}] shown as buttons inside the toast. */
function toast(message, type = 'info', duration = 2500, actions = null) {
  const el = document.getElementById('toast');
  el.textContent = message;
  (actions || []).forEach((a) => {
    const b = document.createElement('button');
    b.className   = 'toast-btn';
    b.textContent = a.label;
    b.addEventListener('click', () => { el.className = 'toast'; a.onClick(); });
    el.appendChild(b);
  });
  el.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, duration);
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function setStatus(status, lastReplicated, lastModified) {
  const pill   = document.getElementById('statusPill');
  const lastEl = document.getElementById('lastMod');

  const labels = {
    published: 'Published', draft: 'Draft', modified: 'Modified', unknown: 'Unknown',
  };
  pill.textContent = labels[status] || labels.unknown;
  pill.className   = `status-pill ${status || 'unknown'}`;

  if (lastModified) {
    const d = new Date(lastModified);
    lastEl.textContent = `Modified ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else if (lastReplicated) {
    const d = new Date(lastReplicated);
    lastEl.textContent = `Published ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } else {
    lastEl.textContent = '';
  }
}

/** Preview-tier status pill; hidden when the env has no preview host. */
function setPreviewStatus(previewStatus) {
  const pill = document.getElementById('previewPill');
  const hasPreview = !!currentConfig?.environments?.[currentEnv]?.previewHost;
  if (!hasPreview) { pill.style.display = 'none'; return; }
  const labels = { published: 'Preview: live', draft: 'Preview: none', modified: 'Preview: stale' };
  const s = labels[previewStatus] ? previewStatus : 'unknown';
  pill.textContent   = labels[s] || 'Preview: ?';
  pill.className     = `status-pill ${s}`;
  pill.style.display = '';
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Second line under the status: who changed it, lock, scheduled on/off, live copy. */
function setDetails(s) {
  const el = document.getElementById('pageDetails');
  if (!s) { el.textContent = ''; return; }
  const parts = [];
  if (s.lastModifiedBy) parts.push(`Modified by ${escHtml(s.lastModifiedBy)}`);
  if (s.lastReplicatedBy && s.status !== 'draft') parts.push(`published by ${escHtml(s.lastReplicatedBy)}`);
  if (s.lockOwner) parts.push(`<span class="pd-warn">🔒 Locked by ${escHtml(s.lockOwner)}</span>`);
  if (s.onTime)  parts.push(`<span class="pd-warn">On time ${escHtml(fmtDate(s.onTime))}</span>`);
  if (s.offTime) parts.push(`<span class="pd-warn">Off time ${escHtml(fmtDate(s.offTime))}</span>`);
  if (s.isLiveCopy) parts.push('Live copy');
  el.innerHTML = parts.join(' · ');
  document.getElementById('lockBtnLabel').textContent = s.lockOwner ? 'Unlock Page' : 'Lock Page';
}

async function refreshFavourite() {
  const btn = document.getElementById('favBtn');
  if (!currentJcrPath) { btn.style.display = 'none'; return; }
  const { favourites = [] } = await msg('GET_PAGE_LISTS');
  const on = favourites.some((f) => f.env === currentEnv && f.path === currentJcrPath);
  btn.style.display = '';
  btn.textContent   = on ? '★' : '☆';
  btn.title         = on ? 'Remove from favourites' : 'Add to favourites';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(on));
  btn.classList.toggle('on', on);
}

async function refreshStatus() {
  currentStatus = null;
  if (!currentJcrPath) { setStatus('unknown'); setPreviewStatus(null); setDetails(null); refreshFavourite(); return; }
  const [r, q] = await Promise.all([
    msg('GET_PAGE_STATUS', { jcrPath: currentJcrPath }),
    msg('GET_REPLICATION_QUEUE'),
  ]);
  if (r.ok) {
    currentStatus = r;
    setStatus(r.status, r.lastReplicated, r.lastModified);
    setPreviewStatus(r.previewStatus);
    setDetails(r);
    msg('RECORD_RECENT', { jcrPath: currentJcrPath, title: r.title });
  } else {
    setStatus('unknown'); setPreviewStatus(null); setDetails(null);
    // Signed out of this environment: say so once, with a shortcut to the login page.
    if (r.login && !loginPrompted) { loginPrompted = true; failToast({ msg, toast }, `Not signed in to ${r.login.label}`, r, 8000); }
  }
  const queuePill = document.getElementById('queuePill');
  if (queuePill) {
    if (q?.ok && q.queueCount > 0) {
      queuePill.style.display = '';
      queuePill.textContent = `${q.queueCount} queue (${q.queueStatus})`;
      queuePill.className = `status-pill ${q.queueStatus === 'blocked' ? 'bad' : 'warn'}`;
    } else {
      queuePill.style.display = 'none';
    }
  }
  refreshFavourite();
}

// ─── Env badge ────────────────────────────────────────────────────────────────

function setEnvBadge(envKey, envsCfg) {
  const badge = document.getElementById('envBadge');
  if (!badge) return;
  const isBuiltin = BUILTIN_ENVS.includes(envKey);
  const label     = (!isBuiltin && envsCfg?.[envKey]?.label) ? envsCfg[envKey].label : envKey;
  const cls       = isBuiltin ? `env-badge-${envKey}` : 'env-badge-custom';
  const isProtected = !!envsCfg?.[envKey]?.protected;
  document.getElementById('envBadgeLabel').textContent = label;
  document.getElementById('envLock').style.display = isProtected ? '' : 'none';
  badge.title     = isProtected ? 'Protected environment: destructive actions need typed confirmation' : '';
  badge.className = `env-badge ${cls}`;
}

// ─── Panel helper ─────────────────────────────────────────────────────────────

function setActiveActionBtn(btnId) {
  document.querySelectorAll('.action-btn.active, .big-btn.active').forEach((b) => b.classList.remove('active'));
  if (btnId) {
    document.getElementById(btnId)?.classList.add('active');
  }
}

function openPanel(title, contentHtml, { normalWhitespace = false, sourceBtnId = null } = {}) {
  document.getElementById('panelTitle').textContent = title;
  document.getElementById('panelContent').innerHTML  = contentHtml;
  document.getElementById('panelContent').classList.toggle('ws-normal', normalWhitespace);
  const panel = document.getElementById('mainPanel');
  panel.classList.add('open');
  setActiveActionBtn(sourceBtnId);
  requestAnimationFrame(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function closePanel() {
  document.getElementById('mainPanel').classList.remove('open');
  setActiveActionBtn(null);
}

// ─── Load page info ────────────────────────────────────────────────────────────

async function loadPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const config = await msg('GET_CONFIG');
  currentConfig  = config;
  popupTheme.set(config.optionsTheme); // the Settings theme button's choice (light / dark / auto)
  const envs     = config.environments || {};

  // Check if anything is configured at all
  const anyConfigured = Object.values(envs).some(
    (e) => e?.authorHost || e?.publishHost || e?.previewHost || e?.dispatcherHost
  );
  if (!anyConfigured) {
    document.getElementById('notConfigured').style.display = 'block';
    document.getElementById('mainContent').style.display   = 'none';
    return;
  }

  document.getElementById('notConfigured').style.display = 'none';
  document.getElementById('mainContent').style.display   = 'block';
  applyDevMode(config);

  const url = tab.url || '';
  const shortUrl = url.replace(/^https?:\/\//, '');
  document.getElementById('pageUrl').textContent = shortUrl.length > 65 ? `${shortUrl.substring(0, 65)}…` : shortUrl;
  document.getElementById('pageUrl').title = url;
  setViewingNote(false);

  const info = await msg('GET_PAGE_INFO', { url });
  currentEnv = info.matchedEnv || firstConfiguredEnv(envs, config.envOrder);
  setEnvBadge(currentEnv, envs);
  const hasPreview = !!envs[currentEnv]?.previewHost;
  document.getElementById('publishPreviewBtn').style.display = hasPreview ? '' : 'none';
  document.getElementById('replRow').classList.toggle('no-preview', !hasPreview);
  applyControlPolicy(config);

  if (info.ok && info.jcrPath) {
    currentJcrPath = info.jcrPath;
    tabJcrPath     = info.jcrPath;
    document.getElementById('jcrPath').textContent = info.jcrPath;
  } else {
    currentJcrPath = null;
    tabJcrPath     = null;
    document.getElementById('jcrPath').textContent = 'JCR path unavailable';
  }
  await refreshStatus();
}

/**
 * Administrator policy: hide the controls this environment's policy switches off. Runs after the
 * environment is known, because a policy can differ per environment. The service worker enforces
 * the same rules; this only keeps blocked controls from being offered.
 */
function applyControlPolicy(config) {
  const off = {
    publishBtn: 'publish', unpublishBtn: 'unpublish', treeActivateBtn: 'treePublish', treeDeactivateBtn: 'treePublish',
    bulkBtn: 'bulkPublish', lockBtn: 'lock', findReplaceBtn: 'findReplace', createVersionBtn: 'saveVersion',
    dispatcherFlushBtn: 'flushDispatcher', deleteBtn: 'delete',
  };
  const allowed = (c) => isControlAllowed(config.controlPolicy, c, currentEnv);
  Object.entries(off).forEach(([id, control]) => {
    const el = document.getElementById(id);
    if (el && !allowed(control)) el.style.display = 'none';
  });
  // Preview shows only with a Preview tier AND when the policy allows it.
  if (!allowed('publishPreview')) {
    document.getElementById('publishPreviewBtn').style.display = 'none';
    document.getElementById('replRow').classList.add('no-preview');
  }
  // The "Versions" list offers Restore; it stays, and the worker refuses Restore when it is off.
}

/**
 * Developer Mode (Settings): show the Developer Tools group only when it is on, and only
 * the buttons that are enabled there. Same keys as the toolbar (jcr, tools, overlays, delete).
 * Versions, Save Version and Copy URLs live in Workspace, but move into Developer Tools while it
 * is shown, so that group's heading stays visible without scrolling.
 */
function applyDevMode(config) {
  const on = config.enableDevMode === true;
  const allowed = config.devToolsButtons || {};
  const buttons = { jcrBtn: 'jcr', crxdeBtn: 'tools', overlayBtn: 'overlays', deleteBtn: 'delete' };
  let visible = 0;
  Object.entries(buttons).forEach(([id, key]) => {
    const show = on && allowed[key] !== false;
    document.getElementById(id).style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.getElementById('groupDeveloper').style.display = visible ? '' : 'none';

  const el = (id) => document.getElementById(id);
  if (visible) {
    const dev = el('groupDeveloper').querySelector('.action-grid');
    dev.insertBefore(el('versionsBtn'),      el('overlayBtn'));
    dev.insertBefore(el('createVersionBtn'), el('overlayBtn'));
    dev.insertBefore(el('urlVariantsBtn'),   el('deleteBtn'));
  } else {
    const workspace = el('groupWorkspace').querySelector('.action-grid');
    ['versionsBtn', 'createVersionBtn', 'urlVariantsBtn'].forEach((id) => workspace.appendChild(el(id)));
  }
}

/** Show/hide the note that tells the user the popup is showing a searched page, not the tab. */
function setViewingNote(on) {
  document.getElementById('viewingNote').style.display = on ? '' : 'none';
}

document.getElementById('viewingBack').addEventListener('click', () => {
  currentJcrPath = tabJcrPath;
  document.getElementById('jcrPath').textContent = tabJcrPath || 'JCR path unavailable';
  setViewingNote(false);
  refreshStatus();
});

// ─── Search ───────────────────────────────────────────────────────────────────

let searchSeq = 0; // ignore replies that arrive after a newer search started

async function runSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;
  const resultsEl = document.getElementById('searchResults');
  resultsEl.innerHTML = '<div class="search-empty">Searching…</div>';
  resultsEl.classList.add('open');

  const seq      = ++searchSeq;
  const rootPath = currentConfig?.contentRoot || '/content';
  const result   = await msg('SEARCH_PAGES', { rootPath, query, limit: 15 });
  if (seq !== searchSeq) return;

  if (!result.ok) {
    resultsEl.innerHTML = `<div class="search-empty">Error: ${escHtml(result.error)}</div>`;
    return;
  }
  if (!result.results || result.results.length === 0) {
    resultsEl.innerHTML = '<div class="search-empty">No pages found.</div>';
    return;
  }

  resultsEl.innerHTML = result.results.map((r) => `
    <div class="search-result-item" data-path="${escAttr(r.path)}">
      <span class="sr-title">${escHtml(r.title)}</span>
      <span class="sr-path">${escHtml(r.path)}</span>
    </div>
  `).join('');

  resultsEl.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      currentJcrPath = item.dataset.path;
      document.getElementById('jcrPath').textContent  = currentJcrPath;
      document.getElementById('searchInput').value    = '';
      setViewingNote(currentJcrPath !== tabJcrPath);
      resultsEl.classList.remove('open');
      resultsEl.innerHTML = '';
      // Reload status for the selected page
      refreshStatus();
    });
  });
}

document.getElementById('searchBtn').addEventListener('click', runSearch);

// Search as you type: wait for a pause and at least 3 characters, so we don't send a request per keystroke.
let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 3) {
    searchSeq++;
    document.getElementById('searchResults').classList.remove('open');
    document.getElementById('searchResults').innerHTML = '';
    return;
  }
  searchTimer = setTimeout(runSearch, 350);
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); }
  if (e.key === 'Escape') {
    clearTimeout(searchTimer);
    searchSeq++;
    document.getElementById('searchResults').classList.remove('open');
    document.getElementById('searchResults').innerHTML = '';
  }
});

// ─── Author / Publish actions ─────────────────────────────────────────────────

document.getElementById('editBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const { authorEditUrl } = await msg('GET_URL_VARIANTS', { jcrPath: currentJcrPath });
  await msg('OPEN_TAB', { url: authorEditUrl });
  window.close();
});

document.getElementById('viewBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const { authorDisabledUrl } = await msg('GET_URL_VARIANTS', { jcrPath: currentJcrPath });
  if (!authorDisabledUrl) return toast('Author host is not configured for this environment', 'error');
  await msg('OPEN_TAB', { url: authorDisabledUrl });
  window.close();
});

document.getElementById('previewBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const { liveUrl } = await msg('GET_URL_VARIANTS', { jcrPath: currentJcrPath });
  if (!liveUrl) return toast('Live is not configured for this environment', 'error');
  await msg('OPEN_TAB', { url: liveUrl });
  window.close();
});

// Publish / Publish to Preview / Unpublish (shared with the toolbar)
async function withBusy(id, fn) {
  const b = document.getElementById(id);
  if (b.classList.contains('busy')) return;
  b.classList.add('busy');
  b.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { b.classList.remove('busy'); b.removeAttribute('aria-busy'); }
}
const replicate = (kind) => () => withBusy(`${kind}Btn`.replace('previewBtn', 'publishPreviewBtn'),
  () => runReplication(kind, { msg, jcrPath: currentJcrPath, toast, onDone: refreshStatus, previousStatus: currentStatus?.status, guard: destructiveGuard() }));
document.getElementById('publishBtn').addEventListener('click', replicate('publish'));
document.getElementById('publishPreviewBtn').addEventListener('click', replicate('preview'));
document.getElementById('unpublishBtn').addEventListener('click', replicate('unpublish'));

/** Inputs for the shared confirmDestructive (protected envs require typing the page name). */
function destructiveGuard() {
  return {
    env:           currentEnv,
    isProtected:   !!currentConfig?.environments?.[currentEnv]?.protected,
    confirmDelete: currentConfig?.confirmDelete,
    confirmPublish: currentConfig?.confirmPublish,
  };
}

function confirmDestructive(actionLabel, path, { always = false } = {}) {
  return confirmShared(actionLabel, path, { ...destructiveGuard(), always, tone: 'warn' });
}

document.getElementById('treeActivateBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  // Dry run first, so the confirmation says how many pages are about to go live.
  toast('Counting pages…', 'info', 15000);
  const plan = await msg('PREVIEW_TREE_ACTIVATE', { jcrPath: currentJcrPath });
  if (!plan.ok) return failToast({ msg, toast }, `✗ ${plan.error}`, plan, 5000);
  const skipped = plan.skipped ? `\n${plan.skipped} page(s) that were unpublished on purpose are skipped.` : '';
  const label = `Tree-publish this page and its descendants: ${plan.count} page(s) will be published.${skipped}`
    + `\n\n${plan.sample.join('\n')}${plan.count > plan.sample.length ? `\n…and ${plan.count - plan.sample.length} more` : ''}`;
  const confirmText = await confirmDestructive(label, currentJcrPath, { always: true });
  if (confirmText === null) return;
  toast('Tree publishing…', 'info', 15000);
  const result = await msg('TREE_ACTIVATE', { jcrPath: currentJcrPath, confirmText });
  if (result.ok) toast(`✓ Published ${result.count} page(s)`, 'success', 4000);
  else failToast({ msg, toast }, `✗ Tree publish failed: ${result.error}`, result, 7000);
});

document.getElementById('treeDeactivateBtn')?.addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  toast('Counting pages…', 'info', 15000);
  const plan = await msg('PREVIEW_TREE_DEACTIVATE', { jcrPath: currentJcrPath });
  if (!plan.ok) return failToast({ msg, toast }, `✗ ${plan.error}`, plan, 5000);
  const label = `Tree-unpublish this page and its descendants: ${plan.count} page(s) will be unpublished.`
    + `\n\n${plan.sample.join('\n')}${plan.count > plan.sample.length ? `\n…and ${plan.count - plan.sample.length} more` : ''}`;
  const confirmText = await confirmDestructive(label, currentJcrPath, { always: true });
  if (confirmText === null) return;
  toast('Tree unpublishing…', 'info', 15000);
  const result = await msg('TREE_DEACTIVATE', { jcrPath: currentJcrPath, confirmText });
  if (result.ok) toast(`✓ Unpublished ${result.count} page(s)`, 'success', 4000);
  else failToast({ msg, toast }, `✗ Tree unpublish failed: ${result.error}`, result, 7000);
});

// ─── Developer actions ─────────────────────────────────────────────────────────

document.getElementById('jcrBtn').addEventListener('click', async () => {
  const panel = document.getElementById('mainPanel');
  if (panel.classList.contains('open') && document.getElementById('panelTitle').textContent === 'JCR Properties') {
    closePanel(); return;
  }
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  openPanel('JCR Properties', '<span style="color:var(--faint);">Loading…</span>', { sourceBtnId: 'jcrBtn' });
  const result = await msg('FETCH_JCR_NODE', { jcrPath: `${currentJcrPath}/jcr:content` });
  if (result.ok) {
    // Show ALL properties from jcr:content as a sortable table — no key whitelist
    const rows = Object.entries(result.data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `<div class="jcr-row">
          <span class="jcr-key">${escHtml(k)}</span>
          <span class="jcr-val">${escHtml(val)}</span>
        </div>`;
      }).join('');
    document.getElementById('panelContent').innerHTML = rows ||
      '<span style="color:var(--faint);">No properties found.</span>';
  } else {
    document.getElementById('panelContent').textContent = `Error: ${result.error}`;
  }
});

document.getElementById('propertiesBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const { propertiesUrl } = await msg('GET_URL_VARIANTS', { jcrPath: currentJcrPath });
  if (!propertiesUrl) return toast('Author host not configured', 'error');
  await msg('OPEN_TAB', { url: propertiesUrl });
  window.close();
});

document.getElementById('crxdeBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const { crxdeUrl } = await msg('GET_URL_VARIANTS', { jcrPath: currentJcrPath });
  if (!crxdeUrl) return toast('Author host not configured', 'error');
  await msg('OPEN_TAB', { url: crxdeUrl });
  window.close();
});

document.getElementById('versionsBtn').addEventListener('click', async () => {
  const panel = document.getElementById('mainPanel');
  if (panel.classList.contains('open') && document.getElementById('panelTitle').textContent === 'Page Versions') {
    closePanel(); return;
  }
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  openPanel('Page Versions', '<span style="color:var(--faint);">Loading…</span>', { sourceBtnId: 'versionsBtn' });
  const result = await msg('GET_PAGE_VERSIONS', { jcrPath: currentJcrPath });
  if (!result.ok) { document.getElementById('panelContent').textContent = `Error: ${result.error}`; return; }
  if (!result.versions || result.versions.length === 0) {
    document.getElementById('panelContent').innerHTML = '<span style="color:var(--faint);">No versions found.</span>';
    return;
  }
  const content = document.getElementById('panelContent');
  content.innerHTML = result.versions.map((v) => `
    <div class="version-item" style="display:flex; align-items:center; gap:8px;">
      <span class="version-name" style="flex:1;"><b>${escHtml(v.name)}</b>${v.labels?.length ? ` · ${escHtml(v.labels.join(', '))}` : ''}<br><span class="version-date" style="font-size:11px; opacity:0.7;">${escHtml(new Date(v.created).toLocaleString())}</span></span>
      <button class="url-open" data-diff-ver="${escAttr(v.name)}" style="font-size:11px; padding:2px 6px;">Diff vs current</button>
      <button class="url-open" data-restore-ver="${escAttr(v.name)}" style="font-size:11px; padding:2px 6px;">Restore</button>
    </div>
  `).join('');

  content.querySelectorAll('[data-diff-ver]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const verName = btn.dataset.diffVer;
      toast(`Diffing version ${verName}…`, 'info');
      const d = await msg('DIFF_VERSIONS', { jcrPath: currentJcrPath, versionA: verName, versionB: 'current' });
      if (!d.ok) return toast(`✗ Diff failed: ${d.error}`, 'error');
      content.innerHTML = renderDiff(`Version ${verName}`, d);
    });
  });

  content.querySelectorAll('[data-restore-ver]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const verName = btn.dataset.restoreVer;
      if (!(await ui.confirm({ title: 'Restore version', message: `Restore version "${verName}" to ${currentJcrPath}?`, tone: 'warn', confirmLabel: 'Restore' }))) return;
      toast(`Restoring version ${verName}…`, 'info');
      const r = await msg('RESTORE_VERSION', { jcrPath: currentJcrPath, versionName: verName });
      if (r.ok) {
        toast(`✓ Version "${verName}" restored`, 'success');
        refreshStatus();
      } else {
        failToast({ msg, toast }, `✗ Restore failed: ${r.error}`, r);
      }
    });
  });
});

document.getElementById('createVersionBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const label = await ui.prompt({ title: 'Create version', message: 'Save the current state of this page as a new version.', detail: currentJcrPath, confirmLabel: 'Create', input: { label: 'Version label (optional)', placeholder: 'e.g. before-launch' } });
  if (label === null) return; // cancelled
  toast('Creating version…', 'info');
  const result = await msg('CREATE_VERSION', { jcrPath: currentJcrPath, label });
  if (result.ok) toast('✓ Version created', 'success');
  else failToast({ msg, toast }, `✗ ${result.error}`, result);
});

// Reuses the toolbar's overlay toggle (single implementation in the content script).
document.getElementById('overlayBtn').addEventListener('click', async () => {
  if (!currentTab?.id) return;
  let r;
  try {
    r = await chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_OVERLAYS' });
  } catch {
    return toast('Orbit toolbar not active on this page', 'warn');
  }
  if (!r?.found) toast('No AEM overlays on this page', 'warn');
  else toast(r.hidden ? 'Overlays hidden' : 'Overlays shown', 'info');
});

document.getElementById('urlVariantsBtn').addEventListener('click', async () => {
  const panel = document.getElementById('mainPanel');
  if (panel.classList.contains('open') && document.getElementById('panelTitle').textContent === 'Copy URLs') {
    closePanel(); return;
  }
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  openPanel('Copy URLs', '<span style="color:var(--faint);">Loading…</span>', { sourceBtnId: 'urlVariantsBtn' });
  const variants = await msg('GET_URL_VARIANTS', { jcrPath: currentJcrPath });
  const entries = [
    { label: 'Edit',        url: variants.authorEditUrl },
    { label: 'Author',      url: variants.authorTouchUrl },
    { label: 'View',        url: variants.authorDisabledUrl },
    { label: 'Sites',       url: variants.sitesConsoleUrl },
    { label: 'CRXDE',       url: variants.crxdeUrl },
    { label: 'Universal Editor', url: variants.universalEditorUrl },
    { label: 'Preview',     url: variants.previewUrl },
    { label: 'Published',   url: variants.publishUrl },
    { label: 'Live',        url: variants.dispatcherUrl },
  ];
  // Edge Delivery Services page: its preview / live twins and the Universal Editor link for it.
  const eds = getEdsVariants(currentTab?.url || '');
  if (eds) {
    entries.push(
      { label: 'EDS Preview', url: eds.previewUrl },
      { label: 'EDS Live',    url: eds.liveUrl },
      { label: 'Universal Editor', url: getUniversalEditorUrl(eds.previewUrl, variants.imsOrg) },
    );
  }
  entries.splice(0, entries.length, ...entries.filter((e) => e.url));

  if (entries.length === 0) {
    document.getElementById('panelContent').innerHTML = '<span style="color:var(--faint);">No hosts configured.</span>';
    return;
  }

  document.getElementById('panelContent').innerHTML = entries.map((e, i) => `
    <div class="url-item">
      <span class="url-label">${escHtml(e.label)}</span>
      <span class="url-value" title="${escAttr(e.url)}">${escHtml(e.url)}</span>
      <button class="url-copy" data-idx="${i}" title="Copy">Copy</button>
      <button class="url-open" data-url="${escAttr(e.url)}" title="Open">Open</button>
    </div>
  `).join('');

  const urls = entries.map((e) => e.url);
  document.getElementById('panelContent').querySelectorAll('.url-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(urls[+btn.dataset.idx]);
      toast('✓ URL copied', 'success');
    });
  });
  document.getElementById('panelContent').querySelectorAll('.url-open').forEach((btn) => {
    btn.addEventListener('click', () => { msg('OPEN_TAB', { url: btn.dataset.url }); window.close(); });
  });
});

// Delete (shared with the toolbar)
document.getElementById('deleteBtn').addEventListener('click', () => runDelete({
  msg, jcrPath: currentJcrPath, toast, guard: destructiveGuard(),
  onDone: () => setTimeout(() => window.close(), 1500),
}));

// ─── Workspace: lock, favourites, compare, recent, quick links, bulk ──────────

/** Toggle a panel by title; returns false when it was open (and is now closed). */
function togglePanel(title, sourceBtnId = null) {
  const panel = document.getElementById('mainPanel');
  if (panel.classList.contains('open') && document.getElementById('panelTitle').textContent === title) {
    closePanel(); return false;
  }
  openPanel(title, '<span style="color:var(--faint);">Loading…</span>', { normalWhitespace: true, sourceBtnId });
  return true;
}

const envLabel = (key) => {
  const e = currentConfig?.environments?.[key];
  return (!BUILTIN_ENVS.includes(key) && e?.label) ? e.label : key;
};

document.getElementById('lockBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const unlock = !!currentStatus?.lockOwner;
  const result = await msg(unlock ? 'UNLOCK_PAGE' : 'LOCK_PAGE', { jcrPath: currentJcrPath });
  if (result.ok) { toast(unlock ? '✓ Page unlocked' : '✓ Page locked', 'success'); refreshStatus(); }
  else failToast({ msg, toast }, `✗ ${result.error}`, result);
});

document.getElementById('favBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return;
  const r = await msg('TOGGLE_FAVOURITE', { jcrPath: currentJcrPath, title: currentStatus?.title });
  if (r.ok) toast(r.favourite ? '★ Added to favourites' : 'Removed from favourites', 'info');
  refreshFavourite();
});

/** Panel body for a property-level diff: "other env" → "this env". */
function renderDiff(otherEnv, d) {
  const head = `<div class="list-head">${escHtml(envLabel(otherEnv).toUpperCase())} → ${escHtml(envLabel(currentEnv).toUpperCase())}</div>`;
  if (!d.ok) return `${head}<span class="list-sub">Error: ${escHtml(d.error)}</span>`;
  if (!d.baseExists || !d.otherExists) {
    return `${head}<span class="list-sub">The page does not exist on ${escHtml(envLabel(d.baseExists ? otherEnv : currentEnv))}.</span>`;
  }
  if (!d.total) return `${head}<span class="list-sub">No differences in content.</span>`;
  const sign = { added: '+', removed: '−', changed: '~' };
  const rows = d.changes.map((c) => {
    const what = c.node ? `<span class="list-sub">${escHtml(c.kind)} node (${escHtml(c.size)} item(s))</span>`
      : c.kind === 'changed' ? `<span class="list-sub">${escHtml(c.from)} → ${escHtml(c.to)}</span>`
        : `<span class="list-sub">${escHtml(c.kind === 'added' ? c.to : c.from)}</span>`;
    return `<div class="list-row"><span class="list-tag ${c.kind === 'added' ? 'ok' : c.kind === 'removed' ? 'bad' : 'warn'}">${sign[c.kind]}</span>`
      + `<span class="list-main" title="${escAttr(c.path)}"><b>${escHtml(c.path)}</b> ${what}</span></div>`;
  }).join('');
  const more = d.truncated ? `<div class="list-sub">Showing ${d.changes.length} of ${d.total} differences.</div>` : '';
  return `${head}${rows}${more}`;
}

document.getElementById('compareBtn').addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  if (!togglePanel('Compare Environments', 'compareBtn')) return;
  const r = await msg('COMPARE_ENVS', { jcrPath: currentJcrPath });
  const content = document.getElementById('panelContent');
  if (!r.ok) { content.textContent = `Error: ${r.error}`; return; }
  const base = r.results.find((x) => x.env === currentEnv && x.hash)?.hash;
  content.innerHTML = r.results.map((x) => {
    let tag;
    let diffBtn = '';
    if (!x.ok) {
      tag = `<span class="list-tag bad" title="${escAttr(x.error)}">${loginTarget(x.error, currentConfig?.environments) ? 'signed out' : 'error'}</span>`;
      if (loginTarget(x.error, currentConfig?.environments)) diffBtn = `<button class="url-open" data-login="${escAttr(x.env)}">Log in</button>`;
    }
    else if (!x.exists)   tag = '<span class="list-tag bad">missing</span>';
    else if (x.env === currentEnv) tag = '<span class="list-tag">this env</span>';
    else if (!base)       tag = '<span class="list-tag">—</span>';
    else if (x.hash === base) tag = '<span class="list-tag ok">in sync</span>';
    else {
      tag = '<span class="list-tag warn">differs</span>';
      diffBtn = `<button class="url-open" data-diff="${escAttr(x.env)}">Show diff</button>`;
    }
    const sub = x.exists
      ? `${escHtml(x.status || '')}${x.lastModified ? ` · ${escHtml(fmtDate(x.lastModified))}` : ''}${x.lastModifiedBy ? ` · ${escHtml(x.lastModifiedBy)}` : ''}`
      : '';
    return `<div class="list-row"><span class="list-main"><b>${escHtml(envLabel(x.env).toUpperCase())}</b> <span class="list-sub">${sub}</span></span>${tag}${diffBtn}</div>`;
  }).join('') || '<span style="color:var(--faint);">No environments with an author host.</span>';

  content.querySelectorAll('[data-login]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const x = r.results.find((y) => y.env === btn.dataset.login);
      const t = x && loginTarget(x.error, currentConfig?.environments);
      if (t) { msg('OPEN_TAB', { url: t.url }); window.close(); }
    });
  });

  content.querySelectorAll('[data-diff]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const other = btn.dataset.diff;
      openPanel(`Diff: ${envLabel(other)} → ${envLabel(currentEnv)}`, '<span style="color:var(--faint);">Comparing…</span>', { normalWhitespace: true, sourceBtnId: 'compareBtn' });
      const d = await msg('DIFF_ENVS', { jcrPath: currentJcrPath, otherEnv: other });
      document.getElementById('panelContent').innerHTML = renderDiff(other, d);
    });
  });
});

document.getElementById('listsBtn').addEventListener('click', async () => {
  if (!togglePanel('Recent & Favourites', 'listsBtn')) return;
  const { favourites = [], recent = [] } = await msg('GET_PAGE_LISTS');
  const rows = (items) => items.map((e, i) => `
    <div class="list-row">
      <span class="list-main" title="${escAttr(e.path)}">${escHtml(e.title || e.path)} <span class="list-sub">${escHtml(e.path)}</span></span>
      <span class="list-tag">${escHtml(envLabel(e.env))}</span>
      <button class="url-open" data-i="${i}">Open</button>
    </div>`).join('');
  const content = document.getElementById('panelContent');
  content.innerHTML =
    `<div class="list-head">Favourites</div><div data-list="fav">${rows(favourites) || '<span class="list-sub">None yet — click ☆ next to the status.</span>'}</div>` +
    `<div class="list-head">Recent</div><div data-list="recent">${rows(recent) || '<span class="list-sub">No recent pages.</span>'}</div>`;
  content.querySelectorAll('[data-list] .url-open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const list  = btn.closest('[data-list]').dataset.list === 'fav' ? favourites : recent;
      const entry = list[+btn.dataset.i];
      const v = await msg('GET_URL_VARIANTS', { env: entry.env, jcrPath: entry.path });
      const url = v.authorEditUrl || v.publishUrl || v.dispatcherUrl;
      if (!url) return toast('No host configured for that environment', 'warn');
      await msg('OPEN_TAB', { url });
      window.close();
    });
  });
});

document.getElementById('quickLinksBtn').addEventListener('click', async () => {
  if (!togglePanel('Quick Links', 'quickLinksBtn')) return;
  const { links = [] } = await msg('GET_QUICK_LINKS');
  const content = document.getElementById('panelContent');
  if (!links.length) { content.innerHTML = '<span style="color:var(--faint);">No author host configured for this environment.</span>'; return; }
  let group = '';
  content.innerHTML = links.map((l, i) => {
    const head = l.group !== group ? `<div class="list-head">${escHtml((group = l.group))}</div>` : '';
    return `${head}<div class="list-row"><span class="list-main">${escHtml(l.label)}</span><button class="url-open" data-i="${i}">Open</button></div>`;
  }).join('');
  content.querySelectorAll('.url-open').forEach((btn) => {
    btn.addEventListener('click', () => { msg('OPEN_TAB', { url: links[+btn.dataset.i].url }); window.close(); });
  });
});

document.getElementById('bulkBtn').addEventListener('click', () => {
  if (!togglePanel('Bulk Publish', 'bulkBtn')) return;
  const content = document.getElementById('panelContent');
  content.innerHTML = `
    <textarea class="bulk-input" id="bulkInput" spellcheck="false"
      placeholder="One /content path or page URL per line (max 200)"></textarea>
    <div class="bulk-actions">
      <span class="list-sub" id="bulkCount">0 pages</span>
      <button class="url-copy" id="bulkDryRun" style="margin-left:auto;">Dry Run</button>
      <button class="url-copy" id="bulkUnpublish">Unpublish</button>
      <button class="url-open" id="bulkPublish">Publish</button>
    </div>
    <div id="bulkDryRunResults" style="margin-top:8px; max-height:160px; overflow-y:auto;"></div>`;
  const input = document.getElementById('bulkInput');
  let paths = [];
  input.addEventListener('input', async () => {
    const r = await msg('PARSE_PATH_LIST', { text: input.value });
    paths = r.paths || [];
    document.getElementById('bulkCount').textContent = `${paths.length} page(s)`;
  });

  document.getElementById('bulkDryRun').addEventListener('click', async () => {
    if (!paths.length) return toast('No valid /content paths', 'warn');
    toast('Checking page statuses…', 'info');
    const r = await msg('PREVIEW_BULK_REPLICATE', { text: input.value, cmd: 'Activate' });
    if (!r.ok) return toast(`✗ ${r.error}`, 'error');
    const resBox = document.getElementById('bulkDryRunResults');
    resBox.innerHTML = `<div class="list-head">Dry run preview (${r.count} pages)</div>` +
      r.pages.map((p) => `
        <div class="list-row" style="font-size:11px;">
          <span class="list-main"><b>${escHtml(p.path)}</b></span>
          <span class="list-tag ${p.status === 'published' ? 'ok' : p.status === 'modified' ? 'warn' : 'bad'}">${escHtml(p.status)}</span>
        </div>
      `).join('');
    resBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const run = async (cmd) => {
    if (!paths.length) return toast('No valid /content paths', 'warn');
    const verb = cmd === 'Activate' ? 'Publish' : 'Unpublish';
    let confirmText = '';
    if (currentConfig?.environments?.[currentEnv]?.protected) {
      const typed = await ui.prompt({
        title: 'Confirm on protected environment', message: `${verb} ${paths.length} page(s).`, env: currentEnv, isProtected: true, tone: 'danger',
        input: { label: `Type the number of pages (${paths.length}) to confirm`, placeholder: String(paths.length), expect: String(paths.length) },
      });
      if (typed === null) return;
      confirmText = typed;
    } else if (!(await ui.confirm({ title: `${verb} pages`, message: `${verb} ${paths.length} page(s) on ${String(currentEnv).toUpperCase()}?`, env: currentEnv, tone: 'warn', confirmLabel: verb }))) return;
    toast(`${verb}ing ${paths.length} page(s)…`, 'info', 15000);
    const r = await msg('BULK_REPLICATE', { text: input.value, cmd, confirmText });
    if (r.ok) toast(`✓ ${verb}ed ${r.count} page(s)`, 'success', 4000);
    else {
      failToast({ msg, toast }, `✗ ${r.error}`, r, 8000);
      if (r.failed?.length) {
        // Keep only the pages that did not go through, so a retry does not repeat the others.
        input.value = r.failed.join('\n');
        input.dispatchEvent(new Event('input'));
      }
    }
  };
  document.getElementById('bulkPublish').addEventListener('click', () => run('Activate'));
  document.getElementById('bulkUnpublish').addEventListener('click', () => run('Deactivate'));
  input.focus();
});


document.getElementById('actionLogBtn').addEventListener('click', async () => {
  if (!togglePanel('Action Log', 'actionLogBtn')) return;
  const { entries = [] } = await msg('GET_ACTION_LOG');
  const content = document.getElementById('panelContent');
  if (!entries.length) {
    content.innerHTML = '<span class="list-sub">No publish / unpublish / delete actions recorded yet.</span>';
    return;
  }
  content.innerHTML = entries.map((e) => {
    const isSync = e.ok && /^Sync from /.test(e.action || '');
    const undoBtn = isSync && e.path ? `<button class="url-open" data-restore-sync="${escAttr(e.path)}" data-sync-env="${escAttr(e.env)}" style="font-size:11px; padding:2px 6px;">Undo</button>` : '';
    return `
    <div class="list-row" title="${escAttr(e.error || e.path)}">
      <span class="list-tag ${e.ok ? 'ok' : 'bad'}">${e.ok ? 'OK' : 'FAIL'}</span>
      <span class="list-main"><b>${escHtml(e.action)}</b>${e.count ? ` (${escHtml(e.count)})` : ''} <span class="list-sub">${escHtml(e.path)}</span></span>
      <span class="list-tag">${escHtml(envLabel(e.env))}</span>
      <span class="list-sub">${escHtml(fmtDate(e.ts))}</span>
      ${undoBtn}
    </div>`;
  }).join('') +
    `<div class="bulk-actions">
      <button class="url-copy" id="logExport">Copy as CSV</button>
      <button class="url-copy" id="logClear" style="margin-left:auto;">Clear log</button>
    </div>`;

  content.querySelectorAll('[data-restore-sync]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const path = btn.dataset.restoreSync;
      const env = btn.dataset.syncEnv;
      // Protected environments need the page name typed; the worker checks it again.
      const confirmText = await confirmShared(`Undo sync: restore the previous content of this page on ${env.toUpperCase()}`, path, {
        env,
        isProtected: !!currentConfig?.environments?.[env]?.protected,
        always: true,
        tone: 'warn',
      });
      if (confirmText === null) return;
      toast(`Undoing sync on ${env}…`, 'info');
      const r = await msg('UNDO_SYNC', { env, jcrPath: path, confirmText });
      if (r.ok) toast('✓ Sync undone / previous version restored', 'success');
      else failToast({ msg, toast }, `✗ ${r.error}`, r);
    });
  });
  document.getElementById('logExport').addEventListener('click', async () => {
    // Quote, and neutralise spreadsheet formula injection (=, +, -, @, tab, CR).
    const q = (v) => {
      const s = String(v ?? '');
      return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const csv = ['time,env,action,path,count,result,error',
      ...entries.map((e) => [new Date(e.ts).toISOString(), e.env, e.action, e.path, e.count ?? '', e.ok ? 'ok' : 'fail', e.error ?? ''].map(q).join(','))]
      .join('\n');
    await navigator.clipboard.writeText(csv);
    toast('✓ Log copied as CSV', 'success');
  });
  document.getElementById('logClear').addEventListener('click', async () => {
    if (!(await ui.confirm({ title: 'Clear action log', message: 'Clear the local action log?', tone: 'danger', confirmLabel: 'Clear' }))) return;
    await msg('CLEAR_ACTION_LOG');
    closePanel();
    toast('Action log cleared', 'info');
  });
});

document.getElementById('dispatcherFlushBtn')?.addEventListener('click', async () => {
  if (!currentJcrPath) return toast('No JCR path available', 'error');
  const path = currentJcrPath;
  const label = `Invalidate Dispatcher cache for ${path} on ${currentEnv.toUpperCase()}?`;
  const confirmText = await confirmDestructive(label, path, { always: true });
  if (confirmText === null) return;
  toast('Flushing Dispatcher cache…', 'info');
  const result = await msg('FLUSH_DISPATCHER', { path, invalidate: true, confirmText });
  if (result.ok) toast('✓ Dispatcher cache invalidated', 'success');
  else failToast({ msg, toast }, `✗ Dispatcher flush failed: ${result.error}`, result);
});

document.getElementById('findReplaceBtn')?.addEventListener('click', () => {
  if (!togglePanel('Find & Replace', 'findReplaceBtn')) return;
  const content = document.getElementById('panelContent');
  const defaultPath = currentJcrPath || '/content';
  content.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <input type="text" id="frRootPath" class="search-input" value="${escAttr(defaultPath)}" placeholder="Scope root path (e.g. /content/site)" />
      <input type="text" id="frSearchTerm" class="search-input" placeholder="Search text..." />
      <input type="text" id="frReplaceTerm" class="search-input" placeholder="Replace with..." />
      <input type="text" id="frPropName" class="search-input" placeholder="Property name filter (optional, e.g. jcr:title)" />
      <div class="bulk-actions">
        <button class="url-open" id="frFindBtn">Find Matches</button>
        <button class="url-copy" id="frApplyBtn" style="display:none; margin-left:auto;">Apply Replacements</button>
      </div>
      <div id="frResults" style="margin-top:8px; max-height:180px; overflow-y:auto;"></div>
    </div>`;

  let currentMatches = [];

  document.getElementById('frFindBtn').addEventListener('click', async () => {
    const rootPath = document.getElementById('frRootPath').value.trim() || '/content';
    const searchTerm = document.getElementById('frSearchTerm').value;
    const propertyName = document.getElementById('frPropName').value.trim();
    if (!searchTerm) return toast('Enter search text', 'warn');

    toast('Searching pages…', 'info');
    const r = await msg('FIND_ACROSS_PAGES', { rootPath, searchTerm, options: { propertyName } });
    if (!r.ok) return toast(`✗ ${r.error}`, 'error');
    currentMatches = r.matches || [];
    const resultsBox = document.getElementById('frResults');
    const applyBtn = document.getElementById('frApplyBtn');

    if (!currentMatches.length) {
      resultsBox.innerHTML = '<span class="list-sub">No matches found.</span>';
      applyBtn.style.display = 'none';
      return;
    }

    applyBtn.style.display = '';
    applyBtn.textContent = `Apply to ${currentMatches.length} match(es)`;

    resultsBox.innerHTML = `<div class="list-head">Found ${currentMatches.length} match(es)</div>` +
      currentMatches.map((m) => {
        const preview = m.oldValue.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (x) => `<mark style="background:var(--warn-bg); color:inherit;">${escHtml(x)}</mark>`);
        return `
          <div class="list-row" style="flex-direction:column; align-items:flex-start; gap:2px; font-size:11px;">
            <span class="list-main"><b>${escHtml(m.propPath)}</b></span>
            <span class="list-sub">${preview}</span>
          </div>
        `;
      }).join('');
  });

  document.getElementById('frApplyBtn').addEventListener('click', async () => {
    const searchTerm = document.getElementById('frSearchTerm').value;
    const replaceTerm = document.getElementById('frReplaceTerm').value;
    if (!currentMatches.length) return;
    if (!(await ui.confirm({ title: 'Apply Find & Replace', message: `Replace "${searchTerm}" with "${replaceTerm}" across ${currentMatches.length} property match(es)?`, tone: 'warn', confirmLabel: 'Replace All' }))) return;

    const replacements = currentMatches.map((m) => ({
      propPath: m.propPath,
      newValue: m.oldValue.replaceAll(searchTerm, replaceTerm),
    }));

    toast('Applying replacements…', 'info');
    const r = await msg('REPLACE_ACROSS_PAGES', { replacements });
    if (r.ok) {
      toast(`✓ Updated ${r.updatedCount || currentMatches.length} properties`, 'success');
      document.getElementById('frResults').innerHTML = '<span class="list-sub">Replacements applied successfully.</span>';
      document.getElementById('frApplyBtn').style.display = 'none';
    } else {
      failToast({ msg, toast }, `✗ Replace failed: ${r.error}`, r);
    }
  });
});


// Copy JCR path by clicking the path display
const copyJcrPath = async () => {
  if (!currentJcrPath) return;
  await navigator.clipboard.writeText(currentJcrPath);
  toast('✓ JCR path copied', 'success');
};
document.getElementById('jcrPath').addEventListener('click', copyJcrPath);
document.getElementById('jcrPath').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyJcrPath(); }
});

// ─── Panel close ──────────────────────────────────────────────────────────────
document.getElementById('closePanelBtn').addEventListener('click', closePanel);

// ─── Header buttons ───────────────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', loadPageInfo);
document.getElementById('optionsBtn').addEventListener('click', () => msg('OPEN_OPTIONS'));
document.getElementById('openOptionsBtn')?.addEventListener('click', () => msg('OPEN_OPTIONS'));

// escHtml (shared) escapes all five HTML-significant characters, so it is safe
// for both text content and quoted attribute values.
const escAttr = escHtml;

// ─── Init ─────────────────────────────────────────────────────────────────────
loadPageInfo();
