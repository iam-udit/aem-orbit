/**
 * @file Extension Options Page Script for AEM Orbit.
 * @module options/options
 *
 * Configures built-in (local, dev, stage, prod) and custom environments, authentication
 * credentials (Basic / Bearer / Session), host permissions, URL mappings, feature toggles,
 * and developer toolbar button customizations.
 */

import { escHtml, ui } from '../ui/page-actions.js';
import { CONTROLS, isControlAllowed } from '../shared/control-policy.js';
import { nextTheme } from '../shared/theme.js';
import { syncTheme } from '../shared/theme-dom.js';
import { logoSpiralPaths } from '../shared/spiral.js';
import { ITEM_BY_ID, TOOLBAR_ITEMS, MAX_ITEMS, defaultLayout, normalizeLayout, isDefaultLayout } from '../shared/toolbar-layout.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const BUILTIN_ENVS   = ['local', 'dev', 'stage', 'prod'];
const HOST_FIELDS    = ['authorHost', 'publishHost', 'previewHost', 'dispatcherHost'];
const MAPPING_FIELD  = 'publishUsesMappings'; // per-env checkbox: apply URL mappings to Publish / Preview URLs
const HTML_FIELD     = 'dispatcherOmitHtml';  // per-env checkbox: Dispatcher / CDN URLs without ".html"
const SECRET_FIELDS  = ['username', 'password', 'bearerToken']; // stored in chrome.storage.local only
const ENV_FIELDS     = [...HOST_FIELDS, ...SECRET_FIELDS];
const SHARED_FIELDS  = ['contentRoot', 'appName', 'imsOrg', 'urlMappings', 'requestTimeoutSec'];
const TOGGLES        = ['showOnAuthor', 'showOnPublish', 'showOnDispatcher', 'confirmDelete', 'enableKeyboardShortcut', 'showLastModified', 'enableDevMode', 'classicBar', 'summonOnLongPress', 'customizeToolbar', 'allowUpwardSync', 'confirmPublish', 'notifyOnActions', 'sessionOnlyCredentials'];
const OFF_BY_DEFAULT = ['enableDevMode', 'classicBar', 'summonOnLongPress', 'customizeToolbar', 'allowUpwardSync', 'confirmPublish', 'sessionOnlyCredentials'];
const DEV_BTN_KEYS   = ['jcr', 'overlays', 'highlight', 'inspect', 'tools', 'reload', 'delete', 'sync'];

const BUILTIN_LABELS = { local: 'Local', dev: 'Dev', stage: 'Stage', prod: 'Prod' };

// In-memory state
let customEnvIds = [];  // e.g. ['custom_1', 'custom_2']
let envOrder     = [...BUILTIN_ENVS]; // ordered list of all env keys
let dirty        = false; // true when the form has edits that are not saved yet
let tbLayout     = defaultLayout(); // toolbar layout being edited: {mini: [ids], expanded: [ids]}

function setDirty(value) {
  dirty = value;
  const note = document.getElementById('dirtyNote');
  if (note) note.hidden = !value;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function msg(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, payload }, (r) => resolve(r || { ok: false, error: 'No response' }));
  });
}

/** "https://a.com:4502/x" → "https://a.com/*" (Chrome match patterns have no port). */
function originPattern(hostStr) {
  try {
    const u = new URL(hostStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch { return null; }
}

/** All host patterns currently entered in the form (all envs). */
function formOriginPatterns() {
  const set = new Set();
  [...BUILTIN_ENVS, ...customEnvIds].forEach((env) => {
    HOST_FIELDS.forEach((f) => {
      const v = document.getElementById(`${env}-${f}`)?.value.trim();
      const p = v ? originPattern(v) : null;
      if (p) set.add(p);
    });
  });
  return [...set];
}

// ─── Extra per-env controls (session auth + protected toggle) ───────────────

/** Add the "Browser Session" auth option and the "Protected" toggle to an env panel. */
function enhanceEnvPanel(env) {
  // Preview Host field (AEMaaCS Preview tier), inserted after Publish Host.
  const publishInput = document.getElementById(`${env}-publishHost`);
  if (publishInput && !document.getElementById(`${env}-previewHost`)) {
    const group = document.createElement('div');
    group.className = 'form-group';
    const label = document.createElement('label');
    label.htmlFor     = `${env}-previewHost`;
    label.textContent = 'Preview Host';
    const input = document.createElement('input');
    input.type        = 'url';
    input.id          = `${env}-previewHost`;
    input.placeholder = 'https://preview-pXXXX-eXXXX.adobeaemcloud.com';
    const hint = document.createElement('div');
    hint.className   = 'field-hint';
    hint.textContent = 'AEM as a Cloud Service Preview tier (optional). Enables "Publish to Preview".';
    group.append(label, input, hint);
    publishInput.closest('.form-group')?.after(group);
  }

  // Publish / Preview URLs use the URL mappings only when a dispatcher/CDN sits in front of them.
  const dispatcherInput = document.getElementById(`${env}-dispatcherHost`);
  if (dispatcherInput && !document.getElementById(`${env}-${MAPPING_FIELD}`)) {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `
      <div>
        <div class="toggle-label">Apply URL mapping to Publish / Preview</div>
        <div class="toggle-desc">Turn on when the Publish / Preview host is behind a dispatcher or CDN that rewrites paths. Leave off for a publisher without a dispatcher, which only serves full /content paths. The Dispatcher / CDN Host always uses the URL mappings.</div>
      </div>
      <label class="toggle"><input type="checkbox" id="${env}-${MAPPING_FIELD}" /><span class="toggle-slider"></span></label>`;
    dispatcherInput.closest('.form-group')?.after(row);
  }

  // Dispatcher / CDN URLs: drop ".html" when the site serves extension-less URLs.
  if (dispatcherInput && !document.getElementById(`${env}-${HTML_FIELD}`)) {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `
      <div>
        <div class="toggle-label">Omit .html on Dispatcher / CDN URLs</div>
        <div class="toggle-desc">Turn on when the live site uses URLs like /path/page instead of /path/page.html. Also applies to Publish / Preview URLs when URL mapping is applied to them; otherwise they keep .html.</div>
      </div>
      <label class="toggle"><input type="checkbox" id="${env}-${HTML_FIELD}" /><span class="toggle-slider"></span></label>`;
    dispatcherInput.closest('.form-group')?.after(row);
  }

  const selector = document.querySelector(`.auth-selector[data-env="${env}"]`);
  if (selector && !selector.querySelector('[data-type="session"]')) {
    const btn = document.createElement('button');
    btn.className    = 'auth-option';
    btn.dataset.type = 'session';
    btn.textContent  = 'Browser Session';
    selector.insertBefore(btn, selector.querySelector('[data-type="none"]'));

    const fields = document.createElement('div');
    fields.className = 'auth-fields';
    fields.id        = `${env}-session-fields`;
    fields.innerHTML = '<div class="field-hint" style="padding-top:4px;">Recommended. Uses your existing AEM login in this browser — no credentials are stored. Log in to the Author host once, then the extension reuses that session.</div>';
    document.getElementById(`${env}-none-fields`)?.before(fields);
  }

  const firstSection = document.querySelector(`#panel-${env} .section`);
  if (firstSection && !document.getElementById(`${env}-protected`)) {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `
      <div>
        <div class="toggle-label">Protected environment</div>
        <div class="toggle-desc">Delete and Tree Publish require typing the page name, and the toolbar shows a warning stripe.</div>
      </div>
      <label class="toggle"><input type="checkbox" id="${env}-protected" /><span class="toggle-slider"></span></label>`;
    firstSection.appendChild(row);
  }

  // Health diagnostics: one click checks every configured tier and shows its latency.
  const testRow = document.querySelector(`[data-test="${env}"]`)?.closest('.form-group');
  if (testRow && !document.getElementById(`${env}-diagBtn`)) {
    const btn = document.createElement('button');
    btn.className   = 'btn btn-secondary btn-sm diag-btn';
    btn.id          = `${env}-diagBtn`;
    btn.textContent = 'Run diagnostics';
    btn.addEventListener('click', () => runDiagnostics(env));
    const list = document.createElement('div');
    list.className = 'diag-list';
    list.id        = `${env}-diagList`;
    list.setAttribute('aria-live', 'polite');
    testRow.querySelector(`[data-test="${env}"]`).after(btn);
    testRow.appendChild(list);
  }
}

BUILTIN_ENVS.forEach(enhanceEnvPanel);

// ─── Tab switching ────────────────────────────────────────────────────────────

function activateTab(envKey) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.env-panel').forEach((p) => p.classList.remove('visible'));
  const tab   = document.querySelector(`.tab[data-tab="${envKey}"]`);
  const panel = document.getElementById(`panel-${envKey}`);
  if (tab)   tab.classList.add('active');
  if (panel) panel.classList.add('visible');
}

document.getElementById('env-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) activateTab(tab.dataset.tab);
});

