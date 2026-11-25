import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── chrome.* mock ────────────────────────────────────────────────────────────
// The service worker registers its listeners at import time, so everything it touches
// must exist before the module is loaded.

const EXT_ID = 'test-ext-id';
const stores = { sync: {}, local: {}, managed: {} };

function makeArea(name) {
  return {
    get(keys, cb) {
      const data = stores[name];
      if (keys === null) return cb(structuredClone(data));
      const out = {};
      for (const [k, def] of Object.entries(keys)) out[k] = k in data ? structuredClone(data[k]) : structuredClone(def);
      cb(out);
    },
    set(obj, cb) { Object.assign(stores[name], structuredClone(obj)); cb?.(); },
  };
}

const noop = () => {};
const event = () => ({ addListener: noop });

let messageListener;
let notifications = [];
let createdTabs = [];

globalThis.chrome = {
  storage: { sync: makeArea('sync'), local: makeArea('local'), managed: makeArea('managed'), onChanged: event() },
  runtime: {
    id: EXT_ID,
    getURL: (p = '') => `chrome-extension://${EXT_ID}/${p}`,
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    onInstalled: event(),
    onStartup: event(),
    openOptionsPage: noop,
  },
  permissions: { onAdded: event(), onRemoved: event(), contains: async () => false },
  tabs: {
    TAB_ID_NONE: -1,
    onActivated: event(),
    onUpdated: event(),
    query: async () => [],
    get: async () => null,
    reload: async () => {},
    create: (opts) => { createdTabs.push(opts); },
  },
  action: {},
  scripting: {},
  declarativeNetRequest: {},
  notifications: { create: (opts) => { notifications.push(opts); } },
};

// ─── fetch mock ───────────────────────────────────────────────────────────────

let calls = [];
let routes = [];
function route(match, handler) { routes.push({ match, handler }); }

function respond({ status = 200, json, text = '', type = 'application/json' } = {}) {
  const body = json !== undefined ? JSON.stringify(json) : text;
  return new Response(body, { status, headers: { 'content-type': type } });
}

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, init });
  const r = routes.find((x) => (typeof x.match === 'string' ? url.includes(x.match) : x.match.test(url)));
  if (!r) return respond({ status: 404, text: 'nf', type: 'text/plain' });
  return r.handler(url, init);
};

