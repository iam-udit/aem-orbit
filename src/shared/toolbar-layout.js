// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file Toolbar layout — which buttons appear on the regular (mini) and expanded bar.
 * @module shared/toolbar-layout
 *
 * Pure helpers shared by the content script (applies the layout) and the options
 * page (edits it). The default layout is exactly the toolbar as it shipped before
 * the layout became configurable, so a user who never customises sees no change.
 *
 * Only built-in items can be placed. Destructive actions (Delete, Unpublish) are
 * deliberately not in the registry: they stay inside menus, behind a confirmation.
 */

/**
 * @typedef {object} ToolbarItem
 * @property {string}  id        Stable id stored in settings.
 * @property {string}  label     Name shown in Settings.
 * @property {string}  elId      Id of the button element in the toolbar.
 * @property {string}  group     Neighbouring items of one group sit together; a divider separates groups.
 * @property {string}  icon      SVG path data (24×24 viewBox).
 * @property {string}  [dev]     Developer Mode button key that must be on for the button to show.
 * @property {string}  [qa]      QA Verification tool key that must be on for the button to show.
 * @property {boolean} [required] Cannot be removed from the expanded bar.
 * @property {boolean} [overflow] When removed from the expanded bar, shown as a row in the More menu.
 */

/** @type {ToolbarItem[]} */
export const TOOLBAR_ITEMS = [
  { id: 'tier',      label: 'Tier switcher',        elId: 'asp-tier-btn',         group: 'nav',   overflow: true,
    icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z' },
  { id: 'publish',   label: 'Publish menu',         elId: 'asp-publish-menu-btn', group: 'nav',   overflow: true,
    icon: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z' },
  { id: 'locales',   label: 'Locales',              elId: 'asp-locales-btn',      group: 'nav',   overflow: true,
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
  { id: 'sites',     label: 'Sites console',        elId: 'asp-sites-btn',        group: 'tools', overflow: true,
    icon: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z' },
  { id: 'sync',      label: 'Sync content',         elId: 'asp-sync-btn',         group: 'tools', overflow: true, dev: 'sync',
    icon: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z' },
  { id: 'inspect',   label: 'Component inspector',  elId: 'asp-inspect-btn',      group: 'tools', overflow: true, dev: 'inspect',
    icon: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { id: 'jcr',       label: 'JCR inspector',        elId: 'asp-jcr-btn',          group: 'tools', overflow: true, dev: 'jcr',
    icon: 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.1-.9-2-2-2zm0 5h-2V5h2v3z' },
  { id: 'more',      label: 'More menu',            elId: 'asp-more-btn',         group: 'tools', required: true,
    icon: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
  { id: 'palette',   label: 'Command palette',      elId: 'asp-palette-btn',      group: 'utility',
    icon: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { id: 'copy',      label: 'Copy JCR path',        elId: 'asp-copy-btn',         group: 'utility', overflow: true,
    icon: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z' },
  { id: 'settings',  label: 'Settings',             elId: 'asp-options-btn',      group: 'utility', required: true,
    icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' },
  // One-click links (the regular bar's default buttons)
  { id: 'edit',      label: 'Edit',                 elId: 'asp-mini-edit-btn',    group: 'link',
    icon: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' },
  { id: 'view',      label: 'View',                 elId: 'asp-mini-view-btn',    group: 'link',
    icon: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z' },
  { id: 'live',      label: 'Live',                 elId: 'asp-mini-live-btn',    group: 'link',
    icon: 'M7 2v11h3v9l7-12h-4l4-8z' },
  { id: 'props',     label: 'Page properties',      elId: 'asp-mini-props-btn',   group: 'link',
    icon: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z' },
  // Extra items that are in the More menu by default
  { id: 'dam',       label: 'Asset inspector',      elId: 'asp-dam-btn',          group: 'tools',
    icon: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z' },
  { id: 'overlays',  label: 'Overlays',             elId: 'asp-overlay-btn',      group: 'tools', dev: 'overlays',
    icon: 'M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z' },
  { id: 'highlight', label: 'Highlight components', elId: 'asp-highlight-btn',    group: 'tools', dev: 'highlight',
    icon: 'M17.5 4.5c-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5-1.45 0-2.99.22-4.28.79C1.49 5.62 1 6.33 1 7.14v11.28c0 1.3 1.22 2.26 2.48 1.94.98-.26 2.01-.36 3.02-.36 1.56 0 3.22.26 4.56.92.6.3 1.28.3 1.87 0 1.34-.67 3-.92 4.56-.92 1.01 0 2.04.1 3.02.36 1.26.33 2.48-.63 2.48-1.94V7.14c0-.81-.49-1.52-1.22-1.85C18.8 4.72 17.26 4.5 17.5 4.5z' },
  { id: 'tools',     label: 'Developer links',      elId: 'asp-tools-btn',        group: 'tools', dev: 'tools',
    icon: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z' },
  { id: 'reload',    label: 'Hard reload',          elId: 'asp-reload-btn',       group: 'tools', dev: 'reload',
    icon: 'M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z' },
  { id: 'audit',     label: 'SEO & a11y audit',     elId: 'asp-audit-btn',        group: 'tools', qa: 'audit',
    icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
  { id: 'cache',     label: 'Cache headers',        elId: 'asp-cache-btn',        group: 'tools', qa: 'cache',
    icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
];

/** @type {Record<string, ToolbarItem>} */
export const ITEM_BY_ID = Object.fromEntries(TOOLBAR_ITEMS.map((i) => [i.id, i]));

/** Most buttons a bar can hold: keeps the bar from outgrowing the window. */
export const MAX_ITEMS = { mini: 6, expanded: 14 };

const DEFAULT_LAYOUT = {
  mini:     ['edit', 'view', 'live', 'props'],
  expanded: ['tier', 'publish', 'locales', 'sites', 'sync', 'inspect', 'jcr', 'more', 'palette', 'copy', 'settings'],
};

/** Groups whose buttons sit directly in the bar rather than inside a `.asp-group` wrapper. */
export const FLAT_GROUPS = new Set(['link', 'utility']);

/** @returns {{mini: string[], expanded: string[]}} a fresh copy of the built-in layout */
export function defaultLayout() {
  return { mini: [...DEFAULT_LAYOUT.mini], expanded: [...DEFAULT_LAYOUT.expanded] };
}

/**
 * Sanitizes one toolbar strip array (`mini` or `expanded`), enforcing valid IDs, deduplication,
 * required items (`expanded`), and maximum slot capacity.
 *
 * @param {unknown} list - Candidate array of item IDs.
 * @param {'mini'|'expanded'} bar - Target bar section.
 * @returns {string[]}
 */
function normalizeBar(list, bar) {
  if (!Array.isArray(list)) return [...DEFAULT_LAYOUT[bar]];
  const seen = new Set();
  const ids = list.filter((id) => typeof id === 'string' && ITEM_BY_ID[id] && !seen.has(id) && seen.add(id));
  // A list with entries but none we recognise is damaged, not an intentionally empty bar.
  if (list.length && !ids.length) return [...DEFAULT_LAYOUT[bar]];
  if (bar === 'expanded') {
    TOOLBAR_ITEMS.forEach((i) => { if (i.required && !seen.has(i.id)) { ids.push(i.id); seen.add(i.id); } });
  }
  // Over the cap: drop from the end, but never the required items.
  for (let i = ids.length - 1; ids.length > MAX_ITEMS[bar] && i >= 0; i--) {
    if (!ITEM_BY_ID[ids[i]].required) ids.splice(i, 1);
  }
  return ids;
}

/**
 * Turn whatever is stored (or imported) into a safe layout.
 * Unknown ids and duplicates are dropped, the caps apply, and the required items
 * (More, Settings) always stay on the expanded bar. Anything unusable falls back to the default.
 *
 * @param {unknown} saved
 * @returns {{mini: string[], expanded: string[]}}
 */
export function normalizeLayout(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  return { mini: normalizeBar(s.mini, 'mini'), expanded: normalizeBar(s.expanded, 'expanded') };
}

/** True when the layout is the built-in one (so nothing needs to be stored). */
export function isDefaultLayout(layout) {
  const n = normalizeLayout(layout);
  return ['mini', 'expanded'].every((bar) => n[bar].length === DEFAULT_LAYOUT[bar].length
    && n[bar].every((id, i) => id === DEFAULT_LAYOUT[bar][i]));
}

/**
 * Split an ordered id list into runs of the same group; the toolbar draws a divider before each run.
 * @param {string[]} ids
 * @returns {{group: string, ids: string[]}[]}
 */
export function layoutRuns(ids) {
  const runs = [];
  ids.forEach((id) => {
    const group = ITEM_BY_ID[id]?.group;
    if (!group) return;
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.ids.push(id);
    else runs.push({ group, ids: [id] });
  });
  return runs;
}

/**
 * Items taken off the expanded bar that would otherwise have no home:
 * the More menu lists them so nothing is lost.
 * @param {{expanded: string[]}} layout
 * @returns {ToolbarItem[]}
 */
export function overflowItems(layout) {
  const onBar = new Set(layout.expanded);
  return TOOLBAR_ITEMS.filter((i) => i.overflow && !onBar.has(i.id));
}