// ─── Auth type switcher ───────────────────────────────────────────────────────

function bindAuthSelector(env) {
  const selector = document.querySelector(`.auth-selector[data-env="${env}"]`);
  if (!selector) return;
  selector.querySelectorAll('.auth-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selector.querySelectorAll('.auth-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      showAuthFields(env, btn.dataset.type);
      refreshOrderItem(env); // configured status may have changed
    });
  });
}

function showAuthFields(env, type) {
  ['basic', 'bearer', 'session', 'none'].forEach((t) => {
    const el = document.getElementById(`${env}-${t}-fields`);
    if (el) el.classList.toggle('visible', t === type);
  });
}

function getSelectedAuthType(env) {
  const btn = document.querySelector(`.auth-selector[data-env="${env}"] .auth-option.selected`);
  return btn?.dataset.type || 'basic';
}

function setSelectedAuthType(env, type) {
  const selector = document.querySelector(`.auth-selector[data-env="${env}"]`);
  if (!selector) return;
  selector.querySelectorAll('.auth-option').forEach((b) => {
    b.classList.toggle('selected', b.dataset.type === type);
  });
  showAuthFields(env, type);
}

BUILTIN_ENVS.forEach(bindAuthSelector);

// Refresh order-list status badge whenever a host field changes
document.addEventListener('input', (e) => {
  const id = e.target?.id || '';
  const match = id.match(/^(.+)-(authorHost|publishHost|previewHost|dispatcherHost)$/);
  if (match) refreshOrderItem(match[1]);
});

// ─── Configured check ────────────────────────────────────────────────────────

/** Returns true if the env has at least one host filled in. */
function isConfigured(envId) {
  return HOST_FIELDS.some((f) => {
    const el = document.getElementById(`${envId}-${f}`);
    return el && el.value.trim() !== '';
  });
}

// ─── Environment Order list ───────────────────────────────────────────────────

let dragSrcKey = null;

/** Rebuild the entire order list from the current envOrder array. */
function rebuildOrderList() {
  const list = document.getElementById('env-order-list');
  list.innerHTML = '';
  envOrder.forEach((envKey) => {
    const item = buildOrderItem(envKey);
    list.appendChild(item);
  });
}

/** Create a single order-list row for envKey. */
function buildOrderItem(envKey) {
  const isBuiltin    = BUILTIN_ENVS.includes(envKey);
  const dotCls       = isBuiltin ? `order-dot-${envKey}` : 'order-dot-custom';
  const rawLabel     = isBuiltin
    ? BUILTIN_LABELS[envKey]
    : (document.getElementById(`${envKey}-label`)?.value.trim() || envKey);
  const configured   = isConfigured(envKey);

  const item = document.createElement('div');
  item.className = `order-item${configured ? '' : ' unconfigured'}`;
  item.dataset.env = envKey;
  item.draggable   = true;
  item.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6-16a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
      </svg>
    </span>
    <span class="order-dot ${dotCls}"></span>
    <span class="order-label">${escHtml(rawLabel)}</span>
    <span class="order-status${configured ? ' configured' : ''}">${configured ? '✓ Configured' : 'Not configured — hidden from toolbar'}</span>
  `;

  // Drag events
  item.addEventListener('dragstart', (e) => {
    dragSrcKey = envKey;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => item.classList.add('dragging'), 0);
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    document.querySelectorAll('.order-item').forEach((i) => i.classList.remove('drag-over'));
  });
  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.order-item').forEach((i) => i.classList.remove('drag-over'));
    item.classList.add('drag-over');
  });
  item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drag-over');
    if (!dragSrcKey || dragSrcKey === envKey) return;
    // Reorder in-memory array
    const from = envOrder.indexOf(dragSrcKey);
    const to   = envOrder.indexOf(envKey);
    if (from === -1 || to === -1) return;
    envOrder.splice(from, 1);
    envOrder.splice(to, 0, dragSrcKey);
    dragSrcKey = null;
    rebuildOrderList();
    setDirty(true);
  });

  return item;
}

/** Refresh just one item's label + configured status without rebuilding the whole list. */
function refreshOrderItem(envKey) {
  const item = document.querySelector(`#env-order-list .order-item[data-env="${envKey}"]`);
  if (!item) return;

  const configured = isConfigured(envKey);
  item.classList.toggle('unconfigured', !configured);

  const statusEl = item.querySelector('.order-status');
  if (statusEl) {
    statusEl.textContent  = configured ? '✓ Configured' : 'Not configured — hidden from toolbar';
    statusEl.className    = `order-status${configured ? ' configured' : ''}`;
  }

  // Keep label in sync for custom envs (built-ins don't change)
  if (!BUILTIN_ENVS.includes(envKey)) {
    const labelEl = item.querySelector('.order-label');
    const input   = document.getElementById(`${envKey}-label`);
    if (labelEl && input) labelEl.textContent = input.value.trim() || envKey;
  }
}

// ─── Custom env: DOM helpers ──────────────────────────────────────────────────

