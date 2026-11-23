import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageUrl,
  stripSlingDecorations,
  parseMappings,
  mapPublicToJcr,
  mapJcrToPublic,
  buildPageUrl,
  firstConfiguredEnv,
  parentPath,
  parseMsmPath,
  sameTierUrl,
  quickLinks,
  isCloudHost,
  addRecent,
  parsePathList,
  resolveProfile,
  isEdsHost,
  getEdsVariants,
  getUniversalEditorUrl,
} from '../src/shared/url-utils.js';

const config = {
  envOrder: ['local', 'prod'],
  contentRoot: '/content/mysite',
  urlMappings: '# comment\n/content/mysite/us/en = /us/en\n/content/mysite/home = /',
  environments: {
    local: { authorHost: 'http://localhost:4502', publishHost: 'http://localhost:4503', dispatcherHost: '' },
    prod:  {
      authorHost: 'https://author-p1-e2.adobeaemcloud.com',
      publishHost: 'https://publish-p1-e2.adobeaemcloud.com',
      dispatcherHost: 'https://www.example.com',
    },
  },
};

test('stripSlingDecorations removes selectors, extension, suffix, jcr:content', () => {
  assert.equal(stripSlingDecorations('/content/a/b.html'), '/content/a/b');
  assert.equal(stripSlingDecorations('/content/a/b.model.json/suffix'), '/content/a/b');
  assert.equal(stripSlingDecorations('/content/a/b/jcr:content/root.json'), '/content/a/b');
  assert.equal(stripSlingDecorations('/content/a/b/'), '/content/a/b');
  assert.equal(stripSlingDecorations('/'), '/');
});

test('author editor.html URL resolves the page path', () => {
  const r = parsePageUrl('http://localhost:4502/editor.html/content/mysite/us/en/about.html', config);
  assert.equal(r.matchedEnv, 'local');
  assert.equal(r.isAuthor, true);
  assert.equal(r.jcrPath, '/content/mysite/us/en/about');
});

test('sites console, properties ?item= and CRXDE hash resolve', () => {
  assert.equal(parsePageUrl('http://localhost:4502/sites.html/content/mysite/us', config).jcrPath, '/content/mysite/us');
  assert.equal(
    parsePageUrl('http://localhost:4502/mnt/overlay/wcm/core/content/sites/properties.html?item=%2Fcontent%2Fmysite%2Fx', config).jcrPath,
    '/content/mysite/x',
  );
  // AEM Cloud Service unified shell keeps the path in the hash
  assert.equal(parsePageUrl('http://localhost:4502/ui#/aem/editor.html/content/mysite/y/z.html', config).jcrPath, '/content/mysite/y/z');
  assert.equal(parsePageUrl('http://localhost:4502/ui#/aem/sites.html/content/mysite/y?layout=column', config).jcrPath, '/content/mysite/y');

  assert.equal(parsePageUrl('http://localhost:4502/crx/de/index.jsp#/content/mysite/y/jcr%3Acontent', config).jcrPath, '/content/mysite/y');
});

test('author non-content page gives null path but still matches env', () => {
  const r = parsePageUrl('http://localhost:4502/aem/start.html', config);
  assert.equal(r.matchedEnv, 'local');
  assert.equal(r.jcrPath, null);
  assert.equal(r.isContentPage, false);
});

