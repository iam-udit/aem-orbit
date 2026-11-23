/**
 * @file URL, Repository Path, and Environment Mapping Utilities.
 * @module shared/url-utils
 *
 * Pure functional helpers (zero chrome.* API dependencies) allowing 100% unit testing
 * in Node.js environments.
 */

/** Author console wrappers whose suffix is the content path. */
const WRAPPER_PREFIXES = [
  '/editor.html',
  '/sites.html',
  '/assets.html',
  '/mnt/overlay/wcm/core/content/sites/properties.html',
  '/libs/wcm/core/content/sites/properties.html',
];

/**
 * Safely extracts the protocol + hostname + port origin from a URL string.
 *
 * @param {string} hostStr - URL string.
 * @returns {string|null} Origin string (e.g. "https://example.com:4502") or null if invalid.
 */
export function safeOrigin(hostStr) {
  try { return new URL(hostStr).origin; } catch { return null; }
}

/**
 * Chrome match pattern for a host URL ("https://a.com:8443" → "https://a.com/*").
 * Match patterns cannot contain ports; they match every port of the host.
 * @returns {string|null}
 */
export function originPattern(hostStr) {
  try {
    const u = new URL(hostStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch { return null; }
}

/**
 * The environment to use when nothing else says which one: the first environment, in the
 * user's order, that has at least one host configured (else the first in order, else "local").
 * @param {object} [environments]
 * @param {string[]} [envOrder]
 * @returns {string}
 */
export function firstConfiguredEnv(environments = {}, envOrder = []) {
  const order = envOrder?.length ? envOrder : Object.keys(environments);
  const hasHost = (k) => ['authorHost', 'publishHost', 'previewHost', 'dispatcherHost'].some((f) => environments[k]?.[f]);
  return order.find(hasHost) || order[0] || 'local';
}

/** Unique match patterns for every host configured across all environments. */
export function configuredOriginPatterns(environments = {}) {
  const set = new Set();
  Object.values(environments).forEach((env) => {
    ['authorHost', 'publishHost', 'previewHost', 'dispatcherHost'].forEach((f) => {
      const p = env?.[f] ? originPattern(env[f]) : null;
      if (p) set.add(p);
    });
  });
  return [...set];
}

/** Join two path parts, collapsing duplicate slashes and dropping a trailing slash. */
export function joinPath(a, b) {
  const joined = `${a}/${b}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

/**
 * Strip Sling selectors / extension / suffix and anything below jcr:content.
 * "/content/a/b.model.json/suffix" -> "/content/a/b"
 * @param {string} resPath
 * @returns {string}
 */
export function stripSlingDecorations(resPath) {
  let decoded = resPath;
  try { decoded = decodeURIComponent(resPath); } catch { /* keep raw */ }
  const out = [];
  for (const seg of decoded.split('/')) {
    if (seg === 'jcr:content' || seg === '_jcr_content') break;
    const dot = seg.indexOf('.');
    if (dot !== -1) {
      if (dot > 0) out.push(seg.slice(0, dot));
      break;
    }
    out.push(seg);
  }
  const path = out.join('/');
  if (!path) return '/';
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

/**
 * Extract the repository resource path from a URL, unwrapping author consoles
 * (editor.html, sites.html, properties ?item=, CRXDE #hash).
 * @param {URL} url
 * @returns {string}
 */
export function extractResourcePath(url) {
  const item = url.searchParams.get('item');
  if (item && item.startsWith('/')) return stripSlingDecorations(item);

  if (url.pathname.startsWith('/crx/de') && url.hash.startsWith('#/')) {
    return stripSlingDecorations(url.hash.slice(1));
  }

  // Classic UI editor: /cf#/content/site/page.html
  if (url.pathname === '/cf' && url.hash.startsWith('#/')) {
    return stripSlingDecorations(url.hash.slice(1));
  }

  // AEM Cloud Service unified shell: /ui#/aem/editor.html/content/site/page.html
  let pathname = url.pathname;
  if (pathname === '/ui' && url.hash.startsWith('#/aem/')) {
    pathname = url.hash.slice('#/aem'.length).split('?')[0];
  }

  for (const prefix of WRAPPER_PREFIXES) {
    if (pathname.startsWith(`${prefix}/`)) {
      return stripSlingDecorations(pathname.slice(prefix.length));
    }
  }
  return stripSlingDecorations(pathname);
}

/**
 * Parse mapping text. One mapping per line:
 *   "<jcrPrefix> = <publicPrefix>"   the page and everything below it
 *   "<jcrPath>  == <publicPath>"     exactly that page (its children are not affected)
 * Lines starting with # are comments; invalid lines (and lines containing `*`) are ignored.
 * @param {string} text
 * @returns {Array<{jcr:string, pub:string, exact?:true}>}  `exact` is only present on `==` rules
 */
export function parseMappings(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const parts = /^(.*?)\s*(==|=)\s*(.*)$/.exec(l);
      if (!parts) return null;
      const m = { jcr: normalizePrefix(parts[1].trim()), pub: normalizePrefix(parts[3].trim()) };
      if (parts[2] === '==') m.exact = true;
      return m;
    })
    .filter((m) => m && m.jcr.startsWith('/content') && m.pub.startsWith('/') && !`${m.jcr}${m.pub}`.includes('*'));
}

/**
 * Normalizes a URL/JCR path prefix by collapsing multiple slashes and removing trailing slashes.
 *
 * @param {string} p - Path prefix.
 * @returns {string} Normalized prefix.
 */
function normalizePrefix(p) {
  if (!p) return '';
  const s = p.replace(/\/{2,}/g, '/');
  return s.length > 1 ? s.replace(/\/$/, '') : s;
}

/**
 * Checks if a path matches a mapping side. A prefix rule matches on a path-segment boundary
 * ("/" matches everything); an exact rule matches only the whole path.
 *
 * @param {string} path - Full path to test.
 * @param {string} side - The rule's JCR or public path.
 * @param {boolean} exact - True for a `==` rule.
 * @returns {boolean}
 */
function matches(path, side, exact) {
  if (exact) return path === side;
  if (side === '/') return true;
  return path === side || path.startsWith(`${side}/`);
}

/** Most specific rule first: `==` rules before prefix rules, then the longer path. Ties keep their order. */
function bySpecificity(side) {
  return (a, b) => (Number(!!b.exact) - Number(!!a.exact)) || (b[side].length - a[side].length);
}

/**
 * Map a public (dispatcher/CDN) path to its JCR path.
 * Falls back to contentRoot + path when no mapping matches.
 * @returns {string|null}
 */
export function mapPublicToJcr(publicPath, mappings, contentRoot) {
  if (publicPath.startsWith('/content/')) return publicPath;
  for (const m of [...mappings].sort(bySpecificity('pub'))) {
    if (matches(publicPath, m.pub, !!m.exact)) {
      return joinPath(m.jcr, m.pub === '/' ? publicPath : publicPath.slice(m.pub.length));
    }
  }
  if (contentRoot && contentRoot.startsWith('/content')) return joinPath(contentRoot, publicPath);
  return null;
}

/**
 * Map a JCR path to its public (dispatcher/CDN) path. Returns the JCR path unchanged
 * when no mapping matches.
 */
export function mapJcrToPublic(jcrPath, mappings) {
  for (const m of [...mappings].sort(bySpecificity('jcr'))) {
    if (matches(jcrPath, m.jcr, !!m.exact)) return joinPath(m.pub, jcrPath.slice(m.jcr.length));
  }
  return jcrPath;
}

/** Build a public page URL: "/" stays "/", everything else gets ".html" unless `html` is false. */
export function buildPageUrl(host, path, { html = true } = {}) {
  if (!host) return '';
  return path === '/' ? `${host}/` : `${host}${path}${html ? '.html' : ''}`;
}

/**
 * Recognise Multi Site Manager page paths.
 *   /content/site/language-masters/en/x → { kind: 'master',   siteRoot, lang: 'en', relPath: 'x' }
 *   /content/site/us/en/x               → { kind: 'livecopy', siteRoot, region: 'us', lang: 'en', relPath: 'x' }
 * `relPath` is '' for the language root itself. Returns null for any other path.
 */
export function parseMsmPath(jcrPath) {
  const path = String(jcrPath || '');
  const lm = path.match(/^(\/content\/[^/]+)\/language-masters\/([a-z]{2}(?:_[a-z]{2})?)(?:\/(.*))?$/i);
  if (lm) return { kind: 'master', siteRoot: lm[1], lang: lm[2], relPath: lm[3] || '' };
  const lc = path.match(/^(\/content\/[^/]+)\/([a-z]{2}(?:-[a-z]{2})?)\/([a-z]{2}(?:_[a-z]{2})?)(?:\/(.*))?$/i);
  if (lc) return { kind: 'livecopy', siteRoot: lc[1], region: lc[2], lang: lc[3], relPath: lc[4] || '' };
  return null;
}

/** Parent path ("/content/a/b" → "/content/a"). */
export function parentPath(path) {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '/';
}

/**
 * The URL of the same page on another environment, on the same tier
 * (author editor → author editor, publish → publish, …).
 * @param {object} variants  result of getUrlVariants for the target env
 * @param {'author'|'publish'|'preview'|'dispatcher'} tier
 * @param {boolean} inEditor  current page is /editor.html
 * @param {boolean} [wcmDisabled]  current page is an Author view without the editing UI (?wcmmode=disabled)
 * @returns {string}  '' when the target env has no host for that tier
 */
export function sameTierUrl(variants, tier, inEditor, wcmDisabled = false) {
  switch (tier) {
    case 'author':
      if (inEditor) return variants.authorEditUrl;
      return wcmDisabled ? variants.authorDisabledUrl : variants.authorTouchUrl;
    case 'publish':    return variants.publishUrl;
    case 'preview':    return variants.previewUrl;
    case 'dispatcher': return variants.dispatcherUrl;
    default:           return '';
  }
}

/**
 * AEM system / tool areas. On publish and dispatcher hosts a path under one of
 * these is never a content page, even though the contentRoot fallback would
 * turn it into a JCR path.
 */
const SYSTEM_PATH = /^\/(libs|apps|etc|etc\.clientlibs|etc\.designs|conf|crx|system|bin|var|mnt)(\/|$)/;

const EMPTY = { isContentPage: false, jcrPath: null, matchedEnv: null, isAuthor: false, isPublish: false, isPreview: false, isDispatcher: false, tier: null, matchedProfile: null };

/** True when `path` is the content root or lies below it, also inside an editor URL such as `/editor.html/content/brand/en.html`. */
function underRoot(path, root) {
  const i = path.indexOf(root);
  if (i < 0) return false;
  const next = path[i + root.length];
  return next === undefined || next === '/' || next === '.';
}

/**
 * Resolves a matching multi-site / multi-brand profile for a given URL or JCR path.
 *
 * @param {string} urlOrPath - Page URL or JCR path.
 * @param {Record<string, {label?:string, contentRoot?:string, appName?:string, urlMappings?:string, matchDomains?:string[]}>|null|undefined} profiles
 * @param {string} [activeProfileId] - Optional active profile override.
 * @returns {{id: string, label: string, contentRoot?: string, appName?: string, urlMappings?: string}|null}
 */
export function resolveProfile(urlOrPath, profiles, activeProfileId) {
  if (!profiles || typeof profiles !== 'object') return null;
  const entries = Object.entries(profiles).filter(([, v]) => v && typeof v === 'object');
  if (!entries.length) return null;

  let host = '';
  let path = String(urlOrPath || '');
  try {
    if (/^https?:\/\//i.test(urlOrPath)) {
      const u = new URL(urlOrPath);
      host = u.hostname.toLowerCase();
      path = u.pathname;
    }
  } catch { /* ignore */ }

  // 1. Match by domain
  if (host) {
    for (const [id, prof] of entries) {
      if (Array.isArray(prof.matchDomains)) {
        if (prof.matchDomains.some((d) => typeof d === 'string' && (host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`)))) {
          return { id, label: prof.label || id, ...prof };
        }
      }
    }
  }

  // 2. Match by contentRoot prefix
  for (const [id, prof] of entries) {
    if (prof.contentRoot && underRoot(path, prof.contentRoot)) {
      return { id, label: prof.label || id, ...prof };
    }
  }

  // 3. Fall back to activeProfileId if set
  if (activeProfileId && profiles[activeProfileId]) {
    return { id: activeProfileId, label: profiles[activeProfileId].label || activeProfileId, ...profiles[activeProfileId] };
  }

  return null;
}