function buildCustomPanel(envId, label) {
  const panel = document.createElement('div');
  panel.className = 'env-panel';
  panel.id        = `panel-${envId}`;
  panel.innerHTML = `
    <div class="section">
      <div class="section-title">
        <input
          class="custom-env-label-input"
          id="${envId}-label"
          value="${escHtml(label)}"
          placeholder="Environment name"
          title="Click to rename"
          maxlength="32"
        />
        <button class="btn-delete-env" data-delete-env="${envId}" title="Remove this environment">✕ Remove</button>
      </div>
      <div class="form-group">
        <label for="${envId}-authorHost">Author Host</label>
        <input type="url" id="${envId}-authorHost" placeholder="https://author-pXXXX.adobeaemcloud.com" />
      </div>
      <div class="form-group">
        <label for="${envId}-publishHost">Publish Host</label>
        <input type="url" id="${envId}-publishHost" placeholder="https://publish-pXXXX.adobeaemcloud.com" />
      </div>
      <div class="form-group">
        <label for="${envId}-dispatcherHost">Dispatcher Host</label>
        <input type="url" id="${envId}-dispatcherHost" placeholder="https://custom.yoursite.com" />
      </div>
    </div>
    <div class="section">
      <div class="section-title">Authentication</div>
      <div class="form-group">
        <div class="auth-selector" data-env="${envId}">
          <button class="auth-option selected" data-type="basic">Basic Auth</button>
          <button class="auth-option" data-type="bearer">Bearer Token</button>
          <button class="auth-option" data-type="none">No Auth</button>
        </div>
        <div class="auth-fields visible" id="${envId}-basic-fields">
          <label for="${envId}-username">Username</label>
          <input type="text" id="${envId}-username" placeholder="admin" autocomplete="username" style="margin-bottom:8px;" />
          <label for="${envId}-password">Password</label>
          <input type="password" id="${envId}-password" autocomplete="current-password" />
        </div>
        <div class="auth-fields" id="${envId}-bearer-fields">
          <label for="${envId}-bearerToken">Bearer Token</label>
          <input type="password" id="${envId}-bearerToken" placeholder="eyJhbGci..." />
        </div>
        <div class="auth-fields" id="${envId}-none-fields">
          <div class="field-hint" style="padding-top:4px;">No authentication header will be sent.</div>
        </div>
        <div class="form-group" style="padding:10px 0 0 0;border:none;">
          <button class="btn btn-secondary btn-sm" data-test="${envId}">Test Connection</button>
          <div class="test-row">
            <div class="dot unknown" id="${envId}-connDot"></div>
            <span class="conn-status-text" id="${envId}-connStatus">Not tested</span>
          </div>
        </div>
      </div>
    </div>
  `;

  return panel;
}

/** Wire up a custom panel once it is in the DOM. */
function bindCustomPanel(envId, panel) {
  enhanceEnvPanel(envId);
  bindAuthSelector(envId);

  panel.querySelector(`[data-delete-env="${envId}"]`).addEventListener('click', () => {
    deleteCustomEnv(envId);
  });

  panel.querySelector(`[data-test="${envId}"]`).addEventListener('click', () => {
    testConnection(envId);
  });
}

function buildCustomTab(envId, label) {
  const tab = document.createElement('button');
  tab.className    = 'tab tab-custom';
  tab.dataset.tab  = envId;
  tab.textContent  = `✦ ${label}`;
  return tab;
}

// ─── Custom env: add / delete ─────────────────────────────────────────────────

document.getElementById('btn-add-env').addEventListener('click', () => {
  const id    = `custom_${Date.now()}`;
  const label = `Custom ${customEnvIds.length + 1}`;
  addCustomEnvToDOM(id, label);
  activateTab(id);
  setDirty(true);
});

function addCustomEnvToDOM(envId, label) {
  customEnvIds.push(envId);
  if (!envOrder.includes(envId)) envOrder.push(envId);

  // Tab
  const tab = buildCustomTab(envId, label);
  document.getElementById('env-tabs').appendChild(tab);

  // Panel
  const panel = buildCustomPanel(envId, label);
  document.getElementById('custom-panels').appendChild(panel);
  bindCustomPanel(envId, panel);

  // Add to order list
  const orderList = document.getElementById('env-order-list');
  if (orderList) orderList.appendChild(buildOrderItem(envId));

  // Keep tab + pill + order item label in sync with the name input
  const labelInput = document.getElementById(`${envId}-label`);
  labelInput.addEventListener('input', () => {
    const newLabel   = labelInput.value.trim() || envId;
    tab.textContent  = `✦ ${newLabel}`;
    refreshOrderItem(envId);
  });
}

async function deleteCustomEnv(envId) {
  if (!(await ui.confirm({ title: 'Remove environment', message: 'Remove this custom environment? Its settings will be lost.', tone: 'danger', confirmLabel: 'Remove' }))) return;

  document.querySelector(`.tab[data-tab="${envId}"]`)?.remove();
  document.getElementById(`panel-${envId}`)?.remove();
  document.querySelector(`#env-order-list .order-item[data-env="${envId}"]`)?.remove();

  customEnvIds = customEnvIds.filter((id) => id !== envId);
  envOrder     = envOrder.filter((id) => id !== envId);
  setDirty(true);

  activateTab('local');
}

// ─── Load settings ────────────────────────────────────────────────────────────

function loadSettings() {
  Promise.all([
    new Promise((r) => chrome.storage.sync.get(null, r)),
    new Promise((r) => chrome.storage.local.get({ secrets: {} }, r)),
    new Promise((r) => chrome.storage.session.get({ secrets: {} }, r)),
  ]).then(([data, local, session]) => {
    const secrets = { ...(local.secrets || {}), ...(session.secrets || {}) };
    // Shared fields
    SHARED_FIELDS.forEach((key) => {
      const el = document.getElementById(key);
      if (el) el.value = data[key] || '';
    });
    TOGGLES.forEach((key) => {
      const el = document.getElementById(key);
      if (el) {
        // Opt-in flags default to false (not true like the others)
        el.checked = OFF_BY_DEFAULT.includes(key) ? (data[key] === true) : (data[key] !== false);
      }
    });
    // Developer mode button visibility
    const devBtns = data.devToolsButtons || {};
    DEV_BTN_KEYS.forEach((k) => {
      const el = document.getElementById(`devBtn-${k}`);
      if (el) el.checked = devBtns[k] !== false;
    });
    // Show/hide the dev-buttons section based on current toggle state
    toggleDevBtnSection();
    tbLayout = normalizeLayout(data.toolbarLayout);
    toggleToolbarSection();
    renderToolbarEditor();
    updateOrbSummonSetting();

    const envData   = data.environments || {};

    const fillEnv = (env, envCfg, defaultAuth, defaultProtected) => {
      const merged = { ...envCfg, ...(secrets[env] || {}) };
      ENV_FIELDS.forEach((field) => {
        const el = document.getElementById(`${env}-${field}`);
        if (el) el.value = merged[field] || '';
      });
      const mapChk = document.getElementById(`${env}-${MAPPING_FIELD}`);
      if (mapChk) mapChk.checked = envCfg[MAPPING_FIELD] === true;
      const htmlChk = document.getElementById(`${env}-${HTML_FIELD}`);
      if (htmlChk) htmlChk.checked = envCfg[HTML_FIELD] === true;
      setSelectedAuthType(env, envCfg.authType || defaultAuth);
      const prot = document.getElementById(`${env}-protected`);
      if (prot) prot.checked = envCfg.protected ?? defaultProtected;
    };

    // Built-in envs
    BUILTIN_ENVS.forEach((env) => {
      fillEnv(env, envData[env] || {}, env === 'local' || env === 'dev' ? 'basic' : 'session', env === 'prod');
    });

    // Custom envs (keys not in BUILTIN_ENVS)
    // Keys end up in element ids and attributes, so only the shape this page generates is accepted
    // (chrome.storage.sync can be changed from another signed-in device).
    const storedCustomIds = Object.keys(envData).filter((k) => !BUILTIN_ENVS.includes(k) && /^custom_[A-Za-z0-9_]{1,40}$/.test(k));
    storedCustomIds.forEach((envId) => {
      const envCfg = envData[envId] || {};
      addCustomEnvToDOM(envId, envCfg.label || envId);
      fillEnv(envId, envCfg, 'basic', false);
    });

    // Restore saved order — start with stored order, append any missing keys
    const savedOrder = data.envOrder || [];
    const allKeys    = [...BUILTIN_ENVS, ...storedCustomIds];
    envOrder = [
      ...savedOrder.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !savedOrder.includes(k)),
    ];

    rebuildOrderList();
    updateQuickSetup(Object.values(envData).some((e) => e?.authorHost || e?.publishHost || e?.previewHost || e?.dispatcherHost));
    setDirty(false);
    showPolicyNotice();
  });
}