test('toolbar shows on pages only, not on consoles or tools', () => {
  const show = (u) => parsePageUrl(u, config).isContentPage;
  const A = 'http://localhost:4502';
  // pages: editor, directly rendered page, Cloud shell editor, classic editor
  assert.equal(show(A + '/editor.html/content/mysite/us/en/about.html'), true);
  assert.equal(show(A + '/editor.html/content/experience-fragments/mysite/x/master.html'), true);
  assert.equal(show(A + '/content/mysite/us/en/about.html?wcmmode=disabled'), true);
  assert.equal(show(A + '/ui#/aem/editor.html/content/mysite/y/z.html'), true);
  assert.equal(show(A + '/cf#/content/mysite/y/z.html'), true);
  assert.equal(show('http://localhost:4503/content/mysite/us/en/about.html'), true);
  assert.equal(show('https://www.example.com/us/en/about.html'), true);
  assert.equal(show('https://www.example.com/'), true);
  // consoles that list or configure pages
  assert.equal(show(A + '/sites.html/content/mysite/us'), false);
  assert.equal(show(A + '/ui#/aem/sites.html/content/mysite/y?layout=column'), false);
  assert.equal(show(A + '/assets.html/content/dam'), false);
  assert.equal(show(A + '/mnt/overlay/wcm/core/content/sites/properties.html?item=%2Fcontent%2Fmysite%2Fx'), false);
  assert.equal(show(A + '/assetdetails.html/content/dam/mysite/a.jpg'), false);
  // start page, tools and system pages
  assert.equal(show(A + '/aem/start.html'), false);
  assert.equal(show(A + '/ui#/aem/start.html'), false);
  assert.equal(show(A + '/crx/de/index.jsp'), false);
  assert.equal(show(A + '/crx/de/index.jsp#/content/mysite/y'), false); // CRXDE itself
  assert.equal(show(A + '/crx/packmgr/index.jsp'), false);
  assert.equal(show(A + '/system/console/bundles'), false);
  assert.equal(show(A + '/libs/granite/core/content/login.html'), false);
  // system paths on publish / dispatcher never fall back to contentRoot
  assert.equal(show('https://www.example.com/libs/granite/core/content/login.html'), false);
  assert.equal(show('https://www.example.com/bin/querybuilder.json'), false);
  assert.equal(show('https://www.example.com/etc.clientlibs/mysite/main.css'), false);
  assert.equal(parsePageUrl('https://www.example.com/etc/clientlibs/x.js', config).jcrPath, null);
  // consoles still report their path (the popup works with it)
  assert.equal(parsePageUrl(A + '/sites.html/content/mysite/us', config).jcrPath, '/content/mysite/us');
});

test('dispatcher URLs map through mappings (longest prefix first)', () => {
  assert.equal(parsePageUrl('https://www.example.com/us/en/about.html', config).jcrPath, '/content/mysite/us/en/about');
  assert.equal(parsePageUrl('https://www.example.com/', config).jcrPath, '/content/mysite/home');
  assert.equal(parsePageUrl('https://www.example.com/foo.html', config).jcrPath, '/content/mysite/home/foo');
});

test('dispatcher falls back to contentRoot when no mapping', () => {
  const c = { ...config, urlMappings: '' };
  assert.equal(parsePageUrl('https://www.example.com/de/page.html', c).jcrPath, '/content/mysite/de/page');
});

test('selectors on publish are stripped', () => {
  const r = parsePageUrl('https://publish-p1-e2.adobeaemcloud.com/content/mysite/a.model.json', config);
  assert.equal(r.matchedEnv, 'prod');
  assert.equal(r.isPublish, true);
  assert.equal(r.jcrPath, '/content/mysite/a');
});

test('unknown host / non-http returns empty (disables action)', () => {
  assert.equal(parsePageUrl('https://other.com/content/x.html', config).matchedEnv, null);
  assert.equal(parsePageUrl('chrome://extensions', config).matchedEnv, null);
  assert.equal(parsePageUrl('https://google.com', config).matchedEnv, null);
  assert.equal(parsePageUrl('about:blank', config).matchedEnv, null);
  assert.equal(parsePageUrl('not a url', config).matchedEnv, null);
});