/**
 * On author, only the page editor and a directly rendered page are "page views".
 * Consoles that merely list or configure pages (sites.html, assets.html, page
 * properties, start.html, CRXDE, …) are not, even though they carry a content path.
 */
function isAuthorPageView(url) {
  if (url.pathname.startsWith('/content/')) return true;            // rendered page (also ?wcmmode=disabled)
  if (url.pathname === '/cf') return url.hash.startsWith('#/content/'); // classic UI editor
  // Cloud Service shell keeps the console in the hash: /ui#/aem/editor.html/content/…
  const p = url.pathname === '/ui' && url.hash.startsWith('#/aem/') ? url.hash.slice('#/aem'.length) : url.pathname;
  return p.startsWith('/editor.html/');
}

/**
 * Derive the JCR page path and matching environment for a URL.
 * @param {string} pageUrl
 * @param {{environments:object, envOrder?:string[], urlMappings?:string, contentRoot?:string, profiles?:object, activeProfile?:string}} config
 */
export function parsePageUrl(pageUrl, config) {
  let url;
  try { url = new URL(pageUrl); } catch { return { ...EMPTY }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ...EMPTY };

  const envs     = config.environments || {};
  const order    = config.envOrder?.length ? config.envOrder : Object.keys(envs);
  const profile  = resolveProfile(pageUrl, config.profiles, config.activeProfile);
  const activeRoot = profile?.contentRoot || config.contentRoot;
  const activeMappings = profile?.urlMappings ? parseMappings(profile.urlMappings) : parseMappings(config.urlMappings);

  for (const envName of order) {
    const env = envs[envName];
    if (!env) continue;
    const isAuthor     = !!env.authorHost     && url.origin === safeOrigin(env.authorHost);
    const isPublish    = !!env.publishHost    && url.origin === safeOrigin(env.publishHost);
    const isPreview    = !!env.previewHost    && url.origin === safeOrigin(env.previewHost);
    const isDispatcher = !!env.dispatcherHost && url.origin === safeOrigin(env.dispatcherHost);
    if (!isAuthor && !isPublish && !isPreview && !isDispatcher) continue;

    const resPath = extractResourcePath(url);
    let jcrPath;
    if (resPath.startsWith('/content/')) {
      jcrPath = resPath;
    } else if ((isDispatcher || isPublish || isPreview) && !SYSTEM_PATH.test(resPath)) {
      jcrPath = mapPublicToJcr(resPath, activeMappings, activeRoot);
    } else {
      jcrPath = null;
    }
    const tier = isAuthor ? 'author' : isPreview ? 'preview' : isPublish ? 'publish' : 'dispatcher';
    // The toolbar belongs on pages only — not on start.html, Sites/Assets consoles, properties, CRXDE, …
    // (jcrPath is still returned for those so the popup can work with the selected page.)
    const isContentPage = !!jcrPath && (!isAuthor || isAuthorPageView(url));
    return { isContentPage, jcrPath, matchedEnv: envName, isAuthor, isPublish, isPreview, isDispatcher, tier, matchedProfile: profile?.id || null };
  }
  return { ...EMPTY };
}