/**
 * Tell the user which controls their administrator switched off. The policy is read-only
 * (managed storage), so Developer Mode is locked here instead of silently turning itself off.
 */
async function showPolicyNotice() {
  const note = document.getElementById('policyNote');
  const config = await msg('GET_CONFIG');
  if (!config) return;

  if (config.lockConfiguration) {
    let banner = document.getElementById('lockBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'lockBanner';
      banner.className = 'asp-alert asp-alert-info';
      banner.style.cssText = 'background: rgba(69, 137, 255, 0.15); border: 1px solid #4589ff; padding: 12px 16px; border-radius: 8px; margin: 16px 0 20px; font-size: 13px; font-weight: 500; color: var(--text); display: flex; align-items: center; gap: 8px; box-sizing: border-box;';
      banner.textContent = '🔒 Configuration is managed by your administrator policy. Settings are read-only.';
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        topbar.after(banner);
      } else {
        document.querySelector('.page')?.prepend(banner);
      }
    }
    document.querySelectorAll('input:not([type="button"]), select, textarea').forEach((el) => {
      el.disabled = true;
    });
    const saveBtn = document.getElementById('save');
    if (saveBtn) saveBtn.disabled = true;
  }

  if (config.enforceSessionAuthOnly) {
    document.querySelectorAll('.auth-option[data-type="session"]').forEach((b) => b.click());
    document.querySelectorAll('.auth-option:not([data-type="session"])').forEach((b) => {
      b.disabled = true;
      b.style.opacity = '0.5';
      b.title = 'Enforced by enterprise policy';
    });
  }

  const controlPolicy = config.controlPolicy;
  if (!note || !controlPolicy) return;
  const everywhere = controlPolicy.disabledControls || [];
  const perEnv = Object.entries(controlPolicy.byEnvironment || {});
  if (!everywhere.length && !perEnv.length) return;

  const names = (ids) => ids.map((id) => CONTROLS[id]?.label || id).join(', ');
  const parts = [];
  if (everywhere.length) parts.push(`Turned off for your team: ${names(everywhere)}.`);
  perEnv.forEach(([env, rule]) => parts.push(`Turned off on ${env}: ${names(rule.disabledControls)}.`));
  note.textContent = `Set by your administrator and not changeable here. ${parts.join(' ')}`;
  note.style.display = '';

  if (!isControlAllowed(controlPolicy, 'developerMode')) {
    const toggle = document.getElementById('enableDevMode');
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = true;
      toggle.closest('.toggle-row')?.classList.add('is-disabled');
      toggleDevBtnSection();
    }
  }
}

// ─── Save settings ────────────────────────────────────────────────────────────

function saveSettings() {
  // Host access must be requested synchronously inside the click (user gesture).
  const origins = formOriginPatterns();
  const permPromise = origins.length
    ? chrome.permissions.request({ origins }).catch(() => false)
    : Promise.resolve(true);

  const data = {};
  const secrets = {};

  SHARED_FIELDS.forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    if (key === 'requestTimeoutSec') {
      // Stored as a number clamped to 5–120; empty means the default (15).
      const n = Math.round(Number(el.value));
      data[key] = el.value.trim() && Number.isFinite(n) ? Math.min(120, Math.max(5, n)) : 15;
      el.value = String(data[key]);
      return;
    }
    data[key] = key === 'urlMappings' ? el.value.trim() : el.value.trim().replace(/\/$/, '');
  });
  TOGGLES.forEach((key) => {
    const el = document.getElementById(key);
    if (el) data[key] = el.checked;
  });
  // Developer mode per-button config
  data.devToolsButtons = {};
  DEV_BTN_KEYS.forEach((k) => {
    const el = document.getElementById(`devBtn-${k}`);
    data.devToolsButtons[k] = el ? el.checked : true;
  });
  // null = the built-in layout, so buttons added in a later version still appear for people who never customised
  data.toolbarLayout = isDefaultLayout(tbLayout) ? null : normalizeLayout(tbLayout);

  // Persist the current visual order from the DOM (drag may have changed it)
  data.envOrder = [...document.querySelectorAll('#env-order-list .order-item')]
    .map((item) => item.dataset.env);

  const collectEnv = (env, extra = {}) => {
    const authType = getSelectedAuthType(env);
    const envObj   = { authType, protected: !!document.getElementById(`${env}-protected`)?.checked, ...extra };
    envObj[MAPPING_FIELD] = !!document.getElementById(`${env}-${MAPPING_FIELD}`)?.checked;
    envObj[HTML_FIELD]    = !!document.getElementById(`${env}-${HTML_FIELD}`)?.checked;
    HOST_FIELDS.forEach((field) => {
      const el = document.getElementById(`${env}-${field}`);
      envObj[field] = el ? el.value.trim().replace(/\/$/, '') : '';
    });
    // Only keep the secrets the selected auth type actually uses.
    const s = {};
    if (authType === 'basic') {
      s.username = document.getElementById(`${env}-username`)?.value.trim() || '';
      s.password = document.getElementById(`${env}-password`)?.value || '';
    } else if (authType === 'bearer') {
      s.bearerToken = document.getElementById(`${env}-bearerToken`)?.value.trim() || '';
    }
    if (Object.values(s).some(Boolean)) secrets[env] = s;
    return envObj;
  };

  const invalid = [...BUILTIN_ENVS, ...customEnvIds].flatMap((env) => HOST_FIELDS
    .map((f) => document.getElementById(`${env}-${f}`)?.value.trim())
    .filter((v) => v && !originPattern(v)));
  if (invalid.length) {
    showBanner('error', `⚠ Invalid host URL: ${invalid[0]} (must start with http:// or https://)`);
    return;
  }

  (async () => {
    data.environments = {};

    BUILTIN_ENVS.forEach((env) => { data.environments[env] = collectEnv(env); });
    customEnvIds.forEach((envId) => {
      const labelEl = document.getElementById(`${envId}-label`);
      data.environments[envId] = collectEnv(envId, { label: labelEl ? labelEl.value.trim() || envId : envId });
    });

    const granted = await permPromise;
    // "Keep credentials for this browser session only": memory-only storage, cleared when the browser closes.
    // The secrets go to one area only, so turning the option on or off moves them (never copies).
    const sessionOnly = data.sessionOnlyCredentials === true;
    await new Promise((r) => chrome.storage[sessionOnly ? 'session' : 'local'].set({ secrets }, r));
    await new Promise((r) => chrome.storage[sessionOnly ? 'local' : 'session'].remove('secrets', r));
    await new Promise((r) => chrome.storage.sync.set(data, r));
    await msg('SYNC_CONTENT_SCRIPTS');

    setDirty(false);
    updateQuickSetup(true);
    if (granted) showBanner('success', '✓ Settings saved. Reload open AEM tabs to show the toolbar.');
    else showBanner('error', '⚠ Saved, but host access was not granted — the toolbar and API calls will not work for those hosts.');
  })();
}