test('a default locale mapped to "/" resolves in both directions and other locales keep their prefix', () => {
  const cfg = {
    environments: { stage: { authorHost: 'https://author.example.net', dispatcherHost: 'https://www.example.com' } },
    contentRoot: '/content/adobe-cms',
    urlMappings: '/content/adobe-cms/us/en = /\n/content/adobe-cms/de/de = /de-de',
  };
  const jcr = (u) => parsePageUrl(u, cfg).jcrPath;
  assert.equal(jcr('https://www.example.com/products'), '/content/adobe-cms/us/en/products');
  assert.equal(jcr('https://www.example.com/products/ai.html'), '/content/adobe-cms/us/en/products/ai');
  assert.equal(jcr('https://www.example.com/'), '/content/adobe-cms/us/en');
  assert.equal(jcr('https://www.example.com/de-de/products'), '/content/adobe-cms/de/de/products');
  assert.equal(jcr('https://www.example.com/de-de'), '/content/adobe-cms/de/de');

  const m = parseMappings(cfg.urlMappings);
  assert.equal(mapJcrToPublic('/content/adobe-cms/us/en/products', m), '/products');
  assert.equal(mapJcrToPublic('/content/adobe-cms/us/en', m), '/');
  assert.equal(mapJcrToPublic('/content/adobe-cms/de/de/products', m), '/de-de/products');
  assert.equal(buildPageUrl('https://www.example.com', mapJcrToPublic('/content/adobe-cms/us/en/products', m)), 'https://www.example.com/products.html');
  assert.equal(buildPageUrl('https://www.example.com', mapJcrToPublic('/content/adobe-cms/us/en', m)), 'https://www.example.com/');
});

test('== maps exactly one page (a home page the site redirects to) without touching its children', () => {
  const cfg = {
    environments: { stage: { authorHost: 'https://author.example.net', dispatcherHost: 'https://www.example.com' } },
    contentRoot: '/content/adobe-cms',
    urlMappings: '/content/adobe-cms/us/en = /\n/content/adobe-cms/us/en/homepage == /\n/content/adobe-cms/de/de = /de-de\n/content/adobe-cms/de/de/startseite == /de-de',
  };
  const jcr = (u) => parsePageUrl(u, cfg).jcrPath;
  const m = parseMappings(cfg.urlMappings);
  assert.equal(m.find((x) => x.exact).jcr, '/content/adobe-cms/us/en/homepage');
  assert.equal(jcr('https://www.example.com/'), '/content/adobe-cms/us/en/homepage');
  assert.equal(jcr('https://www.example.com/products'), '/content/adobe-cms/us/en/products');
  assert.equal(jcr('https://www.example.com/de-de'), '/content/adobe-cms/de/de/startseite');
  assert.equal(jcr('https://www.example.com/de-de/produkte'), '/content/adobe-cms/de/de/produkte');
  assert.equal(mapJcrToPublic('/content/adobe-cms/us/en/homepage', m), '/');
  assert.equal(mapJcrToPublic('/content/adobe-cms/us/en/homepage/sub', m), '/homepage/sub');
  assert.equal(mapJcrToPublic('/content/adobe-cms/us/en', m), '/');
  assert.equal(mapJcrToPublic('/content/adobe-cms/de/de/startseite', m), '/de-de');
});

test('an explicit rule for one locale beats the broader rules, and an exact rule beats a prefix rule', () => {
  const m = parseMappings('/content/adobe-cms/gb = /uk\n/content/adobe-cms/gb/en = /uk-en\n/content/adobe-cms/gb/en/home == /uk-en/start');
  assert.equal(mapJcrToPublic('/content/adobe-cms/gb/en/x', m), '/uk-en/x');
  assert.equal(mapJcrToPublic('/content/adobe-cms/gb/fr/x', m), '/uk/fr/x');
  assert.equal(mapJcrToPublic('/content/adobe-cms/gb/en/home', m), '/uk-en/start');
  assert.equal(mapPublicToJcr('/uk-en/start', m, '/content/adobe-cms'), '/content/adobe-cms/gb/en/home');
  assert.equal(mapPublicToJcr('/uk-en/x', m, '/content/adobe-cms'), '/content/adobe-cms/gb/en/x');
});

