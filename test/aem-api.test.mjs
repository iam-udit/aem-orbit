import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal chrome.storage + fetch mocks ─────────────────────────────────────

const stores = { sync: {}, local: {} };

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

globalThis.chrome = { storage: { sync: makeArea('sync'), local: makeArea('local') } };

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

const api = await import('../src/shared/aem-api.js');

const AUTHOR = 'https://author-p1-e1.adobeaemcloud.com';

beforeEach(() => {
  stores.sync  = {
    enableDevMode: true, // Sync is a developer feature
    environments: {
      dev:  { authorHost: AUTHOR, authType: 'basic' },
      prod: { authorHost: 'https://author-p1-e9.adobeaemcloud.com', authType: 'session', protected: true },
    },
  };
  stores.local = { secrets: { dev: { username: 'admin', password: 'pw' } } };
  calls  = [];
  routes = [];
  route('/libs/granite/csrf/token.json', () => respond({ json: { token: 'tkn' } }));
});

// ─── Config / secrets ─────────────────────────────────────────────────────────

test('getConfig merges secrets from local storage', async () => {
  const cfg = await api.getConfig();
  assert.equal(cfg.environments.dev.username, 'admin');
  assert.equal(cfg.environments.dev.password, 'pw');
  assert.equal(cfg.environments.prod.protected, true);
});

test('getPublicConfig never exposes credentials', async () => {
  const cfg = await api.getPublicConfig();
  for (const env of Object.values(cfg.environments)) {
    assert.equal(env.username, undefined);
    assert.equal(env.password, undefined);
    assert.equal(env.bearerToken, undefined);
  }
  assert.equal(cfg.environments.dev.hasCredentials, true);
  assert.equal(cfg.environments.prod.hasCredentials, true); // session auth
});

test('migrateSecretsToLocal moves secrets out of sync', async () => {
  stores.sync.environments.stage = { authorHost: 'https://s', bearerToken: 'secret-token' };
  await api.migrateSecretsToLocal();
  assert.equal(stores.sync.environments.stage.bearerToken, undefined);
  assert.equal(stores.local.secrets.stage.bearerToken, 'secret-token');
  assert.equal(stores.local.secrets.dev.username, 'admin'); // existing kept
});

// ─── aemRequest ───────────────────────────────────────────────────────────────

test('basic auth header, omitted cookies, timeout signal', async () => {
  route('.infinity.json', () => respond({ json: { a: 1 } }));
  const r = await api.fetchJcrNode('dev', '/content/x/jcr:content');
  assert.equal(r.ok, true);
  const { init } = calls.at(-1);
  assert.equal(init.headers.Authorization, `Basic ${btoa('admin:pw')}`);
  assert.equal(init.credentials, 'omit');
  assert.ok(init.signal instanceof AbortSignal);
});

test('session auth includes cookies and sends no Authorization', async () => {
  route('.infinity.json', () => respond({ json: {} }));
  await api.fetchJcrNode('prod', '/content/x');
  const { init } = calls.at(-1);
  assert.equal(init.credentials, 'include');
  assert.equal(init.headers.Authorization, undefined);
});

test('HTML response is reported as expired session (not a JSON parse error)', async () => {
  route('.infinity.json', () => respond({ text: '<html>login</html>', type: 'text/html' }));
  const r = await api.fetchJcrNode('dev', '/content/x');
  assert.equal(r.ok, false);
  assert.match(r.error, /Session expired/);
});

test('401 gives a friendly error', async () => {
  route('.infinity.json', () => respond({ status: 401, text: '', type: 'text/plain' }));
  const r = await api.fetchJcrNode('dev', '/content/x');
  assert.match(r.error, /Not signed in/);
});

test('network failure returns a generic message (no internals leaked)', async () => {
  route('.infinity.json', () => { throw new TypeError('Failed to fetch at internal.host:1234'); });
  const r = await api.fetchJcrNode('dev', '/content/x');
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.error, /internal\.host/);
});

test('path segments are URL-encoded', async () => {
  route('.infinity.json', () => respond({ json: {} }));
  await api.fetchJcrNode('dev', '/content/a b/c#d');
  assert.ok(calls.at(-1).url.endsWith('/content/a%20b/c%23d.infinity.json'));
});

test('POSTs carry the CSRF token', async () => {
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  const r = await api.publishPage('dev', '/content/x');
  assert.equal(r.ok, true);
  const post = calls.find((c) => c.url.includes('/bin/replicate.json'));
  assert.equal(post.init.headers['CSRF-Token'], 'tkn');
  assert.match(post.init.body, /cmd=Activate/);
});

// ─── Operations ───────────────────────────────────────────────────────────────

test('getPageStatus: modified when lastModified > lastReplicated', async () => {
  route('/jcr:content.json', () => respond({ json: {
    'cq:lastReplicationAction': 'Activate',
    'cq:lastReplicated': '2024-01-01T00:00:00Z',
    'cq:lastModified':   '2024-02-01T00:00:00Z',
  } }));
  const r = await api.getPageStatus('dev', '/content/x');
  assert.equal(r.status, 'modified');
});

test('deletePage unpublishes a live page, then uses wcmcommand deletePage', async () => {
  route('/jcr:content.json', () => respond({ json: { 'cq:lastReplicationAction': 'Activate' } }));
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  route('/bin/wcmcommand', () => respond({ text: 'ok', type: 'text/plain' }));
  const r = await api.deletePage('dev', '/content/x');
  assert.equal(r.ok, true);
  const urls = calls.map((c) => c.url);
  const iRep = urls.findIndex((u) => u.includes('/bin/replicate.json'));
  const iDel = urls.findIndex((u) => u.includes('/bin/wcmcommand'));
  assert.ok(iRep !== -1 && iDel > iRep);
  assert.match(calls[iDel].init.body, /cmd=deletePage/);
  assert.match(calls[iDel].init.body, /force=false/);
});

test('deletePage reports referenced page (412)', async () => {
  route('/jcr:content.json', () => respond({ json: {} }));
  route('/bin/wcmcommand', () => respond({ status: 412, text: '', type: 'text/plain' }));
  const r = await api.deletePage('dev', '/content/x');
  assert.match(r.error, /referenced/);
});

test('getPageVersions reads version storage via jcr:uuid and maps labels', async () => {
  const uuid = 'abcdef12-0000-0000-0000-000000000000';
  route('/jcr:content.json', () => respond({ json: { 'jcr:uuid': uuid } }));
  route(`/jcr:system/jcr:versionStorage/ab/cd/ef/${uuid}.1.json`, () => respond({ json: {
    'jcr:rootVersion': { 'jcr:primaryType': 'nt:version' },
    '1.0': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-01-01T00:00:00Z', 'jcr:uuid': 'v1' },
    '1.1': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-03-01T00:00:00Z', 'jcr:uuid': 'v2' },
    'jcr:versionLabels': { 'jcr:primaryType': 'nt:versionLabels', 'Release A': 'v2' },
  } }));
  const r = await api.getPageVersions('dev', '/content/x');
  assert.equal(r.ok, true);
  assert.deepEqual(r.versions.map((v) => v.name), ['1.1', '1.0']);
  assert.deepEqual(r.versions[0].labels, ['Release A']);
});

test('getPageVersions orders versions created in the same second by version number', async () => {
  const uuid = 'abcdef12-0000-0000-0000-000000000000';
  route('/jcr:content.json', () => respond({ json: { 'jcr:uuid': uuid } }));
  const same = '2024-01-01T00:00:00Z';
  route(`/jcr:system/jcr:versionStorage/ab/cd/ef/${uuid}.1.json`, () => respond({ json: {
    '1.9':  { 'jcr:primaryType': 'nt:version', 'jcr:created': same, 'jcr:uuid': 'a' },
    '1.10': { 'jcr:primaryType': 'nt:version', 'jcr:created': same, 'jcr:uuid': 'b' },
    '1.2':  { 'jcr:primaryType': 'nt:version', 'jcr:created': same, 'jcr:uuid': 'c' },
  } }));
  const r = await api.getPageVersions('dev', '/content/x');
  assert.deepEqual(r.versions.map((v) => v.name), ['1.10', '1.9', '1.2']);
});

test('getPageVersions: never-versioned page returns empty list', async () => {
  route('/jcr:content.json', () => respond({ json: {} }));
  const r = await api.getPageVersions('dev', '/content/x');
  assert.deepEqual(r, { ok: true, versions: [] });
});