// ─── Reset / Clear ────────────────────────────────────────────────────────────

function destroyAllCustomEnvDOM() {
  customEnvIds.slice().forEach((id) => {
    document.querySelector(`.tab[data-tab="${id}"]`)?.remove();
    document.getElementById(`panel-${id}`)?.remove();
    document.querySelector(`#env-order-list .order-item[data-env="${id}"]`)?.remove();
  });
  customEnvIds = [];
  envOrder     = [...BUILTIN_ENVS];
}

async function resetSettings() {
  if (!(await ui.confirm({ title: 'Reset settings', message: 'Reset all settings to defaults?', tone: 'warn', confirmLabel: 'Reset' }))) return;
  chrome.storage.local.remove('secrets');
  chrome.storage.session.remove('secrets');
  chrome.storage.sync.clear(() => {
    destroyAllCustomEnvDOM();
    activateTab('local');
    loadSettings();
    showBanner('success', '✓ Reset to defaults.');
  });
}

async function clearAll() {
  if (!(await ui.confirm({ title: 'Clear all data', message: 'Clear ALL AEM Orbit data? This cannot be undone.', tone: 'danger', confirmLabel: 'Clear all' }))) return;
  chrome.storage.local.clear();
  chrome.storage.session.clear();
  chrome.storage.sync.clear(() => {
    destroyAllCustomEnvDOM();
    activateTab('local');
    loadSettings();
    showBanner('success', '✓ All data cleared.');
  });
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection(env) {
  const dot         = document.getElementById(`${env}-connDot`);
  const statusEl    = document.getElementById(`${env}-connStatus`);
  const authorHost  = document.getElementById(`${env}-authorHost`)?.value.trim().replace(/\/$/, '');
  const pattern     = authorHost ? originPattern(authorHost) : null;

  if (!pattern) {
    dot.className    = 'dot fail';
    statusEl.textContent = 'Set a valid Author Host first.';
    return;
  }

  // Request host access inside the click gesture before doing anything async.
  const granted = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
  if (!granted) {
    dot.className    = 'dot fail';
    statusEl.textContent = 'Host access not granted.';
    return;
  }

  dot.className    = 'dot checking';
  statusEl.textContent = 'Testing…';

  const result = await msg('TEST_CONNECTION', {
    cfg: {
      authorHost,
      authType:    getSelectedAuthType(env),
      username:    document.getElementById(`${env}-username`)?.value.trim() || '',
      password:    document.getElementById(`${env}-password`)?.value || '',
      bearerToken: document.getElementById(`${env}-bearerToken`)?.value.trim() || '',
    },
  });

  if (result.ok) {
    dot.className    = 'dot ok';
    statusEl.textContent = `Connected as ${result.user}`;
  } else {
    dot.className    = 'dot fail';
    statusEl.textContent = result.error || 'Connection failed.';
  }
}

// ─── Health diagnostics ───────────────────────────────────────────────────────

const DIAG_TIERS = [
  ['author', 'Author'],
  ['csrf', 'CSRF token'],
  ['publish', 'Publish'],
  ['preview', 'Preview'],
  ['dispatcher', 'Dispatcher / CDN'],
];

function diagRow(label, state, detail) {
  const row = document.createElement('div');
  row.className = 'diag-row';
  const dot = document.createElement('span');
  dot.className = `dot ${state}`;
  const name = document.createElement('span');
  name.className = 'diag-name';
  name.textContent = label;
  const text = document.createElement('span');
  text.className = 'conn-status-text';
  text.textContent = detail;
  row.append(dot, name, text);
  return row;
}

async function runDiagnostics(env) {
  const list = document.getElementById(`${env}-diagList`);
  const btn  = document.getElementById(`${env}-diagBtn`);
  if (!list) return;
  const val = (f) => document.getElementById(`${env}-${f}`)?.value.trim().replace(/\/$/, '') || '';
  const cfg = {
    authorHost: val('authorHost'), publishHost: val('publishHost'), previewHost: val('previewHost'), dispatcherHost: val('dispatcherHost'),
    authType:    getSelectedAuthType(env),
    username:    document.getElementById(`${env}-username`)?.value.trim() || '',
    password:    document.getElementById(`${env}-password`)?.value || '',
    bearerToken: document.getElementById(`${env}-bearerToken`)?.value.trim() || '',
  };
  list.replaceChildren();
  const patterns = HOST_FIELDS.map((f) => (cfg[f] ? originPattern(cfg[f]) : null)).filter(Boolean);
  if (!patterns.length) {
    list.append(diagRow('Hosts', 'fail', 'Set at least an Author Host first.'));
    return;
  }
  // Host access has to be requested inside the click gesture.
  const granted = await chrome.permissions.request({ origins: [...new Set(patterns)] }).catch(() => false);
  if (!granted) {
    list.append(diagRow('Hosts', 'fail', 'Host access not granted.'));
    return;
  }
  btn.disabled = true;
  list.append(diagRow('Checking', 'checking', 'Running diagnostics…'));
  const res = await msg('RUN_DIAGNOSTICS', { env, cfg });
  btn.disabled = false;
  list.replaceChildren();
  if (!res.ok) {
    list.append(diagRow('Diagnostics', 'fail', res.error || 'Diagnostics failed.'));
    return;
  }
  DIAG_TIERS.forEach(([key, label]) => {
    const r = res[key];
    if (!r?.checked) return;
    const ms = r.latencyMs ? `${r.latencyMs} ms` : '';
    const detail = r.ok
      ? [key === 'csrf' ? 'Token issued' : 'Reachable', r.status ? `HTTP ${r.status}` : '', ms].filter(Boolean).join(' · ')
      : (r.error ? 'Failed' : `Failed${r.status ? ` · HTTP ${r.status}` : ''}`);
    list.append(diagRow(label, r.ok ? 'ok' : 'fail', detail));
  });
  if (!list.children.length) list.append(diagRow('Hosts', 'fail', 'Nothing to check — no hosts set.'));
}


// Bind test buttons for built-in envs (custom envs bind inside buildCustomPanel)
document.querySelectorAll('[data-test]').forEach((btn) => {
  if (BUILTIN_ENVS.includes(btn.dataset.test)) {
    btn.addEventListener('click', () => testConnection(btn.dataset.test));
  }
});

// ─── Banner ───────────────────────────────────────────────────────────────────

function showBanner(type, message) {
  const banner = document.getElementById('statusBanner');
  banner.className = `status-banner ${type}`;
  banner.textContent = message;
  setTimeout(() => { banner.className = 'status-banner'; }, 5000);
}

// ─── Theme ───────────────────────────────────────────────────────────────────

const THEME_LABEL = { auto: 'Auto (follows your browser theme)', light: 'Light', dark: 'Dark' };
let themeChoice = 'auto';        // saved choice: 'auto' | 'light' | 'dark'
let themeSync   = null;

/** `theme` is what is drawn (light or dark); `choice` what the user picked (auto follows the browser theme). */
function applyTheme(theme, choice) {
  themeChoice = choice;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-choice', choice);
  // (data-asp-theme, which themes the shared dialogs in dialog.css and the toolbar, is set by syncTheme)
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const text = `Theme: ${THEME_LABEL[choice]}. Click for ${THEME_LABEL[nextTheme(choice)].replace(/ \(.*/, '')}.`;
    btn.title = text;
    btn.setAttribute('aria-label', text);
  }
}