test('invalid exact rules and rules with * are ignored', () => {
  assert.deepEqual(parseMappings('/content/a/*/b = /x'), []);
  assert.deepEqual(parseMappings('/content/a = /x*'), []);
  assert.deepEqual(parseMappings('/content/a == b'), []);
  assert.deepEqual(parseMappings('/content/a == /b'), [{ jcr: '/content/a', pub: '/b', exact: true }]);
});

test('mapJcrToPublic and buildPageUrl', () => {
  const m = parseMappings(config.urlMappings);
  assert.equal(m.length, 2);
  assert.equal(mapJcrToPublic('/content/mysite/us/en/about', m), '/us/en/about');
  assert.equal(mapJcrToPublic('/content/mysite/home', m), '/');
  assert.equal(mapJcrToPublic('/content/other/x', m), '/content/other/x');
  assert.equal(buildPageUrl('https://h', '/'), 'https://h/');
  assert.equal(buildPageUrl('https://h', '/a'), 'https://h/a.html');
  assert.equal(buildPageUrl('', '/a'), '');
  assert.equal(buildPageUrl('https://h', '/a', { html: false }), 'https://h/a');
  assert.equal(buildPageUrl('https://h', '/', { html: false }), 'https://h/');
});

test('mapPublicToJcr keeps /content paths intact', () => {
  assert.equal(mapPublicToJcr('/content/x/y', [], '/content/mysite'), '/content/x/y');
});

test('mappings ignore invalid lines', () => {
  assert.deepEqual(parseMappings('bad line\n/etc = /x\n/content/a = /a/'), [{ jcr: '/content/a', pub: '/a' }]);
});

// ─── Phase 3: preview tier + same-tier env switching ─────────────────────────

test('previewHost URLs parse as tier=preview with mapping fallback', () => {
  const cfg = structuredClone(config);
  cfg.environments.prod.previewHost = 'https://preview-p1-e2.adobeaemcloud.com';
  const r = parsePageUrl('https://preview-p1-e2.adobeaemcloud.com/content/mysite/us/en/x.html', cfg);
  assert.equal(r.matchedEnv, 'prod');
  assert.equal(r.isPreview, true);
  assert.equal(r.isPublish, false);
  assert.equal(r.tier, 'preview');
  assert.equal(r.jcrPath, '/content/mysite/us/en/x');
});

test('tier is set for author, publish and dispatcher', () => {
  assert.equal(parsePageUrl('http://localhost:4502/editor.html/content/mysite/a.html', config).tier, 'author');
  assert.equal(parsePageUrl('http://localhost:4503/content/mysite/a.html', config).tier, 'publish');
  assert.equal(parsePageUrl('https://www.example.com/us/en/a.html', config).tier, 'dispatcher');
  assert.equal(parsePageUrl('https://unknown.example/a.html', config).tier, null);
});

test('parentPath', () => {
  assert.equal(parentPath('/content/a/b'), '/content/a');
  assert.equal(parentPath('/content'), '/');
});

test('sameTierUrl picks the matching variant', () => {
  const v = { authorEditUrl: 'E', authorTouchUrl: 'T', authorDisabledUrl: 'W', publishUrl: 'P', previewUrl: 'V', dispatcherUrl: 'D' };
  assert.equal(sameTierUrl(v, 'author', true), 'E');
  assert.equal(sameTierUrl(v, 'author', false), 'T');
  assert.equal(sameTierUrl(v, 'author', false, true), 'W');
  assert.equal(sameTierUrl(v, 'author', true, true), 'E');
  assert.equal(sameTierUrl(v, 'publish'), 'P');
  assert.equal(sameTierUrl(v, 'preview'), 'V');
  assert.equal(sameTierUrl(v, 'dispatcher'), 'D');
  assert.equal(sameTierUrl(v, null), '');
});

// ─── Phase 4a: quick links, recent lists, bulk path parsing ──────────────────

