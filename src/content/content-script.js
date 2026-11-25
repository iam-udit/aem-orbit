// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * AEM Orbit — Content Script
 *
 * Injects the AEM Orbit horizontal pill bar fixed to the bottom-center
 * of the screen. Mirrors Adobe's AEM Sidekick UX with env switching, status
 * indicators, quick actions and a full JCR inspector.
 *
 * Architecture notes:
 * - #aem-sidekick-pro-root uses transform:translateX(-50%) which creates a new
 *   containing block, so #asp-env-picker and #asp-toast are appended to
 *   document.body instead and positioned via getBoundingClientRect().
 * - The JCR inspector panel (#asp-inspector) is likewise on document.body so
 *   it is never clipped by the root's stacking context.
 * - All AEM API calls are proxied through chrome.runtime.sendMessage to the
 *   background service worker to avoid CORS restrictions from content context.
 * - Source is an ES module; esbuild bundles it into a classic IIFE script
 *   (content scripts cannot load modules). Run `npm run build`.
 */

import { sameTierUrl, parseMsmPath, getEdsVariants } from '../shared/url-utils.js';
import { isSyncAllowed } from '../shared/sync-direction.js';
import { TOOLBAR_ITEMS, ITEM_BY_ID, FLAT_GROUPS, defaultLayout, normalizeLayout, layoutRuns, overflowItems } from '../shared/toolbar-layout.js';
import { planFan, ringBounds, orbLeafOrder, envFanOrder, MAX_ENV_LEAVES } from '../shared/orb-layout.js';
import { createMessenger, failToast, escHtml, runReplication, runDelete, confirmDestructive, ui } from '../ui/page-actions.js';
import { isControlAllowed } from '../shared/control-policy.js';
import { syncTheme } from '../shared/theme-dom.js';
import { spiralPath, logoSpiralPaths } from '../shared/spiral.js';
import { PERSONA_DEFS, resolvePersonaState, isPersonaToolEnabled } from '../shared/persona.js';
import { getExtApi, copyToClipboard, createTimeoutSignal, compatStorageGet, compatStorageSet } from '../shared/browser-compat.js';

(function () {
  'use strict';

  if (document.getElementById('aem-sidekick-pro-root')) return;

  // ─── State ──────────────────────────────────────────────────────────────────

  let jcrPath     = null;
  // Environment for THIS tab only — never shared with other tabs.
  let activeEnv   = 'local';
  let isEditableRegionsHighlighted = false;
  let isMinimized  = true;         // default: collapsed on page load
  let isEnvPickerOpen = false;
  let featureFlags = { enableKeyboardShortcut: true, showLastModified: true, summonOnLongPress: false };
  let fullConfigFlags = { confirmDelete: true, confirmPublish: false };
  let envsConfig   = {};             // credential-free env configs
  let pageTier     = null;           // 'author' | 'preview' | 'publish' | 'dispatcher'
  let pageStatus   = 'unknown';      // last known publish status of this page
  let statusData   = null;           // last GET_PAGE_STATUS reply, shown in the details panel
  let savedPos     = null;           // dragged toolbar position {cx, bottom}, remembered per site
  let devMode      = { enabled: false, buttons: { jcr: true, overlays: true, highlight: true, inspect: true, tools: true, reload: true, delete: true, sync: true } };
  let personaState = resolvePersonaState({});
  let lockConfig   = false;
  let toolbarLayout = defaultLayout(); // which buttons sit on the regular / expanded bar (Settings → Toolbar)
  let controlPolicy = null;            // administrator policy (managed storage): controls switched off for this team
  let orbMode      = true;             // default: the collapsed bar is a floating orb unless classicBar is enabled (Settings → Toolbar)
  let orbTimer     = null;             // hover-intent timer that opens / closes the orb's fan
  let orbEnvOpen   = false;            // the orb's fan shows the environments (the Env leaf stays in the middle)
  let summoned     = false;            // the orb was called up at the pointer (long-press); not remembered
  let summonedFromExpanded = false;    // ...while the full toolbar was open: it comes back when the orb goes away
  let summonPos    = null;             // {cx, bottom} of that temporary spot
  let summonTimer  = null;             // returns the summoned orb after the pointer has been away from it for a while
  let swallowClick = false;            // eat the click that ends the long-press
  let busyCount    = 0;                // actions in progress (the orb animates faster while > 0)
  let themeSync    = null;             // keeps data-asp-theme on <html> in step with the Settings theme choice

  const BUILTIN_ENVS = ['local', 'dev', 'stage', 'prod'];
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // ─── Messaging ───────────────────────────────────────────────────────────────

  /** Every request carries this tab's env so the worker never guesses. */
  const msg = createMessenger(() => activeEnv);
  /** May the admin policy let this control be used on the environment this tab targets? (The worker enforces it too.) */
  const allowed = (control) => isControlAllowed(controlPolicy, control, activeEnv);

  // ─── Toast ────────────────────────────────────────────────────────────────────
  // Lives on <body> (not inside the transformed root) so position:fixed is
  // always viewport-relative.

  /** "local" -> "Local", "my stage" -> "My Stage". Only the first letter of each word changes. */
  const titleCase = (s) => String(s).replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

  /** `actions` (optional): [{label, onClick}] shown as buttons inside the toast. */
  function toast(message, type = 'info', duration = 2800, actions = null) {
    const el = document.getElementById('asp-toast');
    if (!el) return;

    el.classList.remove('asp-toast-show');
    el.className = `asp-toast asp-toast-${type}${actions?.length ? ' asp-toast-has-actions' : ''}`;
    el.textContent = message;
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className   = 'asp-toast-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        el.classList.remove('asp-toast-show');
        a.onClick();
      });
      el.appendChild(b);
    });

    // Above the bar. As an orb it is centred on the orb and sits just beyond the outer edge of the ring
    // (above it, or below it when the ring points down), so the leaves never cover it.
    const bar = document.getElementById('asp-bar');
    if (bar) {
      const barRect = bar.getBoundingClientRect();
      const toastH  = el.offsetHeight || 34;
      el.style.removeProperty('left');
      el.style.top = `${barRect.top - toastH - 8}px`;
      if (orbActive()) {
        const cx   = barRect.left + barRect.width / 2;
        const cy   = barRect.top + barRect.height / 2;
        const ring = ringBounds(planFan(orbLeafOrder(true).length, cx, cy, window.innerWidth, window.innerHeight), cx, cy);
        const half = (el.offsetWidth || 160) / 2 + 8;
        el.style.left = `${Math.max(half, Math.min(cx, window.innerWidth - half))}px`;
        if (ring.top - toastH - 8 >= 8) el.style.top = `${ring.top - toastH - 8}px`;
        else if (ring.bottom + 8 + toastH + 8 <= window.innerHeight) el.style.top = `${ring.bottom + 8}px`;
      }
    }

    requestAnimationFrame(() => { el.classList.add('asp-toast-show'); });
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.classList.remove('asp-toast-show'); }, duration);
  }

  // ─── Status pill ──────────────────────────────────────────────────────────────

  const STATUS_MAP = {
    published: { label: 'Published', cls: 'asp-s-published' },
    draft:     { label: 'Draft',     cls: 'asp-s-draft'     },
    modified:  { label: 'Modified',  cls: 'asp-s-modified'  },
    unknown:   { label: '—',         cls: 'asp-s-unknown'   },
  };

  /** Updates the toolbar publication status badge, orb indicator, and last-modified tooltip. */
  function updateStatus(status, lastModified) {
    const pill = document.getElementById('asp-status-pill');
    if (!pill) return;
    const s = STATUS_MAP[status] || STATUS_MAP.unknown;
    pageStatus       = STATUS_MAP[status] ? status : 'unknown';
    pill.textContent = s.label;
    pill.className   = `asp-status-pill ${s.cls}`;
    updateOrbInfo();

    if (featureFlags.showLastModified && lastModified) {
      try {
        const d = new Date(lastModified);
        pill.title = `Last modified: ${d.toLocaleString()}`;
      } catch (_) { /* ignore */ }
    } else {
      pill.title = 'Click for page details';
    }
  }

  // ─── Editable regions ─────────────────────────────────────────────────────────

  /**
   * Outline components without changing layout: outlines don't affect box size,
   * and labels are drawn in a separate fixed overlay instead of forcing
   * position:relative onto page elements.
   */
  const HIGHLIGHT_SELECTOR = '[data-cmp-is],.parsys,.responsivegrid,.aem-GridColumn';

  /** Recomputes and paints fixed component badge labels over highlighted Core Components. */
  function drawHighlightLabels() {
    document.getElementById('asp-highlight-labels')?.remove();
    if (!isEditableRegionsHighlighted) return;
    const layer = document.createElement('div');
    layer.id = 'asp-highlight-labels';
    document.querySelectorAll('[data-cmp-is]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return;
      const tag = document.createElement('span');
      tag.className   = 'asp-highlight-tag';
      tag.textContent = el.getAttribute('data-cmp-is');
      tag.style.top   = `${Math.max(r.top, 0)}px`;
      tag.style.left  = `${Math.max(r.left, 0)}px`;
      layer.appendChild(tag);
    });
    document.body.appendChild(layer);
  }

  let _hlRaf = 0;
  function scheduleHighlightLabels() {
    cancelAnimationFrame(_hlRaf);
    _hlRaf = requestAnimationFrame(drawHighlightLabels);
  }

  /** Toggles editable component outlines and component-type badge overlays on the page. */
  function toggleEditableHighlight() {
    isEditableRegionsHighlighted = !isEditableRegionsHighlighted;
    const existing = document.getElementById('asp-highlight-style');
    if (isEditableRegionsHighlighted) {
      if (!existing) {
        const s = document.createElement('style');
        s.id = 'asp-highlight-style';
        s.textContent = `${HIGHLIGHT_SELECTOR} { outline: 2px dashed #0f62fe !important; outline-offset: -2px !important; }`;
        document.head.appendChild(s);
      }
      drawHighlightLabels();
      window.addEventListener('scroll', scheduleHighlightLabels, { passive: true, capture: true });
      window.addEventListener('resize', scheduleHighlightLabels, { passive: true });
      document.getElementById('asp-highlight-btn')?.classList.add('asp-btn-on');
    } else {
      existing?.remove();
      drawHighlightLabels();
      window.removeEventListener('scroll', scheduleHighlightLabels, { capture: true });
      window.removeEventListener('resize', scheduleHighlightLabels);
      document.getElementById('asp-highlight-btn')?.classList.remove('asp-btn-on');
    }
  }

  // ─── Destructive-action confirmation ─────────────────────────────────────────

  /** Inputs for confirmDestructive (protected envs require typing the page name). */
  function destructiveGuard() {
    return { env: activeEnv, isProtected: !!envsConfig[activeEnv]?.protected, confirmDelete: fullConfigFlags.confirmDelete, confirmPublish: fullConfigFlags.confirmPublish };
  }

  // ─── Build toolbar HTML ───────────────────────────────────────────────────────

  /**
   * @param {object}   envsCfg   fullConfig.environments
   * @param {string[]} envOrder  ordered array of env keys
   */
  function buildToolbar(envsCfg, envOrder) {
    const root = document.createElement('div');
    root.id = 'aem-sidekick-pro-root';

    // ── Env picker (on <body>) ─────────────────────────────────────────────────
    const picker = document.createElement('div');
    picker.id        = 'asp-env-picker';
    picker.className = 'asp-env-picker';
    picker.style.display = 'none';

    const configuredKeys = envOrder.filter((k) => {
      const c = envsCfg[k];
      return c && (c.authorHost || c.publishHost || c.previewHost || c.dispatcherHost);
    });

    // Built with DOM APIs (not innerHTML) — env labels are user-controlled.
    const pickerLabel = document.createElement('div');
    pickerLabel.className   = 'asp-env-picker-label';
    pickerLabel.textContent = 'Switch environment';
    const pickerItems = document.createElement('div');
    pickerItems.className = 'asp-env-picker-items';
    configuredKeys.forEach((k) => {
      const isBuiltin = BUILTIN_ENVS.includes(k);
      const btn = document.createElement('button');
      btn.className   = `asp-env-pick-btn ${isBuiltin ? `asp-epc-${k}` : 'asp-epc-custom'}`;
      btn.dataset.env = k;
      const dot = document.createElement('span');
      dot.className = 'asp-epc-dot';
      btn.append(dot, titleCase((!isBuiltin && envsCfg[k]?.label) ? envsCfg[k].label : k));
      pickerItems.appendChild(btn);
    });
    picker.append(pickerLabel, pickerItems);
    document.body.appendChild(picker);

    // ── Toast (on <body>) ──────────────────────────────────────────────────────
    const toastEl = document.createElement('div');
    toastEl.id        = 'asp-toast';
    toastEl.className = 'asp-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);

    // ── JCR Inspector (on <body>, floats ABOVE the bar) ────────────────────────
    // Kept outside #aem-sidekick-pro-root so position:fixed is viewport-relative.
    const inspector = document.createElement('div');
    inspector.id        = 'asp-inspector';
    inspector.className = 'asp-inspector';
    inspector.style.display = 'none';
    inspector.innerHTML = `
      <div class="asp-inspector-header">
        <div class="asp-inspector-header-left">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3z"/>
          </svg>
          <span id="asp-inspector-title">JCR Properties — jcr:content</span>
        </div>
        <div class="asp-inspector-header-right">
          <button class="asp-inspector-btn" id="asp-inspector-expand" title="Expand all nodes">Expand</button>
          <button class="asp-inspector-btn" id="asp-inspector-collapse" title="Collapse nested nodes">Collapse</button>
          <button class="asp-inspector-btn" id="asp-inspector-copy" title="Copy all as JSON" aria-label="Copy all as JSON">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            Copy
          </button>
          <button class="asp-icon-btn" id="asp-inspector-close" title="Close" aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div class="asp-inspector-search">
        <input class="asp-inspector-search-input" id="asp-inspector-search" type="text" placeholder="Filter properties and nodes…" autocomplete="off" />
      </div>
      <div class="asp-inspector-table-wrap">
        <div class="asp-tree" id="asp-inspector-body">
          <div class="asp-inspector-loading">Loading…</div>
        </div>
      </div>
    `;
    document.body.appendChild(inspector);

    // ── Bar HTML ──────────────────────────────────────────────────────────────
    // Orb spiral: two interlaced closed strands like the AEM mark (8 lobes) in a 44 × 44 box centred on the orb. `sign` +1 bulges
    // at top / bottom / left / right (the thin strand), -1 at the diagonals (the thick strand).
    const thickD = spiralPath(-1, 22, 22, 12.2, 2.2);
    const thinD = spiralPath(1, 22, 22, 12.2, 2.2);
    root.innerHTML = `
      <div class="asp-bar" id="asp-bar" role="toolbar" aria-label="AEM Orbit">

        <!-- Logo / expand toggle -->
        <div class="asp-cluster asp-cluster-left">
          <button class="asp-logo-btn" id="asp-logo-btn" title="Expand / collapse (⌥⇧K). Drag to move." aria-label="Expand or collapse the toolbar" aria-expanded="false">
            <svg class="asp-logo-a" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">${logoSpiralPaths()}</svg>
            <!-- Orb style only (hidden otherwise): the AEM-style spiral in the environment colour, in place of the small white spiral of the regular bar. The spiral stays
                 still; one glowing dot (stacked strokes: five glows and a bright core) runs round the thick strand -->
            <svg class="asp-logo-spiral" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
              <path class="asp-sp-thin" d="${thinD}"/>
              <path class="asp-sp-thick" d="${thickD}"/>
              ${[1, 2, 3, 4, 5, 6].map((n) => `<path class="asp-sp-dot asp-sp-d${n}" pathLength="100" d="${thickD}"/>`).join('')}
            </svg>
          </button>
          <!-- Orb style only (hidden otherwise): the outer ring in the environment colour (dashed when the environment is protected) and the hub caption -->
          <span class="asp-orb-ring" aria-hidden="true"></span>
          <span class="asp-orb-hub" id="asp-orb-hub" aria-hidden="true"></span>
        </div>

        <!-- Orb style only: the leaves (environment, regular-bar buttons) fan out here on hover / focus -->
        <div class="asp-orb-fan" id="asp-orb-fan" role="group" aria-label="Quick actions"></div>

        <!-- Always-visible: status + env chip -->
        <div class="asp-cluster asp-cluster-persistent">
          <span class="asp-status-pill asp-s-unknown" id="asp-status-pill" role="button" tabindex="0" aria-haspopup="dialog" title="Click for page details">—</span>
          <button class="asp-env-chip" id="asp-env-chip" title="Switch environment" aria-haspopup="menu" aria-expanded="false">
            <svg class="asp-env-chip-lock" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM9 6a3 3 0 016 0v2H9V6z"/>
            </svg>
            <span class="asp-env-chip-label" id="asp-env-chip-label">local</span>
            <svg class="asp-env-chip-chevron" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </button>
        </div>

        <!-- Regular (minimized) mode: 4 one-click actions. Hidden when expanded. -->
        <div class="asp-cluster asp-cluster-mini" id="asp-mini-cluster">
          <span class="asp-divider"></span>
          <button class="asp-btn asp-mini-btn" id="asp-mini-edit-btn" data-variant="authorEditUrl" data-label="Edit" title="Edit page in AEM editor" aria-label="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            <span class="asp-lbl">Edit</span>
          </button>
          <button class="asp-btn asp-mini-btn" id="asp-mini-view-btn" data-variant="authorDisabledUrl" data-label="View" title="View the page as visitors see it (Author, editing UI off)" aria-label="View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>
            <span class="asp-lbl">View</span>
          </button>
          <button class="asp-btn asp-mini-btn" id="asp-mini-live-btn" data-variant="liveUrl" data-label="Live" title="Open the live site (CDN if configured, otherwise Publish)" aria-label="Live">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
            <span class="asp-lbl">Live</span>
          </button>
          <button class="asp-btn asp-mini-btn" id="asp-mini-props-btn" data-variant="propertiesUrl" data-label="Props" title="Page properties" aria-label="Page properties">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
            <span class="asp-lbl">Props</span>
          </button>
        </div>

        <!-- Extended cluster — hidden when minimized -->
        <div class="asp-cluster asp-cluster-center" id="asp-center-cluster">
          <span class="asp-divider"></span>
          <div class="asp-group">
            <button class="asp-btn asp-tier-btn" id="asp-tier-btn" title="Switch page tier / view" aria-haspopup="menu" aria-expanded="false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
              <span class="asp-lbl" id="asp-tier-label">Tier</span>
              <svg class="asp-more-chevron" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            </button>
            <button class="asp-btn" id="asp-publish-menu-btn" title="Publishing actions: publish, publish to Preview, unpublish" aria-haspopup="menu" aria-expanded="false">
              <svg class="asp-pub-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
              <svg class="asp-spinner" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2zm0 20A10 10 0 0 1 2 12h2a8 8 0 0 0 8 8v2z" opacity=".9"/></svg>
              <span class="asp-lbl">Publish</span>
              <svg class="asp-more-chevron" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            </button>
            <button class="asp-btn" id="asp-locales-btn" title="Locales &amp; MSM Language Masters" aria-haspopup="menu" aria-expanded="false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              <span class="asp-lbl">Locales</span>
              <svg class="asp-more-chevron" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            </button>
          </div>
          <span class="asp-divider"></span>
          <div class="asp-group">
            <button class="asp-btn" id="asp-sites-btn" title="Open parent folder in Sites console">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
              <span class="asp-lbl">Sites</span>
            </button>
            <button class="asp-btn" id="asp-sync-btn" title="Pull/push content from another environment">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
              <span class="asp-lbl">Sync</span>
            </button>
            <button class="asp-btn" id="asp-inspect-btn" title="Component inspector — click a component to see its resource path &amp; type">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <span class="asp-lbl">Inspect</span>
            </button>
            <button class="asp-btn" id="asp-jcr-btn" title="JCR Inspector">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.1-.9-2-2-2zm0 5h-2V5h2v3z"/></svg>
              <span class="asp-lbl">JCR</span>
            </button>
            <button class="asp-btn asp-more-btn" id="asp-more-btn" title="More actions" aria-haspopup="menu" aria-expanded="false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
              <span class="asp-lbl">More</span>
              <svg class="asp-more-chevron" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            </button>
          </div>

          <!-- Utility icons -->
          <span class="asp-divider"></span>
          <button class="asp-kbd" id="asp-palette-btn" title="Search all commands" aria-label="Search all commands" style="display:none"></button>
          <button class="asp-icon-btn" id="asp-copy-btn" title="Copy JCR path" aria-label="Copy JCR path">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button class="asp-icon-btn" id="asp-options-btn" title="Open options" aria-label="Open options">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </button>
        </div>

        <!-- Secondary actions live in the More menu. The buttons stay here (hidden) so
             their handlers and the command palette keep working. -->
        <div class="asp-pool" id="asp-pool" aria-hidden="true">
          <!-- Orb style only: the environment leaf (moved into the fan while the orb is shown) -->
          <button class="asp-btn asp-orb-env-btn" id="asp-orb-env-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Switch environment">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path id="asp-orb-env-ic" d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>
            <span class="asp-lbl" id="asp-orb-env-lbl">local</span>
          </button>
          <button class="asp-btn" id="asp-publish-btn" title="Publish page">
            <span class="asp-lbl">Publish</span>
          </button>
          <button class="asp-btn" id="asp-dam-btn" title="DAM asset inspect — hover an image or asset element and click to inspect it">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            <span class="asp-lbl">Asset</span>
          </button>
          <button class="asp-btn" id="asp-overlay-btn" title="Toggle AEM edit overlays">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
            <span class="asp-lbl">Overlays</span>
          </button>
          <button class="asp-btn" id="asp-highlight-btn" title="Highlight editable components">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 4.5c-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5-1.45 0-2.99.22-4.28.79C1.49 5.62 1 6.33 1 7.14v11.28c0 1.3 1.22 2.26 2.48 1.94.98-.26 2.01-.36 3.02-.36 1.56 0 3.22.26 4.56.92.6.3 1.28.3 1.87 0 1.34-.67 3-.92 4.56-.92 1.01 0 2.04.1 3.02.36 1.26.33 2.48-.63 2.48-1.94V7.14c0-.81-.49-1.52-1.22-1.85C18.8 4.72 17.26 4.5 17.5 4.5z"/></svg>
            <span class="asp-lbl">Highlight</span>
          </button>
          <button class="asp-btn" id="asp-tools-btn" title="Modes &amp; developer views">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
            <span class="asp-lbl">Tools</span>
          </button>
          <button class="asp-btn" id="asp-reload-btn" title="Hard reload page (bypass cache)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            <span class="asp-lbl">Reload</span>
          </button>
          <button class="asp-btn" id="asp-audit-btn" title="SEO &amp; accessibility audit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
            <span class="asp-lbl">Audit</span>
          </button>
          <button class="asp-btn" id="asp-cache-btn" title="Cache &amp; dispatcher headers">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            <span class="asp-lbl">Cache</span>
          </button>
          <button class="asp-btn asp-btn-danger" id="asp-delete-btn" title="Delete page">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            <span class="asp-lbl">Delete</span>
          </button>
          <button class="asp-btn asp-btn-warn" id="asp-unpublish-btn" title="Unpublish page">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            <span class="asp-lbl">Unpublish</span>
          </button>
          <button class="asp-btn" id="asp-publish-preview-btn" title="Publish to Preview">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5zm0 12.5a5 5 0 110-10 5 5 0 010 10z"/></svg>
            <span class="asp-lbl">To Preview</span>
          </button>
        </div>

        <!-- Close — always visible -->
        <div class="asp-cluster asp-cluster-right">
          <button class="asp-icon-btn asp-close-btn" id="asp-close-btn" title="Close Orbit" aria-label="Close Orbit">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

      </div>
    `;

    // Orb style: one leaf per environment, shown while the Env leaf is open (moved into the fan by placeItems)
    const svgNS = 'http://www.w3.org/2000/svg';
    const envLeafPool = root.querySelector('#asp-pool');
    configuredKeys.forEach((k) => {
      const isBuiltin = BUILTIN_ENVS.includes(k);
      const label = titleCase((!isBuiltin && envsCfg[k]?.label) ? envsCfg[k].label : k);
      const leaf = el('button', 'asp-btn asp-orb-envopt');
      leaf.dataset.env  = k;
      leaf.dataset.kind = isBuiltin ? k : 'custom';
      leaf.title = `Switch to ${label}`;
      leaf.setAttribute('aria-pressed', 'false');
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svgNS, 'path');
      // A lock on a protected environment, a dot otherwise
      path.setAttribute('d', envsCfg[k]?.protected ? ICON_LOCK : 'M12 5.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z');
      svg.appendChild(path);
      leaf.append(svg, el('span', 'asp-lbl', label));
      envLeafPool?.appendChild(leaf);
    });

    return root;
  }

  // ─── JCR Inspector helpers ────────────────────────────────────────────────────

  /** All stored JCR data for filtering */
  let _jcrData = null;

  const isNode = (v) => v && typeof v === 'object' && !Array.isArray(v);

  /** Does this node (or any descendant) have a key / value matching the filter? */
  function treeMatches(obj, lc) {
    return Object.entries(obj).some(([k, v]) =>
      k.toLowerCase().includes(lc)
      || (isNode(v) ? treeMatches(v, lc) : String(v).toLowerCase().includes(lc)));
  }

  /**
   * Render a JCR node as a collapsible tree: properties first, then child nodes.
   * Built with DOM APIs (textContent) — no HTML strings from repository data.
   */
  function buildTree(obj, lc, depth) {
    const frag = document.createDocumentFragment();
    const entries = Object.entries(obj);
    const props = entries.filter(([, v]) => !isNode(v)).sort(([a], [b]) => a.localeCompare(b));
    const kids  = entries.filter(([, v]) => isNode(v));

    props.forEach(([k, v]) => {
      if (lc && !k.toLowerCase().includes(lc) && !String(v).toLowerCase().includes(lc)) return;
      const row = document.createElement('div');
      row.className = 'asp-tree-prop';
      const valText = Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
      row.title = 'Click to copy property value';
      const key = document.createElement('span');
      key.className = 'asp-insp-key';
      key.textContent = k;
      const val = document.createElement('span');
      val.className = 'asp-insp-val';
      val.textContent = valText;
      row.append(key, val);
      row.addEventListener('click', async () => {
        await copyToClipboard(valText);
        toast(`✓ Copied ${k}`, 'success');
      });
      frag.appendChild(row);
    });

    kids.forEach(([k, v]) => {
      if (lc && !k.toLowerCase().includes(lc) && !treeMatches(v, lc)) return;
      const det = document.createElement('details');
      det.className = 'asp-tree-node';
      det.open = !!lc || depth < 1;
      const sum = document.createElement('summary');
      sum.textContent = k;
      const type = v['sling:resourceType'] || v['jcr:primaryType'];
      if (type) {
        const t = document.createElement('span');
        t.className = 'asp-tree-type';
        t.textContent = type;
        sum.appendChild(t);
      }
      det.appendChild(sum);
      det.appendChild(buildTree(v, lc, depth + 1));
      frag.appendChild(det);
    });
    return frag;
  }

  function renderInspectorTable(data, filter = '') {
    const body = document.getElementById('asp-inspector-body');
    if (!body) return;
    const lc = filter.trim().toLowerCase();
    body.replaceChildren(buildTree(data, lc, 0));
    if (!body.childNodes.length) {
      body.innerHTML = '<div class="asp-inspector-empty">No matching properties.</div>';
    }
  }

  /**
   * Positions a fixed floating menu/panel/card safely inside the viewport.
   * Long lists (such as Locales or JCR trees) are constrained to the screen height,
   * centered vertically when they exceed the space above/below the toolbar, and scroll internally.
   */
  function fitFloatingBox(box, refRect, { alignLeft, preferredMaxH } = {}) {
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    box.style.maxHeight = '';
    const naturalH = box.offsetHeight || 0;
    const w = box.offsetWidth || 0;
    const wantLeft = alignLeft ?? (refRect ? refRect.left + refRect.width / 2 - w / 2 : margin);
    box.style.left = `${Math.max(margin, Math.min(wantLeft, vw - w - margin))}px`;

    const cap = Math.min(preferredMaxH || Math.round(vh * 0.68), vh - margin * 2);
    const spaceAbove = refRect ? Math.max(0, refRect.top - 8 - margin) : vh - margin * 2;
    const spaceBelow = refRect ? Math.max(0, vh - refRect.bottom - 8 - margin) : vh - margin * 2;

    if (refRect && naturalH > spaceAbove && naturalH > spaceBelow) {
      const maxH = Math.max(160, Math.min(cap, vh - margin * 2));
      box.style.maxHeight = `${maxH}px`;
      const actualH = Math.min(naturalH, maxH);
      box.style.top = `${Math.max(margin, Math.round((vh - actualH) / 2))}px`;
      return;
    }

    const putAbove = refRect ? (spaceAbove >= naturalH || spaceAbove >= spaceBelow) : false;
    const maxH = Math.max(140, Math.min(cap, putAbove ? spaceAbove : spaceBelow));
    box.style.maxHeight = `${maxH}px`;
    const actualH = Math.min(naturalH, maxH);
    if (!refRect) {
      box.style.top = `${Math.max(margin, Math.round((vh - actualH) / 2))}px`;
    } else if (putAbove) {
      box.style.top = `${Math.max(margin, refRect.top - actualH - 8)}px`;
    } else {
      box.style.top = `${Math.min(vh - actualH - margin, refRect.bottom + 8)}px`;
    }
  }

  function positionInspector() {
    const bar   = document.getElementById('asp-bar');
    const panel = document.getElementById('asp-inspector');
    if (!bar || !panel) return;
    fitFloatingBox(panel, bar.getBoundingClientRect(), { preferredMaxH: 460 });
  }

  function openInspector() {
    const panel = document.getElementById('asp-inspector');
    if (!panel) return;
    panel.style.display = 'flex';
    positionInspector();
    document.getElementById('asp-jcr-btn')?.classList.add('asp-btn-on');
  }

  function closeInspector() {
    const panel = document.getElementById('asp-inspector');
    if (panel) panel.style.display = 'none';
    document.getElementById('asp-jcr-btn')?.classList.remove('asp-btn-on');
  }

  // ─── Env chip + picker ────────────────────────────────────────────────────────

  function setActiveEnvUI(env) {
    activeEnv = env;
    const bar   = document.getElementById('asp-bar');
    const isProtected = !!envsConfig[env]?.protected;
    if (bar) {
      bar.setAttribute('data-env', BUILTIN_ENVS.includes(env) ? env : 'custom');
      bar.classList.toggle('asp-protected', isProtected);
    }

    const chip       = document.getElementById('asp-env-chip');
    if (chip) {
      chip.title = isProtected
        ? 'Switch environment. This environment is protected: destructive actions need typed confirmation'
        : 'Switch environment';
    }
    const labelEl    = document.getElementById('asp-env-chip-label');
    const pickerBtn  = document.querySelector(`.asp-env-pick-btn[data-env="${env}"]`);
    const displayLabel = (pickerBtn && !BUILTIN_ENVS.includes(env))
      ? pickerBtn.textContent.trim()
      : env;

    if (labelEl) labelEl.textContent = displayLabel;
    if (chip) {
      const colorCls = BUILTIN_ENVS.includes(env) ? `asp-env-chip-${env}` : 'asp-env-chip-custom';
      chip.className = `asp-env-chip ${colorCls}`;
    }
    document.querySelectorAll('.asp-env-pick-btn').forEach((b) => {
      b.classList.toggle('asp-epc-active', b.dataset.env === env);
    });
    document.querySelectorAll('.asp-orb-envopt').forEach((b) => {
      b.classList.toggle('asp-orb-active', b.dataset.env === env);
      b.setAttribute('aria-pressed', String(b.dataset.env === env));
    });
    updateOrbInfo();
  }

  /** The control the env picker opens from: the chip on the bar, the Env leaf on the orb. */
  const envAnchor = () => document.getElementById(orbActive() ? 'asp-orb-env-btn' : 'asp-env-chip');

  function openEnvPicker() {
    isEnvPickerOpen = true;
    const picker = document.getElementById('asp-env-picker');
    const chip   = envAnchor();
    if (!picker || !chip) return;

    picker.style.display = 'flex';
    picker.setAttribute('role', 'menu');
    picker.querySelectorAll('.asp-env-pick-btn').forEach((b) => b.setAttribute('role', 'menuitemradio'));
    // As an orb the picker opens on its own (the fan is closed): centred above the orb, not on a leaf.
    const chipRect = chip.getBoundingClientRect();
    const barRect  = document.getElementById('asp-bar')?.getBoundingClientRect() || chipRect;
    const pickerW  = picker.offsetWidth;
    const wanted   = orbActive() ? barRect.left + barRect.width / 2 - pickerW / 2 : chipRect.left;
    fitFloatingBox(picker, barRect, { alignLeft: wanted, preferredMaxH: Math.round(window.innerHeight * 0.65) });

    chip.classList.add('asp-env-chip-open');
    chip.setAttribute('aria-expanded', 'true');
  }

  function closeEnvPicker() {
    const wasOpen = isEnvPickerOpen;
    isEnvPickerOpen = false;
    const picker = document.getElementById('asp-env-picker');
    if (picker) picker.style.display = 'none';
    ['asp-env-chip', 'asp-orb-env-btn'].forEach((id) => {
      document.getElementById(id)?.classList.remove('asp-env-chip-open');
      document.getElementById(id)?.setAttribute('aria-expanded', 'false');
    });
    // The fan stayed open for the picker; let it close once the pointer is gone too.
    const bar = document.getElementById('asp-bar');
    if (wasOpen && orbActive() && bar && !bar.matches(':hover')) scheduleOrbFan(false, ORB_CLOSE_DELAY);
  }

  // ─── Minimize / Maximize ─────────────────────────────────────────────────────

  /** A layout item only takes space on the bar when it can actually be used under the active persona & policy. */
  function layoutItemVisible(item) {
    if (item.dev && item.qa) {
      if (!isPersonaToolEnabled(personaState, item.dev) && !isPersonaToolEnabled(personaState, item.qa)) return false;
    } else if (item.dev && !isPersonaToolEnabled(personaState, item.dev)) {
      return false;
    } else if (item.qa && !isPersonaToolEnabled(personaState, item.qa)) {
      return false;
    }
    if (item.id === 'sync' && !allowed('sync')) return false;
    if (item.id === 'publish' && (!personaState.showReplication || !['publish', 'unpublish', 'publishPreview'].some(allowed))) return false;
    if (item.id === 'palette' && !featureFlags.enableKeyboardShortcut) return false;
    return true;
  }

  /**
   * Put the chosen buttons into the visible bar, in the saved order. Every button
   * is built once (handlers are bound by id); this only moves elements. Buttons not on
   * the active bar are parked in the hidden pool, so the command palette still works.
   */
  function placeItems() {
    const pool    = document.getElementById('asp-pool');
    const inFan   = isMinimized && orbMode;
    const cluster = document.getElementById(inFan ? 'asp-orb-fan' : isMinimized ? 'asp-mini-cluster' : 'asp-center-cluster');
    if (!pool || !cluster) return;
    TOOLBAR_ITEMS.forEach((i) => { const e = document.getElementById(i.elId); if (e) { fromFan(e); pool.appendChild(e); } });
    document.querySelectorAll('#asp-orb-env-btn, .asp-orb-envopt').forEach((e) => { fromFan(e); pool.appendChild(e); });
    document.getElementById('asp-orb-fan')?.replaceChildren();
    cluster.replaceChildren();
    if (inFan) {
      // The orb has a fixed set of leaves (see orbLeafOrder), or the environments around the Env leaf while those are open.
      const envBtn = document.getElementById('asp-orb-env-btn');
      envBtn?.classList.toggle('asp-orb-back', orbEnvOpen);
      envBtn?.setAttribute('aria-expanded', String(orbEnvOpen));
      if (orbEnvOpen) {
        envFanOrder([...document.querySelectorAll('.asp-orb-envopt')]).forEach((leaf) => {
          const e = leaf || envBtn;
          if (e) cluster.appendChild(e);
        });
      } else {
        orbLeafOrder(isPersonaToolEnabled(personaState, 'jcr'), personaState.persona).forEach((id) => {
          if (id === 'env') { if (envBtn) cluster.appendChild(envBtn); return; }
          const e = document.getElementById(ITEM_BY_ID[id]?.elId || '');
          if (e) { toFan(e, ITEM_BY_ID[id]); cluster.appendChild(e); }
        });
      }
      updateOrbInfo();
      layoutOrbFan();
      return;
    }
    const ids = (isMinimized ? toolbarLayout.mini : toolbarLayout.expanded).filter((id) => layoutItemVisible(ITEM_BY_ID[id]));
    layoutRuns(ids).forEach(({ group, ids: run }) => {
      const divider = document.createElement('span');
      divider.className = 'asp-divider';
      cluster.appendChild(divider);
      let host = cluster;
      if (!FLAT_GROUPS.has(group)) {
        host = document.createElement('div');
        host.className = 'asp-group';
        cluster.appendChild(host);
      }
      run.forEach((id) => { const e = document.getElementById(ITEM_BY_ID[id].elId); if (e) host.appendChild(e); });
    });
  }

  function applyMinimized() {
    const root   = document.getElementById('aem-sidekick-pro-root');
    const bar    = document.getElementById('asp-bar');
    const center = document.getElementById('asp-center-cluster');
    const mini   = document.getElementById('asp-mini-cluster');
    if (root)   root.classList.toggle('asp-root-orb', isMinimized && orbMode);
    if (bar)    bar.classList.toggle('asp-orb', orbMode);
    if (bar)    bar.classList.toggle('asp-minimized', isMinimized);
    if (center) center.style.display = isMinimized ? 'none' : '';
    if (mini)   mini.style.display   = (isMinimized && !orbMode) ? '' : 'none';
    closeOrbFan();
    orbEnvOpen = false;
    placeItems();
    document.getElementById('asp-logo-btn')?.setAttribute('aria-expanded', String(!isMinimized));
    if (isMinimized) {
      closeEnvPicker();
      closeInspector();
      closeMenu();
    }
    updateOrbInfo();
    applySavedPosition();
  }

  // ─── Orb style (default) ──────────────────────────────────────────────────────
  // The collapsed bar is a round, animated floating orb (unless classicBar is enabled).
  // Hovering or focusing it fans the environment and regular-bar buttons out as a half ring of pointed leaves; clicking it
  // opens the full toolbar. Dragging, the saved position and ⌥⇧K work as for the regular bar.

  const orbActive = () => orbMode && isMinimized;
  const ORB_OPEN_DELAY  = 120;   // ms the pointer must rest on the orb before the fan opens
  const ORB_CLOSE_DELAY = 300;   // ms of grace so crossing the gap between the orb and a leaf doesn't close it
  const CAP_CLEAR = 60;          // degrees the ring must stay away from straight up / down for the hub caption to fit there
  const ORB_CHEVRON_H = 6;       // px height of the filled triangle on the active environment leaf (keep in sync with toolbar.css)
  const ORB_LABELS = { copy: 'Path' };      // short names for leaves whose label would not fit
  const ICON_LOCK   = 'M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM9 6a3 3 0 016 0v2H9V6z';
  const ICON_BACK   = 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z';
  const ICON_LAYERS = 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z';
  let lastPointerTouch = false;
  let orbGeom = null;            // { plan, cx, cy }: the last fan layout, so menus and panels can sit clear of the ring
  const orbOrigNodes = new WeakMap();   // a button's own children, kept while the fan shows an icon + label for it
  const orbAddedBtn  = new WeakSet();   // buttons that only get the .asp-btn class while they are a leaf

  /** Every leaf shows an icon and a label. Buttons that lack one of them get it for as long as they are in the fan. */
  function toFan(e, item) {
    if (!e.classList.contains('asp-btn')) { e.classList.add('asp-btn'); orbAddedBtn.add(e); }
    const icon = e.querySelector('svg');
    const lbl  = e.querySelector('.asp-lbl');
    if (icon && lbl) return;
    if (!orbOrigNodes.has(e)) orbOrigNodes.set(e, [...e.childNodes]);
    const svg = icon ? icon.cloneNode(true) : document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (!icon) {
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', item.icon);
      svg.appendChild(path);
    }
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    e.replaceChildren(svg, el('span', 'asp-lbl', ORB_LABELS[item.id] || item.label));
  }

  function fromFan(e) {
    if (orbAddedBtn.delete(e)) e.classList.remove('asp-btn');
    const nodes = orbOrigNodes.get(e);
    if (nodes) { e.replaceChildren(...nodes); orbOrigNodes.delete(e); }
    ['--ox', '--oy', '--cvx', '--cvy', '--cva', '--i', 'clip-path', 'transform-origin', 'left', 'top', 'width', 'height'].forEach((k) => e.style.removeProperty(k));
  }

  /** Shape and place each leaf on the half ring, turning the ring away from the window edges. */
  function layoutOrbFan() {
    const fan = document.getElementById('asp-orb-fan');
    const bar = document.getElementById('asp-bar');
    if (!fan || !bar || !fan.children.length) return;
    const r  = bar.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const plan = planFan(fan.children.length, cx, cy, window.innerWidth, window.innerHeight);
    orbGeom = { plan, cx, cy };
    // The hub caption sits above or below the orb, but only where the ring leaves that side clear (the pill is wide:
    // the ring must stay at least CAP_CLEAR degrees from straight down / up) and the window has room for it.
    const angDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    const clear = (dir) => {
      const lo = plan.center - plan.span / 2;
      return angDist(dir, plan.center) > plan.span / 2
        && Math.min(angDist(dir, lo), angDist(dir, lo + plan.span)) >= CAP_CLEAR;
    };
    const roomBelow = cy + r.height / 2 + 26 <= window.innerHeight;   // 9px gap + the 16px pill
    const roomAbove = cy - r.height / 2 - 26 >= 0;
    bar.dataset.orbCompact = plan.compact ? '1' : '0';
    bar.dataset.orbCap = roomBelow && clear(270) ? 'below' : roomAbove && clear(90) ? 'above' : 'none';
    [...fan.children].forEach((leaf, i) => {
      const p = plan.items[i];
      // The leaf's box is just its own wedge; its icon + label are moved from the box centre to the anchor point.
      leaf.style.setProperty('left', `${p.box.left}px`);
      leaf.style.setProperty('top', `${p.box.top}px`);
      leaf.style.setProperty('width', `${p.box.width}px`);
      leaf.style.setProperty('height', `${p.box.height}px`);
      leaf.style.setProperty('--ox', `${p.x - (p.box.left + p.box.width / 2)}px`);
      leaf.style.setProperty('--oy', `${p.y - (p.box.top + p.box.height / 2)}px`);
      // Filled up triangle (▴) of the environment in use: centred on the leaf's base (the curve around the orb), its lower edge
      // exactly on that curve and turned with the leaf so it points away from the orb.
      const aRad = (p.a * Math.PI) / 180;
      const cr = plan.inner + ORB_CHEVRON_H / 2;
      leaf.style.setProperty('--cvx', `${cr * Math.cos(aRad) - (p.box.left + p.box.width / 2)}px`);
      leaf.style.setProperty('--cvy', `${-cr * Math.sin(aRad) - (p.box.top + p.box.height / 2)}px`);
      leaf.style.setProperty('--cva', `${90 - p.a}deg`);
      leaf.style.setProperty('--i', String(i));
      leaf.style.setProperty('transform-origin', `${-p.box.left}px ${-p.box.top}px`);   // grow out of the orb's centre
      leaf.style.setProperty('clip-path', p.path);
    });
  }

  /** Icon-only leaves (narrow arcs near a corner): show the leaf's name in the hub pill, beside the leaf. */
  function showLeafName(leaf) {
    const bar = document.getElementById('asp-bar');
    const hub = document.getElementById('asp-orb-hub');
    const i = [...document.getElementById('asp-orb-fan').children].indexOf(leaf);
    const p = orbGeom?.plan.items[i];
    if (!bar || !hub || !p || bar.dataset.orbCompact !== '1') return;
    hub.textContent = leaf.querySelector('.asp-lbl')?.textContent || '';
    hub.dataset.tip = '1';
    // Just beyond the ring's outer edge along the leaf's angle, so it never covers a neighbouring leaf.
    const ang = (p.a * Math.PI) / 180;
    const halfW = hub.offsetWidth / 2;
    const dist = orbGeom.plan.outer + 6 + halfW * Math.abs(Math.cos(ang)) + 7 * Math.abs(Math.sin(ang));
    const x = Math.max(halfW + 4, Math.min(orbGeom.cx + dist * Math.cos(ang), window.innerWidth - halfW - 4));
    const y = Math.max(11, Math.min(orbGeom.cy - dist * Math.sin(ang), window.innerHeight - 11));
    hub.style.left = `${22 + x - orbGeom.cx}px`;            // the orb's box is 44px: its centre is at 22px
    hub.style.top  = `${22 + y - orbGeom.cy - 7}px`;
  }

  function hideLeafName() {
    const hub = document.getElementById('asp-orb-hub');
    if (!hub?.dataset.tip) return;
    delete hub.dataset.tip;
    hub.style.removeProperty('left');
    hub.style.removeProperty('top');
    updateOrbInfo();
  }

  /** The area a leaf covers: menus open from here. */
  function leafRect(btn) {
    const fan = document.getElementById('asp-orb-fan');
    const i = fan && btn.parentElement === fan ? [...fan.children].indexOf(btn) : -1;
    const p = i >= 0 ? orbGeom?.plan.items[i] : null;
    if (!p) return btn.getBoundingClientRect();
    const { cx, cy } = orbGeom;
    const left = cx + p.box.left;
    const top  = cy + p.box.top;
    return { left, top, right: left + p.box.width, bottom: top + p.box.height, width: p.box.width, height: p.box.height };
  }

  /** The toolbar's box for placing panels: the orb, plus the whole ring while the fan is open. */
  function barBox() {
    const r = document.getElementById('asp-bar')?.getBoundingClientRect();
    if (!r || !orbActive() || !orbGeom || !document.getElementById('asp-bar').classList.contains('asp-orb-open')) return r;
    const b = ringBounds(orbGeom.plan, orbGeom.cx, orbGeom.cy);
    const left = Math.min(b.left, r.left);
    const top = Math.min(b.top, r.top);
    const right = Math.max(b.right, r.right);
    const bottom = Math.max(b.bottom, r.bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function openOrbFan() {
    clearTimeout(orbTimer);
    const bar = document.getElementById('asp-bar');
    if (!orbActive() || !bar || bar.classList.contains('asp-dragging') || isEnvPickerOpen) return;   // the dropdown stands in for the fan
    // A fan that closed while showing the environments starts from the regular leaves again.
    if (orbEnvOpen && !bar.classList.contains('asp-orb-open')) { orbEnvOpen = false; placeItems(); }
    layoutOrbFan();
    bar.classList.add('asp-orb-open');
  }

  /** Swap the fan between the regular leaves and the environments (the Env leaf stays in the middle, marked active). */
  function setOrbEnvs(open) {
    const hadFocus = document.getElementById('asp-orb-fan')?.contains(document.activeElement) ? document.activeElement : null;
    orbEnvOpen = open;
    hideLeafName();
    placeItems();
    if (hadFocus?.isConnected) hadFocus.focus();   // placeItems re-parents the buttons, which drops keyboard focus
  }

  function closeOrbFan() {
    clearTimeout(orbTimer);
    document.getElementById('asp-bar')?.classList.remove('asp-orb-open');
  }

  /** Open / close after a short delay (hover intent). Closing waits while a menu, the env picker or keyboard focus is in the fan. */
  function scheduleOrbFan(open, delay) {
    clearTimeout(orbTimer);
    orbTimer = setTimeout(() => {
      if (open) return openOrbFan();
      const bar = document.getElementById('asp-bar');
      if (document.getElementById('asp-menu') || isEnvPickerOpen || bar?.querySelector(':focus-visible')) return;
      closeOrbFan();
    }, delay);
  }

  /** The Env leaf, the hub caption, the orb's tooltip and its accessible name carry what the full bar's pill and chip show. */
  function updateOrbInfo() {
    const bar  = document.getElementById('asp-bar');
    const logo = document.getElementById('asp-logo-btn');
    if (!bar || !logo) return;
    bar.dataset.status = pageStatus;
    const statusLabel = (STATUS_MAP[pageStatus] || STATUS_MAP.unknown).label;
    const envLabel    = titleCase(document.getElementById('asp-env-chip-label')?.textContent || activeEnv);
    const isProtected = !!envsConfig[activeEnv]?.protected;
    const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };
    set('asp-orb-hub', `${envLabel} · ${statusLabel}`);
    // While the environments are open, the middle leaf is the way back, so it never reads like the active environment
    set('asp-orb-env-lbl', orbEnvOpen ? 'Back' : envLabel);
    document.getElementById('asp-orb-env-ic')?.setAttribute('d', orbEnvOpen ? ICON_BACK : isProtected ? ICON_LOCK : ICON_LAYERS);
    const envBtn = document.getElementById('asp-orb-env-btn');
    envBtn?.setAttribute('aria-label', orbEnvOpen
      ? 'Back to the toolbar buttons'
      : `Environment: ${envLabel}${isProtected ? ' (protected)' : ''}. Switch environment`);
    if (envBtn) envBtn.title = orbEnvOpen ? 'Back' : 'Switch environment';
    if (!orbActive()) {
      logo.title = 'Expand / collapse (⌥⇧K). Drag to move.';
      logo.setAttribute('aria-label', 'Expand or collapse the toolbar');
      return;
    }
    const info = `${envLabel}${isProtected ? ' (protected)' : ''} · ${statusLabel}`;
    logo.title = `${info}\nClick to open the toolbar (⌥⇧K). Drag to move.`;
    logo.setAttribute('aria-label', `Open the toolbar. ${info}`);
  }

  /** Faster orb animation while a publish / replicate action is running. */
  function setOrbBusy(delta) {
    busyCount = Math.max(0, busyCount + delta);
    document.getElementById('asp-bar')?.classList.toggle('asp-orb-busy', busyCount > 0);
  }

  let resizeDebounceTimer = null;
  let resizeSettleFrame = 0;
  /** Re-clamp the toolbar and its panels to the viewport. Runs once, after the window has stopped resizing. */
  function settleAfterResize() {
    applySavedPosition();
    if (document.getElementById('asp-bar')?.classList.contains('asp-orb-open')) layoutOrbFan();
    const insp = document.querySelector('.asp-inspector:not(.asp-float-panel)');
    if (insp) positionInspector();
    document.querySelectorAll('.asp-float-panel').forEach((p) => placeAboveBar(p));
  }

  function onWindowResize() {
    // Dragging the browser edge fires a burst of resize events (some skipped when dragging fast);
    // only measure and clamp once the burst has ended and the layout has settled.
    if (document.getElementById('asp-menu')) closeMenu();
    if (isEnvPickerOpen) closeEnvPicker();
    clearTimeout(resizeDebounceTimer);
    cancelAnimationFrame(resizeSettleFrame);
    resizeDebounceTimer = setTimeout(() => {
      resizeSettleFrame = requestAnimationFrame(settleAfterResize);
    }, 150);
  }

  function bindOrb() {
    const bar = document.getElementById('asp-bar');
    if (!bar) return;
    bar.addEventListener('pointerdown', (e) => { lastPointerTouch = e.pointerType === 'touch'; }, true);
    bar.addEventListener('pointerenter', () => clearTimeout(summonTimer));
    bar.addEventListener('pointerleave', () => armSummonTimer());
    bar.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && orbActive()) scheduleOrbFan(true, ORB_OPEN_DELAY); });
    bar.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && orbActive()) scheduleOrbFan(false, ORB_CLOSE_DELAY); });
    // Keyboard: focusing the orb (or a button in the fan) opens the fan; leaving it closes the fan.
    bar.addEventListener('focusin', (e) => { if (orbActive() && e.target.matches(':focus-visible')) openOrbFan(); });
    bar.addEventListener('focusout', (e) => {
      if (orbActive() && !bar.contains(e.relatedTarget) && !bar.matches(':hover')) scheduleOrbFan(false, ORB_CLOSE_DELAY);
    });
    const fan = document.getElementById('asp-orb-fan');
    const leafOf = (e) => e.target.closest?.('#asp-orb-fan > .asp-btn');
    fan?.addEventListener('pointerover', (e) => { const l = leafOf(e); if (l) showLeafName(l); });
    fan?.addEventListener('pointerout', (e) => { if (leafOf(e)) hideLeafName(); });
    fan?.addEventListener('focusin', (e) => { const l = leafOf(e); if (l && l.matches(':focus-visible')) showLeafName(l); });
    fan?.addEventListener('focusout', (e) => { if (leafOf(e)) hideLeafName(); });
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────
  // Alt/Option+Shift+K : expand / collapse the toolbar
  // Ctrl/Cmd+K         : command palette
  // e.code is used because on macOS Option+Shift+K produces e.key "" (not "K").

  function isEditableTarget() {
    const el = document.activeElement;
    return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && !document.getElementById('asp-dialog')) {
      if (document.getElementById('asp-palette')) { closePalette(); return; }
      if (document.getElementById('asp-menu')) return closeMenu();
      if (isEnvPickerOpen) {
        closeEnvPicker();
        // As an orb the dropdown stands in for the fan, so focus goes back to the orb (and the fan it opens is closed again)
        document.getElementById(orbActive() ? 'asp-logo-btn' : 'asp-env-chip')?.focus();
        if (orbActive()) closeOrbFan();
        return;
      }
      const openPanel = ['asp-inspector', 'asp-audit-panel', 'asp-cache-panel', 'asp-status-panel', 'asp-component-card', 'asp-asset-card']
        .map((id) => document.getElementById(id))
        .find((el) => el && el.style.display !== 'none');
      if (openPanel) {
        if (openPanel.id === 'asp-inspector') closeInspector();
        else openPanel.remove();
        return;
      }
      if (orbEnvOpen) { setOrbEnvs(false); document.getElementById('asp-orb-env-btn')?.focus(); return; }
      if (summoned) return endSummon();
      if (document.getElementById('asp-bar')?.classList.contains('asp-orb-open')) {
        document.getElementById('asp-logo-btn')?.focus();   // focusing the orb opens the fan, so close it afterwards
        closeOrbFan();
        return;
      }
    }
    if (!featureFlags.enableKeyboardShortcut || e.code !== 'KeyK') return;
    if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (isEditableTarget()) return;
      isMinimized = !isMinimized;
      applyMinimized();
    } else if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      if (isEditableTarget() && !document.activeElement.closest('#asp-palette')) return;
      e.preventDefault();
      if (document.getElementById('asp-palette')) closePalette(); else openPalette();
    }
  }

  // ─── Tools menu (modes + developer views) ─────────────────────────────────────

  const MENU_ICONS = {
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    preview: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>',
    cloudPreview: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>',
    publish: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>',
    unpublish: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    live: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>',
    sites: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    crxde: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
    locales: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
    master: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z"/></svg>',
    openTabs: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
    props: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
    dam: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    jcr: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.1-.9-2-2-2zm0 5h-2V5h2v3z"/></svg>',
    search: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    published: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
    overlays: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>',
    highlight: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 4.5c-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5-1.45 0-2.99.22-4.28.79C1.49 5.62 1 6.33 1 7.14v11.28c0 1.3 1.22 2.26 2.48 1.94.98-.26 2.01-.36 3.02-.36 1.56 0 3.22.26 4.56.92.6.3 1.28.3 1.87 0 1.34-.67 3-.92 4.56-.92 1.01 0 2.04.1 3.02.36 1.26.33 2.48-.63 2.48-1.94V7.14c0-.81-.49-1.52-1.22-1.85C18.8 4.72 17.26 4.5 17.5 4.5z"/></svg>',
    reload: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    audit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>',
    cache: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>',
    persona: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  };

  /**
   * Floating menu above a toolbar button (scrolls internally when tall).
   * Items: {label, url, icon} | {label, onClick, icon} | {section} | {separator} | {loading: 'text'}; any item may have
   * `hint` (tooltip), `desc` (one-line explanation shown under the label) and `danger`.
   */
  function openMenu(anchorId, title, items) {
    closeMenu();
    let anchor = document.getElementById(anchorId);
    // Buttons that live in the hidden pool can't anchor a menu: use the More button.
    if (anchor && anchor.offsetParent === null) anchor = document.getElementById('asp-more-btn');
    if (anchor && anchor.offsetParent === null) anchor = document.getElementById('asp-logo-btn'); // bar collapsed
    if (!anchor) return;
    const menu = document.createElement('div');
    menu.id = 'asp-menu';
    menu.className = 'asp-env-picker asp-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', title);
    const head = document.createElement('div');
    head.className   = 'asp-env-picker-label';
    head.textContent = title;
    const listWrap = document.createElement('div');
    listWrap.className = 'asp-menu-items';
    menu.append(head, listWrap);
    // If any row has an icon, rows without one get an empty slot so labels stay aligned.
    const hasIcons = items.some((it) => it.icon);
    items.forEach((it) => {
      if (it.separator) {
        const hr = document.createElement('div');
        hr.className = 'asp-menu-sep';
        hr.setAttribute('role', 'separator');
        listWrap.appendChild(hr);
        return;
      }
      if (it.loading) {
        const row = document.createElement('div');
        row.className = 'asp-menu-loading';
        row.setAttribute('role', 'status');
        row.innerHTML = '<svg class="asp-menu-spinner" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2zm0 20A10 10 0 0 1 2 12h2a8 8 0 0 0 8 8v2z" opacity=".9"/></svg>';
        const txt = document.createElement('span');
        txt.textContent = it.loading;
        row.appendChild(txt);
        listWrap.appendChild(row);
        return;
      }
      if (it.section) {
        const sec = document.createElement('div');
        sec.className   = 'asp-env-picker-label asp-menu-sec';
        sec.textContent = it.section;
        listWrap.appendChild(sec);
        return;
      }
      const b = document.createElement('button');
      b.className = `asp-menu-item${it.danger ? ' asp-menu-danger' : ''}`;
      b.setAttribute('role', 'menuitem');
      if (hasIcons) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'asp-menu-icon';
        if (!it.icon) {
          iconSpan.setAttribute('aria-hidden', 'true');
        } else if (typeof it.icon === 'string' && it.icon.startsWith('<svg')) {
          iconSpan.innerHTML = it.icon;
        } else {
          iconSpan.textContent = it.icon;
        }
        b.appendChild(iconSpan);
      }
      const textWrap = document.createElement('div');
      textWrap.className = 'asp-menu-text';
      const t = document.createElement('span');
      t.className   = 'asp-menu-title';
      t.textContent = it.label;
      textWrap.appendChild(t);
      if (it.desc) {
        const d = document.createElement('span');
        d.className   = 'asp-menu-desc';
        d.textContent = it.desc;
        textWrap.appendChild(d);
      }
      b.appendChild(textWrap);
      if (it.hint) b.title = it.hint;
      b.disabled = !it.url && !it.onClick;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        if (it.onClick) it.onClick();
        else if (it.url) window.open(it.url, '_blank', 'noopener');
      });
      listWrap.appendChild(b);
    });
    // Arrow keys move through the items; Esc closes and returns focus to the button.
    menu.addEventListener('keydown', (e) => {
      const els = [...menu.querySelectorAll('.asp-menu-item:not(:disabled)')];
      const i = els.indexOf(document.activeElement);
      if (e.key === 'ArrowDown')      { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
      else if (e.key === 'Home')      { e.preventDefault(); els[0]?.focus(); }
      else if (e.key === 'End')       { e.preventDefault(); els.at(-1)?.focus(); }
      else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Type-ahead: jump to the next row whose title starts with the typed letter.
        const ch   = e.key.toLowerCase();
        const next = [...els.slice(i + 1), ...els.slice(0, i + 1)]
          .find((el) => el.querySelector('.asp-menu-title')?.textContent.trim().toLowerCase().startsWith(ch));
        if (next) { e.preventDefault(); next.focus(); }
      }
      else if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); closeMenu(); anchor.focus(); }
    });
    menu.style.display = 'flex';
    document.body.appendChild(menu);
    menu._anchor = anchor;
    anchor.setAttribute?.('aria-expanded', 'true');
    anchor.classList.add('asp-btn-on');
    const barRect = barBox();
    const r = orbActive() ? leafRect(anchor) : anchor.getBoundingClientRect();
    // From the orb's fan the menu sits next to the leaf it came from, not the (tiny) orb.
    const refRect = (orbActive() ? r : barRect) || r;
    fitFloatingBox(menu, refRect, { alignLeft: r.left, preferredMaxH: Math.round(window.innerHeight * 0.65) });
    menu.querySelector('.asp-menu-item:not(:disabled)')?.focus({ preventScroll: true });
  }

  function closeMenu() {
    const m = document.getElementById('asp-menu');
    if (!m) return;
    m._anchor?.setAttribute?.('aria-expanded', 'false');
    m._anchor?.classList.remove('asp-btn-on');
    m.remove();
    // The fan stayed open for the menu; let it close once the pointer is gone too.
    const bar = document.getElementById('asp-bar');
    if (orbActive() && bar && !bar.matches(':hover')) scheduleOrbFan(false, ORB_CLOSE_DELAY);
  }

  /** Add/replace a query param on the current URL and navigate. */
  function withParam(name, value) {
    const u = new URL(window.location.href);
    if (value === null) u.searchParams.delete(name); else u.searchParams.set(name, value);
    return u.toString();
  }

  // One name per tier/view, shared by the Tier button, its menu, the Tools menu and the palette.
  const TIER_NAMES = {
    edit: 'Edit',            // Author, /editor.html
    view: 'View',            // Author, wcmmode=disabled (page without the editing UI)
    preview: 'Preview',      // Cloud Preview tier
    published: 'Published',  // Publish tier
    live: 'Live',            // Dispatcher CDN
    author: 'Author',        // any other Author page
  };

  /** Refreshes the toolbar tier chip text (`Edit`/`Preview`/`Published`/`Live`/`Author`). */
  function updateTierLabel() {
    const lbl = document.getElementById('asp-tier-label');
    if (!lbl) return;
    const path = window.location.pathname;
    const search = window.location.search;
    if (path.startsWith('/editor.html')) {
      lbl.textContent = TIER_NAMES.edit;
    } else if (search.includes('wcmmode=disabled')) {
      lbl.textContent = TIER_NAMES.view;
    } else if (pageTier === 'author') {
      lbl.textContent = TIER_NAMES.author;
    } else if (pageTier === 'preview') {
      lbl.textContent = TIER_NAMES.preview;
    } else if (pageTier === 'publish') {
      lbl.textContent = TIER_NAMES.published;
    } else if (pageTier === 'dispatcher') {
      lbl.textContent = TIER_NAMES.live;
    } else {
      lbl.textContent = 'Tier';
    }
  }

  /** Opens the floating tier switcher menu (`Edit`, `Universal Editor`, `View`, `Preview`, `Published`, `Live`). */
  async function openTierMenu() {
    if (document.getElementById('asp-menu')?._anchor?.id === 'asp-tier-btn') return closeMenu();
    if (!jcrPath) return toast('JCR path not available', 'warn');
    const v = await msg('GET_URL_VARIANTS', { jcrPath });
    const items = [
      { label: TIER_NAMES.edit, icon: MENU_ICONS.edit, url: v.authorEditUrl, hint: 'Edit page in AEM touch-optimized editor' },
      { label: 'Universal Editor', icon: MENU_ICONS.edit, url: v.universalEditorUrl, hint: 'Open this page in the Universal Editor (needs an https Author host)' },
      { label: TIER_NAMES.view, icon: MENU_ICONS.preview, url: v.authorDisabledUrl, hint: 'View the page without the editing UI (Author, wcmmode=disabled)' },
      { label: TIER_NAMES.preview, icon: MENU_ICONS.cloudPreview, url: v.previewUrl, hint: 'Open page on AEM Cloud Preview tier' },
      { label: TIER_NAMES.published, icon: MENU_ICONS.published, url: v.publishUrl, hint: 'Open page on AEM Publish tier' },
      { label: TIER_NAMES.live, icon: MENU_ICONS.live, url: v.dispatcherUrl, hint: 'Open live production site via Dispatcher CDN' },
    ].filter((it) => it.url);

    // Edge Delivery Services page (*.aem.page / *.aem.live): one click between its preview and live tier.
    const eds = getEdsVariants(window.location.href);
    if (eds) {
      const other = eds.tier === 'preview'
        ? { label: 'EDS Live', url: eds.liveUrl, hint: 'Same page on the Edge Delivery live tier (.aem.live)' }
        : { label: 'EDS Preview', url: eds.previewUrl, hint: 'Same page on the Edge Delivery preview tier (.aem.page)' };
      items.unshift(other, { separator: true });
    }

    openMenu('asp-tier-btn', 'Switch Tier / View', items);
  }

  /** Opens the Developer Tools dropdown menu (CRXDE, PackMgr, JSON endpoints, debug flags). */
  async function openToolsMenu() {
    if (document.getElementById('asp-menu')?._anchor?.id === 'asp-tools-btn') return closeMenu();
    if (!jcrPath) return toast('JCR path not available', 'warn');
    const v = await msg('GET_URL_VARIANTS', { jcrPath });
    const here = window.location;
    const hereParams = new URLSearchParams(here.search);
    const hasDebugParams = ['debug', 'nocache', 'wcmmode', 'debugClientLibs'].some((p) => hereParams.has(p));
    const inEditor = here.pathname.startsWith('/editor.html');
    const onAuthor = pageTier === 'author';
    const nav = (url) => () => { window.location.href = url; };

    // CRX Package Manager URL (same base as CRXDE)
    const packMgrUrl = v.crxdeUrl ? v.crxdeUrl.replace(/\/crx\/de\/.*/, '/crx/packmgr/index.jsp') : '';
    openMenu('asp-tools-btn', 'Developer links', [
      { label: 'Open in CRXDE Lite',            url: v.crxdeUrl },
      { label: 'Open CRX Package Manager',      url: packMgrUrl,
        hint: 'Opens /crx/packmgr/index.jsp on the Author host' },
      { separator: true },
      { label: 'Sling Model JSON (.model.json)', url: v.modelJsonUrl },
      { label: 'JCR content JSON (.infinity.json)', url: v.jcrJsonUrl },
      { label: 'Debug client libraries',        url: v.debugClientLibsUrl,
        hint: 'Loads clientlibs un-minified and un-concatenated' },
      { separator: true },
      { label: 'Layout debug on this page (?debug=layout)',
        onClick: (onAuthor && !inEditor) ? nav(withParam('debug', 'layout')) : null,
        hint: 'Author only, outside the editor' },
      { label: 'Bypass cache on this page (?nocache=…)',
        onClick: !onAuthor ? nav(withParam('nocache', Date.now().toString(36))) : null,
        hint: 'Adds a unique query string so dispatcher/CDN serve a fresh copy' },
      { label: 'Clear debug params',
        onClick: hasDebugParams
          ? nav((() => { const u = new URL(here.href); ['debug', 'nocache', 'wcmmode', 'debugClientLibs'].forEach((p) => u.searchParams.delete(p)); return u.toString(); })())
          : null },
      { separator: true },
      { label: 'SEO & accessibility check',      onClick: runAudit },
      { label: 'Cache & dispatcher headers',     onClick: showCacheHeaders,
        hint: 'Most useful on publish / dispatcher / CDN URLs' },
    ]);
  }

  // ─── More menu (everything that is not a daily action) ──────────────────────

  const clickPool = (id) => () => document.getElementById(id)?.click();

  /** Builds and opens the overflow/More menu adapted to the active persona and policy. */
  function openMoreMenu() {
    if (document.getElementById('asp-menu')?._anchor?.id === 'asp-more-btn') return closeMenu();
    const items = [
      { section: `This page · ${PERSONA_DEFS[personaState.persona]?.label || 'Custom'}` },
      { label: 'Page properties', icon: MENU_ICONS.props, desc: 'Open the AEM properties dialog for this page', onClick: async () => {
        if (!jcrPath) return toast('JCR path not available', 'warn');
        const { propertiesUrl } = await msg('GET_URL_VARIANTS', { jcrPath });
        if (!propertiesUrl) return toast('Author host not configured', 'warn');
        window.open(propertiesUrl, '_blank', 'noopener');
      } },
      { label: 'Inspect an image or asset', icon: MENU_ICONS.dam, desc: 'Hover an image on the page, then click to see its DAM details', onClick: clickPool('asp-dam-btn') },
      ...(jcrPath && jcrPath.startsWith('/content/dam/') ? [
        { label: 'Asset / Content Fragment details', icon: MENU_ICONS.dam, desc: 'Metadata, and for a Content Fragment its model, variations and headless JSON', onClick: () => showAssetCard(jcrPath) },
      ] : []),
      { label: 'Copy page URL', icon: MENU_ICONS.copy, desc: 'Copy the address of this page to the clipboard', onClick: async () => {
        await copyToClipboard(window.location.href.split('#')[0]);
        toast('✓ URL copied', 'success');
      } },
    ];

    const qaRows = [];
    if (isPersonaToolEnabled(personaState, 'audit')) {
      qaRows.push({ label: 'SEO & accessibility check', desc: 'Title, headings, alt text, ARIA & broken links', icon: MENU_ICONS.audit, onClick: runAudit });
    }
    if (isPersonaToolEnabled(personaState, 'cache')) {
      qaRows.push({ label: 'Cache & dispatcher headers', desc: 'Inspect CDN X-Cache, Age & Cache-Control headers', icon: MENU_ICONS.cache, onClick: showCacheHeaders });
    }
    if (personaState.persona === 'qa') {
      if (isPersonaToolEnabled(personaState, 'highlight')) {
        qaRows.push({ label: 'Highlight components', desc: 'Outline every editable component', icon: MENU_ICONS.highlight, onClick: clickPool('asp-highlight-btn') });
      }
      if (isPersonaToolEnabled(personaState, 'reload')) {
        qaRows.push({ label: 'Hard reload', desc: 'Reload this page and skip the browser cache', icon: MENU_ICONS.reload, onClick: clickPool('asp-reload-btn') });
      }
    }
    if (qaRows.length) {
      items.push({ section: 'QA verification' }, ...qaRows);
    }

    if (devMode.enabled) {
      const dev = [
        ['overlays',  'asp-overlay-btn',   'Show / hide overlays', 'Toggle the AEM editor overlays', MENU_ICONS.overlays],
        ['highlight', 'asp-highlight-btn', 'Highlight components', 'Outline every editable component', MENU_ICONS.highlight],
        ['tools',     'asp-tools-btn',     'Developer links',      'CRXDE, JSON views, SEO check, cache headers…', MENU_ICONS.crxde],
        ['reload',    'asp-reload-btn',    'Hard reload',          'Reload this page and skip the browser cache', MENU_ICONS.reload],
      ].filter(([k]) => devMode.buttons[k] !== false);
      if (dev.length) {
        items.push({ section: 'Developer' });
        dev.forEach(([, id, label, desc, icon]) => items.push({ label, desc, icon, onClick: clickPool(id) }));
      }
      if (devMode.buttons.delete !== false && allowed('delete')) {
        items.push({ separator: true });
        items.push({ label: 'Delete page…', icon: MENU_ICONS.unpublish, desc: 'Permanently remove this page (asks you to confirm)', danger: true, onClick: clickPool('asp-delete-btn') });
      }
    }
    // Buttons the user took off the expanded bar still live here, so nothing is lost.
    const moved = overflowItems(toolbarLayout).filter(layoutItemVisible);
    if (moved.length) {
      items.push({ section: 'Removed from the toolbar' });
      moved.forEach((i) => items.push({
        label: i.label,
        icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="${i.icon}"/></svg>`,
        onClick: () => document.getElementById(i.elId)?.click(),
      }));
    }
    if (!lockConfig && personaState.allowedPersonas?.length > 1) {
      items.push({ section: 'Workspace Persona' });
      personaState.allowedPersonas.forEach((p) => {
        const def = PERSONA_DEFS[p];
        const active = personaState.persona === p;
        items.push({
          label: `${active ? '✓ ' : ''}${def.label}`,
          desc: def.summary,
          icon: MENU_ICONS.persona,
          onClick: async () => {
            const res = await msg('SET_PERSONA', { persona: p });
            if (res.ok) toast(`✓ Switched to ${def.label} persona`, 'success');
            else toast(`✗ ${res.error}`, 'error');
          },
        });
      });
    }
    items.push({ separator: true });
    items.push({ label: 'Search all commands', icon: MENU_ICONS.search, desc: `Type to find any action (${isMac ? '⌘' : 'Ctrl'}+K)`, onClick: openPalette });
    openMenu('asp-more-btn', 'More actions', items);
  }

  function openPublishMenu() {
    if (document.getElementById('asp-menu')?._anchor?.id === 'asp-publish-menu-btn') return closeMenu();
    const items = [];
    if (allowed('publish')) {
      items.push({ label: 'Publish page', icon: MENU_ICONS.publish, desc: 'Make this page live on the Publish tier', onClick: clickPool('asp-publish-btn') });
    }
    if (envsConfig[activeEnv]?.previewHost && allowed('publishPreview')) {
      items.push({ label: 'Publish to Preview', icon: MENU_ICONS.cloudPreview, desc: 'Send this page to the Preview tier only', onClick: clickPool('asp-publish-preview-btn') });
    }
    if (allowed('unpublish')) {
      if (items.length) items.push({ separator: true });
      items.push({ label: 'Unpublish page', icon: MENU_ICONS.unpublish, desc: 'Remove this page from the Publish tier', danger: true, onClick: clickPool('asp-unpublish-btn') });
    }
    if (!items.length) return toast('Publishing is turned off by your administrator.', 'warn');
    openMenu('asp-publish-menu-btn', 'Publish', items);
  }

  // ─── Page details panel (opened from the status pill) ────────────────────────

  function toggleStatusPanel() {
    if (document.getElementById('asp-status-panel')) return document.getElementById('asp-status-panel').remove();
    const { panel, body } = showFloatingPanel('asp-status-panel', 'Page details');
    body.replaceChildren();
    const row = (k, v, cls) => {
      const r = el('div', 'asp-cc-row');
      const val = el('span', `asp-cc-val${cls ? ` ${cls}` : ''}`, v);
      r.append(el('span', 'asp-cc-key', k), val);
      body.appendChild(r);
    };
    const when = (d, by) => `${new Date(d).toLocaleString()}${by ? ` by ${by}` : ''}`;
    const r = statusData;
    const label = (STATUS_MAP[pageStatus] || STATUS_MAP.unknown).label;
    row('Status', jcrPath ? `${label} on ${activeEnv.toUpperCase()}` : 'No page path found on this URL');
    if (r) {
      if (r.title)        row('Title', r.title);
      if (r.lastModified) row('Last changed', when(r.lastModified, r.lastModifiedBy));
      if (r.lastReplicated && r.status !== 'draft') row('Last published', when(r.lastReplicated, r.lastReplicatedBy));
      if (r.previewStatus) row('Preview tier', (STATUS_MAP[r.previewStatus] || STATUS_MAP.unknown).label);
      if (r.lockOwner)    row('Locked by', r.lockOwner);
      if (r.onTime)       row('Goes live', new Date(r.onTime).toLocaleString());
      if (r.offTime)      row('Goes offline', new Date(r.offTime).toLocaleString());
      if (r.isLiveCopy)   row('Live copy', 'This page follows another page (Multi Site Manager)');
    }
    if (jcrPath) row('Path', jcrPath);
    const note = el('div', 'asp-cc-hint', r ? 'Updates each time you publish, unpublish or switch environment.' : 'Status could not be loaded. Check that you are signed in to AEM.');
    body.appendChild(note);
    placeAboveBar(panel);
  }

  // ─── Busy state: disable a button while its action runs ─────────────────────

  // Publish actions live in the hidden pool; mirror their busy state onto the visible Publish button.
  const PUBLISH_POOL_IDS = ['asp-publish-btn', 'asp-unpublish-btn', 'asp-publish-preview-btn'];
  // While one of them runs, the visible button says what is happening
  const PUBLISH_BUSY_LABEL = {
    'asp-publish-btn':         'Publishing…',
    'asp-unpublish-btn':       'Unpublishing…',
    'asp-publish-preview-btn': 'Publishing…',
  };

  async function withBusy(id, fn) {
    const b = document.getElementById(id);
    if (b?.classList.contains('asp-busy')) return;
    const targets = [b];
    const menuBtn = PUBLISH_POOL_IDS.includes(id) ? document.getElementById('asp-publish-menu-btn') : null;
    if (menuBtn) targets.push(menuBtn);
    const menuLbl = menuBtn?.querySelector('.asp-lbl');
    targets.forEach((t) => { t?.classList.add('asp-busy'); t?.setAttribute('aria-busy', 'true'); });
    setOrbBusy(1);
    if (menuLbl) menuLbl.textContent = PUBLISH_BUSY_LABEL[id];
    try { return await fn(); } finally {
      targets.forEach((t) => { t?.classList.remove('asp-busy'); t?.removeAttribute('aria-busy'); });
      setOrbBusy(-1);
      if (menuLbl) menuLbl.textContent = 'Publish';
    }
  }

  // ─── Remember the toolbar's position (per site); every page starts collapsed (regular bar or orb) ──────────────

  const STATE_KEY = `asp-ui:${window.location.origin}`;

  function loadUiState() {
    return compatStorageGet('local', { [STATE_KEY]: {} }).then((r) => r?.[STATE_KEY] || {}).catch(() => ({}));
  }
  function saveUiState(patch) {
    loadUiState().then((cur) => {
      compatStorageSet('local', { [STATE_KEY]: { ...cur, ...patch } }).catch(() => {});
    });
  }

  function applySavedPosition() {
    const root = document.getElementById('aem-sidekick-pro-root');
    const pos = summoned ? summonPos : savedPos;
    if (!root) return;
    if (!pos) {
      root.style.left = '';
      root.style.bottom = '';
      return;
    }
    const half = (root.offsetWidth || 0) / 2;
    const targetCx = (typeof pos.xRatio === 'number' && window.innerWidth > 0)
      ? pos.xRatio * window.innerWidth
      : pos.cx;
    const cx = Math.max(half + 8, Math.min(targetCx, window.innerWidth - half - 8));
    const bottom = Math.max(8, Math.min(pos.bottom, window.innerHeight - 56));
    root.style.left   = `${cx}px`;
    root.style.bottom = `${bottom}px`;
  }

  /** Drag the toolbar by its logo button; a click without movement still toggles it. */
  function enableDragging() {
    const logo = document.getElementById('asp-logo-btn');
    const root = document.getElementById('aem-sidekick-pro-root');
    const bar  = document.getElementById('asp-bar');
    if (!logo || !root || !bar) return;
    logo.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX, startY = e.clientY;
      const rect = root.getBoundingClientRect();
      const startCx = rect.left + rect.width / 2;
      const startBottom = window.innerHeight - rect.bottom;
      let moved = false;
      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) { moved = true; bar.classList.add('asp-dragging'); closeOrbFan(); closeMenu(); closeEnvPicker(); }
        const half = rect.width / 2;
        const cx = Math.max(half + 8, Math.min(startCx + dx, window.innerWidth - half - 8));
        const bottom = Math.max(8, Math.min(startBottom - dy, window.innerHeight - 56));
        const xRatio = window.innerWidth > 0 ? (cx / window.innerWidth) : 0.5;
        root.style.left = `${cx}px`;
        root.style.bottom = `${bottom}px`;
        if (summoned) summonPos = { cx, bottom, xRatio }; else savedPos = { cx, bottom, xRatio };
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        bar.classList.remove('asp-dragging');
        if (moved) {
          if (!summoned) saveUiState({ pos: savedPos });
          logo._justDragged = true;               // swallow the click that follows a drag
          setTimeout(() => { logo._justDragged = false; }, 0);
        }
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    });
    // Double-click the logo to put the toolbar back in the centre.
    logo.addEventListener('dblclick', () => {
      savedPos = null;
      root.style.left = '';
      root.style.bottom = '';
      saveUiState({ pos: null });
      toast('Toolbar moved back to the centre', 'info');
    });
  }

  // ─── Summon the orb at the pointer (opt-in, orb mode) ─────────────────────────
  // Press and hold on the page: the orb opens where the pointer is. Nothing is saved; Esc or a click elsewhere puts it back.

  const SUMMON_HOLD_MS = 600;
  const SUMMON_AWAY_MS = 3000;  // pointer outside the orb and its fan this long: it goes back to its saved spot
  const SUMMON_SLOP    = 6;   // px the pointer may drift during the hold
  const SUMMON_SKIP    = 'a,button,input,textarea,select,summary,label,video,audio,[contenteditable],[role="button"]';
  const summonBound    = new WeakSet();
  let summonCleanups   = [];

  const toSummonPos = (cx, bottom) => ({ cx, bottom, xRatio: window.innerWidth > 0 ? cx / window.innerWidth : 0.5 });

  function summonAt(x, y) {
    const logo = document.getElementById('asp-logo-btn');
    if (!logo || !orbMode) return;
    closeMenu();
    // From the expanded toolbar: collapse it into the orb; endSummon() expands it again at its previous spot.
    if (!isMinimized) {
      summonedFromExpanded = true;
      isMinimized = true;
      applyMinimized();
    }
    summoned = true;
    summonPos = toSummonPos(x, window.innerHeight - y);
    applySavedPosition();
    // Aim the orb's centre (not the bar's bottom edge) at the pointer: measure it once placed, then correct
    const r = logo.getBoundingClientRect();
    summonPos = toSummonPos(
      summonPos.cx + (x - (r.left + r.width / 2)),
      summonPos.bottom + ((r.top + r.height / 2) - y),
    );
    applySavedPosition();
    openOrbFan();
    armSummonTimer();
  }

  /** Start (or restart) the countdown once the pointer is off the orb. It waits while a menu, the picker, a dialog or an action is open. */
  function armSummonTimer() {
    clearTimeout(summonTimer);
    if (!summoned) return;
    summonTimer = setTimeout(() => {
      const busy = document.getElementById('asp-menu') || document.getElementById('asp-dialog') || isEnvPickerOpen || busyCount > 0
        || document.getElementById('asp-bar')?.matches(':hover');
      if (busy) return armSummonTimer();
      endSummon();
    }, SUMMON_AWAY_MS);
  }

  function endSummon() {
    clearTimeout(summonTimer);
    if (!summoned) return;
    summoned = false;
    summonPos = null;
    closeOrbFan();
    hideLeafName();
    const root = document.getElementById('aem-sidekick-pro-root');
    if (root) { root.style.left = ''; root.style.bottom = ''; }
    if (summonedFromExpanded) {
      summonedFromExpanded = false;
      if (isMinimized) { isMinimized = false; applyMinimized(); return; }   // applyMinimized() restores the saved position
    }
    applySavedPosition();
  }

  function bindSummon(doc, frame) {
    if (summonBound.has(doc)) return;
    summonBound.add(doc);
    let timer = null, sx = 0, sy = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const onDown = (e) => {
      cancel();
      if (!orbMode || e.button !== 0 || !e.isPrimary || e.pointerType === 'touch') return;
      if (e.target.closest?.(SUMMON_SKIP) || e.target.closest?.(OWN_UI)) return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        const o = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
        swallowClick = true;
        summonAt(o.left + sx, o.top + sy);
      }, SUMMON_HOLD_MS);
    };
    const onMove = (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > SUMMON_SLOP) cancel(); };
    const onUp = () => { cancel(); if (swallowClick) setTimeout(() => { swallowClick = false; }, 50); };
    const onClick = (e) => {
      if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
      if (summoned && !e.target.closest?.(OWN_UI)) endSummon();
    };
    const onKey = (e) => { if (e.key === 'Escape') endSummon(); };   // keys typed inside the editor frame never reach the top document
    const on = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', cancel],
                ['dragstart', cancel], ['contextmenu', cancel], ['click', onClick]];
    if (frame) on.push(['keydown', onKey]);
    on.forEach(([t, f]) => doc.addEventListener(t, f, true));
    summonCleanups.push(() => { on.forEach(([t, f]) => doc.removeEventListener(t, f, true)); summonBound.delete(doc); });
  }

  function unbindSummon() {
    summonCleanups.forEach((f) => f());
    summonCleanups = [];
    clearTimeout(summonTimer);
    summoned = false;
    summonedFromExpanded = false;
    summonPos = null;
    swallowClick = false;
  }

  /** The page and, in the AEM editor, the same-origin frame the page lives in. */
  function bindSummonAll() {
    unbindSummon();
    if (!featureFlags.summonOnLongPress || !orbMode) return;
    bindSummon(document, null);
    const frame = document.getElementById('ContentFrame');
    if (!frame) return;
    const attach = () => { try { if (frame.contentDocument) bindSummon(frame.contentDocument, frame); } catch { /* cross-origin frame */ } };
    attach();
    frame.addEventListener('load', attach);
    summonCleanups.push(() => frame.removeEventListener('load', attach));
  }

  // ─── Overlays (shared by the toolbar button and the popup) ───────────────────

  const OVERLAY_SELECTOR = '.cq-Overlay,[data-layer="Edit"] .cq-Overlay,.cq-editrollover-insert-container,.cq-droptarget';

  /** @returns {{found:boolean, hidden?:boolean}} */
  function toggleOverlays() {
    const overlays = document.querySelectorAll(OVERLAY_SELECTOR);
    if (!overlays.length) return { found: false };
    const hidden = overlays[0].style.visibility !== 'hidden';
    overlays.forEach((el) => { el.style.visibility = hidden ? 'hidden' : ''; });
    return { found: true, hidden };
  }

  // ─── Floating panels (audit, cache headers) ──────────────────────────────────

  const NET_TIMEOUT_MS = 15000;
  const LINK_CHECK_MAX = 25;
  const LINK_CHECK_CONCURRENCY = 5;

  /** Positions a floating panel relative to the toolbar bounds safely inside the viewport. */
  function placeAboveBar(panel) {
    const bar = barBox();
    if (!bar) return;
    fitFloatingBox(panel, bar, { preferredMaxH: 460 });
  }

  /** Create a floating panel with the inspector look. Returns its body element. */
  function showFloatingPanel(id, title) {
    document.getElementById(id)?.remove();
    const panel = document.createElement('div');
    panel.id = id;
    panel.className = 'asp-inspector asp-float-panel';
    const header = document.createElement('div');
    header.className = 'asp-inspector-header';
    const t = document.createElement('span');
    t.className = 'asp-inspector-header-left';
    t.textContent = title;
    const close = document.createElement('button');
    close.className = 'asp-icon-btn';
    close.textContent = '✕';
    close.addEventListener('click', () => panel.remove());
    header.append(t, close);
    const body = document.createElement('div');
    body.className = 'asp-inspector-table-wrap asp-float-body';
    body.textContent = 'Loading…';
    panel.append(header, body);
    document.body.appendChild(panel);
    placeAboveBar(panel);
    return { panel, body };
  }

  /** Creates a DOM element with optional CSS class and `textContent`. */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ─── SEO + accessibility quick check ─────────────────────────────────────────

  /** In the page editor the page itself lives in the (same-origin) ContentFrame. */
  function pageDocument() {
    try { return document.getElementById('ContentFrame')?.contentDocument || document; } catch { return document; }
  }

  const OWN_UI = '#aem-sidekick-pro-root,#asp-inspector,#asp-menu,#asp-toast,.asp-float-panel,#asp-component-card,#asp-palette,#asp-env-picker,#asp-highlight-labels';

  /** Probes a same-origin URL via HEAD (falling back to GET on 405) to detect broken links. */
  async function linkStatus(url) {
    try {
      let r = await fetch(url, { method: 'HEAD', credentials: 'same-origin', signal: createTimeoutSignal(NET_TIMEOUT_MS).signal });
      if (r.status === 405) r = await fetch(url, { credentials: 'same-origin', signal: createTimeoutSignal(NET_TIMEOUT_MS).signal });
      return r.status;
    } catch { return 0; } // timeout / network — not reported as broken
  }

  /** Collects SEO, heading, image, ARIA, duplicate-ID, and internal-link facts from the live page DOM. */
  async function collectAuditFacts() {
    const d    = pageDocument();
    const own  = (e) => !e.closest(OWN_UI);
    const all  = (sel) => [...d.querySelectorAll(sel)].filter(own);
    const meta = (sel) => d.querySelector(sel)?.getAttribute('content') || '';
    const og   = {};
    d.querySelectorAll('meta[property^="og:"]').forEach((m) => { og[m.getAttribute('property')] = m.getAttribute('content') || ''; });

    const hasName = (e) => !!((e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim()
      || e.getAttribute('aria-labelledby')
      || [...e.querySelectorAll('img[alt]')].some((i) => i.alt.trim()));
    const hasLabel = (e) => !!(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title')
      || e.closest('label') || (e.id && d.querySelector(`label[for="${CSS.escape(e.id)}"]`)));

    const docLoc = d.location || window.location;
    const here = docLoc.href.split('#')[0];
    const internal = [...new Set(all('a[href]').map((a) => {
      try {
        const u = new URL(a.href, docLoc.href);
        u.hash = '';
        return u.origin === docLoc.origin && /^https?:$/.test(u.protocol) ? u.href : null;
      } catch { return null; }
    }).filter((u) => u && u !== here))].slice(0, LINK_CHECK_MAX);

    const brokenLinks = [];
    for (let i = 0; i < internal.length; i += LINK_CHECK_CONCURRENCY) {
      const batch = internal.slice(i, i + LINK_CHECK_CONCURRENCY);
      const codes = await Promise.all(batch.map(linkStatus));
      codes.forEach((status, j) => { if (status >= 400) brokenLinks.push({ href: batch[j], status }); });
    }

    const idCounts = new Map();
    all('[id]').forEach((node) => { if (node.id) idCounts.set(node.id, (idCounts.get(node.id) || 0) + 1); });
    const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    const imgs = all('img');
    const imgsBroken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src || '(inline)');
    const imgsNoDimensions = imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length;

    return {
      title:          d.title || '',
      description:    meta('meta[name="description"]'),
      canonical:      d.querySelector('link[rel="canonical"]')?.href || '',
      robots:         meta('meta[name="robots"]'),
      lang:           d.documentElement.getAttribute('lang') || '',
      viewport:       !!d.querySelector('meta[name="viewport"]'),
      hreflang:       [...d.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')),
      og,
      headings:       all('h1,h2,h3,h4,h5,h6').map((h) => Number(h.tagName[1])),
      imgsMissingAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.currentSrc || i.src || '(inline)'),
      linksNoText:    all('a[href]').filter((a) => !hasName(a)).length,
      buttonsNoName:  all('button,[role="button"]').filter((b) => !hasName(b)).length,
      inputsNoLabel:  all('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),select,textarea')
        .filter((i) => !hasLabel(i)).length,
      brokenLinks,
      linksChecked:   internal.length,
      duplicateIds,
      imgsBroken,
      imgsNoDimensions,
    };
  }

  const AUDIT_ICON = { pass: '✓', warn: '!', fail: '✗', info: 'i' };

  /** Runs an on-page SEO & accessibility audit and renders scored results with JSON copy/export. */
  async function runAudit() {
    const { panel, body } = showFloatingPanel('asp-audit-panel', 'SEO & Accessibility');
    body.textContent = `Checking page and up to ${LINK_CHECK_MAX} internal links…`;
    const facts  = await collectAuditFacts();
    const result = await msg('EVALUATE_AUDIT', { facts });
    if (!result.ok) { body.textContent = `Error: ${result.error}`; return; }

    body.replaceChildren();
    const topRow = el('div', 'asp-audit-top');
    const score = el('div', 'asp-audit-score', `Score ${result.score}/100`);
    score.dataset.level = result.score >= 85 ? 'good' : result.score >= 60 ? 'ok' : 'bad';
    const actions = el('div', 'asp-audit-actions');
    const copyBtn = el('button', 'asp-inspector-btn', 'Copy JSON');
    copyBtn.addEventListener('click', async () => {
      await copyToClipboard(JSON.stringify({ url: window.location.href, jcrPath, ...result }, null, 2));
      toast('✓ Audit JSON copied', 'success');
    });
    const dlBtn = el('button', 'asp-inspector-btn', 'Export JSON');
    dlBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ url: window.location.href, jcrPath, ...result }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `aem-orbit-audit-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    actions.append(copyBtn, dlBtn);
    topRow.append(score, actions);
    body.appendChild(topRow);
    let group = '';
    result.checks.forEach((c) => {
      if (c.group !== group) body.appendChild(el('div', 'asp-audit-group', (group = c.group)));
      const row = el('div', `asp-audit-row asp-audit-${c.status}`);
      row.append(el('span', 'asp-audit-icon', AUDIT_ICON[c.status] || ''), el('span', 'asp-audit-msg', c.message));
      body.appendChild(row);
      (c.details || []).forEach((d) => body.appendChild(el('div', 'asp-audit-detail', d)));
    });
    placeAboveBar(panel);
  }

  // ─── Cache / dispatcher headers ──────────────────────────────────────────────

  const CACHE_HEADER_RE = /^(age|cache-control|surrogate-control|cdn-cache-control|expires|etag|last-modified|vary|via|server|content-type|content-encoding|strict-transport-security|x-.*)$/i;

  /** Fetches and displays CDN/dispatcher cache headers for the current rendered page. */
  async function showCacheHeaders() {
    const { panel, body } = showFloatingPanel('asp-cache-panel', 'Cache & Dispatcher Headers');
    const rawUrl = window.location.href.split('#')[0];
    const url = (window.location.pathname.startsWith('/editor.html') && jcrPath)
      ? `${window.location.origin}${jcrPath}.html?wcmmode=disabled`
      : rawUrl;
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: createTimeoutSignal(NET_TIMEOUT_MS).signal });
      if (res.status === 405) res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: createTimeoutSignal(NET_TIMEOUT_MS).signal });
    } catch {
      body.textContent = 'Request failed or timed out.';
      return;
    }
    const headers = [...res.headers.entries()].filter(([k]) => CACHE_HEADER_RE.test(k)).sort(([a], [b]) => a.localeCompare(b));

    // Plain-language verdict
    const h = (k) => res.headers.get(k) || '';
    const xc = `${h('x-cache')} ${h('x-cache-status')} ${h('cf-cache-status')}`.toUpperCase();
    let verdict;
    if (/HIT/.test(xc) || Number(h('age')) > 0) verdict = `Served from CDN cache${h('age') ? ` (age ${h('age')}s)` : ''}.`;
    else if (/MISS|PASS/.test(xc)) verdict = 'CDN cache miss — fetched from origin.';
    else verdict = 'No CDN cache indicators in the response.';
    if (/no-store|private/i.test(h('cache-control'))) verdict += ' Response is not cacheable (Cache-Control).';
    if (pageTier === 'author') verdict += ' Note: Author URL inspected — CDN headers apply primarily on Publish/Preview/Dispatcher.';

    body.replaceChildren(
      el('div', 'asp-cc-hint', `URL: ${url}`),
      el('div', 'asp-cc-hint', `HTTP ${res.status} · ${verdict}`),
    );
    if (!headers.length) body.appendChild(el('div', 'asp-cc-hint', 'No cache-related headers exposed.'));
    headers.forEach(([k, v]) => {
      const row = el('div', 'asp-cc-row');
      row.append(el('span', 'asp-cc-key', k), el('span', 'asp-cc-val', v));
      row.lastChild.title = v;
      body.appendChild(row);
    });
    placeAboveBar(panel);
  }

  // ─── DAM asset inspector (hover + click on any image/asset element) ───────────

  /**
   * Resolve a DAM asset JCR path from any element on the page.
   *
   * Strategy (in priority order):
   *  1. data-asset-path / data-asset / data-src — explicit AEM asset attributes
   *  2. fileReference on nearest ancestor with that attribute (AEM Core Components)
   *  3. The element's own src / currentSrc (for <img>, <video>, <source>)
   *     — strips query strings, selectors and extensions, checks it starts with /content/dam/
   *  4. background-image url() on the element or its nearest styled ancestor
   *  5. Nearest ancestor <a> whose href points to /content/dam/
   */
  function findDamAsset(target) {
    let node = target;
    while (node && node !== document.body && node.nodeType === 1) {
      // 1. Explicit AEM attributes
      for (const attr of ['data-asset-path', 'data-asset', 'data-src', 'data-lazy-src']) {
        const v = node.getAttribute(attr);
        if (v && v.includes('/content/dam/')) return damPathFrom(v);
      }
      // 2. fileReference (Core Components image, teaser, …)
      const fileRef = node.getAttribute('data-cmp-filereference')
        || node.getAttribute('fileReference')
        || node.getAttribute('data-filereference');
      if (fileRef && fileRef.startsWith('/content/dam/')) return damPathFrom(fileRef);

      // 3. src / currentSrc
      if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'SOURCE') {
        const src = node.currentSrc || node.getAttribute('src') || '';
        const p = damPathFrom(src);
        if (p) return p;
      }

      // 4. background-image on this element
      try {
        const bg = window.getComputedStyle(node).backgroundImage;
        if (bg && bg !== 'none') {
          const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (m) { const p = damPathFrom(m[1]); if (p) return p; }
        }
      } catch { /* cross-origin frames — skip */ }

      // 5. Ancestor link to /content/dam/
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        const p = damPathFrom(href);
        if (p) return p;
      }

      node = node.parentElement;
    }
    return null;
  }

  /**
   * Extract a clean /content/dam/… JCR path from any URL or path string.
   * Strips: query strings, host+scheme prefixes, AEM rendition suffixes
   * (/jcr:content/renditions/…) and Sling selectors that follow the asset's own
   * file extension (/a/b.png.thumb.319.319.png → /a/b.png). The extension is part
   * of a DAM asset's JCR node name, so it is kept.
   */
  function damPathFrom(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let s = raw;
    // Strip scheme+host
    try { s = new URL(raw, window.location.href).pathname; } catch { /* keep raw */ }
    try { s = decodeURIComponent(s); } catch { /* keep encoded */ }
    // Strip /jcr:content or _jcr_content subtrees (renditions etc.)
    s = s.replace(/\/(jcr:content|_jcr_content).*$/, '');
    // Drop selectors after the asset's own extension
    s = s.replace(/(\.(?:jpe?g|png|gif|webp|avif|svg|bmp|tiff?|ico|pdf|mp4|webm|mov|mp3|wav|docx?|xlsx?|pptx?|zip|json|txt|csv))\..*$/i, '$1');
    // Must start with /content/dam/
    return s.startsWith('/content/dam/') ? s : null;
  }

  // ── DAM inspect mode state ──────────────────────────────────────────────────

  let isDamInspecting = false;
  let _damHoverEl = null;
  let _damHoverPath = null;

  const OWN_PANELS = '#aem-sidekick-pro-root,#asp-inspector,#asp-component-card,#asp-asset-card,#asp-menu,.asp-float-panel,#asp-palette';

  function setDamHoverOutline(targetEl, found) {
    let box = document.getElementById('asp-dam-inspect-box');
    if (!targetEl) { box?.remove(); _damHoverEl = null; _damHoverPath = null; return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'asp-dam-inspect-box';
      document.body.appendChild(box);
    }
    const r = targetEl.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${r.top}px`, left: `${r.left}px`,
      width: `${r.width}px`, height: `${r.height}px`,
      outlineColor: found ? '#f1c21b' : 'rgba(241,194,27,0.3)',
    });
  }

  function onDamMove(e) {
    if (e.target.closest(OWN_PANELS)) return;
    const assetPath = findDamAsset(e.target);
    _damHoverEl   = assetPath ? e.target : null;
    _damHoverPath = assetPath;
    setDamHoverOutline(_damHoverEl, !!assetPath);
  }

  async function onDamClick(e) {
    if (e.target.closest(OWN_PANELS)) return;
    e.preventDefault();
    e.stopPropagation();
    const assetPath = _damHoverPath || findDamAsset(e.target);
    stopDamInspecting();
    if (!assetPath) return toast('No DAM asset found here', 'warn');
    await showAssetCard(assetPath);
  }

  function onDamKey(e) { if (e.key === 'Escape') stopDamInspecting(); }

  function startDamInspecting() {
    isDamInspecting = true;
    document.getElementById('asp-dam-btn')?.classList.add('asp-btn-on');
    document.addEventListener('mousemove', onDamMove, true);
    document.addEventListener('click', onDamClick, true);
    document.addEventListener('keydown', onDamKey, true);
    toast('Hover an image or asset, then click (Esc to cancel)', 'info', 3500);
  }

  function stopDamInspecting() {
    isDamInspecting = false;
    _damHoverEl = null;
    _damHoverPath = null;
    setDamHoverOutline(null);
    document.getElementById('asp-dam-btn')?.classList.remove('asp-btn-on');
    document.removeEventListener('mousemove', onDamMove, true);
    document.removeEventListener('click', onDamClick, true);
    document.removeEventListener('keydown', onDamKey, true);
  }

  // ── Asset card (shown after clicking an asset in inspect mode) ──────────────

  const DAM_META_PROPS = [
    ['dc:title',             'Title'],
    ['dc:description',       'Description'],
    ['dc:format',            'MIME Type'],
    ['dam:size',             'File Size'],
    ['tiff:ImageWidth',      'Width (px)'],
    ['tiff:ImageLength',     'Height (px)'],
    ['dam:assetLastModified','Last Modified'],
    ['xmp:CreatorTool',      'Creator Tool'],
    ['dam:sha1',             'SHA-1'],
  ];

  async function showAssetCard(assetPath) {
    document.getElementById('asp-asset-card')?.remove();

    // Build the card immediately with a loading state so the user gets instant feedback
    const card = document.createElement('div');
    card.id = 'asp-asset-card';
    card.className = 'asp-inspector asp-component-card';

    const header = document.createElement('div');
    header.className = 'asp-inspector-header';
    const titleEl = document.createElement('div');
    titleEl.className = 'asp-inspector-header-left';
    titleEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;
    titleEl.appendChild(document.createTextNode(' DAM Asset'));
    const closeBtn = document.createElement('button');
    closeBtn.className = 'asp-icon-btn';
    closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    closeBtn.addEventListener('click', () => card.remove());
    header.append(titleEl, closeBtn);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'asp-inspector-table-wrap asp-float-body';
    body.textContent = 'Loading…';
    card.appendChild(body);

    document.body.appendChild(card);
    positionCard(card);

    // Fetch metadata, editor URL, and publication status in parallel
    const [metaResult, urlResult, statusResult, cfResult] = await Promise.all([
      msg('GET_DAM_ASSET_METADATA',     { assetPath }),
      msg('GET_DAM_EDITOR_URL',         { assetPath }),
      msg('GET_PAGE_STATUS',            { jcrPath: assetPath }),
      msg('GET_CONTENT_FRAGMENT_INFO',  { jcrPath: assetPath }),
    ]);

    body.replaceChildren();

    const row = (label, value, actions = []) => {
      const r = el('div', 'asp-cc-row');
      r.append(el('span', 'asp-cc-key', label), el('span', 'asp-cc-val', value || '—'));
      actions.forEach(({ text, fn }) => {
        const b = el('button', 'asp-inspector-btn', text);
        b.addEventListener('click', fn);
        r.appendChild(b);
      });
      return r;
    };
    const copy = (v) => async () => { await navigator.clipboard.writeText(v); toast('✓ Copied', 'success'); };
    const openUrl = (u) => () => window.open(u, '_blank', 'noopener');

    // "Open in Asset Editor" as the first action row
    if (urlResult.ok && urlResult.url) {
      const openRow = el('div', 'asp-cc-row');
      const lbl = el('span', 'asp-cc-key', 'Asset Editor');
      const btn = el('button', 'asp-inspector-btn', '⤴ Open');
      btn.title = urlResult.url;
      btn.addEventListener('click', openUrl(urlResult.url));
      openRow.append(lbl, btn);
      body.appendChild(openRow);
    }

    // JCR path row always shown
    body.appendChild(row('JCR Path', assetPath, [
      { text: 'Copy', fn: copy(assetPath) },
      ...(urlResult.ok && urlResult.url
        ? [{ text: 'CRXDE', fn: openUrl(urlResult.url.replace('/assetdetails.html', '/crx/de/index.jsp#')) }]
        : []),
    ]));

    if (statusResult.ok) {
      body.appendChild(row('Status', statusResult.status || 'unknown', [
        ...(allowed('publish') ? [{
          text: 'Publish',
          fn: async () => {
            toast('Publishing asset…', 'info');
            const r = await msg('PUBLISH_PAGE', { jcrPath: assetPath });
            if (r.ok) toast('✓ Asset published', 'success');
            else failToast({ msg, toast }, `✗ Asset publish failed: ${r.error}`, r);
          },
        }] : []),
        ...(allowed('unpublish') ? [{
          text: 'Unpublish',
          fn: async () => {
            toast('Unpublishing asset…', 'info');
            const r = await msg('UNPUBLISH_PAGE', { jcrPath: assetPath });
            if (r.ok) toast('✓ Asset unpublished', 'success');
            else failToast({ msg, toast }, `✗ Asset unpublish failed: ${r.error}`, r);
          },
        }] : []),
      ]));
    }

    // Content Fragment: the model it is built on, its variations and the headless (Assets API) JSON.
    if (cfResult.ok && cfResult.isContentFragment) {
      titleEl.lastChild.textContent = ' Content Fragment';
      body.appendChild(row('Model', cfResult.modelName || cfResult.model, cfResult.model ? [{ text: 'Copy', fn: copy(cfResult.model) }] : []));
      body.appendChild(row('Variations', ['master', ...cfResult.variations].join(', ')));
      if (urlResult.ok && urlResult.url) {
        try {
          const apiUrl = `${new URL(urlResult.url).origin}/api/assets/${assetPath.replace(/^\/content\/dam\//, '').split('/').map(encodeURIComponent).join('/')}.json`;
          body.appendChild(row('Headless JSON', '/api/assets/…', [
            { text: 'Open', fn: openUrl(apiUrl) },
            { text: 'Copy', fn: copy(apiUrl) },
          ]));
        } catch { /* no usable author origin — skip the headless link */ }
      }
    }

    if (!metaResult.ok) {
      body.appendChild(el('div', 'asp-cc-hint', `Metadata unavailable: ${metaResult.error}`));
    } else {
      const m = metaResult.data || {};
      DAM_META_PROPS.forEach(([prop, label]) => {
        const val = m[prop];
        if (val === undefined || val === '') return;
        const display = prop === 'dam:size' ? `${Math.round(Number(val) / 1024)} KB` : String(val);
        body.appendChild(row(label, display, [{ text: 'Copy', fn: copy(display) }]));
      });
      const tags = [].concat(m['cq:tags'] || []);
      if (tags.length) body.appendChild(row('Tags', tags.join(', ')));
    }

    if (!metaResult.ok || Object.keys(metaResult.data || {}).length === 0) {
      const hint = el('div', 'asp-cc-hint', 'No metadata node found — asset may not be processed yet, or the JCR path could not be resolved.');
      body.appendChild(hint);
    }

    positionCard(card);
  }

  function positionCard(card) {
    const bar = barBox() || document.getElementById('asp-bar')?.getBoundingClientRect();
    if (!bar) return;
    fitFloatingBox(card, bar, { preferredMaxH: 460 });
  }

  // ─── Globalized URLs (hreflang / locales) ────────────────────────────────────

  /**
   * Collect locale URLs from hreflang link elements on the current page.
   * Falls back to generating locale variants from the JCR path when the page
   * has no hreflang tags (e.g. outside the editor frame).
   */
  function collectLocaleUrls() {
    const d = pageDocument();
    const links = [...d.querySelectorAll('link[rel="alternate"][hreflang]')];
    if (links.length) {
      return links.map((l) => ({
        locale: l.getAttribute('hreflang') || '?',
        url:    localeUrl(l.getAttribute('href'), d),
      })).filter((e) => e.url && e.locale !== 'x-default');
    }
    return [];
  }

  /**
   * Resolve an hreflang href to an http(s) URL. Some AEM sites emit it without a
   * scheme ("host:4502/content/…"), which the browser would read as a "host:"
   * scheme; those get the page's protocol.
   */
  function localeUrl(href, d) {
    const raw = (href || '').trim();
    if (!raw) return '';
    const absolute = /^https?:\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('.');
    const candidate = absolute ? raw : `${d.location.protocol}//${raw}`;
    try {
      const u = new URL(candidate, d.baseURI);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch { return ''; }
  }

  /** How the current page is shown: Author editor, Author view (no editing UI), Publish, Preview or Live. */
  function currentViewMode() {
    return {
      tier:        pageTier,
      inEditor:    window.location.pathname.startsWith('/editor.html'),
      wcmDisabled: window.location.search.includes('wcmmode=disabled'),
    };
  }

  /** Open the same page on another JCR path, in the same tier / view mode we are in now. */
  async function switchToPath(targetPath) {
    const v = await msg('GET_URL_VARIANTS', { jcrPath: targetPath });
    const { tier, inEditor, wcmDisabled } = currentViewMode();
    const target = sameTierUrl(v, tier, inEditor, wcmDisabled) || v.authorEditUrl || v.publishUrl || v.liveUrl;
    if (!target) return toast('No host configured for that page', 'warn');
    window.location.href = target;
  }

  /** Menu rows for the Locales menu. `msm` is null while the live-copy lookup is still running. */
  function localeMenuItems(here, msm, locales) {
    const items = [];
    if (here) {
      if (!msm) {
        items.push({ loading: 'Finding live copies…' });
      } else {
        const master = (msm.targets || []).filter((t) => t.role === 'master');
        const copies = (msm.targets || []).filter((t) => t.role === 'livecopy');
        master.forEach((t) => items.push({
          label: `Switch to Language Master (${t.lang.toUpperCase()})`,
          icon: MENU_ICONS.master,
          hint: t.path,
          onClick: () => switchToPath(t.path),
        }));
        if (copies.length) {
          if (items.length) items.push({ separator: true });
          items.push({ section: here.kind === 'master' ? 'Switch to Live Copy' : 'Switch to Another Live Copy' });
          copies.forEach((t) => items.push({
            label: `${t.region.toUpperCase()} / ${t.lang.toUpperCase()}`,
            icon: MENU_ICONS.locales,
            hint: t.path,
            onClick: () => switchToPath(t.path),
          }));
        } else if (msm.ok && !master.length) {
          items.push({ section: 'No other live copies of this page' });
        }
      }
    }

    if (locales.length) {
      if (items.length) items.push({ separator: true });
      items.push({ section: `Page Locales (${locales.length})` });
      locales.forEach((e) => items.push({ label: e.locale.toUpperCase(), icon: MENU_ICONS.locales, url: e.url, hint: e.url }));
      items.push({ separator: true });
      items.push({
        label: 'Open All Locales in Tabs',
        icon: MENU_ICONS.openTabs,
        desc: `Open all ${locales.length} country / language variants at once`,
        onClick: () => {
          locales.forEach((l) => window.open(l.url, '_blank', 'noopener'));
          toast(`Opened ${locales.length} locale tabs`, 'success');
        },
      });
    }
    return items;
  }

  async function openLocalesMenu() {
    if (document.getElementById('asp-menu')?._anchor?.id === 'asp-locales-btn') return closeMenu();
    const locales = collectLocaleUrls();
    const here = jcrPath ? parseMsmPath(jcrPath) : null;
    if (!here && !locales.length) return toast('No locale or live copy links found for this page', 'warn');

    // Show the menu straight away; the lookups can take seconds on a large site.
    openMenu('asp-locales-btn', 'Locales', [{ loading: 'Loading locales…' }]);
    const menuEl = document.getElementById('asp-menu');

    // Page locales open in the tier / view we are in (edit stays edit, view stays view)
    const resolveUrls = locales.length
      ? msg('RESOLVE_LOCALE_URLS', { urls: locales.map((l) => l.url), ...currentViewMode() })
      : Promise.resolve(null);
    const msmLookup = here ? msg('GET_MSM_TARGETS', { jcrPath }) : Promise.resolve(null);
    const [r, result] = await Promise.all([resolveUrls, msmLookup]);
    if (document.getElementById('asp-menu') !== menuEl) return; // closed (or replaced) meanwhile

    if (r?.ok && r.urls?.length === locales.length) locales.forEach((l, i) => { l.url = r.urls[i] || l.url; });
    const items = localeMenuItems(here, result || { ok: false, targets: [] }, locales);
    if (!items.length) { closeMenu(); return toast('No locale or live copy links found for this page', 'warn'); }
    openMenu('asp-locales-btn', 'Locales', items);
  }

  // ─── Content sync (copy this page between environments) ──────────────────────

  /**
   * Copy the current page from srcEnv to tgtEnv. If the page (or parents) is
   * missing on the target, the user is told and it is created on confirmation.
   */
  async function syncPage(srcEnv, tgtEnv) {
    const S = srcEnv.toUpperCase();
    const T = tgtEnv.toUpperCase();
    toast(`Checking ${T}…`, 'info');
    const plan = await msg('GET_SYNC_PLAN', { env: tgtEnv, sourceEnv: srcEnv, jcrPath });
    if (!plan.ok) return failToast({ msg, toast }, `✗ Sync failed: ${plan.error}`, plan, 5000);

    // What will change on the target, so the confirmation is an informed one.
    // The diff runs target → source: "+" is added to the target, "−" is removed from it.
    let changes = '';
    if (plan.exists) {
      const d = await msg('DIFF_ENVS', { env: srcEnv, otherEnv: tgtEnv, jcrPath });
      if (d.ok && d.baseExists && d.otherExists) {
        if (!d.total) return toast(`${T} already matches ${S}. Nothing to copy`, 'info', 4000);
        const sign = { added: '+', removed: '−', changed: '~' };
        const lines = d.changes.slice(0, 6).map((c) => `${sign[c.kind]} ${c.path}`);
        changes = `\n\n${d.total} difference(s):\n${lines.join('\n')}${d.total > lines.length ? `\n…and ${d.total - lines.length} more` : ''}\n`;
      }
    }

    const label = plan.exists
      ? `Copy this page from ${S} to ${T}.\nIt overwrites the page content on ${T}, after saving the current one as a version. It is NOT published automatically${changes}`
      : `This page does not exist on ${T}.\nCopy it from ${S} to ${T}`
        + (plan.missingParents.length ? ` — ${plan.missingParents.length} missing parent page(s) will be created first:\n${plan.missingParents.join('\n')}\n` : ' and create it there.\n')
        + 'It is NOT published automatically';
    const confirmText = await confirmDestructive(label, jcrPath, {
      env: tgtEnv, isProtected: !!envsConfig[tgtEnv]?.protected, always: true, tone: 'warn',
    });
    if (confirmText === null) return;

    toast(`Copying ${S} → ${T}…`, 'info');
    const r = await msg('SYNC_CONTENT_PAGE', { env: tgtEnv, sourceEnv: srcEnv, jcrPath, confirmText, createMissing: !plan.exists });
    if (!r.ok) return failToast({ msg, toast }, `✗ Sync failed: ${r.error}`, r, 5000);

    if (r.backup) {
      // Undo restores the stored copy, or the "before-sync-from-…" AEM version when the copy was too large to keep.
      toast(`✓ Page copied ${S} → ${T}. ${r.undo ? 'Previous content saved' : 'Previous version saved in AEM'}`, 'success', 12000, [{
        label: 'Undo',
        onClick: async () => {
          toast(`Restoring ${T}…`, 'info');
          const u = await msg('UNDO_SYNC', { env: tgtEnv, jcrPath, confirmText });
          if (!u.ok) return failToast({ msg, toast }, `✗ Undo failed: ${u.error}`, u, 5000);
          toast(`✓ ${T} restored to how it was before the sync`, 'success', 4000);
          if (tgtEnv === activeEnv) await refreshStatus();
        },
      }]);
    }
    else toast(`✓ Page copied ${S} → ${T}${r.created?.length ? ' (created)' : ''}`, 'success', 3500);
    if (tgtEnv === activeEnv) {
      // A page that did not exist here was a 404 — show the new page.
      if (!plan.exists && pageTier === 'author') setTimeout(() => window.location.reload(), 1500);
      else await refreshStatus();
    }
  }

  async function openSyncMenu() {
    if (document.getElementById('asp-menu')?._anchor?.id === 'asp-sync-btn') return closeMenu();
    if (!jcrPath) return toast('JCR path not available', 'warn');

    const config  = await msg('GET_CONFIG');
    const envKeys = (config.envOrder || Object.keys(config.environments || {}))
      .filter((k) => k !== activeEnv && config.environments?.[k]?.authorHost);

    if (!envKeys.length) {
      return toast('No other configured environments to sync with', 'warn');
    }

    // Safety setting: by default content only flows from a higher environment to a lower one.
    const order    = config.envOrder || Object.keys(config.environments || {});
    const upward   = config.allowUpwardSync === true;
    const pullFrom = envKeys.filter((env) => isSyncAllowed(order, env, activeEnv, upward));
    const pushTo   = envKeys.filter((env) => isSyncAllowed(order, activeEnv, env, upward));

    const A = activeEnv.toUpperCase();
    const items = [
      ...pullFrom.map((env) => ({
        label: `← Pull from ${env.toUpperCase()}`,
        hint:  `Copy ${jcrPath} from ${env} into ${activeEnv}; creates the page if it is missing (does not publish)`,
        onClick: () => syncPage(env, activeEnv),
      })),
      ...(pullFrom.length && pushTo.length ? [{ separator: true }] : []),
      ...pushTo.map((env) => ({
        label: `→ Push to ${env.toUpperCase()}`,
        hint:  `Copy ${jcrPath} from ${activeEnv} to ${env}; creates the page if it is missing (does not publish)`,
        onClick: () => syncPage(activeEnv, env),
      })),
    ];
    if (!items.length) {
      return toast('No sync direction is allowed for this environment. See Settings → Safety.', 'warn', 4000);
    }
    openMenu('asp-sync-btn', `Sync this page — ${A}`, items);
  }

  // ─── Apply developer mode button visibility ───────────────────────────────────

  function applyDevMode() {
    const devBtns = {
      'asp-jcr-btn':     'jcr',
      'asp-overlay-btn': 'overlays',
      'asp-highlight-btn': 'highlight',
      'asp-inspect-btn': 'inspect',
      'asp-tools-btn':   'tools',
      'asp-reload-btn':  'reload',
      'asp-delete-btn':  'delete',
      'asp-sync-btn':    'sync',
    };
    Object.entries(devBtns).forEach(([id, key]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const visible = devMode.enabled && devMode.buttons[key] !== false && (key !== 'delete' && key !== 'sync' || allowed(key));
      btn.style.display = visible ? '' : 'none';
    });
  }

  /**
   * Admin policy: hide the controls this environment's policy switches off. Runs on load and
   * whenever the tab's target environment changes, since the policy can differ per environment.
   */
  function applyControlPolicy() {
    applyDevMode();
    updatePreviewButton();
    [['asp-publish-btn', 'publish'], ['asp-unpublish-btn', 'unpublish']].forEach(([id, control]) => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = allowed(control) ? '' : 'none';
    });
    placeItems();
  }

  // ─── Lock / versions (also available in the popup) ────────────────────────────

  async function toggleLock() {
    if (!jcrPath) return toast('JCR path not available', 'warn');
    const unlock = !!statusData?.lockOwner;
    const r = await msg(unlock ? 'UNLOCK_PAGE' : 'LOCK_PAGE', { jcrPath });
    if (r.ok) { toast(unlock ? '✓ Page unlocked' : '✓ Page locked', 'success'); refreshStatus(); }
    else failToast({ msg, toast }, `✗ ${r.error}`, r);
  }

  async function saveVersion() {
    if (!jcrPath) return toast('JCR path not available', 'warn');
    const label = await ui.prompt({
      title: 'Save version', message: 'Save the current state of this page as a new version.', detail: jcrPath,
      confirmLabel: 'Save', input: { label: 'Version label (optional)', placeholder: 'e.g. before-launch' },
    });
    if (label === null) return; // cancelled
    toast('Creating version…', 'info');
    const r = await msg('CREATE_VERSION', { jcrPath, label });
    if (r.ok) toast('✓ Version saved', 'success');
    else failToast({ msg, toast }, `✗ ${r.error}`, r);
  }

  // ─── Command palette ─────────────────────────────────────────────────────────

  function paletteCommands() {
    const btn = (id, label) => ({
      label,
      available: () => { const b = document.getElementById(id); return !!b && b.style.display !== 'none'; },
      run: () => document.getElementById(id)?.click(),
    });
    const openVariant = (label, key) => ({
      label,
      available: () => !!jcrPath,
      run: async () => {
        const v = await msg('GET_URL_VARIANTS', { jcrPath });
        if (v[key]) window.open(v[key], '_blank', 'noopener'); else toast('Not configured for this environment', 'warn');
      },
    });
    const envs = [...document.querySelectorAll('.asp-env-pick-btn')].map((b) => ({
      label: `Switch environment: ${b.textContent.trim()}`,
      available: () => b.dataset.env !== activeEnv,
      run: () => b.click(),
    }));
    const personaCmds = !lockConfig && personaState.allowedPersonas?.length > 1
      ? personaState.allowedPersonas.map((p) => ({
        label: `Switch persona: ${PERSONA_DEFS[p].label}`,
        available: () => personaState.persona !== p,
        run: async () => {
          const r = await msg('SET_PERSONA', { persona: p });
          if (r.ok) toast(`✓ Switched to ${PERSONA_DEFS[p].label} persona`, 'success');
          else toast(`✗ ${r.error}`, 'error');
        },
      }))
      : [];
    const devToolsOk = isPersonaToolEnabled(personaState, 'tools') || isPersonaToolEnabled(personaState, 'jcr');
    const devVariant = (label, key) => ({
      ...openVariant(label, key),
      available: () => !!jcrPath && devToolsOk,
    });
    const locked = !!statusData?.lockOwner;
    return [
      openVariant(`${TIER_NAMES.edit} page`, 'authorEditUrl'),
      openVariant('Open in Universal Editor', 'universalEditorUrl'),
      openVariant(`${TIER_NAMES.view} page (no editing UI)`, 'authorDisabledUrl'),
      openVariant(`Open ${TIER_NAMES.preview}`, 'previewUrl'),
      openVariant(`Open ${TIER_NAMES.published}`, 'publishUrl'),
      openVariant(`Open ${TIER_NAMES.live}`, 'dispatcherUrl'),
      openVariant('Page properties', 'propertiesUrl'),
      openVariant('Open in Sites console', 'sitesConsoleUrl'),
      { label: 'Tier switcher', keywords: 'author preview publish live edit', available: () => !!jcrPath, run: openTierMenu },
      { label: 'Locales & MSM live copies', keywords: 'hreflang language master', available: () => !!jcrPath, run: openLocalesMenu },
      { label: 'Publish page', available: () => personaState.showReplication && allowed('publish'), run: clickPool('asp-publish-btn') },
      { label: 'Unpublish page', available: () => personaState.showReplication && allowed('unpublish'), run: clickPool('asp-unpublish-btn') },
      { label: 'Publish to Preview tier', available: () => personaState.showReplication && !!envsConfig[activeEnv]?.previewHost && allowed('publishPreview'), run: clickPool('asp-publish-preview-btn') },
      { label: 'Sync content between environments', keywords: 'copy diff merge', available: () => isPersonaToolEnabled(personaState, 'sync') && allowed('sync'), run: openSyncMenu },
      { label: 'JCR inspector', keywords: 'properties node tree', available: () => isPersonaToolEnabled(personaState, 'jcr'), run: clickPool('asp-jcr-btn') },
      { label: 'Toggle editor overlays', available: () => isPersonaToolEnabled(personaState, 'overlays'), run: clickPool('asp-overlay-btn') },
      { label: 'Highlight components', available: () => isPersonaToolEnabled(personaState, 'highlight'), run: clickPool('asp-highlight-btn') },
      { label: 'Component inspector', available: () => isPersonaToolEnabled(personaState, 'inspect'), run: clickPool('asp-inspect-btn') },
      { label: 'Asset inspector (hover an asset)', keywords: 'dam metadata', available: () => true, run: clickPool('asp-dam-btn') },
      { label: 'Hard reload (bypass cache)', available: () => isPersonaToolEnabled(personaState, 'reload'), run: clickPool('asp-reload-btn') },
      { label: 'Copy JCR path', available: () => !!jcrPath, run: clickPool('asp-copy-btn') },
      { label: 'Copy page URL', available: () => true, run: async () => { await copyToClipboard(window.location.href.split('#')[0]); toast('✓ URL copied', 'success'); } },
      { label: 'Page details & status', keywords: 'info last modified lock', available: () => true, run: toggleStatusPanel },
      devVariant('Open in CRXDE Lite', 'crxdeUrl'),
      { label: 'Open CRX Package Manager', available: () => !!jcrPath && devToolsOk, run: async () => {
        const v = await msg('GET_URL_VARIANTS', { jcrPath });
        const u = v.crxdeUrl ? v.crxdeUrl.replace(/\/crx\/de\/.*/, '/crx/packmgr/index.jsp') : '';
        if (u) window.open(u, '_blank', 'noopener');
      } },
      devVariant('Sling Model JSON', 'modelJsonUrl'),
      devVariant('JCR content JSON', 'jcrJsonUrl'),
      devVariant('Debug client libraries', 'debugClientLibsUrl'),
      { label: locked ? 'Unlock page' : 'Lock page', available: () => !!jcrPath && allowed('lock'), run: toggleLock },
      { label: 'Save a version of this page', available: () => !!jcrPath && allowed('saveVersion'), run: saveVersion },
      { label: 'SEO & accessibility audit', keywords: 'check a11y headings images wcag', available: () => personaState.persona === 'custom' || isPersonaToolEnabled(personaState, 'audit'), run: runAudit },
      { label: 'Cache & dispatcher headers', keywords: 'cdn age x-cache via', available: () => personaState.persona === 'custom' || isPersonaToolEnabled(personaState, 'cache'), run: showCacheHeaders },
      ...envs,
      ...personaCmds,
      btn('asp-options-btn', 'Open options'),
      { label: 'Delete page…', available: () => isPersonaToolEnabled(personaState, 'delete') && allowed('delete'), run: clickPool('asp-delete-btn') },
    ].filter((c) => c.available());
  }

  function closePalette() { document.getElementById('asp-palette')?.remove(); }

  /** Opens the floating Command Palette (`Cmd/Ctrl+K`) with fuzzy keyword filtering. */
  function openPalette() {
    closePalette();
    closeMenu();
    const commands = paletteCommands();
    const wrap  = el('div');
    wrap.id = 'asp-palette';
    const box   = el('div', 'asp-palette-box');
    const input = el('input', 'asp-inspector-search-input');
    input.type = 'text';
    input.placeholder = 'Type a command…';
    input.setAttribute('autocomplete', 'off');
    const listEl = el('div', 'asp-palette-list');
    box.append(input, listEl);
    wrap.appendChild(box);
    document.body.appendChild(wrap);

    let shown = commands;
    let sel = 0;
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const rank = (c) => {
        if (!q) return 0;
        const lbl = c.label.toLowerCase();
        if (lbl.startsWith(q)) return 0;
        if (terms.every((t) => lbl.includes(t))) return 1;
        return 2;
      };
      shown = commands
        .filter((c) => {
          const hay = `${c.label} ${c.keywords || ''}`.toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
        .sort((a, b) => rank(a) - rank(b));
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      listEl.replaceChildren(...(shown.length ? shown.map((c, i) => {
        const item = el('button', `asp-menu-item${i === sel ? ' asp-palette-sel' : ''}`, c.label);
        item.addEventListener('click', () => exec(i));
        return item;
      }) : [el('div', 'asp-cc-hint', 'No matching command')]));
      listEl.querySelector('.asp-palette-sel')?.scrollIntoView({ block: 'nearest' });
    };
    const exec = (i) => { const c = shown[i]; closePalette(); if (c) c.run(); };

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      e.stopPropagation(); // keep page shortcuts (e.g. AEM editor) from reacting
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closePalette(); });
    render();
    input.focus();
  }

  // Popup → content script (Toggle Overlays, Audit facts, QA Audit, Cache headers).
  getExtApi()?.runtime?.onMessage?.addListener((m, sender, sendResponse) => {
    const myId = getExtApi()?.runtime?.id;
    if (myId && sender?.id !== myId) return false;
    if (m?.action === 'TOGGLE_OVERLAYS') { sendResponse({ ok: true, ...toggleOverlays() }); return false; }
    if (m?.action === 'COLLECT_AUDIT_FACTS') {
      collectAuditFacts().then((facts) => sendResponse({ ok: true, facts })).catch((e) => sendResponse({ ok: false, error: e?.message || 'Failed' }));
      return true;
    }
    if (m?.action === 'RUN_AUDIT') { runAudit(); sendResponse({ ok: true }); return false; }
    if (m?.action === 'SHOW_CACHE_HEADERS') { showCacheHeaders(); sendResponse({ ok: true }); return false; }
    return false;
  });

  // ─── Component inspector ─────────────────────────────────────────────────────

  let isInspecting = false;
  let _inspectHover = null;

  /**
   * Find the AEM component wrapping an element. In the page editor the content
   * lives in the ContentFrame; the editor wraps components in
   * <cq data-path data-config> siblings, and Core Components carry data-cmp-is.
   * Returns {path, type, el} with whatever could be found.
   */
  function findComponent(el) {
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      // Editor placeholders: <cq data-path="…" data-config='{"type":…}'> follows the component
      const cq = node.nextElementSibling?.tagName === 'CQ' ? node.nextElementSibling : null;
      if (cq?.dataset.path) {
        let type = '';
        try { type = JSON.parse(cq.dataset.config || '{}').type || ''; } catch { /* ignore */ }
        return { path: cq.dataset.path, type, el: node };
      }
      if (node.dataset?.path && node.dataset.path.startsWith('/content/')) {
        return { path: node.dataset.path, type: node.dataset.resourcetype || node.dataset.type || '', el: node };
      }
      if (node.hasAttribute?.('data-cmp-is')) {
        return { path: '', type: node.getAttribute('data-cmp-is'), el: node, cmpName: true };
      }
      node = node.parentElement;
    }
    return null;
  }

  function setHoverOutline(el) {
    let box = document.getElementById('asp-inspect-box');
    if (!el) { box?.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'asp-inspect-box';
      document.body.appendChild(box);
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  function onInspectMove(e) {
    if (e.target.closest('#aem-sidekick-pro-root,#asp-inspector,#asp-component-card,#asp-menu,.asp-float-panel,#asp-palette')) return;
    const comp = findComponent(e.target);
    _inspectHover = comp;
    setHoverOutline(comp?.el || null);
  }

  async function onInspectClick(e) {
    if (e.target.closest('#aem-sidekick-pro-root,#asp-inspector,#asp-component-card,#asp-menu,.asp-float-panel,#asp-palette')) return;
    e.preventDefault();
    e.stopPropagation();
    const comp = _inspectHover || findComponent(e.target);
    stopInspecting();
    if (!comp) return toast('No AEM component found here', 'warn');
    await showComponentCard(comp);
  }

  function onInspectKey(e) { if (e.key === 'Escape') stopInspecting(); }

  function startInspecting() {
    isInspecting = true;
    document.getElementById('asp-inspect-btn')?.classList.add('asp-btn-on');
    document.addEventListener('mousemove', onInspectMove, true);
    document.addEventListener('click', onInspectClick, true);
    document.addEventListener('keydown', onInspectKey, true);
    toast('Click a component (Esc to cancel)', 'info');
  }

  function stopInspecting() {
    isInspecting = false;
    _inspectHover = null;
    setHoverOutline(null);
    document.getElementById('asp-inspect-btn')?.classList.remove('asp-btn-on');
    document.removeEventListener('mousemove', onInspectMove, true);
    document.removeEventListener('click', onInspectClick, true);
    document.removeEventListener('keydown', onInspectKey, true);
  }

  async function showComponentCard(comp) {
    document.getElementById('asp-component-card')?.remove();
    const [urls, pol] = await Promise.all([
      msg('GET_COMPONENT_URLS', { resourcePath: comp.path, resourceType: comp.type }),
      msg('GET_COMPONENT_POLICY', { pagePath: jcrPath, resourceType: comp.type, componentPath: comp.path }),
    ]);

    const card = document.createElement('div');
    card.id = 'asp-component-card';
    card.className = 'asp-inspector asp-component-card';

    const row = (label, value, actions = []) => {
      const r = document.createElement('div');
      r.className = 'asp-cc-row';
      const k = document.createElement('span');
      k.className = 'asp-cc-key';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'asp-cc-val';
      v.textContent = value || '—';
      r.append(k, v);
      actions.forEach(({ text, fn }) => {
        const b = document.createElement('button');
        b.className = 'asp-inspector-btn';
        b.textContent = text;
        b.addEventListener('click', fn);
        r.appendChild(b);
      });
      return r;
    };
    const copy = (val) => async () => { await copyToClipboard(val); toast('✓ Copied', 'success'); };
    const open = (url) => () => window.open(url, '_blank', 'noopener');

    const header = document.createElement('div');
    header.className = 'asp-inspector-header';
    const title = document.createElement('span');
    title.className = 'asp-inspector-header-left';
    title.textContent = 'Component';
    const close = document.createElement('button');
    close.className = 'asp-icon-btn';
    close.textContent = '✕';
    close.addEventListener('click', () => card.remove());
    header.append(title, close);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'asp-inspector-table-wrap asp-float-body';
    card.appendChild(body);

    body.appendChild(row(comp.cmpName ? 'Component' : 'Resource type', comp.type,
      [
        ...(comp.type ? [{ text: 'Copy', fn: copy(comp.type) }] : []),
        ...(urls.crxdeTypeUrl && !comp.cmpName ? [{ text: 'CRXDE', fn: open(urls.crxdeTypeUrl) }] : []),
      ]));
    body.appendChild(row('Resource path', comp.path,
      comp.path ? [
        { text: 'Copy', fn: copy(comp.path) },
        ...(urls.crxdeNodeUrl ? [{ text: 'CRXDE', fn: open(urls.crxdeNodeUrl) }] : []),
      ] : []));
    if (comp.path) {
      const origin = window.location.origin;
      const modelUrl = `${origin}${comp.path}.model.json`;
      const jcrJsonUrl = `${origin}${comp.path}.infinity.json`;
      body.appendChild(row('JSON endpoints', '.model.json / .infinity.json', [
        { text: 'Model', fn: open(modelUrl) },
        { text: 'Infinity', fn: open(jcrJsonUrl) },
        { text: 'Copy .model', fn: copy(modelUrl) },
      ]));
    }
    if (pol?.ok) {
      if (pol.template) {
        body.appendChild(row('Template', pol.template, [{ text: 'Copy', fn: copy(pol.template) }]));
      }
      if (pol.policyTitle || pol.policyPath) {
        body.appendChild(row('Policy', pol.policyTitle || pol.policyPath, pol.policyPath ? [{ text: 'Copy', fn: copy(pol.policyPath) }] : []));
      }
      if (pol.allowedComponents?.length) {
        body.appendChild(row('Allowed components', `${pol.allowedComponents.length} component(s)`));
      }
    }

    if (!comp.path) {
      const hint = document.createElement('div');
      hint.className = 'asp-cc-hint';
      hint.textContent = 'Resource path is only available in the page editor or with ?wcmmode=edit — AEM omits it on published and wcmmode=disabled pages.';
      body.appendChild(hint);
    }

    document.body.appendChild(card);
    positionCard(card);
  }

  // ─── Status refresh ──────────────────────────────────────────────────────────

  let _recentRecorded = false;
  let loginPrompted   = false;   // the "log in" toast was already shown on this page

  async function refreshStatus() {
    if (!jcrPath) return updateStatus('unknown', null);
    const r = await msg('GET_PAGE_STATUS', { jcrPath });
    if (!r.ok) {
      statusData = null;
      // Signed out of this environment: say so once, with a shortcut to the login page.
      if (r.login && !loginPrompted) { loginPrompted = true; failToast({ msg, toast }, `Not signed in to ${r.login.label}`, r, 8000); }
      return updateStatus('unknown', null);
    }
    statusData = r;
    updateStatus(r.status, r.lastModified);

    // Rich status in the pill tooltip
    const pill = document.getElementById('asp-status-pill');
    if (pill) {
      const lines = [];
      if (featureFlags.showLastModified && r.lastModified) {
        lines.push(`Last modified: ${new Date(r.lastModified).toLocaleString()}${r.lastModifiedBy ? ` by ${r.lastModifiedBy}` : ''}`);
      }
      if (r.lastReplicated && r.status !== 'draft') {
        lines.push(`Published: ${new Date(r.lastReplicated).toLocaleString()}${r.lastReplicatedBy ? ` by ${r.lastReplicatedBy}` : ''}`);
      }
      if (r.lockOwner)  lines.push(`🔒 Locked by ${r.lockOwner}`);
      if (r.onTime)     lines.push(`On time: ${new Date(r.onTime).toLocaleString()}`);
      if (r.offTime)    lines.push(`Off time: ${new Date(r.offTime).toLocaleString()}`);
      if (r.isLiveCopy) lines.push('Live copy');
      pill.title = lines.length ? `${lines.join('\n')}\n\nClick for details` : 'Click for page details';
      if (r.lockOwner) pill.textContent = `🔒 ${pill.textContent}`;
    }

    if (!_recentRecorded && pageTier === 'author') {
      _recentRecorded = true;
      msg('RECORD_RECENT', { jcrPath, title: r.title });
    }
  }

  function updatePreviewButton() {
    const btn = document.getElementById('asp-publish-preview-btn');
    if (btn) btn.style.display = envsConfig[activeEnv]?.previewHost && allowed('publishPreview') ? '' : 'none';
  }

  // ─── Bind all events ──────────────────────────────────────────────────────────

  function bindEvents() {
    document.addEventListener('keydown', handleKeydown);

    // Logo — toggle expand / collapse
    document.getElementById('asp-logo-btn')?.addEventListener('click', (e) => {
      if (e.currentTarget._justDragged) return;
      // Touch has no hover: the first tap on the orb fans the buttons out, the next one opens the toolbar.
      if (orbActive() && lastPointerTouch && !document.getElementById('asp-bar')?.classList.contains('asp-orb-open')) {
        openOrbFan();
        return;
      }
      isMinimized = !isMinimized;
      applyMinimized();
    });
    window.addEventListener('resize', onWindowResize, { passive: true });
    enableDragging();
    bindOrb();

    // More menu
    document.getElementById('asp-more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openMoreMenu();
    });

    // Status pill → page details
    const pill = document.getElementById('asp-status-pill');
    pill?.addEventListener('click', toggleStatusPanel);
    pill?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStatusPanel(); }
    });

    // Visible hint for the command palette
    const hint = document.getElementById('asp-palette-btn');
    if (hint) {
      if (featureFlags.enableKeyboardShortcut) {
        hint.textContent   = isMac ? '⌘K' : 'Ctrl K';
        hint.style.display = '';
      }
      hint.addEventListener('click', openPalette);
    }

    // Env chip — toggle picker
    document.getElementById('asp-env-chip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      isEnvPickerOpen ? closeEnvPicker() : openEnvPicker();
    });
    // Env leaf: opens the environments as leaves around it (up to MAX_ENV_LEAVES), otherwise the dropdown picker
    document.getElementById('asp-orb-env-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const n = document.querySelectorAll('.asp-orb-envopt').length;
      if (n >= 2 && n <= MAX_ENV_LEAVES) return setOrbEnvs(!orbEnvOpen);
      if (isEnvPickerOpen) return closeEnvPicker();
      closeOrbFan();     // the dropdown replaces the leaves
      openEnvPicker();
    });
    // Env picker items — open the SAME page on the chosen environment (same tier).
    // Shift-click instead re-targets toolbar actions at that env without navigating.
    document.querySelectorAll('.asp-env-pick-btn, .asp-orb-envopt').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const env = btn.dataset.env;
        closeEnvPicker();
        if (orbEnvOpen) setOrbEnvs(false);
        const displayLabel = btn.textContent.trim();
        const toastType    = BUILTIN_ENVS.includes(env) ? `env-${env}` : 'env-custom';

        if (jcrPath && !e.shiftKey && env !== activeEnv) {
          const variants = await msg('GET_URL_VARIANTS', { env, jcrPath });
          const inEditor = window.location.pathname.startsWith('/editor.html');
          const target   = sameTierUrl(variants, pageTier, inEditor, window.location.search.includes('wcmmode=disabled'))
            || variants.authorEditUrl || variants.publishUrl || variants.dispatcherUrl;
          if (target) {
            toast(`Opening on ${displayLabel}…`, toastType);
            if (e.metaKey || e.ctrlKey) window.open(target, '_blank', 'noopener');
            else window.location.href = target;
            return;
          }
          toast(`${displayLabel} has no host for this tier — targeting actions only`, 'warn', 3500);
        }

        loginPrompted = false;
        _recentRecorded = false;
        closeInspector();
        ['asp-status-panel', 'asp-component-card', 'asp-asset-card'].forEach((id) => document.getElementById(id)?.remove());
        setActiveEnvUI(env); // tab-local only
        applyControlPolicy();
        updateStatus('unknown', null);
        await refreshStatus();
        toast(`Actions now target ${displayLabel}`, toastType);
      });
    });

    // Regular-mode one-click actions (Edit / Preview / Live / Props)
    document.querySelectorAll('.asp-mini-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!jcrPath) return toast('JCR path not available', 'warn');
        const v   = await msg('GET_URL_VARIANTS', { jcrPath });
        const url = v?.[btn.dataset.variant];
        if (!url) return toast(`${btn.dataset.label} is not configured for this environment`, 'warn');
        window.open(url, '_blank', 'noopener');
      });
    });

    // Publish menu (Publish / Publish to Preview / Unpublish)
    document.getElementById('asp-publish-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openPublishMenu();
    });

    // Tier Switcher menu
    document.getElementById('asp-tier-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openTierMenu();
    });

    // Sites console button
    document.getElementById('asp-sites-btn')?.addEventListener('click', async () => {
      if (!jcrPath) return toast('JCR path not available', 'warn');
      const { sitesConsoleUrl } = await msg('GET_URL_VARIANTS', { jcrPath });
      if (!sitesConsoleUrl) return toast('Author host not configured', 'warn');
      window.open(sitesConsoleUrl, '_blank', 'noopener');
    });

    // Tools menu
    document.getElementById('asp-tools-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openToolsMenu();
    });

    // DAM asset inspector — toggle inspect mode (same pattern as component inspector)
    document.getElementById('asp-dam-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDamInspecting) stopDamInspecting(); else startDamInspecting();
    });

    // Locales / hreflang menu
    document.getElementById('asp-locales-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openLocalesMenu();
    });

    // Content sync menu
    document.getElementById('asp-sync-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openSyncMenu();
    });

    // Component inspector
    document.getElementById('asp-inspect-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isInspecting) stopInspecting(); else startInspecting();
    });

    // Publish / Publish to Preview / Unpublish (shared with the popup)
    const replicate = (kind) => () => withBusy(`asp-${kind === 'preview' ? 'publish-preview' : kind}-btn`,
      () => runReplication(kind, { msg, jcrPath, toast, onDone: refreshStatus, previousStatus: pageStatus, guard: destructiveGuard() }));
    document.getElementById('asp-publish-preview-btn')?.addEventListener('click', replicate('preview'));

    // Click outside env picker / menu → close
    document.addEventListener('click', onDocumentClick, true);

    // Close button
    document.getElementById('asp-close-btn')?.addEventListener('click', () => {
      window.removeEventListener('hashchange', onShellNavigate); // closed on purpose: stay closed
      teardown();
    });

    // Options
    document.getElementById('asp-options-btn')?.addEventListener('click', () => msg('OPEN_OPTIONS'));

    // Copy path
    document.getElementById('asp-copy-btn')?.addEventListener('click', async () => {
      if (!jcrPath) return toast('No path available', 'warn');
      await copyToClipboard(jcrPath);
      toast('✓ JCR path copied', 'success');
    });

    document.getElementById('asp-publish-btn')?.addEventListener('click', replicate('publish'));
    document.getElementById('asp-unpublish-btn')?.addEventListener('click', replicate('unpublish'));

    // QA audit & Cache header buttons
    document.getElementById('asp-audit-btn')?.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); runAudit(); });
    document.getElementById('asp-cache-btn')?.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); showCacheHeaders(); });

    // JCR Expand / Collapse All
    document.getElementById('asp-inspector-expand')?.addEventListener('click', () => {
      document.querySelectorAll('#asp-inspector-body details').forEach((d) => { d.open = true; });
    });
    document.getElementById('asp-inspector-collapse')?.addEventListener('click', () => {
      document.querySelectorAll('#asp-inspector-body > details details').forEach((d) => { d.open = false; });
    });

    // JCR Inspector toggle
    document.getElementById('asp-jcr-btn')?.addEventListener('click', async () => {
      if (orbActive()) closeOrbFan();   // the panel gets the focus, not the leaves
      if (!jcrPath) return toast('JCR path not available', 'warn');
      const panel = document.getElementById('asp-inspector');
      if (!panel) return;

      // Toggle off if already open
      if (panel.style.display !== 'none') { closeInspector(); return; }

      // Show with loading state
      document.getElementById('asp-inspector-body').innerHTML =
        '<div class="asp-inspector-loading">Loading…</div>';
      openInspector();

      const result = await msg('FETCH_JCR_NODE', { jcrPath: `${jcrPath}/jcr:content` });
      if (result.ok) {
        _jcrData = result.data;
        renderInspectorTable(_jcrData);
        positionInspector(); // reposition after content loads (height changes)
      } else {
        document.getElementById('asp-inspector-body').innerHTML =
          `<div class="asp-inspector-empty">Error: ${escHtml(result.error)}</div>`;
      }
    });

    // Inspector search filter
    document.getElementById('asp-inspector-search')?.addEventListener('input', (e) => {
      if (_jcrData) renderInspectorTable(_jcrData, e.target.value);
    });

    // Inspector copy button
    document.getElementById('asp-inspector-copy')?.addEventListener('click', async () => {
      if (!_jcrData) return;
      await copyToClipboard(JSON.stringify(_jcrData, null, 2));
      toast('✓ JCR properties copied', 'success');
    });

    // Inspector close
    document.getElementById('asp-inspector-close')?.addEventListener('click', closeInspector);

    // Toggle overlays
    document.getElementById('asp-overlay-btn')?.addEventListener('click', () => {
      const r = toggleOverlays();
      if (!r.found) toast('No AEM overlays on this page', 'warn');
      else toast(r.hidden ? 'Overlays hidden' : 'Overlays shown', 'info');
    });

    // Highlight components
    document.getElementById('asp-highlight-btn')?.addEventListener('click', toggleEditableHighlight);

    // Reload page (hard reload / bypass cache) — done by the worker via chrome.tabs.reload
    document.getElementById('asp-reload-btn')?.addEventListener('click', async () => {
      const r = await msg('RELOAD_TAB');
      if (!r.ok) window.location.reload();
    });

    // Delete (shared with the popup)
    document.getElementById('asp-delete-btn')?.addEventListener('click', () => withBusy('asp-delete-btn', () => runDelete({
      msg, jcrPath, toast, guard: destructiveGuard(),
      onDone: () => setTimeout(() => window.history.back(), 1500),
    })));
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  function onDocumentClick(e) {
    if (swallowClick) return;   // the click that ends a long-press: summonAt() opened the fan on purpose
    if (orbActive() && !e.target.closest('#asp-bar') && !e.target.closest('#asp-menu') && !e.target.closest('#asp-env-picker')) closeOrbFan();
    if (isEnvPickerOpen
      && !e.target.closest('#asp-env-picker')
      && !e.target.closest('#asp-env-chip')
      && !e.target.closest('#asp-orb-env-btn')) {
      closeEnvPicker();
    }
    if (!e.target.closest('#asp-menu')
      && !e.target.closest('#asp-more-btn')
      && !e.target.closest('#asp-tools-btn')
      && !e.target.closest('#asp-tier-btn')
      && !e.target.closest('#asp-publish-menu-btn')
      && !e.target.closest('#asp-locales-btn')
      && !e.target.closest('#asp-sync-btn')) closeMenu();
  }

  let _onSyncChanged = null;

  /** Applies config / persona / layout flags onto the active toolbar live. */
  function applyConfigToToolbar(fullConfig) {
    featureFlags = {
      enableKeyboardShortcut: fullConfig.enableKeyboardShortcut !== false,
      showLastModified:       fullConfig.showLastModified       !== false,
      summonOnLongPress:      fullConfig.summonOnLongPress      === true,
    };
    fullConfigFlags = { confirmDelete: fullConfig.confirmDelete !== false, confirmPublish: fullConfig.confirmPublish === true };
    envsConfig      = fullConfig.environments || {};
    controlPolicy   = fullConfig.controlPolicy || null;
    lockConfig      = !!fullConfig.lockConfiguration;
    personaState    = resolvePersonaState(fullConfig);
    devMode = {
      enabled: personaState.effectiveDevMode,
      buttons: { ...personaState.devToolsButtons },
    };
    toolbarLayout = personaState.persona === 'custom'
      ? (fullConfig.customizeToolbar === true ? normalizeLayout(fullConfig.toolbarLayout) : defaultLayout())
      : normalizeLayout(personaState.effectiveLayout);
    orbMode = fullConfig.classicBar !== true;

    const hint = document.getElementById('asp-palette-btn');
    if (hint) {
      hint.textContent = isMac ? '⌘K' : 'Ctrl K';
      hint.style.display = featureFlags.enableKeyboardShortcut ? '' : 'none';
    }

    themeSync?.stop();
    themeSync = syncTheme(fullConfig.optionsTheme);
    if (document.getElementById('asp-bar')) {
      applyMinimized();
      applyControlPolicy();
      updateTierLabel();
      bindSummonAll();
    }
  }

  /** Remove the toolbar and everything it added to the page. */
  function teardown() {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('resize', onWindowResize);
    clearTimeout(resizeDebounceTimer);
    cancelAnimationFrame(resizeSettleFrame);
    unbindSummon();
    clearTimeout(orbTimer);
    busyCount = 0;
    themeSync?.stop();
    themeSync = null;
    if (_onSyncChanged) {
      try { getExtApi()?.storage?.onChanged?.removeListener(_onSyncChanged); } catch { /* ignore */ }
      _onSyncChanged = null;
    }
    document.documentElement.removeAttribute('data-asp-theme');
    document.removeEventListener('click', onDocumentClick, true);
    stopInspecting();
    stopDamInspecting();
    closeMenu();
    closePalette();
    if (isEditableRegionsHighlighted) toggleEditableHighlight();
    ['asp-env-picker', 'asp-toast', 'asp-inspector', 'asp-component-card', 'asp-asset-card', 'asp-audit-panel', 'asp-cache-panel', 'asp-status-panel', 'asp-dialog', 'aem-sidekick-pro-root']
      .forEach((id) => document.getElementById(id)?.remove());
    jcrPath = null;
    _recentRecorded = false;
  }

  /**
   * The Cloud Service shell (/ui#/aem/…) switches between consoles and the editor
   * without reloading, so the toolbar must follow: appear on a page, disappear on a console.
   */
  let _navTimer = null;
  function onShellNavigate() {
    clearTimeout(_navTimer);
    _navTimer = setTimeout(() => { teardown(); init(); }, 150);
  }

  async function init() {
    const url = window.location.href;

    // Pages only: not JSON / images / PDFs, and not documents without a body.
    if (!document.body || !/^(text\/html|application\/xhtml\+xml)$/.test(document.contentType)) return;
    // The Cloud Service shell navigates by hash; keep listening so the toolbar follows.
    if (window.location.pathname === '/ui') {
      window.removeEventListener('hashchange', onShellNavigate);
      window.addEventListener('hashchange', onShellNavigate);
    }

    // Single config call — avoids the double GET_CONFIG from earlier implementation
    const fullConfig = await msg('GET_CONFIG');
    const envs       = fullConfig.environments || {};

    applyConfigToToolbar(fullConfig);

    // Bail early if nothing is configured
    const anyConfigured = Object.values(envs).some(
      (e) => e?.authorHost || e?.publishHost || e?.previewHost || e?.dispatcherHost
    );
    if (!anyConfigured) return;

    const parsed = await msg('GET_PAGE_INFO', { url });

    // The toolbar only appears on pages belonging to a configured env; that env
    // becomes this tab's env. The global default is NOT modified.
    if (!parsed.matchedEnv) return;
    // …and only on pages: not start.html, the Sites / Assets consoles, properties, CRXDE, system pages.
    if (!parsed.isContentPage) return;
    const detectedEnv = parsed.matchedEnv;
    activeEnv = detectedEnv;
    pageTier  = parsed.tier || null;

    const shouldShow =
      (parsed.isAuthor     && fullConfig.showOnAuthor     !== false) ||
      ((parsed.isPublish || parsed.isPreview) && fullConfig.showOnPublish !== false) ||
      (parsed.isDispatcher && fullConfig.showOnDispatcher !== false);

    if (!shouldShow) return;

    // Build and inject toolbar
    const root = buildToolbar(envs, fullConfig.envOrder || Object.keys(envs));
    document.body.appendChild(root);
    bindEvents();
    bindSummonAll();
    const saved = await loadUiState();
    savedPos = saved.pos || null;
    applyMinimized();
    setActiveEnvUI(detectedEnv);
    applyControlPolicy();
    updateTierLabel();

    // Watch Settings / Persona changes live across tabs
    const api = getExtApi();
    if (!_onSyncChanged && api?.storage?.onChanged) {
      _onSyncChanged = async (changes, area) => {
        if (area !== 'sync') return;
        const keys = ['persona', 'enableDevMode', 'devToolsButtons', 'qaToolsButtons', 'customizeToolbar', 'toolbarLayout', 'classicBar', 'enableKeyboardShortcut', 'showLastModified', 'summonOnLongPress'];
        if (keys.some((k) => k in changes)) {
          const fresh = await msg('GET_CONFIG');
          if (fresh && fresh.environments) applyConfigToToolbar(fresh);
        }
      };
      try { api.storage.onChanged.addListener(_onSyncChanged); } catch { /* ignore */ }
    }

    // Set JCR path and fetch status
    if (parsed.ok && parsed.jcrPath) {
      jcrPath = parsed.jcrPath;
    }
    await refreshStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
