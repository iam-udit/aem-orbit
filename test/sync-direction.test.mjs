import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSyncAllowed } from '../src/shared/sync-direction.js';

const ORDER = ['local', 'dev', 'stage', 'prod'];

test('by default content may flow down, from higher to lower', () => {
  assert.equal(isSyncAllowed(ORDER, 'prod', 'stage', false), true);
  assert.equal(isSyncAllowed(ORDER, 'prod', 'local', false), true);
  assert.equal(isSyncAllowed(ORDER, 'stage', 'dev', false), true);
});

test('by default content may not flow up, from lower to higher', () => {
  assert.equal(isSyncAllowed(ORDER, 'dev', 'prod', false), false);
  assert.equal(isSyncAllowed(ORDER, 'local', 'dev', false), false);
  assert.equal(isSyncAllowed(ORDER, 'stage', 'prod', undefined), false);
});

test('with the opt-in on, both directions are allowed', () => {
  assert.equal(isSyncAllowed(ORDER, 'dev', 'prod', true), true);
  assert.equal(isSyncAllowed(ORDER, 'prod', 'dev', true), true);
});

test('an environment never syncs with itself', () => {
  assert.equal(isSyncAllowed(ORDER, 'dev', 'dev', true), false);
  assert.equal(isSyncAllowed(ORDER, 'dev', 'dev', false), false);
});

test('the rule follows the order from settings, including custom environments', () => {
  const order = ['custom_1', 'prod', 'dev'];
  assert.equal(isSyncAllowed(order, 'dev', 'custom_1', false), true);
  assert.equal(isSyncAllowed(order, 'custom_1', 'dev', false), false);
});

test('an environment that cannot be ranked is refused while restricted', () => {
  assert.equal(isSyncAllowed(ORDER, 'ghost', 'dev', false), false);
  assert.equal(isSyncAllowed(ORDER, 'prod', 'ghost', false), false);
  assert.equal(isSyncAllowed(undefined, 'prod', 'dev', false), false);
  assert.equal(isSyncAllowed(ORDER, '', 'dev', false), false);
});