test('quickLinks: OSGi console only for non-cloud, Cloud Manager only for cloud', () => {
  const local = quickLinks({ authorHost: 'http://localhost:4502' });
  assert.ok(local.some((l) => l.url === 'http://localhost:4502/system/console/bundles'));
  assert.ok(!local.some((l) => l.group === 'Cloud'));

  const cloud = quickLinks({ authorHost: 'https://author-p123-e456.adobeaemcloud.com' });
  assert.ok(!cloud.some((l) => l.url.includes('/system/console')));
  const cm = cloud.find((l) => l.group === 'Cloud');
  assert.match(cm.url, /program\/123\/environment\/456$/);
  const pipe = cloud.find((l) => l.label.includes('Pipelines'));
  assert.ok(pipe);
  assert.match(pipe.url, /pipelines\.html\/program\/123$/);
  assert.deepEqual(quickLinks({}), []);
  assert.equal(isCloudHost('https://author-p1-e2.adobeaemcloud.com'), true);
  assert.equal(isCloudHost('https://evil-adobeaemcloud.com.example.org'), false);
});

test('addRecent de-duplicates by env+path and caps length', () => {
  let list = [];
  list = addRecent(list, { env: 'dev', path: '/content/a', ts: 1 }, 2);
  list = addRecent(list, { env: 'prod', path: '/content/a', ts: 2 }, 2);
  list = addRecent(list, { env: 'dev', path: '/content/a', ts: 3 }, 2);
  assert.deepEqual(list.map((e) => `${e.env}:${e.ts}`), ['dev:3', 'prod:2']);
  list = addRecent(list, { env: 'dev', path: '/content/b', ts: 4 }, 2);
  assert.equal(list.length, 2);
});

test('parsePathList accepts paths and URLs, drops non-content, de-duplicates', () => {
  const text = `/content/site/en/a
    https://author.example.com/editor.html/content/site/en/b.html
    /content/site/en/a.html, /etc/designs/x
    garbage`;
  assert.deepEqual(parsePathList(text), ['/content/site/en/a', '/content/site/en/b']);
  assert.deepEqual(parsePathList(''), []);
});

test('quickLinks deep-links CRXDE to /apps/<appName> and rejects unsafe names', () => {
  const l = quickLinks({ authorHost: 'http://localhost:4502' }, 'my-site');
  assert.ok(l.some((x) => x.url === 'http://localhost:4502/crx/de/index.jsp#/apps/my-site'));
  const bad = quickLinks({ authorHost: 'http://localhost:4502' }, '../etc');
  assert.ok(!bad.some((x) => x.label.startsWith('CRXDE: ')));
});

test('parseMsmPath recognises language masters and live copies', () => {
  assert.deepEqual(parseMsmPath('/content/site/language-masters/en/products/a'),
    { kind: 'master', siteRoot: '/content/site', lang: 'en', relPath: 'products/a' });
  assert.deepEqual(parseMsmPath('/content/site/language-masters/en'),
    { kind: 'master', siteRoot: '/content/site', lang: 'en', relPath: '' });
  assert.deepEqual(parseMsmPath('/content/site/us/en/products/a'),
    { kind: 'livecopy', siteRoot: '/content/site', region: 'us', lang: 'en', relPath: 'products/a' });
  assert.deepEqual(parseMsmPath('/content/site/gb/en_gb'),
    { kind: 'livecopy', siteRoot: '/content/site', region: 'gb', lang: 'en_gb', relPath: '' });
  assert.equal(parseMsmPath('/content/site/about'), null);
  assert.equal(parseMsmPath(''), null);
});

test('firstConfiguredEnv picks the first environment, in the user order, that has a host', () => {
  const envs = { local: {}, dev: { authorHost: '' }, stage: { publishHost: 'https://p.example.com' }, prod: { authorHost: 'https://a.example.com' } };
  assert.equal(firstConfiguredEnv(envs, ['local', 'dev', 'stage', 'prod']), 'stage');
  assert.equal(firstConfiguredEnv(envs, ['prod', 'stage']), 'prod');
  assert.equal(firstConfiguredEnv({ local: {}, dev: {} }, ['dev', 'local']), 'dev');   // none configured: first in order
  assert.equal(firstConfiguredEnv(envs, []), 'stage');                                   // no order: object order
  assert.equal(firstConfiguredEnv({}, []), 'local');
});

