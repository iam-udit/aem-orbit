import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOLBAR_ITEMS, ITEM_BY_ID, MAX_ITEMS, defaultLayout, normalizeLayout, isDefaultLayout, layoutRuns, overflowItems,
} from '../src/shared/toolbar-layout.js';

test('default layout matches the toolbar as it shipped', () => {
  assert.deepEqual(defaultLayout().mini, ['edit', 'view', 'live', 'props']);
  assert.deepEqual(defaultLayout().expanded,
    ['tier', 'publish', 'locales', 'sites', 'sync', 'inspect', 'jcr', 'more', 'palette', 'copy', 'settings']);
});

test('nothing saved gives the default layout', () => {
  for (const v of [null, undefined, 'x', 5, [], {}]) assert.deepEqual(normalizeLayout(v), defaultLayout());
});

test('default layout normalises to itself', () => {
  assert.deepEqual(normalizeLayout(defaultLayout()), defaultLayout());
  assert.equal(isDefaultLayout(defaultLayout()), true);
  assert.equal(isDefaultLayout(null), true);
});

test('unknown ids and duplicates are dropped; order is kept', () => {
  const n = normalizeLayout({ mini: ['live', 'nope', 'edit', 'live', 7, null], expanded: ['more', 'settings'] });
  assert.deepEqual(n.mini, ['live', 'edit']);
});

test('a bar of only unknown ids falls back to the default for that bar', () => {
  const n = normalizeLayout({ mini: ['nope', 'also-nope'], expanded: ['more', 'settings'] });
  assert.deepEqual(n.mini, defaultLayout().mini);
});

test('an intentionally empty regular bar stays empty', () => {
  assert.deepEqual(normalizeLayout({ mini: [], expanded: ['more', 'settings'] }).mini, []);
});

test('More and Settings always stay on the expanded bar', () => {
  const n = normalizeLayout({ mini: ['edit'], expanded: ['tier'] });
  assert.deepEqual(n.expanded, ['tier', 'more', 'settings']);
});

test('delete and unpublish cannot be placed on a bar', () => {
  assert.equal(ITEM_BY_ID.delete, undefined);
  assert.equal(ITEM_BY_ID.unpublish, undefined);
  const n = normalizeLayout({ mini: ['delete', 'unpublish', 'edit'], expanded: ['delete', 'more', 'settings'] });
  assert.deepEqual(n.mini, ['edit']);
  assert.deepEqual(n.expanded, ['more', 'settings']);
});

test('caps apply per bar and never drop required items', () => {
  const all = TOOLBAR_ITEMS.map((i) => i.id);
  const n = normalizeLayout({ mini: all, expanded: all });
  assert.equal(n.mini.length, MAX_ITEMS.mini);
  assert.equal(n.expanded.length, MAX_ITEMS.expanded);
  assert.ok(n.expanded.includes('more') && n.expanded.includes('settings'));
});

test('the same item may sit on both bars', () => {
  const n = normalizeLayout({ mini: ['edit', 'tier'], expanded: ['tier', 'more', 'settings'] });
  assert.ok(n.mini.includes('tier') && n.expanded.includes('tier'));
});

test('isDefaultLayout is false once changed', () => {
  assert.equal(isDefaultLayout({ mini: ['edit'], expanded: defaultLayout().expanded }), false);
});

test('normalizeLayout returns fresh arrays, never the defaults themselves', () => {
  const a = normalizeLayout(null);
  a.mini.push('x');
  assert.deepEqual(normalizeLayout(null).mini, ['edit', 'view', 'live', 'props']);
});

test('layoutRuns reproduces the default dividers', () => {
  assert.deepEqual(layoutRuns(defaultLayout().expanded).map((r) => r.group), ['nav', 'tools', 'utility']);
  assert.deepEqual(layoutRuns(defaultLayout().mini).map((r) => r.group), ['link']);
});

test('overflow lists items taken off the expanded bar', () => {
  assert.deepEqual(overflowItems(defaultLayout()).map((i) => i.id), []);
  const ids = overflowItems({ expanded: ['more', 'settings'] }).map((i) => i.id);
  assert.ok(ids.includes('tier') && ids.includes('sites') && ids.includes('copy'));
  assert.ok(!ids.includes('more') && !ids.includes('settings'));
});

test('every item has a unique id and element id', () => {
  assert.equal(new Set(TOOLBAR_ITEMS.map((i) => i.id)).size, TOOLBAR_ITEMS.length);
  assert.equal(new Set(TOOLBAR_ITEMS.map((i) => i.elId)).size, TOOLBAR_ITEMS.length);
});