// ─── Quick links / page lists ─────────────────────────────────────────────────

/** True for AEM as a Cloud Service hosts (OSGi console etc. are not available there). */
export function isCloudHost(host) {
  try { return /\.adobeaemcloud\.(com|net)$/i.test(new URL(host).hostname); } catch { return false; }
}

/**
 * Tool links for one environment. OSGi/system console links are only offered
 * for non-cloud (local SDK / on-prem) authors; Cloud Manager only for cloud ones.
 * @param {{authorHost?:string}} env
 * @param {string} [appName]  project folder under /apps (deep-links CRXDE there)
 * @returns {Array<{group:string, label:string, url:string}>}
 */
export function quickLinks(env = {}, appName = '') {
  const a = safeOrigin(env.authorHost || '');
  if (!a) return [];
  const app = /^[\w.-]+$/.test(appName || '') ? appName : '';
  const links = [
    { group: 'Consoles', label: 'Sites',                url: `${a}/sites.html/content` },
    { group: 'Consoles', label: 'Assets',               url: `${a}/assets.html/content/dam` },
    { group: 'Consoles', label: 'Experience Fragments', url: `${a}/aem/experience-fragments.html/content/experience-fragments` },
    { group: 'Consoles', label: 'Workflow instances',   url: `${a}/aem/workflow.html` },
    { group: 'Developer', label: 'CRXDE Lite',          url: `${a}/crx/de/index.jsp` },
    ...(app ? [{ group: 'Developer', label: `CRXDE: /apps/${app}`, url: `${a}/crx/de/index.jsp#/apps/${app}` }] : []),
    { group: 'Developer', label: 'Package Manager',     url: `${a}/crx/packmgr/index.jsp` },
    { group: 'Developer', label: 'Query Performance',   url: `${a}/libs/granite/operations/content/diagnosistools/queryPerformance.html` },
  ];
  if (isCloudHost(a)) {
    const m = /author-p(\d+)-e(\d+)/i.exec(new URL(a).hostname);
    links.push({
      group: 'Cloud', label: m ? `Cloud Manager (p${m[1]} / e${m[2]})` : 'Cloud Manager',
      url: m
        ? `https://experience.adobe.com/#/cloud-manager/environments.html/program/${m[1]}/environment/${m[2]}`
        : 'https://experience.adobe.com/#/cloud-manager',
    });
    if (m) {
      links.push({
        group: 'Cloud', label: `Pipelines (p${m[1]})`,
        url: `https://experience.adobe.com/#/cloud-manager/pipelines.html/program/${m[1]}`,
      });
    }
  } else {
    links.push(
      { group: 'System', label: 'OSGi bundles',        url: `${a}/system/console/bundles` },
      { group: 'System', label: 'OSGi configuration',  url: `${a}/system/console/configMgr` },
      { group: 'System', label: 'Sling log support',   url: `${a}/system/console/slinglog` },
      { group: 'System', label: 'Replication agents',  url: `${a}/etc/replication/agents.author.html` },
    );
  }
  return links;
}