test('resolveProfile matches by domain or contentRoot and falls back cleanly', () => {
  const profiles = {
    brandA: { label: 'Brand Alpha', contentRoot: '/content/alpha', appName: 'alpha', matchDomains: ['alpha.example.com'] },
    brandB: { label: 'Brand Beta', contentRoot: '/content/beta', appName: 'beta', matchDomains: ['beta.example.com'] },
  };

  // Match by domain
  assert.equal(resolveProfile('https://alpha.example.com/index.html', profiles)?.id, 'brandA');
  assert.equal(resolveProfile('https://beta.example.com/about', profiles)?.id, 'brandB');

  // Match by contentRoot
  assert.equal(resolveProfile('/content/beta/us/en', profiles)?.id, 'brandB');
  assert.equal(resolveProfile('/content/alpha/home', profiles)?.id, 'brandA');

  // Fallback to activeProfile override
  assert.equal(resolveProfile('https://other.com', profiles, 'brandB')?.id, 'brandB');

  // contentRoot must match a whole path segment; an unrelated page matches no profile
  assert.equal(resolveProfile('/content/alphabet/home', profiles), null);
  assert.equal(resolveProfile('https://other.com/x.html', profiles), null);

  // Empty or invalid profiles returns null
  assert.equal(resolveProfile('/content/other', null), null);
  assert.equal(resolveProfile('/content/other', {}), null);
});

test('parsePageUrl resolves matching multi-site profile', () => {
  const cfg = {
    environments: {
      prod: { authorHost: 'http://localhost:4502', dispatcherHost: 'https://alpha.example.com' },
    },
    profiles: {
      brandA: { contentRoot: '/content/alpha', urlMappings: '/content/alpha = /' },
    },
  };
  const r = parsePageUrl('http://localhost:4502/editor.html/content/alpha/en.html', cfg);
  assert.equal(r.matchedProfile, 'brandA');
  assert.equal(r.jcrPath, '/content/alpha/en');
});

test('isEdsHost and getEdsVariants identify Edge Delivery Services URLs', () => {
  assert.equal(isEdsHost('https://main--repo--owner.aem.page/en/'), true);
  assert.equal(isEdsHost('https://main--repo--owner.aem.live/en/'), true);
  assert.equal(isEdsHost('https://main--repo--owner.hlx.page/en/'), true);
  assert.equal(isEdsHost('https://example.com/en/'), false);

  const vars = getEdsVariants('https://main--repo--owner.aem.page/products/item?wcm=off');
  assert.deepEqual(vars, {
    isEds: true,
    tier: 'preview',
    previewUrl: 'https://main--repo--owner.aem.page/products/item?wcm=off',
    liveUrl: 'https://main--repo--owner.aem.live/products/item?wcm=off',
  });
});

test('getUniversalEditorUrl constructs Universal Editor canvas deep link', () => {
  const u = getUniversalEditorUrl('https://main--repo--owner.aem.page/en', 'my-org');
  assert.equal(u, 'https://experience.adobe.com/#/@my-org/aem/editor/canvas/main--repo--owner.aem.page/en');
  assert.equal(
    getUniversalEditorUrl('https://author-p1-e2.adobeaemcloud.com/content/site/en.html'),
    'https://experience.adobe.com/#/@adobe/aem/editor/canvas/author-p1-e2.adobeaemcloud.com/content/site/en.html',
  );
  assert.equal(getUniversalEditorUrl(''), '');
  assert.equal(getUniversalEditorUrl('http://localhost:4502/content/site/en.html'), '', 'Universal Editor needs https');
  assert.equal(getUniversalEditorUrl('javascript:alert(1)'), '');
});