test('treeActivate lists descendants, skips deactivated, batches replication', async () => {
  const hits = [{ 'jcr:path': '/content/root' }];
  for (let i = 0; i < 60; i++) hits.push({ 'jcr:path': `/content/root/p${i}` });
  hits.push({ 'jcr:path': '/content/root/old', 'jcr:content': { 'cq:lastReplicationAction': 'Deactivate' } });
  route('/bin/querybuilder.json', () => respond({ json: { hits } }));
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));

  const r = await api.treeActivate('dev', '/content/root');
  assert.equal(r.ok, true);
  assert.equal(r.count, 61);
  const posts = calls.filter((c) => c.url.includes('/bin/replicate.json'));
  assert.equal(posts.length, 2); // 50 + 11
  assert.ok(!posts.some((p) => p.init.body.includes('old')));
});

test('treeActivate falls back to walking the tree when the search index misses pages', async () => {
  const page = (extra = {}) => ({ 'jcr:primaryType': 'cq:Page', 'jcr:content': { 'jcr:primaryType': 'cq:PageContent' }, ...extra });
  route('/bin/querybuilder.json', () => respond({ json: { hits: [] } }));
  route('/content/root/a.1.json', () => respond({ json: page({ child: page() }) }));
  route('/content/root/b.1.json', () => respond({ json: page() }));
  route('/content/root/a/child.1.json', () => respond({ json: page() }));
  route('/content/root/old.1.json', () => respond({ json: page() }));
  route('/content/root.1.json', () => respond({ json: page({
    a: page({ child: page() }),
    b: page(),
    old: page({ 'jcr:content': { 'cq:lastReplicationAction': 'Deactivate' } }),
  }) }));
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));

  const r = await api.treeActivate('dev', '/content/root');
  assert.equal(r.ok, true);
  assert.equal(r.count, 4); // root, a, a/child, b — "old" is deactivated
  const body = calls.find((c) => c.url.includes('/bin/replicate.json')).init.body;
  assert.ok(body.includes('a%2Fchild') || body.includes('a/child'));
  assert.ok(!body.includes('old'));
});

test('testConnection rejects anonymous', async () => {
  route('/libs/granite/security/currentuser.json', () => respond({ json: { authorizableId: 'anonymous' } }));
  const r = await api.testConnection({ authorHost: AUTHOR, authType: 'none' });
  assert.equal(r.ok, false);
  assert.match(r.error, /anonymous/);
});

test('testConnection returns the user id', async () => {
  route('/libs/granite/security/currentuser.json', () => respond({ json: { authorizableId: 'jane' } }));
  const r = await api.testConnection({ authorHost: AUTHOR, authType: 'basic', username: 'jane', password: 'x' });
  assert.deepEqual(r, { ok: true, user: 'jane' });
});

test('getUrlVariants encodes the properties item param', async () => {
  const v = await api.getUrlVariants('dev', '/content/a b');
  assert.ok(v.propertiesUrl.endsWith('?item=%2Fcontent%2Fa%20b'));
});

// ─── Phase 3: preview tier, dev views, component inspector ────────────────────

test('computeStatus reports preview tier separately', () => {
  const s = api.computeStatus({
    'cq:lastReplicationAction': 'Activate',
    'cq:lastReplicated': '2024-01-02T00:00:00Z',
    'cq:lastModified': '2024-01-03T00:00:00Z',
    'cq:lastReplicationAction_preview': 'Activate',
    'cq:lastReplicated_preview': '2024-01-04T00:00:00Z',
  });
  assert.equal(s.status, 'modified');
  assert.equal(s.previewStatus, 'published');
  assert.equal(s.lastReplicatedPreview, '2024-01-04T00:00:00Z');
  assert.equal(api.computeStatus({}).previewStatus, null);
});

test('publishToPreview sends agentId=preview', async () => {
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  const r = await api.publishToPreview('dev', '/content/x');
  assert.equal(r.ok, true);
  const post = calls.find((c) => c.url.includes('/bin/replicate.json'));
  assert.match(post.init.body, /agentId=preview/);
  assert.match(post.init.body, /cmd=Activate/);
});

test('publishPage does not target the preview agent', async () => {
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  await api.publishPage('dev', '/content/x');
  const post = calls.find((c) => c.url.includes('/bin/replicate.json'));
  assert.doesNotMatch(post.init.body, /agentId/);
});

test('getUrlVariants returns mode and developer views', async () => {
  stores.sync.environments.dev.previewHost = 'https://preview-p1-e1.adobeaemcloud.com';
  const v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.equal(v.authorDisabledUrl, `${AUTHOR}/content/site/en/page.html?wcmmode=disabled`);
  assert.equal(v.sitesConsoleUrl,   `${AUTHOR}/sites.html/content/site/en/page?layout=column`);
  assert.equal(v.crxdeUrl,          `${AUTHOR}/crx/de/index.jsp#/content/site/en/page/jcr%3Acontent`);
  assert.equal(v.modelJsonUrl,      `${AUTHOR}/content/site/en/page.model.json`);
  assert.equal(v.previewUrl,        'https://preview-p1-e1.adobeaemcloud.com/content/site/en/page.html');
  assert.match(v.debugClientLibsUrl, /debugClientLibs=true/);
});

test('getUrlVariants adds a Universal Editor link on an https author, using the configured organisation', async () => {
  let v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.equal(v.universalEditorUrl, 'https://experience.adobe.com/#/@adobe/aem/editor/canvas/author-p1-e1.adobeaemcloud.com/content/site/en/page.html');
  stores.sync.imsOrg = 'my-org';
  v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.match(v.universalEditorUrl, /#\/@my-org\/aem\/editor\/canvas\//);
  stores.sync.imsOrg = 'bad org/../x';
  v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.match(v.universalEditorUrl, /#\/@adobe\//, 'an unusable organisation falls back to adobe');
});

test('getUrlVariants maps publish/preview URLs through urlMappings when enabled, author URLs stay on the JCR path', async () => {
  stores.sync.urlMappings = '/content/site/en = /en-us';
  stores.sync.environments.dev.publishUsesMappings = true;
  stores.sync.environments.dev.publishHost = 'https://publish-p1-e1.adobeaemcloud.com';
  stores.sync.environments.dev.previewHost = 'https://preview-p1-e1.adobeaemcloud.com';
  const v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.equal(v.publishUrl, 'https://publish-p1-e1.adobeaemcloud.com/en-us/page.html');
  assert.equal(v.previewUrl, 'https://preview-p1-e1.adobeaemcloud.com/en-us/page.html');
  assert.equal(v.authorEditUrl, `${AUTHOR}/editor.html/content/site/en/page.html`);
});

test('getUrlVariants liveUrl prefers the CDN host and falls back to Publish', async () => {
  stores.sync.environments.dev.publishHost = 'https://publish-p1-e1.adobeaemcloud.com';
  stores.sync.environments.dev.dispatcherHost = '';
  let v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.equal(v.liveUrl, 'https://publish-p1-e1.adobeaemcloud.com/content/site/en/page.html');
  stores.sync.environments.dev.dispatcherHost = 'https://www.example.com';
  v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.equal(v.liveUrl, 'https://www.example.com/content/site/en/page.html');
});

test('getUrlVariants: with "Apply URL mapping to Publish / Preview" off, publish/preview use the full path and the dispatcher still maps', async () => {
  stores.sync.urlMappings = '/content/adobe-cms/us/en = /us-en';
  stores.sync.environments.dev.publishHost = 'http://localhost:4503';
  stores.sync.environments.dev.previewHost = 'http://localhost:4504';
  stores.sync.environments.dev.dispatcherHost = '';
  let v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.publishUrl, 'http://localhost:4503/content/adobe-cms/us/en/products.html');
  assert.equal(v.previewUrl, 'http://localhost:4504/content/adobe-cms/us/en/products.html');
  assert.equal(v.liveUrl,    'http://localhost:4503/content/adobe-cms/us/en/products.html');
  stores.sync.environments.dev.dispatcherHost = 'http://localhost:8080';
  v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.liveUrl,       'http://localhost:8080/us-en/products.html');
  assert.equal(v.dispatcherUrl, 'http://localhost:8080/us-en/products.html');
  assert.equal(v.publishUrl,    'http://localhost:4503/content/adobe-cms/us/en/products.html');
});

test('getUrlVariants: with "Apply URL mapping to Publish / Preview" on, publish and the liveUrl fallback use the mapping', async () => {
  stores.sync.urlMappings = '/content/site/en = /en';
  stores.sync.environments.dev.dispatcherHost = '';
  stores.sync.environments.dev.publishHost = 'https://publish.example.com';
  stores.sync.environments.dev.publishUsesMappings = true;
  const v = await api.getUrlVariants('dev', '/content/site/en/page');
  assert.equal(v.publishUrl, 'https://publish.example.com/en/page.html');
  assert.equal(v.liveUrl,    'https://publish.example.com/en/page.html');
});

