import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAS,
  PERSONA_DEFS,
  PERSONA_LAYOUTS,
  normalizePersona,
  allowedPersonasForConfig,
  resolvePersonaState,
  isPersonaToolEnabled,
} from '../src/shared/persona.js';
import { normalizePolicy } from '../src/shared/control-policy.js';

test('normalizePersona validates known personas and defaults to custom', () => {
  assert.deepEqual(PERSONAS, ['author', 'qa', 'dev', 'custom']);
  for (const p of PERSONAS) assert.equal(normalizePersona(p), p);
  assert.equal(normalizePersona('admin'), 'custom');
  assert.equal(normalizePersona(null), 'custom');
  assert.equal(normalizePersona(undefined), 'custom');
});

test('custom persona preserves legacy defaults when no flags are set', () => {
  const s = resolvePersonaState({});
  assert.equal(s.persona, 'custom');
  assert.equal(s.effectiveDevMode, false);
  assert.equal(s.showReplication, true);
  assert.equal(s.showFindReplace, true);
  assert.equal(s.showFlushCache, true);
  assert.equal(s.customizeToolbar, false);
  assert.equal(s.effectiveLayout, null);
  assert.equal(s.readOnlyJcr, false);
  assert.equal(isPersonaToolEnabled(s, 'audit'), false);
  assert.equal(isPersonaToolEnabled(s, 'cache'), false);
  assert.equal(isPersonaToolEnabled(s, 'readiness'), false);
});

test('custom persona honors explicit enableDevMode, devToolsButtons, qaToolsButtons, and toolbarLayout', () => {
  const s = resolvePersonaState({
    persona: 'custom',
    enableDevMode: true,
    devToolsButtons: { delete: false, jcr: true },
    qaToolsButtons: { audit: true, cache: false, readiness: true },
    customizeToolbar: true,
    toolbarLayout: { mini: ['edit'], expanded: ['more', 'settings'] },
  });
  assert.equal(s.effectiveDevMode, true);
  assert.equal(isPersonaToolEnabled(s, 'jcr'), true);
  assert.equal(isPersonaToolEnabled(s, 'delete'), false);
  assert.equal(isPersonaToolEnabled(s, 'audit'), true);
  assert.equal(isPersonaToolEnabled(s, 'cache'), false);
  assert.equal(isPersonaToolEnabled(s, 'readiness'), true);
  assert.deepEqual(s.effectiveLayout, { mini: ['edit'], expanded: ['more', 'settings'] });
});

test('author persona disables developer and QA tools while keeping publishing', () => {
  const s = resolvePersonaState({ persona: 'author', enableDevMode: true });
  assert.equal(s.persona, 'author');
  assert.equal(s.effectiveDevMode, false);
  assert.equal(s.showReplication, true);
  assert.equal(s.showFlushCache, false);
  assert.equal(s.showSystemQuickLinks, false);
  assert.equal(isPersonaToolEnabled(s, 'jcr'), false);
  assert.equal(isPersonaToolEnabled(s, 'audit'), false);
  assert.deepEqual(s.effectiveLayout, PERSONA_LAYOUTS.author);
});

test('qa persona enables audit, cache, readiness, and read-only view tools while hiding replication/mutations', () => {
  const s = resolvePersonaState({ persona: 'qa', enableDevMode: true });
  assert.equal(s.persona, 'qa');
  assert.equal(s.effectiveDevMode, false);
  assert.equal(s.showReplication, false);
  assert.equal(s.showFindReplace, false);
  assert.equal(s.showFlushCache, false);
  assert.equal(s.readOnlyJcr, true);
  assert.equal(isPersonaToolEnabled(s, 'audit'), true);
  assert.equal(isPersonaToolEnabled(s, 'cache'), true);
  assert.equal(isPersonaToolEnabled(s, 'readiness'), true);
  assert.equal(isPersonaToolEnabled(s, 'inspect'), true);
  assert.equal(isPersonaToolEnabled(s, 'highlight'), true);
  assert.equal(isPersonaToolEnabled(s, 'reload'), true);
  assert.equal(isPersonaToolEnabled(s, 'jcr'), false);
  assert.equal(isPersonaToolEnabled(s, 'delete'), false);
  assert.equal(isPersonaToolEnabled(s, 'sync'), false);
  assert.deepEqual(s.effectiveLayout, PERSONA_LAYOUTS.qa);
});

test('dev persona enables all dev tools, QA verification tools, and system quick links', () => {
  const s = resolvePersonaState({ persona: 'dev' });
  assert.equal(s.persona, 'dev');
  assert.equal(s.effectiveDevMode, true);
  assert.equal(s.showReplication, true);
  assert.equal(s.showSystemQuickLinks, true);
  for (const key of ['jcr', 'overlays', 'highlight', 'inspect', 'tools', 'reload', 'delete', 'sync', 'audit', 'cache', 'readiness']) {
    assert.equal(isPersonaToolEnabled(s, key), true, `${key} should be enabled for dev persona`);
  }
  assert.deepEqual(s.effectiveLayout, PERSONA_LAYOUTS.dev);
});

test('enterprise controlPolicy and allowedPersonas constrain available personas', () => {
  const policy = normalizePolicy({ disabledControls: ['developerMode'] });
  assert.deepEqual(allowedPersonasForConfig({ controlPolicy: policy }), ['author', 'qa', 'custom']);

  const coerced = resolvePersonaState({
    persona: 'dev',
    defaultPersona: 'qa',
    allowedPersonas: ['author', 'qa'],
    controlPolicy: policy,
  });
  assert.equal(coerced.persona, 'qa');
  assert.equal(coerced.effectiveDevMode, false);

  const fallback = resolvePersonaState({
    persona: 'dev',
    allowedPersonas: ['dev'],
    controlPolicy: policy,
  });
  assert.deepEqual(allowedPersonasForConfig({ allowedPersonas: ['dev'], controlPolicy: policy }), ['author']);
  assert.equal(fallback.persona, 'author');
  assert.ok(PERSONA_DEFS.author && PERSONA_DEFS.qa && PERSONA_DEFS.dev && PERSONA_DEFS.custom);
});