// ─── Developer mode helpers ───────────────────────────────────────────────────

/** Show/hide the per-button checkboxes depending on the enableDevMode toggle state. */
function toggleDevBtnSection() {
  const on = document.getElementById('enableDevMode')?.checked;
  const section = document.getElementById('devBtnSection');
  if (section) section.style.display = on ? '' : 'none';
  updateSyncSetting();
}

/** "Allow syncing to higher environments" only matters while Sync is available, so grey it out otherwise (its value is kept). */
function updateSyncSetting() {
  const available = !!document.getElementById('enableDevMode')?.checked
    && document.getElementById('devBtn-sync')?.checked !== false;
  const input = document.getElementById('allowUpwardSync');
  if (!input) return;
  input.disabled = !available;
  input.closest('.toggle-row')?.classList.toggle('is-disabled', !available);
  const note = document.getElementById('allowUpwardSyncNote');
  if (note) note.style.display = available ? 'none' : '';
}

/** "Open the orb at the pointer" only applies when the floating orb is used, so grey it out while classic bar is on (its value is kept). */
function updateOrbSummonSetting() {
  const classicOn = document.getElementById('classicBar')?.checked === true;
  const input = document.getElementById('summonOnLongPress');
  if (!input) return;
  input.disabled = classicOn;
  input.closest('.toggle-row')?.classList.toggle('is-disabled', classicOn);
}

// Wire up the live toggle so the section appears/disappears immediately on click.
document.addEventListener('change', (e) => {
  if (e.target?.id === 'enableDevMode') toggleDevBtnSection();
  if (e.target?.id === 'devBtn-sync') updateSyncSetting();
  if (e.target?.id === 'customizeToolbar') toggleToolbarSection();
  if (e.target?.id === 'classicBar') {
    renderToolbarEditor();
    updateOrbSummonSetting();
  }
  // The toolbar editor greys out developer buttons while their toggle is off.
  if (e.target?.id === 'enableDevMode' || e.target?.id?.startsWith('devBtn-')) renderToolbarEditor();
});

// ─── Toolbar layout editor ────────────────────────────────────────────────────

/** Show the layout editor only while "Customise toolbar buttons" is on. */
function toggleToolbarSection() {
  const section = document.getElementById('tbSection');
  if (section) section.style.display = document.getElementById('customizeToolbar')?.checked ? '' : 'none';
}

const TB_BARS = [
  { key: 'mini',     title: 'Regular bar',  hint: 'Shown when the toolbar is collapsed. One-click actions suit it best.' },
  { key: 'expanded', title: 'Expanded bar', hint: 'Shown when the toolbar is open.' },
];

const tbIcon = (item) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${item.icon}"/></svg>`;

/** Why a developer-only button would not show right now (null when it would). */
function tbDevNote(item) {
  if (!item.dev) return null;
  if (!document.getElementById('enableDevMode')?.checked) return 'Needs Developer Mode';
  if (document.getElementById(`devBtn-${item.dev}`)?.checked === false) return 'Turned off in Developer Mode';
  return null;
}

function tbCtl(label, glyph, act, id, bar, disabled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tb-ctl';
  b.textContent = glyph;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.dataset.act = act;
  b.dataset.id  = id;
  b.dataset.bar = bar;
  if (disabled) b.setAttribute('aria-disabled', 'true');
  return b;
}