test('getUrlVariants: "Omit .html" drops the extension on Dispatcher / CDN URLs only', async () => {
  stores.sync.urlMappings = '/content/adobe-cms/us/en = /us-en';
  stores.sync.environments.dev.publishHost = 'http://localhost:4503';
  stores.sync.environments.dev.dispatcherHost = 'https://www.example.com';
  let v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.dispatcherUrl, 'https://www.example.com/us-en/products.html');
  stores.sync.environments.dev.dispatcherOmitHtml = true;
  v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.dispatcherUrl, 'https://www.example.com/us-en/products');
  assert.equal(v.liveUrl,       'https://www.example.com/us-en/products');
  assert.equal(v.publishUrl,    'http://localhost:4503/content/adobe-cms/us/en/products.html');
  v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en');
  assert.equal(v.liveUrl, 'https://www.example.com/us-en');
  stores.sync.environments.dev.dispatcherHost = '';
  v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.liveUrl, 'http://localhost:4503/content/adobe-cms/us/en/products.html');
});

test('getUrlVariants: "Omit .html" also applies to Publish / Preview when URL mapping is applied to them', async () => {
  stores.sync.urlMappings = '/content/adobe-cms/us/en = /us-en';
  stores.sync.environments.dev.publishHost = 'https://publish.example.com';
  stores.sync.environments.dev.previewHost = 'https://preview.example.com';
  stores.sync.environments.dev.dispatcherHost = '';
  stores.sync.environments.dev.dispatcherOmitHtml = true;
  let v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.publishUrl, 'https://publish.example.com/content/adobe-cms/us/en/products.html'); // no mapping: direct publisher
  stores.sync.environments.dev.publishUsesMappings = true;
  v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.publishUrl, 'https://publish.example.com/us-en/products');
  assert.equal(v.previewUrl, 'https://preview.example.com/us-en/products');
  assert.equal(v.liveUrl,    'https://publish.example.com/us-en/products');
  stores.sync.environments.dev.dispatcherOmitHtml = false;
  v = await api.getUrlVariants('dev', '/content/adobe-cms/us/en/products');
  assert.equal(v.publishUrl, 'https://publish.example.com/us-en/products.html');
});

test('resolveLocaleUrls maps page URLs to the current tier / view and leaves other URLs alone', async () => {
  stores.sync.environments.dev.publishHost = 'https://publish-p1-e1.adobeaemcloud.com';
  const urls = [
    'https://publish-p1-e1.adobeaemcloud.com/content/site/us/en/page.html',
    'mailto:someone@example.com',
    'https://other-author.adobeaemcloud.com/content/site/it/it/page',
  ];
  const view = await api.resolveLocaleUrls('dev', urls, { tier: 'author', inEditor: false, wcmDisabled: true });
  assert.equal(view[0], `${AUTHOR}/content/site/us/en/page.html?wcmmode=disabled`);
  assert.equal(view[1], urls[1]); // not a web page link: left alone
  // a host that is not configured (hreflang pointing elsewhere) still moves to the current host
  assert.equal(view[2], `${AUTHOR}/content/site/it/it/page.html?wcmmode=disabled`);
  const edit = await api.resolveLocaleUrls('dev', urls, { tier: 'author', inEditor: true });
  assert.equal(edit[0], `${AUTHOR}/editor.html/content/site/us/en/page.html`);
  const pub = await api.resolveLocaleUrls('dev', urls, { tier: 'publish' });
  assert.equal(pub[0], urls[0]);
});

test('getMsmTargets lists only the live copies that exist, skipping the current one', async () => {
  const page = (extra = {}) => ({ 'jcr:primaryType': 'cq:Page', ...extra });
  route('/content/site.2.json', () => respond({ json: {
    'jcr:primaryType': 'cq:Page',
    'language-masters': page({ en: page() }),
    us: page({ en: page() }),
    gb: page({ en: page() }),
    de: page({ de: page() }),   // different language: not a copy of an "en" page
    jcr_content: { 'jcr:primaryType': 'nt:unstructured' },
  } }));
  route('/content/site/us/en/a/jcr:content.json', () => respond({ json: {} }));
  // gb has no /a page, so it must be dropped
  const fromMaster = await api.getMsmTargets('dev', '/content/site/language-masters/en/a');
  assert.deepEqual(fromMaster.targets.map((t) => t.path), ['/content/site/us/en/a']);

  const fromCopy = await api.getMsmTargets('dev', '/content/site/us/en');
  assert.deepEqual(fromCopy.targets.map((t) => `${t.role}:${t.path}`), [
    'livecopy:/content/site/gb/en',
    'master:/content/site/language-masters/en',
  ]);
});

test('getMsmTargets returns nothing for non-MSM paths', async () => {
  const r = await api.getMsmTargets('dev', '/content/site/about');
  assert.deepEqual(r, { ok: true, msm: null, targets: [] });
});

test('getComponentUrls prefixes relative resource types with /apps/', async () => {
  const u = await api.getComponentUrls('dev', '/content/p/jcr:content/root/text', 'myapp/components/text');
  assert.equal(u.crxdeTypeUrl, `${AUTHOR}/crx/de/index.jsp#/apps/myapp/components/text`);
  assert.equal(u.crxdeNodeUrl, `${AUTHOR}/crx/de/index.jsp#/content/p/jcr%3Acontent/root/text`);
  const empty = await api.getComponentUrls('dev', '', '');
  assert.deepEqual(empty, { crxdeNodeUrl: '', crxdeTypeUrl: '' });
});

// ─── Phase 4a: rich status, lock, references, drift, bulk, lists ──────────────

test('computeStatus exposes rich status fields', () => {
  const s = api.computeStatus({
    'jcr:title': 'Home',
    'cq:lastModifiedBy': 'jane',
    'cq:lastReplicatedBy': 'author',
    'jcr:lockOwner': 'jane',
    onTime: '2030-01-01T00:00:00Z',
    'jcr:mixinTypes': ['cq:LiveRelationship'],
  });
  assert.equal(s.title, 'Home');
  assert.equal(s.lastModifiedBy, 'jane');
  assert.equal(s.lastReplicatedBy, 'author');
  assert.equal(s.lockOwner, 'jane');
  assert.equal(s.onTime, '2030-01-01T00:00:00Z');
  assert.equal(s.isLiveCopy, true);
});

test('setPageLock posts lockPage / unlockPage to wcmcommand', async () => {
  route('/bin/wcmcommand', () => respond({ text: 'ok', type: 'text/plain' }));
  assert.equal((await api.setPageLock('dev', '/content/x', true)).ok, true);
  assert.equal((await api.setPageLock('dev', '/content/x', false)).ok, true);
  const bodies = calls.filter((c) => c.url.includes('/bin/wcmcommand')).map((c) => c.init.body);
  assert.match(bodies[0], /cmd=lockPage/);
  assert.match(bodies[1], /cmd=unlockPage/);
});

test('checkReferences returns only unpublished / outdated references', async () => {
  route('/libs/wcm/core/content/reference.json', () => respond({ json: { pages: [
    { path: '/content/x', published: false },                              // the page itself
    { path: '/content/dam/a.jpg', type: 'asset', published: false },
    { path: '/content/dam/b.jpg', type: 'asset', published: true, outdated: true },
    { path: '/content/dam/c.jpg', type: 'asset', published: true },
  ] } }));
  const r = await api.checkReferences('dev', '/content/x');
  assert.equal(r.ok, true);
  assert.deepEqual(r.references.map((x) => [x.path, x.state]), [
    ['/content/dam/a.jpg', 'unpublished'],
    ['/content/dam/b.jpg', 'outdated'],
  ]);
});

test('checkReferences reads the `assets` list returned by real AEM', async () => {
  route('/libs/wcm/core/content/reference.json', () => respond({ json: { assets: [
    { type: 'contentpolicy', path: '/conf/p1', name: 'P1', published: true, outdated: true, status: 'outdated' },
    { type: 'contentpolicy', path: '/conf/p2', name: 'P2', published: false, status: 'not available' },
    { type: 'asset', path: '/content/dam/ok.jpg', name: 'ok', published: true, outdated: false, status: 'published' },
  ] } }));
  const r = await api.checkReferences('dev', '/content/x');
  assert.deepEqual(r.references.map((x) => [x.path, x.state]), [['/conf/p1', 'outdated'], ['/conf/p2', 'unpublished']]);
});

test('canonicalContent ignores volatile properties and key order', () => {
  const a = { 'jcr:title': 'T', 'cq:lastModified': '1', root: { b: 1, a: 2, 'jcr:uuid': 'x' } };
  const b = { root: { a: 2, b: 1, 'jcr:uuid': 'y' }, 'cq:lastModified': '2', 'jcr:title': 'T' };
  assert.equal(JSON.stringify(api.canonicalContent(a)), JSON.stringify(api.canonicalContent(b)));
});

