// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file Persona Model & Capability Resolution for AEM Orbit.
 * @module shared/persona
 *
 * Supports four user personas:
 *   - `author` : Content Authoring & Publishing focus (clean, non-technical workspace).
 *   - `qa`     : QA Verification & Auditing focus (SEO/a11y, cache headers, component/asset
 *                inspection, cross-env diff, QA readiness; hides destructive/repo mutations).
 *   - `dev`    : Developer & Engineering focus (full JCR, CRXDE, Sync, Overlays, Delete).
 *   - `custom` : Preserves today's exact default settings/popup/toolbar behavior and lets the
 *                user toggle any individual Developer/QA tool or custom toolbar layout.
 *
 * Pure module (zero chrome.* APIs) for 100% unit testability in Node.js.
 */

import { isControlAllowed } from './control-policy.js';

/** Valid persona identifiers in UI display order. */
export const PERSONAS = ['author', 'qa', 'dev', 'custom'];

/** Default per-button flags for Developer tools. */
export const DEFAULT_DEV_BUTTONS = Object.freeze({
  jcr: true,
  overlays: true,
  highlight: true,
  inspect: true,
  tools: true,
  reload: true,
  delete: true,
  sync: true,
});

/** Default per-button flags for QA verification tools. */
export const DEFAULT_QA_BUTTONS = Object.freeze({
  audit: true,
  cache: true,
  readiness: true,
});

/** Toolbar layout presets per curated persona (null = use standard/saved layout for `custom`). */
export const PERSONA_LAYOUTS = Object.freeze({
  author: {
    mini: ['edit', 'view', 'live', 'props'],
    expanded: ['tier', 'publish', 'locales', 'sites', 'more', 'palette', 'copy', 'settings'],
  },
  qa: {
    mini: ['view', 'live', 'audit', 'cache'],
    expanded: ['tier', 'locales', 'audit', 'cache', 'inspect', 'highlight', 'reload', 'more', 'palette', 'copy', 'settings'],
  },
  dev: {
    mini: ['edit', 'view', 'live', 'props'],
    expanded: ['tier', 'publish', 'locales', 'sites', 'sync', 'inspect', 'jcr', 'audit', 'more', 'palette', 'copy', 'settings'],
  },
});

/** Metadata and preset behavior definitions for each persona. */
export const PERSONA_DEFS = Object.freeze({
  author: {
    id: 'author',
    label: 'Author',
    shortLabel: 'Author',
    badge: 'Author',
    summary: 'Focused on content editing, preview, locales, and safe publishing without developer clutter.',
    enableDevMode: false,
    devToolsButtons: {
      jcr: false, overlays: false, highlight: false, inspect: false,
      tools: false, reload: false, delete: false, sync: false,
    },
    qaToolsButtons: { audit: false, cache: false, readiness: false },
    showOnAuthor: true,
    showOnPublish: true,
    showOnDispatcher: false,
    allowUpwardSync: false,
    showReplication: true,
    showAuthorWorkspace: true,
    showFindReplace: true,
    showFlushCache: false,
    showSystemQuickLinks: false,
    showDevSection: false,
    showQaSection: false,
    allowToolbarCustomize: false,
    allowCompareDiff: true,
    allowVersions: true,
    readOnlyJcr: false,
  },
  qa: {
    id: 'qa',
    label: 'QA',
    shortLabel: 'QA',
    badge: 'QA',
    summary: 'Tailored for verification: SEO & a11y audit, cache headers, QA readiness, component/DAM inspection, and cross-env drift checks.',
    enableDevMode: false,
    devToolsButtons: {
      jcr: false, overlays: false, highlight: true, inspect: true,
      tools: false, reload: true, delete: false, sync: false,
    },
    qaToolsButtons: { audit: true, cache: true, readiness: true },
    showOnAuthor: true,
    showOnPublish: true,
    showOnDispatcher: true,
    allowUpwardSync: false,
    showReplication: false,
    showAuthorWorkspace: true,
    showFindReplace: false,
    showFlushCache: false,
    showSystemQuickLinks: false,
    showDevSection: false,
    showQaSection: true,
    allowToolbarCustomize: false,
    allowCompareDiff: true,
    allowVersions: true,
    readOnlyJcr: true,
  },
  dev: {
    id: 'dev',
    label: 'Developer',
    shortLabel: 'Dev',
    badge: 'Dev',
    summary: 'Full engineering suite: JCR tree, CRXDE, overlays, component & DAM inspectors, content sync, QA audits, and cache tools.',
    enableDevMode: true,
    devToolsButtons: { ...DEFAULT_DEV_BUTTONS },
    qaToolsButtons: { ...DEFAULT_QA_BUTTONS },
    showOnAuthor: true,
    showOnPublish: true,
    showOnDispatcher: true,
    allowUpwardSync: false,
    showReplication: true,
    showAuthorWorkspace: true,
    showFindReplace: true,
    showFlushCache: true,
    showSystemQuickLinks: true,
    showDevSection: true,
    showQaSection: true,
    allowToolbarCustomize: false,
    allowCompareDiff: true,
    allowVersions: true,
    readOnlyJcr: false,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    shortLabel: 'Custom',
    badge: 'Custom',
    summary: 'Full manual control over all toolbar buttons, developer switches, and QA tools using standard defaults.',
    showReplication: true,
    showAuthorWorkspace: true,
    showFindReplace: true,
    showFlushCache: true,
    showSystemQuickLinks: true,
    showDevSection: true,
    showQaSection: true,
    allowToolbarCustomize: true,
    allowCompareDiff: true,
    allowVersions: true,
    readOnlyJcr: false,
  },
});