function renderToolbarEditor(focus) {
  const host = document.getElementById('tbEditor');
  if (!host) return;
  host.replaceChildren();
  // The floating orb is active unless classicBar is turned on. Its fixed radial leaves replace the regular bar buttons.
  const orbOn = document.getElementById('classicBar')?.checked !== true;
  const note = document.getElementById('tbOrbNote');
  if (note) note.style.display = orbOn ? '' : 'none';
  TB_BARS.filter(({ key }) => !(orbOn && key === 'mini')).forEach(({ key, title, hint }) => {
    const ids = tbLayout[key];
    const max = MAX_ITEMS[key];
    const wrap = document.createElement('div');
    wrap.className = 'tb-bar';

    const head = document.createElement('div');
    head.className = 'tb-head';
    const t = document.createElement('span');
    t.className = 'tb-title';
    t.textContent = title;
    const count = document.createElement('span');
    count.className = `tb-count${ids.length >= max ? ' full' : ''}`;
    count.textContent = `${ids.length} of ${max} buttons`;
    head.append(t, count);
    wrap.appendChild(head);

    const h = document.createElement('div');
    h.className = 'field-hint';
    h.style.marginTop = '0';
    h.textContent = hint;
    wrap.appendChild(h);

    // Preview: what the bar will contain, in order
    const prev = document.createElement('div');
    prev.className = 'tb-preview';
    prev.setAttribute('aria-hidden', 'true');
    const fixed = (text) => { const s = document.createElement('span'); s.className = 'tb-fixed'; s.textContent = text; return s; };
    prev.appendChild(fixed('Logo · Status · Env'));
    ids.forEach((id) => {
      const item = ITEM_BY_ID[id];
      const chip = document.createElement('span');
      chip.className = `tb-chip${tbDevNote(item) ? ' off' : ''}`;
      chip.innerHTML = tbIcon(item);
      chip.appendChild(document.createTextNode(item.label));
      prev.appendChild(chip);
    });
    prev.appendChild(fixed('Close'));
    wrap.appendChild(prev);

    // Ordered list with controls
    const list = document.createElement('ul');
    list.className = 'tb-list';
    list.setAttribute('aria-label', `${title} buttons`);
    ids.forEach((id, i) => {
      const item = ITEM_BY_ID[id];
      const note = tbDevNote(item);
      const li = document.createElement('li');
      li.className = `tb-row${note ? ' off' : ''}`;
      const icon = document.createElement('span');
      icon.innerHTML = tbIcon(item);
      const name = document.createElement('span');
      name.className = 'tb-name';
      name.textContent = item.label;
      if (note) {
        const n = document.createElement('span');
        n.className = 'tb-note';
        n.textContent = note;
        name.appendChild(n);
      }
      li.append(icon, name);
      li.appendChild(tbCtl(`Move ${item.label} earlier`, '↑', 'up',   id, key, i === 0));
      li.appendChild(tbCtl(`Move ${item.label} later`,   '↓', 'down', id, key, i === ids.length - 1));
      if (key === 'expanded' && item.required) {
        const always = document.createElement('span');
        always.className = 'tb-always';
        always.textContent = 'Always shown';
        li.appendChild(always);
      } else {
        li.appendChild(tbCtl(`Remove ${item.label} from the ${title.toLowerCase()}`, '✕', 'remove', id, key, false));
      }
      list.appendChild(li);
    });
    wrap.appendChild(list);

    // Add menu: items not yet on this bar
    const addable = TOOLBAR_ITEMS.filter((it) => !ids.includes(it.id));
    const add = document.createElement('div');
    add.className = 'tb-add';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Add a button to the ${title.toLowerCase()}`);
    sel.dataset.bar = key;
    const first = document.createElement('option');
    first.value = '';
    first.textContent = ids.length >= max ? `Full — remove one to add another` : '+ Add a button…';
    sel.appendChild(first);
    addable.forEach((it) => {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.label + (it.dev ? ' (developer)' : '');
      sel.appendChild(o);
    });
    sel.disabled = ids.length >= max || !addable.length;
    add.appendChild(sel);
    wrap.appendChild(add);

    host.appendChild(wrap);
  });

  if (focus) {
    const target = host.querySelector(`.tb-ctl[data-bar="${focus.bar}"][data-id="${focus.id}"][data-act="${focus.act}"]:not([aria-disabled="true"])`)
      || host.querySelector(`.tb-ctl[data-bar="${focus.bar}"][data-id="${focus.id}"]:not([aria-disabled="true"])`)
      || host.querySelector(`select[data-bar="${focus.bar}"]`);
    target?.focus();
  }
}

function tbChange(mutate, focus) {
  mutate();
  tbLayout = normalizeLayout(tbLayout);
  renderToolbarEditor(focus);
  setDirty(true);
}

document.getElementById('tbEditor')?.addEventListener('click', (e) => {
  const b = e.target.closest?.('.tb-ctl');
  if (!b || b.getAttribute('aria-disabled') === 'true') return;
  const { act, id, bar } = b.dataset;
  const list = tbLayout[bar];
  const i = list.indexOf(id);
  if (i < 0) return;
  if (act === 'remove') {
    const next = list[i + 1] || list[i - 1];
    tbChange(() => list.splice(i, 1), next ? { bar, id: next, act: 'remove' } : { bar });
  } else if (act === 'up' || act === 'down') {
    const j = act === 'up' ? i - 1 : i + 1;
    tbChange(() => { [list[i], list[j]] = [list[j], list[i]]; }, { bar, id, act });
  }
});

document.getElementById('tbEditor')?.addEventListener('change', (e) => {
  const sel = e.target.closest?.('select[data-bar]');
  if (!sel || !sel.value || !ITEM_BY_ID[sel.value]) return;
  const { bar } = sel.dataset;
  const id = sel.value;
  tbChange(() => { if (!tbLayout[bar].includes(id)) tbLayout[bar].push(id); }, { bar, id, act: 'up' });
});

document.getElementById('tbReset')?.addEventListener('click', () => {
  tbLayout = defaultLayout();
  renderToolbarEditor();
  setDirty(true);
});

document.getElementById('logoSpiral').innerHTML = logoSpiralPaths();

function initTheme() {
  // Follows the browser theme until the saved choice arrives; later changes (this page, another tab) and browser theme switches update it live
  themeSync = syncTheme(null, applyTheme);
  chrome.storage.sync.get({ optionsTheme: 'auto' }, (data) => themeSync.set(data.optionsTheme));
}

// Auto (default) → Light → Dark → Auto …
document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = nextTheme(themeChoice);
  themeSync.set(next);
  chrome.storage.sync.set({ optionsTheme: next });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('save').addEventListener('click', saveSettings);
document.getElementById('reset').addEventListener('click', resetSettings);
document.getElementById('clearAll').addEventListener('click', clearAll);

// ─── Unsaved-changes tracking ─────────────────────────────────────────────────

const fromDialog = (e) => !!e.target.closest?.('#asp-dialog');
document.addEventListener('input', (e) => { if (!fromDialog(e)) setDirty(true); });
document.addEventListener('change', (e) => { if (!fromDialog(e)) setDirty(true); });
document.addEventListener('click', (e) => {
  if (e.target.closest?.('.auth-option')) setDirty(true);
});
window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

// ─── Export / import (credentials are never included) ────────────────────────

const AUTH_TYPES = ['basic', 'bearer', 'none'];

function exportSettings() {
  const out = { version: 1, shared: {}, toggles: {}, devToolsButtons: {}, toolbarLayout: normalizeLayout(tbLayout), envOrder: [], environments: {} };
  SHARED_FIELDS.forEach((k) => { out.shared[k] = document.getElementById(k)?.value.trim() || ''; });
  TOGGLES.forEach((k) => { out.toggles[k] = !!document.getElementById(k)?.checked; });
  DEV_BTN_KEYS.forEach((k) => { out.devToolsButtons[k] = !!document.getElementById(`devBtn-${k}`)?.checked; });
  out.envOrder = [...document.querySelectorAll('#env-order-list .order-item')].map((i) => i.dataset.env);
  [...BUILTIN_ENVS, ...customEnvIds].forEach((env) => {
    const cfg = {
      authType:  getSelectedAuthType(env),
      protected: !!document.getElementById(`${env}-protected`)?.checked,
    };
    cfg[MAPPING_FIELD] = !!document.getElementById(`${env}-${MAPPING_FIELD}`)?.checked;
    cfg[HTML_FIELD]    = !!document.getElementById(`${env}-${HTML_FIELD}`)?.checked;
    if (!BUILTIN_ENVS.includes(env)) cfg.label = document.getElementById(`${env}-label`)?.value.trim() || env;
    HOST_FIELDS.forEach((f) => { cfg[f] = document.getElementById(`${env}-${f}`)?.value.trim() || ''; });
    out.environments[env] = cfg;
  });
  return out;
}

/** Fill a form field and fire `input` so dependent badges and labels refresh. */
function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyImportedSettings(cfg) {
  const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  Object.entries(cfg.shared || {}).forEach(([k, v]) => {
    if (SHARED_FIELDS.includes(k)) setField(k, str(typeof v === 'number' ? String(v) : v, 5000));
  });
  Object.entries(cfg.toggles || {}).forEach(([k, v]) => {
    const el = TOGGLES.includes(k) ? document.getElementById(k) : null;
    if (el && typeof v === 'boolean') el.checked = v;
  });
  Object.entries(cfg.devToolsButtons || {}).forEach(([k, v]) => {
    const el = DEV_BTN_KEYS.includes(k) ? document.getElementById(`devBtn-${k}`) : null;
    if (el && typeof v === 'boolean') el.checked = v;
  });
  toggleDevBtnSection();
  if (cfg.toolbarLayout && typeof cfg.toolbarLayout === 'object') tbLayout = normalizeLayout(cfg.toolbarLayout);
  toggleToolbarSection();
  renderToolbarEditor();
  updateOrbSummonSetting();

  Object.entries(cfg.environments || {}).forEach(([env, e]) => {
    if (!e || typeof e !== 'object') return;
    const builtin = BUILTIN_ENVS.includes(env);
    if (!builtin) {
      if (!/^custom_[A-Za-z0-9_]{1,40}$/.test(env)) return;
      if (!customEnvIds.includes(env)) addCustomEnvToDOM(env, str(e.label, 60) || env);
      else if (e.label) setField(`${env}-label`, str(e.label, 60) || env);
    }
    HOST_FIELDS.forEach((f) => {
      const v = str(e[f]).replace(/\/$/, '');
      setField(`${env}-${f}`, v && originPattern(v) ? v : '');
    });
    const mapChk = document.getElementById(`${env}-${MAPPING_FIELD}`);
    if (mapChk) mapChk.checked = e[MAPPING_FIELD] === true;
    const htmlChk = document.getElementById(`${env}-${HTML_FIELD}`);
    if (htmlChk) htmlChk.checked = e[HTML_FIELD] === true;
    if (AUTH_TYPES.includes(e.authType)) setSelectedAuthType(env, e.authType);
    const prot = document.getElementById(`${env}-protected`);
    if (prot && typeof e.protected === 'boolean') prot.checked = e.protected;
  });

  if (Array.isArray(cfg.envOrder)) {
    const all = [...BUILTIN_ENVS, ...customEnvIds];
    envOrder = [
      ...cfg.envOrder.filter((k, i, a) => all.includes(k) && a.indexOf(k) === i),
      ...all.filter((k) => !cfg.envOrder.includes(k)),
    ];
    rebuildOrderList();
  }
  setDirty(true);
}

// Copy / Import live in one dropdown in the header
const backupBtn  = document.getElementById('backupMenuBtn');
const backupMenu = document.getElementById('backupMenu');

function setBackupMenu(open) {
  backupMenu.hidden = !open;
  backupBtn.setAttribute('aria-expanded', String(open));
  if (open) backupMenu.querySelector('.menu-item')?.focus();
}

backupBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setBackupMenu(backupMenu.hidden);
});
document.addEventListener('click', (e) => {
  if (!backupMenu.hidden && !e.target.closest('.menu-wrap')) setBackupMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !backupMenu.hidden) { setBackupMenu(false); backupBtn.focus(); }
});

document.getElementById('exportSettings').addEventListener('click', async () => {
  setBackupMenu(false);
  try {
    await navigator.clipboard.writeText(JSON.stringify(exportSettings()));
    showBanner('success', '✓ Settings copied as JSON. Credentials are not included.');
  } catch {
    showBanner('error', '⚠ Could not copy to the clipboard.');
  }
});

document.getElementById('importSettings').addEventListener('click', async () => {
  setBackupMenu(false);
  const text = await ui.prompt({
    title: 'Import settings',
    message: 'Paste settings JSON. It fills the form only; click Save to apply. Credentials are not part of the export and are ignored.',
    confirmLabel: 'Import',
    input: { label: 'Settings JSON', placeholder: '{"version":1,...}' },
  });
  if (!text) return;
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch {
    showBanner('error', '⚠ That is not valid JSON.');
    return;
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || cfg.version !== 1) {
    showBanner('error', '⚠ Unrecognised settings format.');
    return;
  }
  applyImportedSettings(cfg);
  showBanner('success', '✓ Settings imported into the form. Review them, then click Save.');
});

document.getElementById('shareSettingsUrl')?.addEventListener('click', async () => {
  setBackupMenu(false);
  try {
    const json = JSON.stringify(exportSettings());
    const b64 = btoa(encodeURIComponent(json));
    const url = `${window.location.origin}${window.location.pathname}#setup=${b64}`;
    await navigator.clipboard.writeText(url);
    showBanner('success', '✓ Shareable setup link copied to clipboard.');
  } catch {
    showBanner('error', '⚠ Could not create shareable link.');
  }
});