test('compareEnvironments fingerprints content and flags missing pages', async () => {
  stores.sync.environments.prod.authorHost = 'https://author-p1-e9.adobeaemcloud.com';
  route(/author-p1-e1.*infinity\.json/, () => respond({ json: { 'jcr:title': 'T', 'cq:lastModified': '1' } }));
  route(/author-p1-e9.*infinity\.json/, () => respond({ status: 404, text: 'nf', type: 'text/plain' }));
  const r = await api.compareEnvironments('/content/x');
  const dev  = r.results.find((x) => x.env === 'dev');
  const prod = r.results.find((x) => x.env === 'prod');
  assert.equal(dev.exists, true);
  assert.match(dev.hash, /^[0-9a-f]{64}$/);
  assert.equal(prod.exists, false);
});

// ─── Content sync ─────────────────────────────────────────────────────────────

const PROD = 'https://author-p1-e9.adobeaemcloud.com';
const notFound = () => respond({ status: 404, text: 'nf', type: 'text/plain' });

function syncRoutes({ existing = [] } = {}) {
  // source = prod (session auth), target = dev
  route(new RegExp(`${PROD}/content/s/en/page/jcr:content\\.infinity\\.json`), () => respond({ json: { 'jcr:primaryType': 'cq:PageContent', 'jcr:title': 'P', 'jcr:uuid': 'u', root: { text: 'hi' } } }));
  route(new RegExp(`${PROD}/content/s(/en)?(/page)?/jcr:content\\.json`), () => respond({ json: { 'jcr:title': 'Title', 'cq:template': '/conf/t', 'sling:resourceType': 'a/page' } }));
  route(/author-p1-e1.*\.json$/, (url) => (existing.some((p) => url.endsWith(`${p}.json`)) ? respond({ json: {} }) : notFound()));
  route(/author-p1-e1.*\/content\/s/, () => respond({ text: '', type: 'text/html' }));
}
const writes = () => calls.filter((c) => c.init.method === 'POST' && c.url.startsWith(AUTHOR) && !c.url.includes('csrf'));

test('getSyncPlan: existing page needs nothing created', async () => {
  syncRoutes({ existing: ['/content/s/en/page'] });
  assert.deepEqual(await api.getSyncPlan('prod', 'dev', '/content/s/en/page'), { ok: true, exists: true, missingParents: [] });
});

test('getSyncPlan: lists missing parents outermost first', async () => {
  syncRoutes({ existing: ['/content/s'] });
  assert.deepEqual(await api.getSyncPlan('prod', 'dev', '/content/s/en/page'), { ok: true, exists: false, missingParents: ['/content/s/en'] });
});

test('getSyncPlan: rejects DAM assets, non-content paths and same env', async () => {
  assert.equal((await api.getSyncPlan('prod', 'dev', '/content/dam/a.png')).ok, false);
  assert.equal((await api.getSyncPlan('prod', 'dev', '/apps/x')).ok, false);
  assert.equal((await api.getSyncPlan('dev', 'dev', '/content/x')).ok, false);
});

test('syncContentPage: missing target page is NOT created unless createMissing', async () => {
  syncRoutes({ existing: ['/content/s'] });
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'TARGET_MISSING');
  assert.equal(writes().length, 0);
});

test('syncContentPage: createMissing creates parents then page as cq:Page/cq:PageContent, then imports content', async () => {
  syncRoutes({ existing: ['/content/s'] });
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page', { createMissing: true });
  assert.deepEqual(r, { ok: true, created: ['/content/s/en', '/content/s/en/page'], backup: false });
  const w = writes();
  assert.deepEqual(w.map((c) => c.url.replace(AUTHOR, '')), ['/content/s/en', '/content/s/en/page', '/content/s/en/page/jcr:content']);
  const skeleton = new URLSearchParams(w[1].init.body);
  assert.equal(skeleton.get('jcr:primaryType'), 'cq:Page');
  assert.equal(skeleton.get('jcr:content/jcr:primaryType'), 'cq:PageContent');
  assert.equal(skeleton.get('jcr:content/cq:template'), '/conf/t');
  const imp = new URLSearchParams(w[2].init.body);
  assert.equal(imp.get(':operation'), 'import');
  assert.equal(imp.get(':content').includes('jcr:uuid'), false);
});

test('syncContentPage: existing page is backed up as a labelled version, then overwritten', async () => {
  syncRoutes({ existing: ['/content/s/en/page'] });
  route('/bin/wcmcommand', () => respond({ text: '', type: 'text/html' }));
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
  assert.deepEqual(r, { ok: true, created: [], backup: true });
  const w = writes();
  assert.equal(w.length, 2);
  const backup = new URLSearchParams(w[0].init.body);
  assert.equal(w[0].url.endsWith('/bin/wcmcommand'), true);
  assert.equal(backup.get('cmd'), 'createVersion');
  assert.equal(backup.get('path'), '/content/s/en/page');
  assert.match(backup.get('label'), /^before-sync-from-prod-\d{17}$/);
  assert.equal(w[1].url.replace(AUTHOR, ''), '/content/s/en/page/jcr:content');   // overwrite comes after the backup
});

test('syncContentPage: if the backup fails nothing is overwritten', async () => {
  syncRoutes({ existing: ['/content/s/en/page'] });
  route('/bin/wcmcommand', () => respond({ status: 500, text: 'boom', type: 'text/plain' }));
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing was changed/);
  assert.equal(writes().some((c) => c.url.endsWith('/jcr:content')), false);
});

test('sync lower → higher is refused by default, before anything is read or written', async () => {
  syncRoutes({ existing: ['/content/s/en/page'] });
  const plan = await api.getSyncPlan('dev', 'prod', '/content/s/en/page');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /lower to higher/);
  const r = await api.syncContentPage('dev', 'prod', '/content/s/en/page');
  assert.equal(r.ok, false);
  assert.match(r.error, /Allow syncing to higher environments/);
  assert.equal(calls.length, 0);
});

test('sync is refused unless Developer Mode and its Sync button are on', async () => {
  syncRoutes({ existing: ['/content/s/en/page'] });
  for (const off of [{ enableDevMode: false }, { devToolsButtons: { sync: false } }]) {
    stores.sync = { ...stores.sync, enableDevMode: true, ...off };
    const plan = await api.getSyncPlan('prod', 'dev', '/content/s/en/page');
    assert.equal(plan.ok, false);
    assert.match(plan.error, /Developer Mode/);
    const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
    assert.equal(r.ok, false);
    assert.match(r.error, /Developer Mode/);
  }
  assert.equal(calls.length, 0);
});

test('sync lower → higher works once allowUpwardSync is on', async () => {
  stores.sync.allowUpwardSync = true;
  route(/author-p1-e9.*\.json$/, () => respond({ json: {} }));
  const plan = await api.getSyncPlan('dev', 'prod', '/content/s/en/page');
  assert.deepEqual(plan, { ok: true, exists: true, missingParents: [] });
});

test('bulkReplicate validates paths and batches', async () => {
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  const paths = Array.from({ length: 60 }, (_, i) => `/content/p${i}`);
  const r = await api.bulkReplicate('dev', [...paths, '/etc/evil', 'not-a-path'], 'Activate');
  assert.equal(r.ok, true);
  assert.equal(r.count, 60);
  assert.deepEqual(r.published, paths);
  assert.deepEqual(r.failed, []);
  assert.equal(calls.filter((c) => c.url.includes('/bin/replicate.json')).length, 2);
  assert.equal((await api.bulkReplicate('dev', ['/etc/x'])).ok, false);
  assert.equal((await api.bulkReplicate('dev', ['/content/x'], 'Delete')).ok, false);
});

test('bulkReplicate keeps going after a failed batch and reports exactly which pages failed', async () => {
  let n = 0;
  route('/bin/replicate.json', () => (++n === 1 ? respond({ status: 500, text: 'boom', type: 'text/plain' }) : respond({ text: 'ok', type: 'text/plain' })));
  const paths = Array.from({ length: 60 }, (_, i) => `/content/p${i}`);
  const r = await api.bulkReplicate('dev', paths, 'Activate');
  assert.equal(r.ok, false);
  assert.equal(r.failed.length, 50);          // first batch
  assert.deepEqual(r.published, paths.slice(50)); // second batch still went through
  assert.match(r.error, /published 10 of 60/);
  assert.match(r.error, /\/content\/p0/);
});

test('treeActivate reports published and failed pages when a batch fails', async () => {
  const hits = [{ 'jcr:path': '/content/root' }];
  for (let i = 0; i < 60; i++) hits.push({ 'jcr:path': `/content/root/p${i}` });
  route('/bin/querybuilder.json', () => respond({ json: { hits } }));
  let n = 0;
  route('/bin/replicate.json', () => (++n === 2 ? respond({ status: 500, text: 'boom', type: 'text/plain' }) : respond({ text: 'ok', type: 'text/plain' })));
  const r = await api.treeActivate('dev', '/content/root');
  assert.equal(r.ok, false);
  assert.equal(r.published.length, 50);
  assert.equal(r.failed.length, 11);
});

