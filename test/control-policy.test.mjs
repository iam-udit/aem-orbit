import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONTROLS, controlForAction, normalizePolicy, isControlAllowed, controlBlockedMessage,
} from '../src/shared/control-policy.js';

test('no policy blocks nothing', () => {
  for (const id of Object.keys(CONTROLS)) {
    assert.equal(isControlAllowed(null, id, 'prod'), true);
    assert.equal(isControlAllowed(normalizePolicy(undefined), id, 'prod'), true);
    assert.equal(isControlAllowed(normalizePolicy({}), id), true);
  }
});

test('a globally disabled control is blocked on every environment', () => {
  const p = normalizePolicy({ disabledControls: ['delete'] });
  assert.equal(isControlAllowed(p, 'delete', 'dev'), false);
  assert.equal(isControlAllowed(p, 'delete', 'prod'), false);
  assert.equal(isControlAllowed(p, 'delete'), false);
  assert.equal(isControlAllowed(p, 'publish', 'prod'), true);
});

test('a per-environment rule only affects that environment', () => {
  const p = normalizePolicy({ byEnvironment: { prod: { disabledControls: ['publish', 'sync'] } } });
  assert.equal(isControlAllowed(p, 'publish', 'prod'), false);
  assert.equal(isControlAllowed(p, 'sync', 'prod'), false);
  assert.equal(isControlAllowed(p, 'publish', 'dev'), true);
  assert.equal(isControlAllowed(p, 'publish'), true);
});

test('garbage input is ignored rather than trusted', () => {
  const p = normalizePolicy({
    disabledControls: ['delete', 'delete', 'nope', 42, null, '__proto__', 'constructor'],
    byEnvironment: { prod: { disabledControls: 'publish' }, dev: null, stage: { disabledControls: ['bogus'] } },
  });
  assert.deepEqual(p, { disabledControls: ['delete'], byEnvironment: {} });
  assert.deepEqual(normalizePolicy('x'), { disabledControls: [], byEnvironment: {} });
  assert.deepEqual(normalizePolicy({ byEnvironment: [] }), { disabledControls: [], byEnvironment: {} });
});

test('environment keys such as __proto__ cannot widen the policy', () => {
  const p = normalizePolicy(JSON.parse('{"byEnvironment":{"__proto__":{"disabledControls":["delete"]}}}'));
  assert.equal(isControlAllowed(p, 'delete', 'dev'), true);
  assert.equal(isControlAllowed(p, 'delete', 'constructor'), true);
});

test('Developer Mode can only be switched off globally', () => {
  const p = normalizePolicy({ byEnvironment: { prod: { disabledControls: ['developerMode', 'delete'] } } });
  assert.deepEqual(p.byEnvironment.prod.disabledControls, ['delete']);
  assert.equal(isControlAllowed(normalizePolicy({ disabledControls: ['developerMode'] }), 'developerMode'), false);
});

test('every guarded action maps to exactly one control', () => {
  const seen = new Map();
  for (const [id, c] of Object.entries(CONTROLS)) {
    for (const a of c.actions) {
      assert.equal(seen.has(a), false, `${a} is listed under two controls`);
      seen.set(a, id);
      assert.equal(controlForAction(a), id);
    }
  }
  assert.equal(controlForAction('GET_CONFIG'), null);
  assert.equal(controlForAction('toString'), null);
});

test('state-changing actions are all covered by a control', () => {
  const worker = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
  // Actions that change AEM content must be guarded, otherwise a policy could be bypassed by that route.
  for (const action of ['PUBLISH_PAGE', 'UNPUBLISH_PAGE', 'PUBLISH_PREVIEW', 'DELETE_PAGE', 'TREE_ACTIVATE', 'TREE_DEACTIVATE',
    'BULK_REPLICATE', 'SYNC_CONTENT_PAGE', 'UNDO_SYNC', 'CREATE_VERSION', 'RESTORE_VERSION', 'LOCK_PAGE', 'UNLOCK_PAGE',
    'REPLACE_ACROSS_PAGES', 'FLUSH_DISPATCHER']) {
    assert.match(worker, new RegExp(`case '${action}'`), `${action} exists in the worker`);
    assert.notEqual(controlForAction(action), null, `${action} is guarded`);
  }
});

test('the blocked message names the control and never the policy source', () => {
  assert.equal(controlBlockedMessage('delete', 'prod'), 'Delete page is turned off by your administrator for prod.');
  assert.equal(controlBlockedMessage('sync'), 'Sync content is turned off by your administrator.');
});

test('schema.json lists exactly the controls the code knows', () => {
  const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url), 'utf8'));
  const global = schema.properties.controlPolicy.properties.disabledControls.items.enum;
  const perEnv = schema.properties.controlPolicy.properties.byEnvironment.additionalProperties.properties.disabledControls.items.enum;
  assert.deepEqual([...global].sort(), Object.keys(CONTROLS).sort());
  assert.deepEqual([...perEnv].sort(), Object.keys(CONTROLS).filter((id) => id !== 'developerMode').sort());
});

// ─── policy-test build ────────────────────────────────────────────────────────

test('the committed policy override is null, so release builds carry no policy', async () => {
  const { POLICY_OVERRIDE } = await import('../src/shared/policy-override.js');
  assert.equal(POLICY_OVERRIDE, null);
});

test('the policy-test build output is separate from the release folder the zip is made from', () => {
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(build, /'policy-test' : 'extension'/);
  assert.match(pkg.scripts.zip, /dist\/extension/);
  assert.doesNotMatch(pkg.scripts.zip, /policy-test/);
  assert.doesNotMatch(pkg.scripts.release, /policy-test/);
});
