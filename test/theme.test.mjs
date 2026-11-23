import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTheme, nextTheme, resolveTheme } from '../src/shared/theme.js';

test('anything but light or dark counts as auto', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  for (const v of ['auto', null, undefined, '', 'blue', 3, {}]) assert.equal(normalizeTheme(v), 'auto');
});

test('the button cycles auto → light → dark → auto', () => {
  assert.equal(nextTheme('auto'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'auto');
  assert.equal(nextTheme(null), 'light'); // nothing saved is auto
  assert.equal(nextTheme('nonsense'), 'light');
});

test('auto follows the device, an explicit choice does not', () => {
  assert.equal(resolveTheme('auto', true), 'light');
  assert.equal(resolveTheme('auto', false), 'dark');
  assert.equal(resolveTheme(undefined, false), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
});