test('previewTreeActivate counts pages and skipped ones without publishing anything', async () => {
  const hits = [
    { 'jcr:path': '/content/root' },
    { 'jcr:path': '/content/root/a' },
    { 'jcr:path': '/content/root/old', 'jcr:content': { 'cq:lastReplicationAction': 'Deactivate' } },
  ];
  route('/bin/querybuilder.json', () => respond({ json: { hits } }));
  const r = await api.previewTreeActivate('dev', '/content/root');
  assert.deepEqual(r, { ok: true, count: 2, skipped: 1, sample: ['/content/root', '/content/root/a'] });
  assert.equal(calls.some((c) => c.url.includes('/bin/replicate.json')), false);
});

test('tree walk fetches siblings in parallel but returns every page once', async () => {
  const page = (extra = {}) => ({ 'jcr:primaryType': 'cq:Page', 'jcr:content': { 'jcr:primaryType': 'cq:PageContent' }, ...extra });
  route('/bin/querybuilder.json', () => respond({ json: { hits: [] } }));
  const kids = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, page({ leaf: page() })]));
  route('/content/root.1.json', () => respond({ json: page(kids) }));
  for (let i = 0; i < 10; i++) {
    route(`/content/root/k${i}.1.json`, () => respond({ json: page({ leaf: page() }) }));
    route(`/content/root/k${i}/leaf.1.json`, () => respond({ json: page() }));
  }
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  const r = await api.treeActivate('dev', '/content/root');
  assert.equal(r.ok, true);
  assert.equal(r.count, 21); // root + 10 children + 10 leaves
  assert.equal(new Set(r.published).size, 21);
});

// ─── Transient failures ───────────────────────────────────────────────────────

test('GET requests are retried on 503', async () => {
  let n = 0;
  route('.infinity.json', () => (++n === 1 ? respond({ status: 503, text: '', type: 'text/plain' }) : respond({ json: { ok: 1 } })));
  const r = await api.fetchJcrNode('dev', '/content/x');
  assert.equal(r.ok, true);
  assert.equal(n, 2);
});

test('GET requests are retried on a network blip', async () => {
  let n = 0;
  route('.infinity.json', () => { if (++n === 1) throw new TypeError('blip'); return respond({ json: {} }); });
  assert.equal((await api.fetchJcrNode('dev', '/content/y')).ok, true);
  assert.equal(n, 2);
});

test('a persistent 503 is reported after two retries, with growing delays', async () => {
  let n = 0;
  const stamps = [];
  route('.infinity.json', () => { n++; stamps.push(Date.now()); return respond({ status: 503, text: '', type: 'text/plain' }); });
  const r = await api.fetchJcrNode('dev', '/content/x');
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(n, 3);
  const [first, second] = [stamps[1] - stamps[0], stamps[2] - stamps[1]];
  assert.ok(first >= 380, `first retry waited ${first}ms`);
  assert.ok(second >= 780, `second retry waited ${second}ms (backoff doubles)`);
});

test('undoSync without a stored snapshot restores the newest before-sync version from AEM', async () => {
  const uuid = 'abcdef12-0000-0000-0000-000000000000';
  route('/jcr:content.json', () => respond({ json: { 'jcr:uuid': uuid } }));
  route(`/jcr:system/jcr:versionStorage/ab/cd/ef/${uuid}.1.json`, () => respond({ json: {
    'jcr:rootVersion': { 'jcr:primaryType': 'nt:version' },
    '1.0': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-01-01T00:00:00Z', 'jcr:uuid': 'v1' },
    '1.1': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-03-01T00:00:00Z', 'jcr:uuid': 'v2' },
    '1.2': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-05-01T00:00:00Z', 'jcr:uuid': 'v3' },
    'jcr:versionLabels': { 'jcr:primaryType': 'nt:versionLabels', 'before-sync-from-prod': 'v2', 'Release': 'v3' },
  } }));
  route('/bin/wcmcommand', () => respond({ text: '', type: 'text/html' }));

  const r = await api.undoSync('dev', '/content/s/en/page');
  assert.equal(r.ok, true);
  assert.equal(r.restoredVersion, '1.1');
  const post = calls.find((c) => c.url.includes('/bin/wcmcommand'));
  const form = new URLSearchParams(String(post.init.body));
  assert.equal(form.get('cmd'), 'restoreVersion');
  assert.equal(form.get('path'), '/content/s/en/page');
  assert.equal(form.get('id'), 'v2', 'the servlet identifies a version by its UUID');
  assert.equal(form.get('versionName'), null);
});

test('undoSync with no snapshot and no before-sync version says so and writes nothing', async () => {
  route('/jcr:content.json', () => respond({ json: {} }));
  const r = await api.undoSync('dev', '/content/s/en/page');
  assert.equal(r.ok, false);
  assert.match(r.error, /Nothing to undo/);
  assert.equal(calls.filter((c) => c.init.method === 'POST' && !c.url.includes('csrf')).length, 0);
});

test('POSTs are never retried, so a write cannot be applied twice', async () => {
  let n = 0;
  route('/bin/replicate.json', () => { n++; return respond({ status: 503, text: '', type: 'text/plain' }); });
  const r = await api.publishPage('dev', '/content/x');
  assert.equal(r.ok, false);
  assert.equal(n, 1);
});

test('401 and 404 are not retried', async () => {
  let n = 0;
  route('.infinity.json', () => { n++; return respond({ status: 404, text: '', type: 'text/plain' }); });
  await api.fetchJcrNode('dev', '/content/x');
  assert.equal(n, 1);
});

// ─── Environment diff ─────────────────────────────────────────────────────────

test('diffEnvironments lists property changes between two environments and ignores volatile ones', async () => {
  route(/author-p1-e1.*infinity\.json/, () => respond({ json: { 'jcr:title': 'New', 'cq:lastModified': '2', root: { text: 'same', extra: 'x' } } }));
  route(/author-p1-e9.*infinity\.json/, () => respond({ json: { 'jcr:title': 'Old', 'cq:lastModified': '1', root: { text: 'same' } } }));
  const r = await api.diffEnvironments('dev', 'prod', '/content/x');
  assert.equal(r.ok, true);
  assert.deepEqual(r.changes.map((c) => [c.kind, c.path]), [
    ['changed', 'jcr:content/jcr:title'],
    ['added', 'jcr:content/root/extra'],
  ]);
  assert.equal(r.total, 2);
});

test('diffEnvironments says which side is missing and refuses bad input', async () => {
  route(/author-p1-e1.*infinity\.json/, () => respond({ json: {} }));
  route(/author-p1-e9.*infinity\.json/, () => respond({ status: 404, text: '', type: 'text/plain' }));
  const r = await api.diffEnvironments('dev', 'prod', '/content/x');
  assert.deepEqual([r.ok, r.baseExists, r.otherExists], [true, true, false]);
  assert.equal((await api.diffEnvironments('dev', 'dev', '/content/x')).ok, false);
  assert.equal((await api.diffEnvironments('dev', 'prod', '/etc/x')).ok, false);
});

// ─── Sync undo ────────────────────────────────────────────────────────────────

test('sync replaces child nodes and removes properties the source does not have', async () => {
  route(new RegExp(`${AUTHOR}/content/s/en/page/jcr:content\\.json$`), () => respond({ json: { 'jcr:primaryType': 'cq:PageContent', 'jcr:title': 'Old', stale: 'x', 'jcr:uuid': 'keep', 'cq:lastReplicated': 'keep' } }));
  route(new RegExp(`${AUTHOR}/content/s/en/page/jcr:content\\.infinity\\.json`), () => respond({ json: { 'jcr:title': 'Old', stale: 'x' } }));
  syncRoutes({ existing: ['/content/s/en/page'] });
  route('/bin/wcmcommand', () => respond({ text: '', type: 'text/html' }));
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
  assert.equal(r.ok, true);
  const w = writes().filter((c) => c.url.endsWith('/jcr:content'));
  const imp = new URLSearchParams(String(w[0].init.body));
  assert.equal(imp.get(':replace'), 'true');
  assert.equal(imp.get(':replaceProperties'), 'true');
  const del = new URLSearchParams(String(w[1].init.body));
  assert.deepEqual([...del.keys()].filter((k) => k.endsWith('@Delete')), ['stale@Delete']);
});