/**
 * Normalizes an arbitrary persona value to a valid persona key (`author` | `qa` | `dev` | `custom`).
 * Unrecognized values default to `'custom'` so existing configurations continue working as-is.
 *
 * @param {unknown} value - Candidate persona string.
 * @returns {'author'|'qa'|'dev'|'custom'}
 */
export function normalizePersona(value) {
  return typeof value === 'string' && PERSONAS.includes(value) ? value : 'custom';
}

/**
 * Resolves the list of personas permitted under enterprise policy.
 * If `controlPolicy` disables `developerMode`, the `dev` persona is excluded automatically.
 *
 * @param {object} [config] - Raw or merged extension config.
 * @returns {('author'|'qa'|'dev'|'custom')[]}
 */
export function allowedPersonasForConfig(config = {}) {
  const devAllowed = isControlAllowed(config.controlPolicy, 'developerMode');
  let list = Array.isArray(config.allowedPersonas) && config.allowedPersonas.length
    ? config.allowedPersonas.filter((p) => PERSONAS.includes(p))
    : [...PERSONAS];
  if (!list.length) list = [...PERSONAS];
  if (!devAllowed) list = list.filter((p) => p !== 'dev');
  return list.length ? list : ['author'];
}

/**
 * Resolves the active persona and effective runtime flags for a configuration object,
 * taking enterprise policy (`allowedPersonas`, `defaultPersona`, `controlPolicy`) into account.
 *
 * @param {object} [config] - Configuration object from storage/getConfig.
 * @returns {{
 *   persona: 'author'|'qa'|'dev'|'custom',
 *   allowedPersonas: ('author'|'qa'|'dev'|'custom')[],
 *   meta: object,
 *   effectiveDevMode: boolean,
 *   devToolsButtons: Record<string, boolean>,
 *   qaToolsButtons: Record<string, boolean>,
 *   effectiveLayout: {mini: string[], expanded: string[]}|null,
 *   customizeToolbar: boolean,
 *   showReplication: boolean,
 *   showFindReplace: boolean,
 *   showFlushCache: boolean,
 *   showSystemQuickLinks: boolean,
 *   readOnlyJcr: boolean,
 * }}
 */
export function resolvePersonaState(config = {}) {
  const allowed = allowedPersonasForConfig(config);
  const raw = config.persona || config.defaultPersona || 'custom';
  let persona = normalizePersona(raw);
  if (!allowed.includes(persona)) {
    const fallback = normalizePersona(config.defaultPersona);
    persona = allowed.includes(fallback) ? fallback : allowed[0];
  }

  const meta = PERSONA_DEFS[persona];
  const devAllowedByPolicy = isControlAllowed(config.controlPolicy, 'developerMode');

  if (persona === 'custom') {
    const devOn = devAllowedByPolicy && config.enableDevMode === true;
    const devButtons = { ...DEFAULT_DEV_BUTTONS, ...(config.devToolsButtons || {}) };
    const qaBase = { audit: false, cache: false, readiness: false };
    const qaButtons = typeof config.qaToolsButtons === 'boolean'
      ? { audit: config.qaToolsButtons, cache: config.qaToolsButtons, readiness: config.qaToolsButtons }
      : { ...qaBase, ...(config.qaToolsButtons && typeof config.qaToolsButtons === 'object' ? config.qaToolsButtons : {}) };
    return {
      persona,
      allowedPersonas: allowed,
      meta,
      effectiveDevMode: devOn,
      devToolsButtons: devButtons,
      qaToolsButtons: qaButtons,
      effectiveLayout: config.customizeToolbar === true ? (config.toolbarLayout || null) : null,
      customizeToolbar: config.customizeToolbar === true,
      showReplication: true,
      showFindReplace: true,
      showFlushCache: true,
      showSystemQuickLinks: devOn,
      readOnlyJcr: false,
    };
  }

  const effectiveDevMode = devAllowedByPolicy && meta.enableDevMode === true;
  const devButtons = effectiveDevMode
    ? { ...meta.devToolsButtons }
    : {
      ...meta.devToolsButtons,
      // In QA mode, non-mutating inspection tools (inspect, highlight, reload) stay enabled explicitly.
      jcr: false,
      overlays: false,
      tools: false,
      delete: false,
      sync: false,
    };

  return {
    persona,
    allowedPersonas: allowed,
    meta,
    effectiveDevMode,
    devToolsButtons: devButtons,
    qaToolsButtons: { ...meta.qaToolsButtons },
    effectiveLayout: PERSONA_LAYOUTS[persona] || null,
    customizeToolbar: false,
    showReplication: meta.showReplication,
    showFindReplace: meta.showFindReplace,
    showFlushCache: meta.showFlushCache,
    showSystemQuickLinks: effectiveDevMode && meta.showSystemQuickLinks,
    readOnlyJcr: meta.readOnlyJcr,
  };
}

/**
 * Checks whether a specific toolbar / UI tool key is active under the resolved persona state.
 * Works across both Developer tools (`jcr`, `overlays`, `highlight`, `inspect`, `tools`, `reload`,
 * `delete`, `sync`) and QA tools (`audit`, `cache`, `readiness`).
 *
 * @param {ReturnType<typeof resolvePersonaState>} state - Resolved persona state.
 * @param {string} key - Tool capability key.
 * @returns {boolean}
 */
export function isPersonaToolEnabled(state, key) {
  if (!state) return false;
  if (key in state.qaToolsButtons) return state.qaToolsButtons[key] !== false;
  if (state.persona === 'qa') {
    return ['highlight', 'inspect', 'reload'].includes(key) && state.devToolsButtons[key] !== false;
  }
  return state.effectiveDevMode && state.devToolsButtons[key] !== false;
}