await import('../src/background/service-worker.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEV  = 'https://author-p1-e1.adobeaemcloud.com';
const PROD = 'https://author-p1-e9.adobeaemcloud.com';

const fromContentScript = { id: EXT_ID, tab: { id: 7, url: `${DEV}/editor.html/content/site/en/home.html` }, url: `${DEV}/editor.html/content/site/en/home.html` };
const fromOptionsPage   = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/src/options/options.html` };

/** Sends a message through the registered onMessage listener and resolves with the response. */
function send(message, sender = fromOptionsPage) {
  return new Promise((resolve) => {
    const keepOpen = messageListener(message, sender, resolve);
    if (keepOpen === false) resolve(undefined); // ignored by the router
  });
}

const replicateCalls = () => calls.filter((c) => c.url.includes('/bin/replicate.json'));

beforeEach(() => {
  stores.sync = {
    enableDevMode: true,
    environments: {
      dev:  { authorHost: DEV,  authType: 'basic' },
      prod: { authorHost: PROD, authType: 'session', protected: true },
    },
  };
  stores.local = { secrets: { dev: { username: 'admin', password: 'pw' } } };
  stores.managed = {};
  calls = [];
  routes = [];
  notifications = [];
  createdTabs = [];
  route('/libs/granite/csrf/token.json', () => respond({ json: { token: 'tkn' } }));
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
});

// ─── routing and sender checks ────────────────────────────────────────────────

test('messages from another extension are ignored', async () => {
  assert.equal(await send({ action: 'GET_CONFIG' }, { id: 'someone-else' }), undefined);
});

test('unknown actions are refused', async () => {
  const r = await send({ action: 'NOPE' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Unknown action/);
});

test('GET_CONFIG never exposes credentials', async () => {
  const cfg = await send({ action: 'GET_CONFIG' });
  assert.equal(cfg.environments.dev.password, undefined);
  assert.equal(cfg.environments.dev.username, undefined);
  assert.equal(cfg.environments.dev.hasCredentials, true);
});

test('TEST_CONNECTION is refused from a content script', async () => {
  const r = await send({ action: 'TEST_CONNECTION', payload: { cfg: { authorHost: DEV } } }, fromContentScript);
  assert.deepEqual(r, { ok: false, error: 'Not allowed' });
  assert.equal(calls.length, 0);
});

test('OPEN_TAB only opens http(s) URLs', async () => {
  assert.equal((await send({ action: 'OPEN_TAB', payload: { url: 'javascript:alert(1)' } })).ok, false);
  assert.equal((await send({ action: 'OPEN_TAB', payload: { url: 'chrome://settings' } })).ok, false);
  assert.equal(createdTabs.length, 0);
  assert.equal((await send({ action: 'OPEN_TAB', payload: { url: 'https://example.com/x' } })).ok, true);
  assert.deepEqual(createdTabs, [{ url: 'https://example.com/x' }]);
});

test('an unexpected exception gives the UI a generic message, not the internal one', async () => {
  const original = console.error;
  console.error = noop;
  try {
    globalThis.chrome.storage.sync.get = () => { throw new Error('secret internal detail /etc/passwd'); };
    const r = await send({ action: 'GET_PAGE_INFO', payload: { url: DEV } });
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.error, /secret|passwd/);
  } finally {
    console.error = original;
    globalThis.chrome.storage.sync = makeArea('sync');
  }
});

// ─── protected-environment guard ──────────────────────────────────────────────

const PAGE = '/content/site/en/home';

for (const [action, label] of [
  ['PUBLISH_PAGE', 'publish'],
  ['PUBLISH_PREVIEW', 'publish to preview'],
  ['UNPUBLISH_PAGE', 'unpublish'],
]) {
  test(`${label} on a protected environment needs the typed page name`, async () => {
    const blocked = await send({ action, payload: { env: 'prod', jcrPath: PAGE } });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /Confirmation required/);
    assert.equal(replicateCalls().length, 0);

    const wrong = await send({ action, payload: { env: 'prod', jcrPath: PAGE, confirmText: 'other' } });
    assert.equal(wrong.ok, false);
    assert.equal(replicateCalls().length, 0);

    const allowed = await send({ action, payload: { env: 'prod', jcrPath: PAGE, confirmText: 'home' } });
    assert.equal(allowed.ok, true);
    assert.equal(replicateCalls().length, 1);
  });
}

test('delete on a protected environment needs the typed page name', async () => {
  route('/bin/wcmcommand', () => respond({ text: 'ok', type: 'text/plain' }));
  const blocked = await send({ action: 'DELETE_PAGE', payload: { env: 'prod', jcrPath: PAGE } });
  assert.equal(blocked.ok, false);
  assert.equal(calls.filter((c) => c.url.includes('/bin/wcmcommand')).length, 0);

  const allowed = await send({ action: 'DELETE_PAGE', payload: { env: 'prod', jcrPath: PAGE, confirmText: 'home' } });
  assert.equal(allowed.ok, true);
  assert.equal(calls.filter((c) => c.url.includes('/bin/wcmcommand')).length, 1);
});

test('tree publish on a protected environment needs the typed page name', async () => {
  const blocked = await send({ action: 'TREE_ACTIVATE', payload: { env: 'prod', jcrPath: PAGE } });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Confirmation required/);
  assert.equal(calls.length, 0);
});

test('non-protected environments publish without confirmation', async () => {
  const r = await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, true);
  assert.equal(replicateCalls().length, 1);
});

test('bulk publish on a protected environment needs the page count typed', async () => {
  const text = '/content/a\n/content/b\n/content/c';
  const blocked = await send({ action: 'BULK_REPLICATE', payload: { env: 'prod', text, confirmText: 'home' } });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Confirmation required/);
  assert.equal(replicateCalls().length, 0);

  const allowed = await send({ action: 'BULK_REPLICATE', payload: { env: 'prod', text, confirmText: '3' } });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.count, 3);
  assert.equal(replicateCalls().length, 1);
});

test('undo sync on a protected environment needs the typed page name', async () => {
  const blocked = await send({ action: 'UNDO_SYNC', payload: { env: 'prod', jcrPath: PAGE } });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Confirmation required/);
});

test('undo sync is refused without Developer Mode', async () => {
  stores.sync.enableDevMode = false;
  const r = await send({ action: 'UNDO_SYNC', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, false);
  assert.match(r.error, /Developer Mode/);
  assert.equal(calls.length, 0);
});

test('the environment of a content-script message comes from its tab, not the default', async () => {
  const r = await send({ action: 'PUBLISH_PAGE', payload: { jcrPath: PAGE } }, fromContentScript);
  assert.equal(r.ok, true);
  assert.ok(replicateCalls()[0].url.startsWith(DEV));
});
// ─── administrator control policy ─────────────────────────────────────────────

test('a control switched off for the team is refused before any AEM request', async () => {
  stores.managed = { controlPolicy: { disabledControls: ['delete', 'publish'] } };
  for (const [action, payload] of [
    ['DELETE_PAGE', { env: 'dev', jcrPath: PAGE }],
    ['PUBLISH_PAGE', { env: 'dev', jcrPath: PAGE }],
  ]) {
    const r = await send({ action, payload });
    assert.equal(r.ok, false);
    assert.match(r.error, /turned off by your administrator/);
  }
  assert.equal(calls.length, 0);
  // Controls that were not listed keep working.
  assert.equal((await send({ action: 'UNPUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } })).ok, true);
});

test('a per-environment rule blocks prod but leaves dev usable', async () => {
  stores.managed = { controlPolicy: { byEnvironment: { prod: { disabledControls: ['publish'] } } } };
  const prod = await send({ action: 'PUBLISH_PAGE', payload: { env: 'prod', jcrPath: PAGE, confirmText: 'home' } });
  assert.equal(prod.ok, false);
  assert.match(prod.error, /for prod/);
  assert.equal(replicateCalls().length, 0);
  assert.equal((await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } })).ok, true);
  assert.equal(replicateCalls().length, 1);
});

test('the policy follows the sender tab when the message names no environment', async () => {
  stores.managed = { controlPolicy: { byEnvironment: { dev: { disabledControls: ['publish'] } } } };
  const r = await send({ action: 'PUBLISH_PAGE', payload: { jcrPath: PAGE } }, fromContentScript);
  assert.equal(r.ok, false);
  assert.match(r.error, /for dev/);
});

test('a user cannot lift the policy by writing the same key into their own settings', async () => {
  stores.managed = { controlPolicy: { disabledControls: ['delete'] } };
  stores.sync.controlPolicy = { disabledControls: [] };
  const r = await send({ action: 'DELETE_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test('a user cannot add a policy of their own that the admin did not set', async () => {
  stores.sync.controlPolicy = { disabledControls: ['publish'] };
  const r = await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, true);
});

test('switching Developer Mode off by policy refuses Sync and is reported to the UI', async () => {
  stores.managed = { controlPolicy: { disabledControls: ['developerMode'] } };
  const cfg = await send({ action: 'GET_CONFIG' });
  assert.equal(cfg.enableDevMode, false);
  assert.deepEqual(cfg.controlPolicy.disabledControls, ['developerMode']);
  const r = await send({ action: 'UNDO_SYNC', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, false);
  assert.match(r.error, /Developer Mode/);
});

test('with no policy installed every control still works', async () => {
  const cfg = await send({ action: 'GET_CONFIG' });
  assert.deepEqual(cfg.controlPolicy, { disabledControls: [], byEnvironment: {} });
  assert.equal((await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } })).ok, true);
});

test('read-only actions are never blocked by the policy', async () => {
  stores.managed = { controlPolicy: { disabledControls: ['publish', 'unpublish', 'delete', 'lock'] } };
  assert.equal((await send({ action: 'GET_CONFIG' })).ok !== false, true);
  assert.equal((await send({ action: 'EVALUATE_AUDIT', payload: { facts: {} } })).ok, true);
});



// ─── read-only previews ───────────────────────────────────────────────────────

test('PREVIEW_TREE_ACTIVATE is read-only and needs no confirmation on a protected environment', async () => {
  route('/bin/querybuilder.json', () => respond({ json: { hits: [{ 'jcr:path': PAGE }, { 'jcr:path': `${PAGE}/a` }] } }));
  const r = await send({ action: 'PREVIEW_TREE_ACTIVATE', payload: { env: 'prod', jcrPath: PAGE } });
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
  assert.equal(replicateCalls().length, 0);
  assert.ok(calls.every((c) => (c.init.method || 'GET') === 'GET'));
});

test('DIFF_ENVS rejects an unknown environment without any request', async () => {
  const r = await send({ action: 'DIFF_ENVS', payload: { env: 'dev', otherEnv: 'nope', jcrPath: PAGE } });
  assert.deepEqual(r, { ok: false, error: 'Unknown environment.' });
  assert.equal(calls.length, 0);
});

// ─── action log and notifications ─────────────────────────────────────────────

test('a successful action is written to the action log and notified', async () => {
  await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  const { entries } = await send({ action: 'GET_ACTION_LOG' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'Publish');
  assert.equal(entries[0].env, 'dev');
  assert.equal(entries[0].path, PAGE);
  assert.equal(entries[0].ok, true);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /Page published/);
});

test('notifications can be turned off in Settings, the action is still logged', async () => {
  stores.sync.notifyOnActions = false;
  await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(notifications.length, 0);
  assert.equal((await send({ action: 'GET_ACTION_LOG' })).entries.length, 1);
});

test('a failed action is logged but not notified', async () => {
  routes = routes.filter((r) => r.match !== '/bin/replicate.json');
  route('/bin/replicate.json', () => respond({ status: 500, text: 'boom', type: 'text/plain' }));
  const r = await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, false);
  assert.equal(notifications.length, 0);
  const { entries } = await send({ action: 'GET_ACTION_LOG' });
  assert.equal(entries[0].ok, false);
});

test('a blocked action leaves no log entry', async () => {
  await send({ action: 'PUBLISH_PAGE', payload: { env: 'prod', jcrPath: PAGE } });
  assert.equal((await send({ action: 'GET_ACTION_LOG' })).entries.length, 0);
});

test('CLEAR_ACTION_LOG empties the log', async () => {
  await send({ action: 'PUBLISH_PAGE', payload: { env: 'dev', jcrPath: PAGE } });
  await send({ action: 'CLEAR_ACTION_LOG' });
  assert.equal((await send({ action: 'GET_ACTION_LOG' })).entries.length, 0);
});

// ─── Signed-out environments ─────────────────────────────────────────────────

test('a Browser Session environment that is signed out gets a login target in the response', async () => {
  stores.sync.environments.dev.authType = 'session';
  route('.json', () => respond({ text: '<html>login</html>', type: 'text/html' }));
  const r = await send({ action: 'GET_PAGE_STATUS', payload: { env: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.login, { env: 'dev', label: 'Dev', url: `${DEV}/` });
});

test('the wrapped error of a sync still carries the login target', async () => {
  stores.sync.allowUpwardSync = true;            // dev -> prod
  stores.sync.environments.prod.authType = 'session';
  route('.json', () => respond({ text: '<html>login</html>', type: 'text/html' }));
  const r = await send({ action: 'GET_SYNC_PLAN', payload: { env: 'prod', sourceEnv: 'dev', jcrPath: PAGE } });
  assert.equal(r.ok, false);
  assert.match(r.error, /^Check on prod failed: Session expired/);
  assert.equal(r.login?.env, 'prod');
});

test('no login target for other failures or for environments not using Browser Session', async () => {
  route('.json', () => respond({ status: 500, text: 'boom', type: 'text/plain' }));
  assert.equal((await send({ action: 'GET_PAGE_STATUS', payload: { env: 'dev', jcrPath: PAGE } })).login, undefined);
  routes = [];
  route('.json', () => respond({ status: 401, text: '', type: 'text/plain' }));
  assert.equal((await send({ action: 'GET_PAGE_STATUS', payload: { env: 'dev', jcrPath: PAGE } })).login, undefined); // dev uses basic auth
});

test('FLUSH_DISPATCHER and REPLACE_ACROSS_PAGES enforce confirmation on protected environments', async () => {
  const fBlocked = await send({ action: 'FLUSH_DISPATCHER', payload: { env: 'prod', path: PAGE } });
  assert.equal(fBlocked.ok, false);
  assert.match(fBlocked.error, /Confirmation required/);

  const rBlocked = await send({
    action: 'REPLACE_ACROSS_PAGES',
    payload: { env: 'prod', rootPath: PAGE, replacements: [{ propPath: `${PAGE}/jcr:content/jcr:title`, newValue: 'X' }] },
  });
  assert.equal(rBlocked.ok, false);
  assert.match(rBlocked.error, /Confirmation required/);
});

test('SET_PERSONA, REMOVE_PAGE_LIST_ITEM, CLEAR_PAGE_LIST, and profile quick links work via router', async () => {
  const sp = await send({ action: 'SET_PERSONA', payload: { persona: 'qa' } });
  assert.equal(sp.ok, true);
  assert.equal(stores.sync.persona, 'qa');

  await send({ action: 'RECORD_RECENT', payload: { env: 'dev', jcrPath: PAGE, title: 'Home' } });
  await send({ action: 'REMOVE_PAGE_LIST_ITEM', payload: { list: 'recent', env: 'dev', jcrPath: PAGE } });
  assert.equal((await send({ action: 'GET_PAGE_LISTS' })).recent.length, 0);

  stores.sync.profiles = { wknd: { contentRoot: '/content/wknd', appName: 'wknd' } };
  const ql = await send({ action: 'GET_QUICK_LINKS', payload: { env: 'dev', jcrPath: '/content/wknd/us/en' } });
  assert.equal(ql.ok, true);
  assert.ok(ql.links.some((l) => l.url.includes('/apps/wknd')));
});