test('sync stores the target content first, and undoSync writes it back once', async () => {
  // The first matching route wins, so the target's own read is registered before syncRoutes' catch-alls.
  route(new RegExp(`${AUTHOR}/content/s/en/page/jcr:content\\.infinity\\.json`), () => respond({ json: { 'jcr:title': 'Before', 'jcr:uuid': 'u', root: { text: 'old' } } }));
  syncRoutes({ existing: ['/content/s/en/page'] });
  route('/bin/wcmcommand', () => respond({ text: '', type: 'text/html' }));
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
  assert.equal(r.ok, true);
  assert.equal(r.undo, true);
  assert.equal(stores.local.syncSnapshots.length, 1);
  assert.equal(stores.local.syncSnapshots[0].content['jcr:uuid'], undefined); // stripped like any sync write

  const before = writes().length;
  const u = await api.undoSync('dev', '/content/s/en/page');
  assert.equal(u.ok, true);
  const w = writes().slice(before);
  assert.equal(w.length, 1);
  assert.equal(w[0].url.replace(AUTHOR, ''), '/content/s/en/page/jcr:content');
  assert.equal(JSON.parse(new URLSearchParams(w[0].init.body).get(':content'))['jcr:title'], 'Before');
  assert.equal(stores.local.syncSnapshots.length, 0);
  assert.equal((await api.undoSync('dev', '/content/s/en/page')).ok, false); // nothing left to undo
});

test('syncing still works when the snapshot cannot be read, just without undo', async () => {
  syncRoutes({ existing: ['/content/s/en/page'] });
  route('/bin/wcmcommand', () => respond({ text: '', type: 'text/html' }));
  const r = await api.syncContentPage('prod', 'dev', '/content/s/en/page');
  assert.equal(r.ok, true);
  assert.equal(r.undo, undefined);
});

test('only the five newest sync snapshots are kept', async () => {
  route('/bin/wcmcommand', () => respond({ text: '', type: 'text/html' }));
  const pages = Array.from({ length: 7 }, (_, i) => `/content/s/en/p${i}`);
  route(new RegExp(`${PROD}/.*infinity\\.json`), () => respond({ json: { root: {} } }));
  route(new RegExp(`${PROD}/.*jcr:content\\.json`), () => respond({ json: {} }));
  route(/author-p1-e1.*infinity\.json/, () => respond({ json: { a: 1 } }));
  route(/author-p1-e1.*\.json$/, () => respond({ json: {} }));   // every page exists on the target
  route(/author-p1-e1.*\/content\/s/, () => respond({ text: '', type: 'text/html' }));
  for (const p of pages) assert.equal((await api.syncContentPage('prod', 'dev', p)).ok, true);
  assert.equal(stores.local.syncSnapshots.length, 5);
  assert.equal(stores.local.syncSnapshots[0].path, pages.at(-1));
});

test('undoSync follows the Sync safety rules', async () => {
  stores.sync.enableDevMode = false;
  const r = await api.undoSync('dev', '/content/s/en/page');
  assert.equal(r.ok, false);
  assert.match(r.error, /Developer Mode/);
  stores.sync.enableDevMode = true;
  assert.equal((await api.undoSync('dev', '/apps/x')).ok, false);
  assert.equal((await api.undoSync('nope', '/content/x')).ok, false);
  assert.equal(calls.filter((c) => c.init.method === 'POST').length, 0);
});

test('recent and favourites are stored locally and de-duplicated', async () => {
  await api.recordRecent('dev', '/content/a', 'A');
  await api.recordRecent('dev', '/content/b', 'B');
  await api.recordRecent('dev', '/content/a', 'A');
  let lists = await api.getPageLists();
  assert.deepEqual(lists.recent.map((e) => e.path), ['/content/a', '/content/b']);
  assert.equal((await api.toggleFavourite('dev', '/content/a', 'A')).favourite, true);
  assert.equal((await api.toggleFavourite('dev', '/content/a', 'A')).favourite, false);
  lists = await api.getPageLists();
  assert.equal(lists.favourites.length, 0);
  assert.equal((await api.recordRecent('dev', '/etc/x')).ok, false);
  assert.equal(stores.sync.recent, undefined); // never synced
});

// ─── Phase 4b: action log, reference warning ─────────────────────────────────

test('action log stores sanitized entries newest-first and can be cleared', async () => {
  await api.logAction({ env: 'dev', action: 'Publish', path: '/content/a', ok: true, password: 'leak?' });
  await api.logAction({ env: 'dev', action: 'Delete', path: '/content/b', ok: false, error: 'Delete blocked' });
  const { entries } = await api.getActionLog();
  assert.deepEqual(entries.map((e) => e.action), ['Delete', 'Publish']);
  assert.equal(entries[0].error, 'Delete blocked');
  assert.equal(entries[1].error, undefined);
  assert.equal('password' in entries[1], false);
  assert.equal(stores.sync.actionLog, undefined); // device-local only
  await api.clearActionLog();
  assert.equal((await api.getActionLog()).entries.length, 0);
});

test('referenceWarning summarises and caps the list', () => {
  assert.equal(api.referenceWarning([]), '');
  const refs = Array.from({ length: 14 }, (_, i) => ({ path: `/content/dam/${i}.jpg`, state: 'unpublished' }));
  const w = api.referenceWarning(refs);
  assert.match(w, /^14 referenced item\(s\)/);
  assert.match(w, /…and 2 more/);
});

// ─── Configurable request timeout ────────────────────────────────────────────

async function timeoutUsed(setting) {
  if (setting === undefined) delete stores.sync.requestTimeoutSec; else stores.sync.requestTimeoutSec = setting;
  route('.infinity.json', () => respond({ json: {} }));
  const spy = AbortSignal.timeout;
  let ms;
  AbortSignal.timeout = (n) => { ms = n; return spy.call(AbortSignal, n); };
  try { await api.fetchJcrNode('dev', '/content/x'); } finally { AbortSignal.timeout = spy; }
  return ms;
}

test('request timeout defaults to 15s', async () => {
  assert.equal(await timeoutUsed(undefined), 15000);
});

test('request timeout follows the setting and is clamped to 5-120s', async () => {
  assert.equal(await timeoutUsed(30), 30000);
  assert.equal(await timeoutUsed(1), 5000);
  assert.equal(await timeoutUsed(9999), 120000);
});

test('an unreadable timeout setting falls back to 15s', async () => {
  assert.equal(await timeoutUsed('soon'), 15000);
});

// ─── Session-only credentials ────────────────────────────────────────────────

test('credentials kept for the session only are read from chrome.storage.session', async () => {
  const session = { secrets: { dev: { username: 'sess-user', password: 'sess-pw' } } };
  globalThis.chrome.storage.session = {
    get(keys, cb) { cb({ secrets: structuredClone(session.secrets) }); },
  };
  try {
    stores.local = {}; // nothing on disk
    const cfg = await api.getConfig();
    assert.equal(cfg.environments.dev.username, 'sess-user');
    assert.equal(cfg.environments.dev.password, 'sess-pw');
    const pub = await api.getPublicConfig();
    assert.equal(pub.environments.dev.password, undefined);
    assert.equal(pub.environments.dev.hasCredentials, true);
  } finally {
    delete globalThis.chrome.storage.session;
  }
});

test('without chrome.storage.session the config still loads from local storage', async () => {
  assert.equal(globalThis.chrome.storage.session, undefined);
  assert.equal((await api.getConfig()).environments.dev.username, 'admin');
});

// ─── Browser Session sign-in ─────────────────────────────────────────────────

const SESSION_MSG = `Session expired — log in to ${AUTHOR} and try again.`;

test('Browser Session: a login page names the host so the UI can offer a login link', async () => {
  stores.sync.environments.dev.authType = 'session';
  route('.infinity.json', () => respond({ text: '<html>login</html>', type: 'text/html' }));
  const r = await api.fetchJcrNode('dev', '/content/x');
  assert.equal(r.error, SESSION_MSG);
});

test('Browser Session: 401 and a login redirect give the same message', async () => {
  stores.sync.environments.dev.authType = 'session';
  route('/content/a.', () => respond({ status: 401, text: '', type: 'text/plain' }));
  assert.equal((await api.fetchJcrNode('dev', '/content/a')).error, SESSION_MSG);
  route('/content/b.', () => {
    const res = respond({ text: '<html>login</html>', type: 'text/html' });
    Object.defineProperty(res, 'url', { value: `${AUTHOR}/libs/granite/core/content/login.html` });
    return res;
  });
  assert.equal((await api.fetchJcrNode('dev', '/content/b')).error, SESSION_MSG);
});

test('Browser Session: a cross-origin redirect to the sign-in page (reported as a network error) is recognised', async () => {
  stores.sync.environments.dev.authType = 'session';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (init.redirect === 'manual') return { type: 'opaqueredirect', status: 0 };
    throw new TypeError('Failed to fetch');
  };
  try {
    const r = await api.fetchJcrNode('dev', '/content/x');
    assert.equal(r.error, SESSION_MSG);
  } finally { globalThis.fetch = realFetch; }
});

