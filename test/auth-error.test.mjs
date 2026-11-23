import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionExpiredMessage, loginTarget } from '../src/shared/auth-error.js';

const ENVS = {
  dev:   { authorHost: 'https://author-p1-e1.adobeaemcloud.com', authType: 'session' },
  stage: { authorHost: 'https://author-p1-e5.adobeaemcloud.com/', authType: 'basic' },
  qa:    { authorHost: 'https://qa.example.com:4502', authType: 'session', label: 'QA Lab' },
};

test('the message names the origin of the host, not a path', () => {
  assert.equal(sessionExpiredMessage('https://author-p1-e1.adobeaemcloud.com/some/path'),
    'Session expired — log in to https://author-p1-e1.adobeaemcloud.com and try again.');
});

test('loginTarget finds a Browser Session environment from the error text', () => {
  const t = loginTarget(sessionExpiredMessage(ENVS.dev.authorHost), ENVS);
  assert.deepEqual(t, { env: 'dev', label: 'Dev', url: 'https://author-p1-e1.adobeaemcloud.com/' });
});

test('loginTarget survives the "<verb> on <env> failed:" prefix added by wrapper errors', () => {
  const t = loginTarget(`Read from dev failed: ${sessionExpiredMessage(ENVS.dev.authorHost)}`, ENVS);
  assert.equal(t?.env, 'dev');
});

test('a custom label and a port are respected', () => {
  const t = loginTarget(sessionExpiredMessage(ENVS.qa.authorHost), ENVS);
  assert.deepEqual(t, { env: 'qa', label: 'QA Lab', url: 'https://qa.example.com:4502/' });
});

test('environments that do not use Browser Session auth get no login target', () => {
  assert.equal(loginTarget(sessionExpiredMessage(ENVS.stage.authorHost), ENVS), null);
});

test('a host that is not configured never becomes a login target', () => {
  assert.equal(loginTarget(sessionExpiredMessage('https://evil.example.org'), ENVS), null);
});

test('other errors and non-strings give nothing', () => {
  assert.equal(loginTarget('HTTP 500', ENVS), null);
  assert.equal(loginTarget('Not signed in — check credentials or log in to AEM.', ENVS), null);
  assert.equal(loginTarget(undefined, ENVS), null);
  assert.equal(loginTarget(sessionExpiredMessage(ENVS.dev.authorHost), undefined), null);
});
