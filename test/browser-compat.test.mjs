import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getExtApi,
  getStorageArea,
  compatStorageGet,
  compatStorageSet,
  compatStorageRemove,
  compatStorageClear,
  getExtensionInitiatorDomain,
  createTimeoutSignal,
  notifyCompat,
  openOptionsCompat,
  reloadTabCompat,
  requestOriginsCompat,
} from '../src/shared/browser-compat.js';

function restoreGlobals(origChrome, origBrowser) {
  if (origChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = origChrome;
  if (origBrowser === undefined) delete globalThis.browser;
  else globalThis.browser = origBrowser;
}

test('getExtApi prefers chrome and falls back to browser WebExtension namespace', () => {
  const origChrome = globalThis.chrome;
  const origBrowser = globalThis.browser;
  try {
    delete globalThis.chrome;
    globalThis.browser = { runtime: { id: 'ff-id' } };
    assert.equal(getExtApi().runtime.id, 'ff-id');
    globalThis.chrome = { runtime: { id: 'cr-id' } };
    assert.equal(getExtApi().runtime.id, 'cr-id');
  } finally {
    restoreGlobals(origChrome, origBrowser);
  }
});

test('compatStorage helpers work with callback-based API and missing session/managed areas', async () => {
  const origChrome = globalThis.chrome;
  const origBrowser = globalThis.browser;
  try {
    delete globalThis.browser;
    const store = {};
    globalThis.chrome = {
      storage: {
        sync: {
          get: (keys, cb) => cb({ ...keys, ...store }),
          set: (data, cb) => { Object.assign(store, data); cb?.(); },
          remove: (k, cb) => { delete store[k]; cb?.(); },
          clear: (cb) => { Object.keys(store).forEach((k) => delete store[k]); cb?.(); },
        },
      },
    };
    assert.equal(getStorageArea('session'), null);
    assert.deepEqual(await compatStorageGet('session', { a: 1 }), { a: 1 });
    await compatStorageSet('sync', { foo: 'bar' });
    assert.deepEqual(await compatStorageGet('sync', { foo: '' }), { foo: 'bar' });
    await compatStorageRemove('sync', 'foo');
    assert.deepEqual(await compatStorageGet('sync', { foo: 'default' }), { foo: 'default' });
    await compatStorageSet('sync', { x: 2 });
    await compatStorageClear('sync');
    assert.deepEqual(await compatStorageGet('sync', { x: 0 }), { x: 0 });
  } finally {
    restoreGlobals(origChrome, origBrowser);
  }
});

test('compatStorage helpers work with Promise-based WebExtension API (Firefox/Safari) and surface sync errors', async () => {
  const origChrome = globalThis.chrome;
  const origBrowser = globalThis.browser;
  try {
    delete globalThis.chrome;
    const store = {};
    globalThis.browser = {
      storage: {
        local: {
          get: async (keys) => ({ ...keys, ...store }),
          set: async (data) => { Object.assign(store, data); },
        },
        sync: {
          get: () => { throw new Error('storage down'); },
        },
      },
    };
    await compatStorageSet('local', { token: 'abc' });
    assert.deepEqual(await compatStorageGet('local', { token: '' }), { token: 'abc' });
    await assert.rejects(() => compatStorageGet('sync', { a: 1 }), /storage down/);
  } finally {
    restoreGlobals(origChrome, origBrowser);
  }
});

test('getExtensionInitiatorDomain parses moz-extension and safari-web-extension UUID hosts', () => {
  const origChrome = globalThis.chrome;
  const origBrowser = globalThis.browser;
  try {
    delete globalThis.chrome;
    globalThis.browser = {
      runtime: {
        id: 'extension@example.org',
        getURL: () => 'moz-extension://12345678-aaaa-bbbb-cccc-1234567890ab/',
      },
    };
    assert.equal(getExtensionInitiatorDomain(), '12345678-aaaa-bbbb-cccc-1234567890ab');
  } finally {
    restoreGlobals(origChrome, origBrowser);
  }
});

test('createTimeoutSignal returns AbortSignal and cancelable timer', () => {
  const s = createTimeoutSignal(500);
  assert.ok(s.signal instanceof AbortSignal);
  assert.equal(s.signal.aborted, false);
  s.cancel();
});

test('notifyCompat, openOptionsCompat, reloadTabCompat, and requestOriginsCompat degrade gracefully', async () => {
  const origChrome = globalThis.chrome;
  const origBrowser = globalThis.browser;
  try {
    delete globalThis.chrome;
    const createdTabs = [];
    let reloadCount = 0;
    globalThis.browser = {
      runtime: { getURL: (p) => `safari-web-extension://uuid/${p}` },
      tabs: {
        create: (opts) => createdTabs.push(opts),
        reload: async (_tabId, opts) => {
          reloadCount++;
          if (opts?.bypassCache) throw new Error('unsupported bypassCache option');
        },
      },
    };
    await notifyCompat({ title: 'Test', message: 'No notifications permission/API' });
    await openOptionsCompat();
    assert.deepEqual(createdTabs, [{ url: 'safari-web-extension://uuid/src/options/options.html' }]);
    assert.equal(await reloadTabCompat(7), true);
    assert.equal(reloadCount, 2);
    assert.equal(await requestOriginsCompat(['https://example.com/*']), true);

    let reqCalled = false;
    globalThis.browser.permissions = {
      contains: async () => true,
      request: async () => { reqCalled = true; return false; },
    };
    assert.equal(await requestOriginsCompat(['https://already.granted/*']), true);
    assert.equal(reqCalled, false);
  } finally {
    restoreGlobals(origChrome, origBrowser);
  }
});