test('Browser Session: a real network failure is still reported as a network error', async () => {
  stores.sync.environments.dev.authType = 'session';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    assert.match((await api.fetchJcrNode('dev', '/content/x')).error, /Network error/);
  } finally { globalThis.fetch = realFetch; }
});

test('other auth types keep their own wording and are never probed for a login redirect', async () => {
  route('.infinity.json', () => respond({ status: 401, text: '', type: 'text/plain' }));
  assert.match((await api.fetchJcrNode('dev', '/content/x')).error, /Not signed in/);
  const realFetch = globalThis.fetch;
  let probed = false;
  globalThis.fetch = async (url, init = {}) => { if (init.redirect === 'manual') probed = true; throw new TypeError('Failed to fetch'); };
  try { await api.fetchJcrNode('dev', '/content/x'); } finally { globalThis.fetch = realFetch; }
  assert.equal(probed, false);
});

// ─── Extended Broader Tools Tests ─────────────────────────────────────────────

test('restoreVersion sends the version UUID (not its name) to /bin/wcmcommand', async () => {
  const uuid = 'abcdef12-0000-0000-0000-000000000000';
  route('/jcr:content.json', () => respond({ json: { 'jcr:uuid': uuid } }));
  route(`/jcr:system/jcr:versionStorage/ab/cd/ef/${uuid}.1.json`, () => respond({ json: {
    '1.0': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-01-01T00:00:00Z', 'jcr:uuid': 'ver-uuid-1' },
  } }));
  route('/bin/wcmcommand', () => respond({ text: 'ok', type: 'text/plain' }));
  const r = await api.restoreVersion('dev', '/content/x', '1.0');
  assert.equal(r.ok, true);
  const form = new URLSearchParams(String(calls.find((c) => c.url.includes('/bin/wcmcommand')).init.body));
  assert.equal(form.get('cmd'), 'restoreVersion');
  assert.equal(form.get('path'), '/content/x');
  assert.equal(form.get('id'), 'ver-uuid-1');
});

test('restoreVersion refuses a version that is not in this page\'s history', async () => {
  const uuid = 'abcdef12-0000-0000-0000-000000000000';
  route('/jcr:content.json', () => respond({ json: { 'jcr:uuid': uuid } }));
  route(`/jcr:system/jcr:versionStorage/ab/cd/ef/${uuid}.1.json`, () => respond({ json: {
    '1.0': { 'jcr:primaryType': 'nt:version', 'jcr:created': '2024-01-01T00:00:00Z', 'jcr:uuid': 'ver-uuid-1' },
  } }));
  const r = await api.restoreVersion('dev', '/content/x', '9.9');
  assert.equal(r.ok, false);
  assert.equal(calls.filter((c) => c.url.includes('/bin/wcmcommand')).length, 0);
});

test('diffVersions compares a version against current page content', async () => {
  const uuid = 'abcdef12-0000-0000-0000-000000000000';
  route('/jcr:content.json', () => respond({ json: { 'jcr:uuid': uuid } }));
  route(`/jcr:system/jcr:versionStorage/ab/cd/ef/${uuid}/1.0/jcr:frozenNode/jcr:content.infinity.json`, () => respond({ json: {
    'jcr:primaryType': 'cq:PageContent',
    'jcr:title': 'Old Title',
    root: { text: 'v1' },
  } }));
  route('/jcr:content.infinity.json', () => respond({ json: {
    'jcr:primaryType': 'cq:PageContent',
    'jcr:title': 'New Title',
    root: { text: 'v2' },
  } }));
  const d = await api.diffVersions('dev', '/content/test-page', '1.0', 'current');
  assert.equal(d.ok, true);
  assert.equal(d.total, 2);
  assert.deepEqual(d.changes.map((c) => c.path), ['jcr:content/jcr:title', 'jcr:content/root/text']);
});

test('previewTreeDeactivate and treeDeactivate unpublish subtree pages', async () => {
  const hits = [{ 'jcr:path': '/content/root' }, { 'jcr:path': '/content/root/sub1' }];
  route('/bin/querybuilder.json', () => respond({ json: { hits } }));
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));

  const prev = await api.previewTreeDeactivate('dev', '/content/root');
  assert.equal(prev.ok, true);
  assert.equal(prev.count, 2);

  const res = await api.treeDeactivate('dev', '/content/root');
  assert.equal(res.ok, true);
  assert.equal(res.count, 2);
  const repCall = calls.find((c) => c.url.includes('/bin/replicate.json'));
  assert.ok(repCall);
  assert.match(repCall.init.body, /cmd=Deactivate/);
});

test('previewBulkReplicate checks statuses across multiple pages', async () => {
  route('/content/p1/jcr:content.json', () => respond({ json: { 'cq:lastReplicationAction': 'Activate', 'cq:lastReplicated': '2025-01-01' } }));
  route('/content/p2/jcr:content.json', () => respond({ status: 404, text: 'nf', type: 'text/plain' }));

  const r = await api.previewBulkReplicate('dev', ['/content/p1', '/content/p2'], 'Activate');
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
  assert.equal(r.pages[0].status, 'published');
  assert.equal(r.pages[1].status, 'not found');
});

test('getReplicationQueueStatus detects pending or blocked replication jobs', async () => {
  route('/etc/replication/agents.author/publish.queue.json', () => respond({ json: [
    { id: 'job1', status: 'BLOCKED', processing: false },
  ] }));
  const q = await api.getReplicationQueueStatus('dev');
  assert.equal(q.ok, true);
  assert.equal(q.queueStatus, 'blocked');
  assert.equal(q.queueCount, 1);
});

test('findAcrossPages finds matches in string and multi-value properties', async () => {
  route('/bin/querybuilder.json', () => respond({ json: { hits: [{ 'jcr:path': '/content/site/page' }] } }));
  route(/\/content\/site\/page\/jcr(:|%3A)content\.infinity\.json/, () => respond({ json: {
    'jcr:title': 'Hello World Site',
    root: { text: 'Welcome to Hello World' },
  } }));
  const found = await api.findAcrossPages('dev', '/content/site', 'Hello');
  assert.equal(found.ok, true);
  assert.equal(found.count, 2);
});

test('replaceAcrossPages versions each page first, then writes the property', async () => {
  route('/bin/wcmcommand', () => respond({ text: 'ok', type: 'text/plain' }));
  route(/\/content\/site\/page\/jcr(:|%3A)content$/, () => respond({ text: 'ok', type: 'text/plain' }));

  const rep = await api.replaceAcrossPages('dev', [
    { propPath: '/content/site/page/jcr:content/jcr:title', newValue: 'Greetings World Site' },
  ]);
  assert.equal(rep.ok, true);
  assert.equal(rep.updatedCount, 1);
  const order = calls.filter((c) => c.init.method === 'POST' && !c.url.includes('csrf')).map((c) => c.url);
  assert.ok(order[0].includes('/bin/wcmcommand'), 'version backup comes first');
  assert.ok(order[1].includes('/content/site/page/jcr'), 'then the property write');
  assert.match(String(calls.find((c) => c.url.includes('/bin/wcmcommand')).init.body), /before-find-replace/);
});

test('replaceAcrossPages keeps the other items of a multi-value property', async () => {
  route('/bin/wcmcommand', () => respond({ text: 'ok', type: 'text/plain' }));
  route(/\/content\/site\/page\/jcr(:|%3A)content\/root\.json/, () => respond({ json: { tags: ['one', 'Hello', 'three'] } }));
  route(/\/content\/site\/page\/jcr(:|%3A)content\/root$/, () => respond({ text: 'ok', type: 'text/plain' }));

  const rep = await api.replaceAcrossPages('dev', [
    { propPath: '/content/site/page/jcr:content/root/tags[1]', newValue: 'Howdy' },
  ]);
  assert.equal(rep.ok, true);
  const write = calls.find((c) => c.init.method === 'POST' && /jcr(:|%3A)content\/root$/.test(c.url));
  assert.deepEqual(new URLSearchParams(String(write.init.body)).getAll('tags'), ['one', 'Howdy', 'three']);
});

test('replaceAcrossPages refuses paths outside jcr:content and skips a page whose backup fails', async () => {
  const bad = await api.replaceAcrossPages('dev', [{ propPath: '/content/site/page/other/jcr:title', newValue: 'x' }]);
  assert.equal(bad.ok, false);
  assert.equal(calls.filter((c) => c.init.method === 'POST' && !c.url.includes('csrf')).length, 0);

  route('/bin/wcmcommand', () => respond({ status: 500, text: 'boom', type: 'text/plain' }));
  const rep = await api.replaceAcrossPages('dev', [
    { propPath: '/content/site/page/jcr:content/jcr:title', newValue: 'x' },
  ]);
  assert.equal(rep.ok, false);
  assert.equal(calls.filter((c) => c.init.method === 'POST' && /jcr(:|%3A)content$/.test(c.url)).length, 0);
});