/**
 * Add an entry to a most-recent-first list, de-duplicated by env+path.
 * @param {Array<{env:string, path:string}>} list
 * @param {{env:string, path:string, title?:string, ts:number}} entry
 * @param {number} [max]
 */
export function addRecent(list, entry, max = 20) {
  const rest = (list || []).filter((e) => !(e.env === entry.env && e.path === entry.path));
  return [entry, ...rest].slice(0, max);
}

/**
 * Parse a pasted list of paths / URLs for bulk publish: keeps /content paths,
 * strips ".html" etc., de-duplicates.
 * @param {string} text
 * @returns {string[]}
 */
export function parsePathList(text) {
  const out = new Set();
  String(text || '').split(/[\s,]+/).forEach((raw) => {
    if (!raw) return;
    let p = raw;
    try { if (/^https?:\/\//i.test(raw)) p = extractResourcePath(new URL(raw)); } catch { return; }
    p = stripSlingDecorations(p);
    if (/^\/content\/[^\s]+$/.test(p)) out.add(p);
  });
  return [...out];
}

/**
 * Checks if a given host or URL belongs to AEM Edge Delivery Services (.aem.page / .aem.live / .hlx.page / .hlx.live).
 * @param {string} hostOrUrl
 * @returns {boolean}
 */
export function isEdsHost(hostOrUrl) {
  try {
    const raw = String(hostOrUrl || '');
    const h = (raw.includes('://') ? new URL(raw).hostname : raw).toLowerCase();
    return h.endsWith('.aem.page') || h.endsWith('.aem.live') || h.endsWith('.hlx.page') || h.endsWith('.hlx.live');
  } catch {
    return false;
  }
}

/**
 * Returns Edge Delivery Services preview and live variants for an EDS URL.
 * @param {string} pageUrl
 * @returns {{isEds: boolean, previewUrl: string, liveUrl: string, tier: 'preview'|'live'}|null}
 */
export function getEdsVariants(pageUrl) {
  try {
    const u = new URL(pageUrl);
    const m = /^([^.]+)\.(aem|hlx)\.(page|live)$/i.exec(u.hostname);
    if (!m) return null;
    const [, name, domain, tier] = m;
    const path = `${u.pathname}${u.search}`;
    return {
      isEds: true,
      tier: tier === 'page' ? 'preview' : 'live',
      previewUrl: `${u.protocol}//${name}.${domain}.page${path}`,
      liveUrl: `${u.protocol}//${name}.${domain}.live${path}`,
    };
  } catch {
    return null;
  }
}

/**
 * Builds the Adobe Universal Editor canvas URL for an AEM page.
 * @param {string} pageUrl
 * @param {string} [org='adobe'] - Adobe IMS Organization ID
 * @returns {string}
 */
export function getUniversalEditorUrl(pageUrl, org = 'adobe') {
  let u;
  try { u = new URL(pageUrl); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  const cleanOrg = encodeURIComponent(String(org || 'adobe').replace(/^@/, ''));
  // The canvas address is the page's host and path without the scheme.
  return `https://experience.adobe.com/#/@${cleanOrg}/aem/editor/canvas/${u.host}${u.pathname}${u.search}`;
}