async function checkShareableImport() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const match = hash.match(/#setup=([^&]+)/) || search.match(/[?&]setup=([^&]+)/);
  if (match) {
    try {
      const json = decodeURIComponent(atob(match[1]));
      const cfg = JSON.parse(json);
      if (cfg && cfg.version === 1) {
        if (await ui.confirm({ title: 'Import team settings', message: 'Import configuration from this setup link?', confirmLabel: 'Import' })) {
          applyImportedSettings(cfg);
          showBanner('success', '✓ Team settings loaded into the form. Review and click Save.');
        }
      }
    } catch {
      // ignore invalid link
    }
  }
}

// ─── Quick setup (first run) ─────────────────────────────────────────────────
// Drives the same fields as the tabs below, so there is one source of truth:
// it fills the chosen environment's real inputs, then reuses testConnection / saveSettings.

function updateQuickSetup(configured) {
  document.getElementById('quickSetup').style.display = configured ? 'none' : '';
}

/** Copy the card's values into the chosen environment's real fields. */
function applyQuickSetup() {
  const env  = document.getElementById('qs-env').value;
  const auth = document.getElementById('qs-auth').value;
  const set  = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); // refreshes the status badges
  };
  set(`${env}-authorHost`, document.getElementById('qs-host').value.trim());
  setSelectedAuthType(env, auth);
  if (auth === 'basic') {
    set(`${env}-username`, document.getElementById('qs-user').value.trim());
    set(`${env}-password`, document.getElementById('qs-pass').value);
  }
  activateTab(env);
  return env;
}

document.getElementById('qs-auth').addEventListener('change', (e) => {
  document.querySelectorAll('.qs-basic').forEach((el) => { el.style.display = e.target.value === 'basic' ? '' : 'none'; });
});

document.getElementById('qs-test').addEventListener('click', async () => {
  const env    = applyQuickSetup();
  const status = document.getElementById('qs-status');
  status.textContent = 'Testing…';
  await testConnection(env);
  status.textContent = document.getElementById(`${env}-connStatus`)?.textContent || '';
});

document.getElementById('qs-save').addEventListener('click', () => {
  applyQuickSetup();
  saveSettings();
});

// ─── Request timeout stepper (− / +) ─────────────────────────────────────────

(function initTimeoutStepper() {
  const input = document.getElementById('requestTimeoutSec');
  const dec   = document.getElementById('requestTimeoutSec-dec');
  const inc   = document.getElementById('requestTimeoutSec-inc');
  if (!input || !dec || !inc) return;
  const MIN = 5, MAX = 120, STEP = 5, DEFAULT = 15;
  const value = () => { const n = Math.round(Number(input.value)); return input.value.trim() && Number.isFinite(n) ? n : DEFAULT; };
  const sync  = () => { dec.disabled = value() <= MIN; inc.disabled = value() >= MAX; };
  const bump  = (dir) => {
    // Move to the next multiple of the step, so 17 goes to 20 (or 15) rather than 22.
    const v = value();
    const next = dir > 0 ? (Math.floor(v / STEP) + 1) * STEP : (Math.ceil(v / STEP) - 1) * STEP;
    input.value = String(Math.min(MAX, Math.max(MIN, next)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  dec.addEventListener('click', () => bump(-1));
  inc.addEventListener('click', () => bump(1));
  input.addEventListener('input', sync);
  input.addEventListener('blur', () => {
    if (input.value.trim()) input.value = String(Math.min(MAX, Math.max(MIN, value())));
    sync();
  });
  sync();
})();

initTheme();
loadSettings().then(() => checkShareableImport());