test('getComponentPolicy maps by component resource type, then by structure path', async () => {
  const T = '/conf/site/settings/wcm/templates/content-page';
  route('/content/page/jcr:content.json', () => respond({ json: { 'cq:template': T } }));
  route(`${T}/policies/jcr:content.infinity.json`, () => respond({ json: {
    root: { container: { 'cq:policy': 'site/container-policy' } },
    site: { components: { title: { 'cq:policy': 'site/title-policy' } } },
  } }));
  route('/conf/site/settings/wcm/policies/site/title-policy.json', () => respond({ json: { 'jcr:title': 'Title Policy', components: 'site/components/x' } }));
  route('/conf/site/settings/wcm/policies/site/container-policy.json', () => respond({ json: { 'jcr:title': 'Container Policy', components: ['site/components/title', 'site/components/teaser'] } }));

  const byType = await api.getComponentPolicy('dev', '/content/page', '/apps/site/components/title', '/content/page/jcr:content/root/container/title');
  assert.equal(byType.policyTitle, 'Title Policy');
  assert.deepEqual(byType.allowedComponents, ['site/components/x']);

  const byStructure = await api.getComponentPolicy('dev', '/content/page', 'wcm/foundation/components/responsivegrid', '/content/page/jcr:content/root/container');
  assert.equal(byStructure.template, T);
  assert.equal(byStructure.policyPath, '/conf/site/settings/wcm/policies/site/container-policy');
  assert.equal(byStructure.policyTitle, 'Container Policy');
  assert.deepEqual(byStructure.allowedComponents, ['site/components/title', 'site/components/teaser']);

  const none = await api.getComponentPolicy('dev', '/content/page', 'site/components/unmapped', '/content/page/jcr:content/other');
  assert.equal(none.ok, true);
  assert.deepEqual(none.allowedComponents, []);
});

test('flushDispatcher triggers the flush agent through the replication servlet', async () => {
  route('/bin/replicate.json', () => respond({ text: 'ok', type: 'text/plain' }));
  const res = await api.flushDispatcher('dev', '/content/site/page');
  assert.equal(res.ok, true);
  const form = new URLSearchParams(String(calls.find((c) => c.url.includes('/bin/replicate.json')).init.body));
  assert.equal(form.get('agentId'), 'flush');
  assert.equal(form.get('cmd'), 'Activate');
  assert.equal(form.get('path'), '/content/site/page');
  assert.equal(calls.some((c) => c.url.includes('/etc/replication/agents.author/flush/jcr:content')), false, 'never writes to the agent configuration');
});

test('flushDispatcher explains a missing or disabled agent, and refuses paths outside /content', async () => {
  route('/bin/replicate.json', () => respond({ status: 400, text: 'no agent found', type: 'text/plain' }));
  const r = await api.flushDispatcher('dev', '/content/site/page');
  assert.equal(r.ok, false);
  assert.match(r.error, /No enabled Dispatcher flush agent/);
  const bad = await api.flushDispatcher('dev', '/etc/replication');
  assert.equal(bad.ok, false);
  assert.equal(calls.filter((c) => c.url.includes('/bin/replicate.json')).length, 1);
});

test('enterprise policy chrome.storage.managed is merged into getConfig', async () => {
  globalThis.chrome.storage.managed = {
    get(keys, cb) {
      cb({
        environments: {
          prod: { authorHost: 'https://managed-author.corp.com' },
        },
      });
    },
  };
  try {
    const cfg = await api.getConfig();
    assert.equal(cfg.environments.prod.authorHost, 'https://managed-author.corp.com');
  } finally {
    delete globalThis.chrome.storage.managed;
  }
});

test('enterprise policy enforces session auth and locks configuration when configured', async () => {
  globalThis.chrome.storage.managed = {
    get(keys, cb) {
      cb({
        lockConfiguration: true,
        enforceSessionAuthOnly: true,
        profiles: {
          brand1: { label: 'Brand One', contentRoot: '/content/brand1' },
        },
      });
    },
  };
  try {
    const cfg = await api.getConfig();
    assert.equal(cfg.lockConfiguration, true);
    assert.equal(cfg.enforceSessionAuthOnly, true);
    assert.equal(cfg.environments.local.authType, 'session');
    assert.equal(cfg.environments.dev.authType, 'session');
    assert.equal(cfg.profiles.brand1.contentRoot, '/content/brand1');

    const pub = await api.getPublicConfig();
    assert.equal(pub.lockConfiguration, true);
    assert.equal(pub.enforceSessionAuthOnly, true);
  } finally {
    delete globalThis.chrome.storage.managed;
  }
});

test('getContentFragmentInfo reads the model and variations from jcr:content/data on a real instance', async () => {
  // Real AEM: jcr:content.json has only a stub for "data"; the model and variations are one level down.
  route('/content/dam/cf-real/jcr:content.json', () => respond({
    json: { 'jcr:primaryType': 'dam:AssetContent', 'contentFragment': true, 'jcr:title': 'Riverside Camping' },
  }));
  route('/content/dam/cf-real/jcr:content/data.1.json', () => respond({
    json: {
      'jcr:primaryType': 'nt:unstructured',
      'cq:model': '/conf/wknd-shared/settings/dam/cfm/models/adventure',
      master: { 'jcr:primaryType': 'nt:unstructured' },
      mobile: { 'jcr:primaryType': 'nt:unstructured' },
    },
  }));
  const res = await api.getContentFragmentInfo('dev', '/content/dam/cf-real');
  assert.equal(res.isContentFragment, true);
  assert.equal(res.model, '/conf/wknd-shared/settings/dam/cfm/models/adventure');
  assert.equal(res.modelName, 'adventure');
  assert.deepEqual(res.variations, ['mobile']);
});

test('getContentFragmentInfo only accepts /content/dam paths', async () => {
  for (const bad of ['', undefined, '/content/site/en', '/content/dam/../apps/x', '/etc/x']) {
    const res = await api.getContentFragmentInfo('dev', bad);
    assert.equal(res.ok, false, String(bad));
  }
});

test('getContentFragmentInfo recognizes Content Fragments and their variations', async () => {
  route('/content/dam/cf-article/jcr:content.json', () => respond({
    json: {
      'jcr:primaryType': 'dam:AssetContent',
      'contentFragment': true,
      'jcr:title': 'Breaking News',
      'cq:model': '/conf/my-site/settings/dam/cfm/models/news',
      data: {
        master: { title: 'Master' },
        mobile: { title: 'Mobile' },
        tablet: { title: 'Tablet' },
      },
    },
  }));
  const res = await api.getContentFragmentInfo('dev', '/content/dam/cf-article');
  assert.equal(res.ok, true);
  assert.equal(res.isContentFragment, true);
  assert.equal(res.title, 'Breaking News');
  assert.equal(res.model, '/conf/my-site/settings/dam/cfm/models/news');
  assert.deepEqual(res.variations.sort(), ['mobile', 'tablet']);

  route('/content/dam/regular-asset/jcr:content.json', () => respond({
    json: { 'jcr:primaryType': 'dam:AssetContent' },
  }));
  const notCf = await api.getContentFragmentInfo('dev', '/content/dam/regular-asset');
  assert.equal(notCf.ok, true);
  assert.equal(notCf.isContentFragment, false);
});

test('runDiagnostics checks configured tiers and measures response', async () => {
  route('/libs/granite/core/content/login.html', () => respond({ text: 'login page', type: 'text/html' }));
  route('/libs/granite/csrf/token.json', () => respond({ json: { token: 'mock-token' } }));

  const res = await api.runDiagnostics('dev');
  assert.equal(res.ok, true);
  assert.equal(res.author.checked, true);
  assert.equal(res.author.ok, true);
  assert.equal(res.csrf.checked, true);
  assert.equal(res.csrf.ok, true);
});

test('runDiagnostics uses unsaved form values when given and reports per-tier failures', async () => {
  routes = []; // drop the default CSRF route so the failing one below is the one that answers
  route('/libs/granite/core/content/login.html', () => respond({ text: 'login page', type: 'text/html' }));
  route('/libs/granite/csrf/token.json', () => respond({ status: 500, text: 'nope' }));
  const res = await api.runDiagnostics('dev', { authorHost: AUTHOR, authType: 'none' });
  assert.equal(res.author.ok, true);
  assert.equal(res.csrf.checked, true);
  assert.equal(res.csrf.ok, false);
  assert.equal(res.publish.checked, false, 'a tier with no host is not checked');
});
