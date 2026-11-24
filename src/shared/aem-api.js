/**
 * @file AEM API Client & Storage Engine for AEM Orbit.
 * @module shared/aem-api
 *
 * All Sling, Replication, WCMCommand, and QueryBuilder REST calls go through here.
 * Supports built-in environments (local, dev, stage, prod) as well as custom environments.
 * Every operation takes an explicit environment name so actions always target
 * the environment of the tab they were triggered from (never an ambiguous global setting).
 *
 * Auth types per environment:
 *   - basic   : HTTP Basic Auth (username + password) — local SDK / dev only
 *   - bearer  : IMS / service access token
 *   - session : re-use the browser's existing AEM login cookie (zero credentials stored)
 *   - none    : no auth header
 *
 * Storage layout:
 *   chrome.storage.sync  — non-secret settings (synced across user devices)
 *   chrome.storage.local — `secrets: { [envKey]: { username, password, bearerToken } }`
 *                          (device-local, never synced)
 */

import { parsePageUrl, parseMappings, mapJcrToPublic, mapPublicToJcr, extractResourcePath, buildPageUrl, addRecent, parentPath, parseMsmPath, sameTierUrl, firstConfiguredEnv, getUniversalEditorUrl } from './url-utils.js';
import { isSyncAllowed } from './sync-direction.js';
import { diffContent } from './content-diff.js';
import { sessionExpiredMessage } from './auth-error.js';
import { normalizePolicy, isControlAllowed, controlBlockedMessage } from './control-policy.js';
import { POLICY_OVERRIDE } from './policy-override.js';

export { parsePageUrl };

export const SECRET_FIELDS = ['username', 'password', 'bearerToken'];

const REQUEST_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MIN_S = 5;
const REQUEST_TIMEOUT_MAX_S = 120;
const TREE_PUBLISH_MAX_PAGES = 500;
const REPLICATE_BATCH_SIZE = 50;
const BULK_PUBLISH_MAX_PATHS = 200;
const WALK_CONCURRENCY = 6;
const SYNC_SNAPSHOTS_MAX = 5;
const SYNC_SNAPSHOT_MAX_CHARS = 400_000; // keeps chrome.storage.local well inside its quota
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;   // first retry; doubles each time (400 ms, 800 ms) plus up to 25% jitter
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RECENT_MAX = 20;
const FAVOURITES_MAX = 50;
const ACTION_LOG_MAX = 200;

const ENV_DEFAULTS = {
  label: '',           // display name (used by custom envs)
  authorHost: '',
  publishHost: '',
  previewHost: '',     // AEM as a Cloud Service Preview tier (https://preview-pX-eY.adobeaemcloud.com)
  dispatcherHost: '',
  dispatcherOmitHtml: false,  // build Dispatcher / CDN URLs without ".html" (extension-less URLs)
  publishUsesMappings: false, // apply URL mappings to Publish/Preview URLs (on when a dispatcher/CDN fronts them)
  authType: 'basic',   // 'basic' | 'bearer' | 'session' | 'none'
  protected: false,    // require typed confirmation for destructive actions
  username: '',
  password: '',
  bearerToken: '',
};

const BUILTIN_ENV_KEYS = ['local', 'dev', 'stage', 'prod'];

const CONFIG_DEFAULTS = {
  envOrder: BUILTIN_ENV_KEYS,
  environments: {
    local: { authType: 'basic' },
    dev:   { authType: 'basic' },
    stage: { authType: 'none' },
    prod:  { authType: 'none', protected: true },
  },
  contentRoot: '/content/mysite',
  appName: 'mysite',
  // Organisation segment of Universal Editor links (https://experience.adobe.com/#/@<imsOrg>/aem/editor/…)
  imsOrg: '',
  // One mapping per line: "/content/site/en = /en"
  urlMappings: '',
  showOnAuthor: true,
  showOnPublish: true,
  showOnDispatcher: true,
  confirmDelete: true,
  // Safety: protected environments always ask before Publish / Unpublish / Publish to Preview.
  // Turn on to ask on the other environments too.
  confirmPublish: false,
  // Desktop notification after Publish / Unpublish / Delete / Sync and similar actions.
  notifyOnActions: true,
  // Feature flags — included in defaults so they survive getConfig merging
  enableKeyboardShortcut: true,
  showLastModified: true,
  // Safety: by default content is copied only from a higher environment to a lower one (prod → stage).
  // Turn on to also allow lower → higher (dev → prod).
  allowUpwardSync: false,
  // Developer mode — gates the developer-only toolbar buttons
  enableDevMode: false,
  // Per-button visibility overrides (all on by default)
  devToolsButtons: {
    jcr: true,
    overlays: true,
    highlight: true,
    inspect: true,
    tools: true,
    reload: true,
    delete: true,
    sync: true,
  },
  // Theme of the Settings page and the toolbar: 'auto' (follow the browser theme), 'light' or 'dark'
  optionsTheme: 'auto',
  // Opt-in: show the classic horizontal minimized bar instead of the default floating orb
  classicBar: false,
  // Opt-in (needs the orb): press and hold on a page to open the orb at the pointer, without saving the spot
  summonOnLongPress: false,
  // Opt-in: use the saved toolbarLayout instead of the built-in toolbar
  customizeToolbar: false,
  // Which buttons sit on the regular / expanded toolbar: {mini: [ids], expanded: [ids]}.
  // null = the built-in layout (see shared/toolbar-layout.js). Kept while customizeToolbar is off.
  toolbarLayout: null,
};

// ─── Storage ───────────────────────────────────────────────────────────────────

/**
 * Promisified wrapper for chrome.storage read operations.
 *
 * @param {'sync'|'local'} area - Storage area name.
 * @param {object|string|string[]} keys - Storage keys to retrieve with defaults.
 * @returns {Promise<object>}
 */
function storageGet(area, keys) {
  // `session` may be missing (older Chrome, test doubles): behave as an empty area.
  if (!chrome.storage[area]) return Promise.resolve(keys && typeof keys === 'object' && !Array.isArray(keys) ? { ...keys } : {});
  // A failed read (e.g. no managed policy installed) leaves `lastError` set and the result undefined: treat it as empty.
  return new Promise((resolve) => chrome.storage[area].get(keys, (r) => {
    void chrome.runtime?.lastError;
    resolve(r || {});
  }));
}

/**
 * Promisified wrapper for chrome.storage write operations.
 *
 * @param {'sync'|'local'} area - Storage area name.
 * @param {object} data - Key-value map to persist.
 * @returns {Promise<void>}
 */
function storageSet(area, data) {
  return new Promise((resolve) => chrome.storage[area].set(data, resolve));
}

/**
 * Filters an object to only include secret fields (username, password, bearerToken).
 *
 * @param {object} [obj={}] - Environment config object.
 * @returns {object} Filtered object containing only defined secrets.
 */
function pickSecrets(obj = {}) {
  const out = {};
  SECRET_FIELDS.forEach((f) => { if (obj[f]) out[f] = obj[f]; });
  return out;
}

/**
 * One-time migration: move any credentials still stored in chrome.storage.sync
 * (pre-1.2 layout) into chrome.storage.local and strip them from sync.
 */
export async function migrateSecretsToLocal() {
  const { environments } = await storageGet('sync', { environments: {} });
  const { secrets = {} } = await storageGet('local', { secrets: {} });
  let changed = false;

  for (const [key, env] of Object.entries(environments || {})) {
    const found = pickSecrets(env);
    if (Object.keys(found).length) {
      secrets[key] = { ...(secrets[key] || {}), ...found };
      changed = true;
    }
    SECRET_FIELDS.forEach((f) => { if (f in env) { delete env[f]; changed = true; } });
  }

  if (changed) {
    await storageSet('local', { secrets });
    await storageSet('sync', { environments });
  }
}

/**
 * Load the full config (including credentials). Service-worker use only.
 * @returns {Promise<typeof CONFIG_DEFAULTS>}
 */
export async function getConfig() {
  const [data, local, session, managedStored] = await Promise.all([
    storageGet('sync', CONFIG_DEFAULTS),
    storageGet('local', { secrets: {}, _managedShim: null }),
    storageGet('session', { secrets: {} }),   // "Keep credentials for this browser session only"
    // Enterprise policy / pre-provisioned team settings. `null` returns everything: an empty
    // defaults object `{}` would return nothing at all.
    storageGet('managed', null),
  ]);
  const rawManaged = local._managedShim ? { ...managedStored, ...local._managedShim } : managedStored;
  // null in every real build; only `npm run build:policy-test` fills it (see shared/policy-override.js).
  const managed = POLICY_OVERRIDE ? { ...rawManaged, controlPolicy: POLICY_OVERRIDE } : rawManaged;
  const secrets    = { ...(local.secrets || {}), ...(session.secrets || {}) };
  const storedEnvs = { ...(data.environments || {}), ...(managed.environments || {}) };
  const keys = [...new Set([...BUILTIN_ENV_KEYS, ...Object.keys(storedEnvs)])];

  const envs = {};
  keys.forEach((k) => {
    envs[k] = {
      ...ENV_DEFAULTS,
      ...(CONFIG_DEFAULTS.environments[k] || {}),
      ...(storedEnvs[k] || {}),
      ...pickSecrets(secrets[k]),
    };
  });

  if (managed?.enforceSessionAuthOnly) {
    keys.forEach((k) => {
      envs[k].authType = 'session';
      envs[k].username = '';
      envs[k].password = '';
      envs[k].bearerToken = '';
    });
  }

  // Build a validated envOrder that includes all known env keys
  const savedOrder = Array.isArray(managed.envOrder) ? managed.envOrder : Array.isArray(data.envOrder) ? data.envOrder : BUILTIN_ENV_KEYS;
  const envOrder   = [
    ...savedOrder.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !savedOrder.includes(k)),
  ];

  // Admin control policy comes from managed storage only, never from the user's own (editable) settings.
  const controlPolicy = normalizePolicy(managed.controlPolicy);
  const merged = {
    ...CONFIG_DEFAULTS,
    ...data,
    ...managed,
    environments: envs,
    envOrder,
    controlPolicy,
    lockConfiguration: !!managed?.lockConfiguration,
    enforceSessionAuthOnly: !!managed?.enforceSessionAuthOnly,
    profiles: managed?.profiles || data?.profiles || {},
    activeProfile: data?.activeProfile || null,
  };
  if (!isControlAllowed(controlPolicy, 'developerMode')) merged.enableDevMode = false;
  return merged;
}

/**
 * Why an admin policy refuses a control on an environment, or null when it is allowed.
 * @param {string} control  A key of CONTROLS (shared/control-policy.js).
 * @param {string} env
 * @returns {Promise<string|null>}
 */
export async function controlPolicyError(control, env) {
  const { controlPolicy } = await getConfig();
  return isControlAllowed(controlPolicy, control, env) ? null : controlBlockedMessage(control, env);
}

/**
 * Config safe to hand to UI contexts (content scripts, popup): credentials are
 * removed and replaced by a `hasCredentials` flag.
 * @returns {Promise<object>}
 */
export async function getPublicConfig() {
  const config = await getConfig();
  const environments = {};
  for (const [key, env] of Object.entries(config.environments)) {
    const clean = { ...env };
    SECRET_FIELDS.forEach((f) => delete clean[f]);
    clean.hasCredentials = env.authType === 'session' || !!(env.username || env.bearerToken);
    environments[key] = clean;
  }
  return { ...config, environments };
}

/**
 * Get the config object for a named environment (includes credentials —
 * service-worker use only).
 * @param {string} envName
 * @returns {Promise<{env: string, cfg: typeof ENV_DEFAULTS, config: object}>}
 */
export async function getEnvConfig(envName) {
  const config = await getConfig();
  const env = envName && config.environments[envName] ? envName : firstConfiguredEnv(config.environments, config.envOrder);
  const cfg = config.environments[env] || ENV_DEFAULTS;
  return { env, cfg, config };
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

/**
 * Generates the HTTP Authorization header string based on environment auth configuration.
 *
 * @param {typeof ENV_DEFAULTS} envCfg - Environment configuration.
 * @returns {string|null} Authorization header value or null for session/none auth.
 */
function buildAuthHeader(envCfg) {
  if (envCfg.authType === 'basic' && envCfg.username) {
    return 'Basic ' + btoa(`${envCfg.username}:${envCfg.password}`);
  }
  if (envCfg.authType === 'bearer' && envCfg.bearerToken) {
    return `Bearer ${envCfg.bearerToken}`;
  }
  return null;
}


/**
 * Request timeout from Settings ("Request timeout", seconds), clamped to a sane range.
 * Anything unreadable falls back to the 15s default.
 * @returns {Promise<number>} milliseconds
 */
async function requestTimeoutMs() {
  const { requestTimeoutSec } = await storageGet('sync', { requestTimeoutSec: REQUEST_TIMEOUT_MS / 1000 });
  const s = Number(requestTimeoutSec);
  if (!Number.isFinite(s)) return REQUEST_TIMEOUT_MS;
  return Math.min(REQUEST_TIMEOUT_MAX_S, Math.max(REQUEST_TIMEOUT_MIN_S, Math.round(s))) * 1000;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Exponential backoff with jitter, so parallel requests do not all retry at the same instant. */
const backoff = (attempt) => delay(RETRY_DELAY_MS * 2 ** attempt * (1 + Math.random() * 0.25));

/**
 * URL-encodes each segment of a repository path while preserving forward slashes.
 *
 * @param {string} path - JCR repository path (e.g. "/content/site/page:name").
 * @returns {string} Encoded path.
 */
function encPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Checks if a fetch response redirected to an AEM login page.
 *
 * @param {Response} res - Fetch Response object.
 * @returns {boolean} True if response URL indicates a login redirection.
 */
function isLoginRedirect(res) {
  return /\/libs\/granite\/core\/content\/login|j_security_check|\/ims\/authorize/i.test(res.url || '');
}

/**
 * Retrieves an AEM CSRF token for state-changing HTTP requests.
 *
 * @async
 * @param {typeof ENV_DEFAULTS} cfg - Environment configuration.
 * @returns {Promise<string|null>} CSRF token string or null if unavailable.
 */
async function getCsrfToken(cfg) {
  const res = await aemRequest(cfg, '/libs/granite/csrf/token.json', { csrf: false });
  return res.ok ? res.data?.token || null : null;
}

/**
 * Asks the author host for its CSRF token without following redirects. A signed-out session is
 * answered with a redirect to the login page, which `redirect: 'manual'` reports as `opaqueredirect`.
 * Any failure here just means "unknown", so the caller keeps its generic network error.
 *
 * @param {typeof ENV_DEFAULTS} cfg
 * @returns {Promise<boolean>} true when the host is redirecting to a login page
 */
async function redirectsToLogin(cfg) {
  try {
    const res = await fetch(`${cfg.authorHost}/libs/granite/csrf/token.json`, {
      credentials: 'include',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    return res.type === 'opaqueredirect';
  } catch {
    return false;
  }
}

/**
 * Single entry point for all AEM HTTP calls.
 * - timeout: 15s unless changed in Settings (5–120s)
 * - CSRF token on POSTs
 * - detects expired sessions / login redirects
 * - returns generic, user-safe error messages
 *
 * @param {typeof ENV_DEFAULTS} cfg
 * @param {string} path          path + query, appended to authorHost
 * @param {{method?:string, form?:URLSearchParams, json?:boolean, csrf?:boolean}} [opts]
 * @returns {Promise<{ok:boolean, status?:number, data?:any, text?:string, error?:string}>}
 */
export async function aemRequest(cfg, path, { method = 'GET', form = null, json = true, csrf = true } = {}) {
  if (!cfg.authorHost) return { ok: false, error: 'Author host not configured for this environment.' };
  const timeoutMs = await requestTimeoutMs();

  const headers = { Accept: json ? 'application/json' : '*/*' };
  const auth = buildAuthHeader(cfg);
  if (auth) headers.Authorization = auth;

  const init = {
    method,
    headers,
    credentials: cfg.authType === 'session' ? 'include' : 'omit',
  };

  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    init.body = form.toString();
    if (csrf) {
      const token = await getCsrfToken(cfg);
      if (token) headers['CSRF-Token'] = token;
    }
  }

  // Reads are retried (twice, with exponential backoff) on a transient failure (network blip, 502/503/504 from the CDN or a
  // restarting author). Writes are never retried: a POST may already have been applied.
  const canRetry = method === 'GET';
  const sessionExpired = { ok: false, status: 401, error: sessionExpiredMessage(cfg.authorHost) };
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${cfg.authorHost}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e?.name === 'TimeoutError') return { ok: false, error: `Request timed out — AEM did not respond within ${timeoutMs / 1000}s.` };
      if (canRetry && attempt < RETRY_ATTEMPTS) { await backoff(attempt); continue; }
      // AEM as a Cloud Service sends a signed-out browser to Adobe's sign-in page. The browser blocks
      // that cross-origin redirect and only reports a network error, so check for it before giving up.
      if (cfg.authType === 'session' && await redirectsToLogin(cfg)) return sessionExpired;
      return { ok: false, error: 'Network error — is the host reachable and permission granted?' };
    }
    if (canRetry && attempt < RETRY_ATTEMPTS && TRANSIENT_STATUSES.has(res.status)) { await backoff(attempt); continue; }
    break;
  }

  if (res.status === 401) {
    if (cfg.authType === 'session') return sessionExpired;
    return { ok: false, status: 401, error: 'Not signed in — check credentials or log in to AEM.' };
  }
  if (res.status === 403) return { ok: false, status: 403, error: 'Permission denied (403).' };
  if (isLoginRedirect(res)) {
    return cfg.authType === 'session' ? { ...sessionExpired, status: res.status }
      : { ok: false, status: res.status, error: 'Session expired — log in to AEM Author.' };
  }
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };

  if (!json) return { ok: true, status: res.status, text: await res.text().catch(() => '') };

  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    return cfg.authType === 'session' ? { ...sessionExpired, status: res.status }
      : { ok: false, status: res.status, error: 'Session expired — AEM returned a login page.' };
  }
  try {
    return { ok: true, status: res.status, data: await res.json() };
  } catch {
    return { ok: false, status: res.status, error: 'Unexpected (non-JSON) response from AEM.' };
  }
}

/**
 * Executes a POST request to AEM's replication servlet (/bin/replicate.json).
 *
 * @async
 * @param {typeof ENV_DEFAULTS} cfg - Environment configuration.
 * @param {'Activate'|'Deactivate'} cmd - Replication command.
 * @param {string[]} paths - JCR paths to replicate.
 * @param {string} [agentId=''] - Optional replication agent identifier (e.g. 'preview').
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function replicate(cfg, cmd, paths, agentId = '') {
  const body = new URLSearchParams({ cmd, _charset_: 'utf-8' });
  paths.forEach((p) => body.append('path', p));
  if (agentId) body.append('agentId', agentId);
  const res = await aemRequest(cfg, '/bin/replicate.json', { method: 'POST', form: body, json: false });
  return res.ok ? { ok: true } : res;
}

// ─── Connection test ───────────────────────────────────────────────────────────

/**
 * Verify the host is reachable AND the credentials resolve to a real user.
 * @param {typeof ENV_DEFAULTS} cfg  (unsaved values from the options form)
 * @returns {Promise<{ok:boolean, user?:string, error?:string}>}
 */
export async function testConnection(cfg) {
  const res = await aemRequest({ ...ENV_DEFAULTS, ...cfg }, '/libs/granite/security/currentuser.json');
  if (!res.ok) return res;
  const user = res.data?.authorizableId;
  if (!user || user === 'anonymous') {
    return { ok: false, error: 'Host reachable, but not authenticated (anonymous).' };
  }
  return { ok: true, user };
}

// ─── JCR / Page operations ─────────────────────────────────────────────────────

/**
 * Fetch JCR node properties for a given path.
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
 */
export async function fetchJcrNode(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  return aemRequest(cfg, `${encPath(jcrPath)}.infinity.json`);
}

/**
 * Get the replication status of a page.
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, status?:'published'|'draft'|'modified', lastReplicated?:string, lastModified?:string, error?:string}>}
 */
export async function getPageStatus(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const result = await aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.json`);
  if (!result.ok) return result;
  return { ok: true, ...computeStatus(result.data) };
}

/**
 * Derive publish + preview status from jcr:content properties.
 * AEMaaCS records preview replication in cq:lastReplicated_preview /
 * cq:lastReplicationAction_preview.
 * @param {object} content
 */
export function computeStatus(content = {}) {
  const lastModified = content['cq:lastModified'] || content['jcr:lastModified'];
  const tierStatus = (action, replicated) => {
    if (action !== 'Activate') return 'draft';
    return (lastModified && replicated && new Date(lastModified) > new Date(replicated)) ? 'modified' : 'published';
  };
  const previewAction = content['cq:lastReplicationAction_preview'];
  const mixins = [].concat(content['jcr:mixinTypes'] || []);
  return {
    status:               tierStatus(content['cq:lastReplicationAction'], content['cq:lastReplicated']),
    lastReplicated:       content['cq:lastReplicated'],
    lastModified,
    previewStatus:        previewAction ? tierStatus(previewAction, content['cq:lastReplicated_preview']) : null,
    lastReplicatedPreview: content['cq:lastReplicated_preview'] || null,
    // Rich status
    title:                content['jcr:title'] || '',
    template:             content['cq:template'] || '',
    lastModifiedBy:       content['cq:lastModifiedBy'] || content['jcr:lastModifiedBy'] || '',
    lastReplicatedBy:     content['cq:lastReplicatedBy'] || '',
    lockOwner:            content['jcr:lockOwner'] || content['cq:lockOwner'] || '',
    onTime:               content.onTime || '',
    offTime:              content.offTime || '',
    isLiveCopy:           mixins.includes('cq:LiveRelationship') || mixins.includes('cq:LiveSync'),
  };
}

/**
 * Lock or unlock a page through the WCM command servlet (same as Sites UI).
 * @param {string} envName
 * @param {string} jcrPath
 * @param {boolean} lock
 */
export async function setPageLock(envName, jcrPath, lock) {
  const { cfg } = await getEnvConfig(envName);
  const body = new URLSearchParams({ cmd: lock ? 'lockPage' : 'unlockPage', path: jcrPath, _charset_: 'utf-8' });
  const res = await aemRequest(cfg, '/bin/wcmcommand', { method: 'POST', form: body, json: false });
  if (res.ok) return { ok: true };
  if (res.status === 409 || res.status === 412) {
    return { ok: false, error: lock ? 'Page is already locked.' : 'Page is locked by another user.' };
  }
  return res;
}

/**
 * Pre-publish reference check: the same servlet the "Publish" wizard uses to
 * list assets / pages / XFs referenced by the page. Returns those that are not
 * published yet or are outdated on publish.
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, references?:Array<{path:string,type:string,title:string,state:'unpublished'|'outdated'}>, error?:string}>}
 */
export async function checkReferences(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const res = await aemRequest(cfg, `/libs/wcm/core/content/reference.json?${new URLSearchParams({ path: jcrPath })}`);
  if (!res.ok) return res;
  // AEM returns the referenced items under `assets` (classic UI servlet used `pages`).
  const items = [res.data?.assets, res.data?.pages].filter(Array.isArray).flat();
  const references = items
    .filter((r) => r && r.path && r.path !== jcrPath && !r.disabled)
    .map((r) => {
      const state = !r.published ? 'unpublished' : (r.outdated || r.status === 'outdated') ? 'outdated' : null;
      return state && { path: String(r.path), type: String(r.type || ''), title: String(r.name || r.title || ''), state };
    })
    .filter(Boolean);
  return { ok: true, references, warning: referenceWarning(references) };
}

/** User-facing confirm text (shared by popup + toolbar, which cannot import modules). */
export function referenceWarning(references, max = 12) {
  if (!references?.length) return '';
  const list = references.slice(0, max).map((x) => `• [${x.state}] ${x.path}`).join('\n');
  const more = references.length > max ? `\n…and ${references.length - max} more` : '';
  return `${references.length} referenced item(s) are not up to date on publish:\n\n${list}${more}\n\n`
    + 'Publish the page anyway? (Use Manage Publication in AEM to include references.)';
}

// ─── Content drift (compare environments) ─────────────────────────────────────

/** Properties that differ between environments for reasons unrelated to content. */
const VOLATILE_PROPS = /^(jcr:(created|createdBy|uuid|lastModified|lastModifiedBy|baseVersion|predecessors|versionHistory|isCheckedOut|lockOwner|lockIsDeep|mixinTypes)|cq:(lastModified|lastModifiedBy|lastReplicated.*|lastReplicationAction.*|lastReplicatedBy.*|lastRolledout|lastRolledoutBy))$/;

/** Deterministic JSON with sorted keys and volatile properties removed. */
export function canonicalContent(node) {
  if (Array.isArray(node)) return node.map(canonicalContent);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  Object.keys(node).sort().forEach((k) => {
    if (VOLATILE_PROPS.test(k)) return;
    out[k] = canonicalContent(node[k]);
  });
  return out;
}

/**
 * Generates a SHA-256 hex digest for a given text string using the Web Cryptography API.
 *
 * @async
 * @param {string} text - Content string to hash.
 * @returns {Promise<string>} 64-character lowercase hex string.
 */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare the same page across every environment that has an author host.
 * Content is fingerprinted (SHA-256 of canonical jcr:content) so the UI can show
 * which environments are in sync without transferring the full tree to the UI.
 * @param {string} jcrPath
 * @returns {Promise<{ok:true, results:Array<{env:string, ok:boolean, exists?:boolean, hash?:string, status?:string, lastModified?:string, lastModifiedBy?:string, title?:string, error?:string}>}>}
 */
export async function compareEnvironments(jcrPath) {
  const config = await getConfig();
  const envs = config.envOrder.filter((k) => config.environments[k]?.authorHost);
  const results = await Promise.all(envs.map(async (env) => {
    const cfg = config.environments[env];
    const res = await aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.infinity.json`);
    if (!res.ok) {
      if (res.status === 404) return { env, ok: true, exists: false };
      return { env, ok: false, error: res.error };
    }
    const s = computeStatus(res.data);
    return {
      env, ok: true, exists: true,
      hash: await sha256(JSON.stringify(canonicalContent(res.data))),
      status: s.status, lastModified: s.lastModified, lastModifiedBy: s.lastModifiedBy, title: s.title,
    };
  }));
  return { ok: true, results };
}

/**
 * What differs in jcr:content between two environments, property by property.
 * Volatile properties (timestamps, uuids, replication state) are ignored, exactly as in
 * compareEnvironments, so "in sync" there means "no changes" here.
 * @param {string} baseEnv   the environment being looked at (the "to" side)
 * @param {string} otherEnv  the environment compared against (the "from" side)
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, baseExists?:boolean, otherExists?:boolean, changes?:object[], total?:number, truncated?:boolean, error?:string}>}
 */
export async function diffEnvironments(baseEnv, otherEnv, jcrPath) {
  if (!jcrPath || !jcrPath.startsWith('/content/')) return { ok: false, error: 'Only /content/ pages can be compared.' };
  if (baseEnv === otherEnv) return { ok: false, error: 'Pick two different environments.' };
  const [base, other] = await Promise.all([baseEnv, otherEnv].map(async (env) => {
    const { cfg } = await getEnvConfig(env);
    return aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.infinity.json`);
  }));
  for (const [env, r] of [[baseEnv, base], [otherEnv, other]]) {
    if (!r.ok && r.status !== 404) return { ok: false, error: `Read from ${env} failed: ${r.error}` };
  }
  if (!base.ok || !other.ok) return { ok: true, baseExists: base.ok, otherExists: other.ok, changes: [], total: 0, truncated: false };
  const d = diffContent(canonicalContent(other.data), canonicalContent(base.data));
  return { ok: true, baseExists: true, otherExists: true, ...d };
}

// ─── Bulk publish ─────────────────────────────────────────────────────────────

/**
 * Replicate paths in batches and keep going when a batch fails, so the caller can tell
 * exactly which pages went live and which did not.
 * @returns {Promise<{published:string[], failed:string[], error?:string}>}
 */
async function replicateInBatches(cfg, cmd, paths) {
  const published = [];
  const failed = [];
  let error;
  for (let i = 0; i < paths.length; i += REPLICATE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REPLICATE_BATCH_SIZE);
    const r = await replicate(cfg, cmd, batch);
    if (r.ok) published.push(...batch);
    else { failed.push(...batch); error ||= r.error; }
  }
  return { published, failed, error };
}

/**
 * Message for a replication that only partly succeeded.
 * The list is capped; the full lists are in the result for the UI.
 */
function partialFailure(verb, { published, failed, error }) {
  const sample = failed.slice(0, 3).join(', ') + (failed.length > 3 ? ', …' : '');
  return `${error} — ${verb} ${published.length} of ${published.length + failed.length}; not ${verb}: ${sample}`;
}

/**
 * Publish / unpublish a list of pages in batches.
 * A failing batch does not stop the others; the result lists which pages made it.
 * @param {string} envName
 * @param {string[]} paths  /content paths (validated)
 * @param {'Activate'|'Deactivate'} [cmd]
 * @returns {Promise<{ok:boolean, count?:number, published?:string[], failed?:string[], error?:string}>}
 */
export async function bulkReplicate(envName, paths, cmd = 'Activate') {
  if (cmd !== 'Activate' && cmd !== 'Deactivate') return { ok: false, error: 'Invalid command.' };
  const clean = [...new Set((paths || []).filter((p) => typeof p === 'string' && /^\/content\/\S+$/.test(p)))];
  if (!clean.length) return { ok: false, error: 'No valid /content paths.' };
  if (clean.length > BULK_PUBLISH_MAX_PATHS) {
    return { ok: false, error: `At most ${BULK_PUBLISH_MAX_PATHS} paths per bulk action.` };
  }
  const { cfg } = await getEnvConfig(envName);
  const r = await replicateInBatches(cfg, cmd, clean);
  if (r.failed.length) {
    return { ok: false, count: r.published.length, published: r.published, failed: r.failed, error: partialFailure(cmd === 'Activate' ? 'published' : 'unpublished', r) };
  }
  return { ok: true, count: r.published.length, published: r.published, failed: [] };
}

/**
 * Dry run for bulk publish/unpublish: checks status for each path.
 * @param {string} envName
 * @param {string[]} paths
 * @param {'Activate'|'Deactivate'} [cmd='Activate']
 * @returns {Promise<{ok:boolean, count?:number, pages?:Array<{path:string, status:string, exists:boolean, lastModified?:string, previewStatus?:string}>, error?:string}>}
 */
export async function previewBulkReplicate(envName, paths, cmd = 'Activate') {
  const clean = [...new Set((paths || []).filter((p) => typeof p === 'string' && /^\/content\/\S+$/.test(p)))];
  if (!clean.length) return { ok: false, error: 'No valid /content paths.' };
  if (clean.length > BULK_PUBLISH_MAX_PATHS) {
    return { ok: false, error: `At most ${BULK_PUBLISH_MAX_PATHS} paths per bulk action.` };
  }
  const { cfg } = await getEnvConfig(envName);
  const concurrency = 6;
  const pages = [];
  for (let i = 0; i < clean.length; i += concurrency) {
    const chunk = clean.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(async (p) => {
      const res = await aemRequest(cfg, `${encPath(p)}/jcr:content.json`);
      if (!res.ok) {
        return { path: p, status: res.status === 404 ? 'not found' : 'unknown', exists: false };
      }
      const st = computeStatus(res.data);
      return { path: p, status: st.status, exists: true, lastModified: st.lastModified, previewStatus: st.previewStatus };
    }));
    pages.push(...results);
  }
  return { ok: true, count: pages.length, cmd, pages };
}

// ─── Recent & favourite pages (device-local) ──────────────────────────────────

export async function getPageLists() {
  const { recent = [], favourites = [] } = await storageGet('local', { recent: [], favourites: [] });
  return { ok: true, recent, favourites };
}

/**
 * Sanitizes and normalizes an entry for the recent/favourite page store.
 *
 * @param {string} env - Environment identifier.
 * @param {string} path - JCR page path.
 * @param {string} [title=''] - Page title.
 * @returns {{env:string, path:string, title:string, ts:number}}
 */
function cleanEntry(env, path, title) {
  return { env: String(env), path: String(path), title: String(title || '').slice(0, 200), ts: Date.now() };
}

export async function recordRecent(env, path, title) {
  if (!env || !/^\/content\//.test(path || '')) return { ok: false, error: 'Invalid page.' };
  const { recent = [] } = await storageGet('local', { recent: [] });
  await storageSet('local', { recent: addRecent(recent, cleanEntry(env, path, title), RECENT_MAX) });
  return { ok: true };
}

// ─── Action log (device-local audit trail of publish / unpublish / delete) ───

/**
 * Append an entry. Only non-sensitive data is stored: time, env, action, path
 * (or page count) and the generic result message — never credentials.
 * @param {{env:string, action:string, path?:string, count?:number, ok:boolean, error?:string}} entry
 */
export async function logAction(entry) {
  const { actionLog = [] } = await storageGet('local', { actionLog: [] });
  const clean = {
    ts:     Date.now(),
    env:    String(entry.env || ''),
    action: String(entry.action || ''),
    path:   String(entry.path || '').slice(0, 500),
    count:  Number.isFinite(entry.count) ? entry.count : undefined,
    ok:     !!entry.ok,
    error:  entry.ok ? undefined : String(entry.error || '').slice(0, 200),
  };
  await storageSet('local', { actionLog: [clean, ...actionLog].slice(0, ACTION_LOG_MAX) });
}

export async function getActionLog() {
  const { actionLog = [] } = await storageGet('local', { actionLog: [] });
  return { ok: true, entries: actionLog };
}

export async function clearActionLog() {
  await storageSet('local', { actionLog: [] });
  return { ok: true };
}

/** Toggle a favourite; returns the new state. */
export async function toggleFavourite(env, path, title) {
  if (!env || !/^\/content\//.test(path || '')) return { ok: false, error: 'Invalid page.' };
  const { favourites = [] } = await storageGet('local', { favourites: [] });
  const exists = favourites.some((f) => f.env === env && f.path === path);
  const next = exists
    ? favourites.filter((f) => !(f.env === env && f.path === path))
    : addRecent(favourites, cleanEntry(env, path, title), FAVOURITES_MAX);
  await storageSet('local', { favourites: next });
  return { ok: true, favourite: !exists };
}

/**
 * Activate (publish) a page via the Replication API.
 * @param {string} envName
 * @param {string} jcrPath
 */
export async function publishPage(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  return replicate(cfg, 'Activate', [jcrPath]);
}

/**
 * Publish a page to the AEM as a Cloud Service Preview tier only.
 * @param {string} envName
 * @param {string} jcrPath
 */
export async function publishToPreview(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const res = await replicate(cfg, 'Activate', [jcrPath], 'preview');
  if (!res.ok && res.status === 404) {
    return { ok: false, error: 'Preview agent not available — this environment has no Preview tier.' };
  }
  return res;
}

/**
 * Deactivate (unpublish) a page via the Replication API.
 * @param {string} envName
 * @param {string} jcrPath
 */
export async function unpublishPage(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  return replicate(cfg, 'Deactivate', [jcrPath]);
}

/**
 * Delete a page through AEM's WCM command servlet (same path as the Sites UI):
 * unpublishes first if the page is live, and refuses to delete referenced pages
 * (force=false) instead of bypassing AEM's checks with a raw Sling delete.
 * @param {string} envName
 * @param {string} jcrPath
 */
export async function deletePage(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);

  const status = await getPageStatus(envName, jcrPath);
  if (status.ok && status.status !== 'draft') {
    const d = await replicate(cfg, 'Deactivate', [jcrPath]);
    if (!d.ok) return { ok: false, error: `Unpublish before delete failed: ${d.error}` };
  }

  const body = new URLSearchParams({ cmd: 'deletePage', path: jcrPath, force: 'false', _charset_: 'utf-8' });
  const res = await aemRequest(cfg, '/bin/wcmcommand', { method: 'POST', form: body, json: false });
  if (res.ok) return { ok: true };
  if (res.status === 412) return { ok: false, error: 'Delete blocked — the page is referenced by other content.' };
  return res;
}

/** "1.10" sorts after "1.9": version names are dotted numbers, and `created` only has second resolution. */
function compareVersionNames(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * List page versions.
 * Oak stores a node's version history at a path derived from its jcr:uuid:
 *   /jcr:system/jcr:versionStorage/<uuid[0..2]>/<uuid[2..4]>/<uuid[4..6]>/<uuid>
 * (`jcr:versionHistory` is a reference property, not a child node.)
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, versions?:Array<{name:string, id:string, created:string, labels:string[]}>, error?:string}>}
 */
export async function getPageVersions(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const content = await aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.json`);
  if (!content.ok) return content;

  const uuid = content.data?.['jcr:uuid'];
  if (!uuid) return { ok: true, versions: [] }; // never versioned

  const historyPath = `/jcr:system/jcr:versionStorage/${uuid.slice(0, 2)}/${uuid.slice(2, 4)}/${uuid.slice(4, 6)}/${uuid}`;
  const history = await aemRequest(cfg, `${historyPath}.1.json`);
  if (!history.ok) {
    if (history.status === 404) return { ok: false, error: 'Version history not readable (requires read access to /jcr:system).' };
    return history;
  }

  // Map version uuid → labels
  const labelsByUuid = {};
  Object.entries(history.data['jcr:versionLabels'] || {})
    .filter(([k]) => !k.startsWith('jcr:'))
    .forEach(([label, ref]) => { (labelsByUuid[ref] ||= []).push(label); });

  const versions = Object.entries(history.data)
    .filter(([key, v]) => key !== 'jcr:rootVersion' && v?.['jcr:primaryType'] === 'nt:version')
    .map(([key, v]) => ({ name: key, id: v['jcr:uuid'], created: v['jcr:created'], labels: labelsByUuid[v['jcr:uuid']] || [] }))
    .sort((a, b) => (new Date(b.created) - new Date(a.created)) || compareVersionNames(b.name, a.name));
  return { ok: true, versions };
}

/**
 * Create a version (checkpoint) of a page via the WCM command servlet.
 * @param {string} envName
 * @param {string} jcrPath
 * @param {string} [label]  optional version label
 */
export async function createVersion(envName, jcrPath, label = '') {
  const { cfg } = await getEnvConfig(envName);
  const body = new URLSearchParams({ cmd: 'createVersion', path: jcrPath, _charset_: 'utf-8' });
  if (label) body.append('label', label);
  const res = await aemRequest(cfg, '/bin/wcmcommand', { method: 'POST', form: body, json: false });
  return res.ok ? { ok: true } : res;
}

/**
 * Restore a previous version of a page via the WCM command servlet.
 * The servlet identifies a version by its UUID (`id`). It ignores a version *name* but still
 * answers 200, so the name is looked up in this page's own version history first: that is also
 * what stops a request from restoring a version that belongs to another page.
 * @param {string} envName
 * @param {string} jcrPath
 * @param {string} versionName  e.g. "1.2" (as listed by getPageVersions)
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function restoreVersion(envName, jcrPath, versionName) {
  const list = await getPageVersions(envName, jcrPath);
  if (!list.ok) return list;
  const version = list.versions.find((v) => v.name === versionName);
  if (!version?.id) return { ok: false, error: 'That version was not found for this page.' };
  const { cfg } = await getEnvConfig(envName);
  const body = new URLSearchParams({ cmd: 'restoreVersion', path: jcrPath, id: version.id, _charset_: 'utf-8' });
  const res = await aemRequest(cfg, '/bin/wcmcommand', { method: 'POST', form: body, json: false });
  return res.ok ? { ok: true } : res;
}

/**
 * Fetch the canonical content of a specific page version.
 * @param {string} envName
 * @param {string} jcrPath
 * @param {string} versionName
 * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
 */
export async function fetchVersionContent(envName, jcrPath, versionName) {
  const { cfg } = await getEnvConfig(envName);
  const content = await aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.json`);
  if (!content.ok) return content;

  const uuid = content.data?.['jcr:uuid'];
  if (!uuid) return { ok: false, error: 'Page has never been versioned.' };

  const historyPath = `/jcr:system/jcr:versionStorage/${uuid.slice(0, 2)}/${uuid.slice(2, 4)}/${uuid.slice(4, 6)}/${uuid}`;
  const frozenRes = await aemRequest(cfg, `${historyPath}/${versionName}/jcr:frozenNode/jcr:content.infinity.json`);
  if (frozenRes.ok && frozenRes.data) {
    return { ok: true, data: canonicalContent(frozenRes.data) };
  }
  const altRes = await aemRequest(cfg, `${historyPath}/${versionName}/jcr:frozenNode.infinity.json`);
  if (altRes.ok && altRes.data) {
    const data = altRes.data['jcr:content'] || altRes.data;
    return { ok: true, data: canonicalContent(data) };
  }
  return { ok: false, error: 'Could not load version content.' };
}

/**
 * Property-level diff between two versions of a page, or a version and the current content.
 * @param {string} envName
 * @param {string} jcrPath
 * @param {string} versionA  (older version, or version name)
 * @param {string} [versionB='current'] (newer version, or 'current')
 * @returns {Promise<{ok:boolean, changes?:object[], total?:number, truncated?:boolean, error?:string}>}
 */
export async function diffVersions(envName, jcrPath, versionA, versionB = 'current') {
  if (!jcrPath || !jcrPath.startsWith('/content/')) return { ok: false, error: 'Only /content/ pages can be diffed.' };
  const { cfg } = await getEnvConfig(envName);

  const [resA, resB] = await Promise.all([
    fetchVersionContent(envName, jcrPath, versionA),
    versionB === 'current'
      ? aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.infinity.json`).then((r) => r.ok ? { ok: true, data: canonicalContent(r.data) } : r)
      : fetchVersionContent(envName, jcrPath, versionB),
  ]);

  if (!resA.ok) return { ok: false, error: `Could not load version ${versionA}: ${resA.error}` };
  if (!resB.ok) return { ok: false, error: `Could not load ${versionB === 'current' ? 'current page' : `version ${versionB}`}: ${resB.error}` };

  const d = diffContent(resA.data, resB.data);
  return { ok: true, ...d };
}

/**
 * Extracts immediate child cq:Page objects from a depth-1 JCR JSON object.
 *
 * @param {string} basePath - Parent repository path.
 * @param {object} node - Depth-1 JCR node JSON.
 * @returns {Array<{path:string, deactivated:boolean}>} List of child page paths and their replication state.
 */
function childPages(basePath, node) {
  return Object.entries(node || {})
    .filter(([, v]) => v && typeof v === 'object' && v['jcr:primaryType'] === 'cq:Page')
    .map(([name, v]) => ({
      path: `${basePath}/${name}`,
      deactivated: v['jcr:content']?.['cq:lastReplicationAction'] === 'Deactivate',
    }));
}

/**
 * Walk the page tree through the repository, one level at a time with up to
 * WALK_CONCURRENCY requests in flight. Slower than QueryBuilder but independent
 * of the search index.
 * @returns {Promise<{ok:true, pages:Array<{path:string,deactivated:boolean}>, tooMany?:boolean}|{ok:false, error:string}>}
 */
async function walkPages(cfg, rootPath) {
  const pages = [];
  let level = [rootPath];
  while (level.length) {
    const next = [];
    for (let i = 0; i < level.length; i += WALK_CONCURRENCY) {
      const chunk = level.slice(i, i + WALK_CONCURRENCY);
      const results = await Promise.all(chunk.map((base) => aemRequest(cfg, `${encPath(base)}.1.json`)));
      for (let j = 0; j < chunk.length; j++) {
        if (!results[j].ok) return results[j];
        for (const child of childPages(chunk[j], results[j].data)) {
          pages.push(child);
          if (pages.length > TREE_PUBLISH_MAX_PAGES) return { ok: true, pages, tooMany: true };
          next.push(child.path);
        }
      }
    }
    level = next;
  }
  return { ok: true, pages };
}

/**
 * Work out which pages a tree publish would replicate, without publishing anything.
 *
 * QueryBuilder depends on the Oak search index, which on AEMaaCS lags behind
 * (or omits) recently created pages. So the result is checked against the
 * page's real children; if any is missing, the tree is walked instead.
 * Previously-deactivated descendants are skipped (and counted in `skipped`).
 * @returns {Promise<{ok:true, paths:string[], skipped:number}|{ok:false, error:string}>}
 */
async function planTreePublish(cfg, jcrPath) {
  const params = new URLSearchParams({
    path: jcrPath,
    type: 'cq:Page',
    'p.limit': String(TREE_PUBLISH_MAX_PAGES + 1),
    'p.hits': 'selective',
    'p.properties': 'jcr:path jcr:content/cq:lastReplicationAction',
  });
  const q = await aemRequest(cfg, `/bin/querybuilder.json?${params.toString()}`);
  if (!q.ok) return q;

  let found = (q.data.hits || [])
    .map((h) => ({ path: h['jcr:path'], deactivated: h['jcr:content']?.['cq:lastReplicationAction'] === 'Deactivate' }))
    .filter((p) => p.path && p.path !== jcrPath);
  let tooMany = (q.data.hits || []).length > TREE_PUBLISH_MAX_PAGES;

  const self = await aemRequest(cfg, `${encPath(jcrPath)}.1.json`);
  if (self.ok) {
    const indexed = new Set(found.map((p) => p.path));
    if (childPages(jcrPath, self.data).some((c) => !indexed.has(c.path))) {
      const walked = await walkPages(cfg, jcrPath);
      if (!walked.ok) return walked;
      found = walked.pages;
      tooMany = !!walked.tooMany;
    }
  }

  if (tooMany) {
    return { ok: false, error: `Subtree has more than ${TREE_PUBLISH_MAX_PAGES} pages — use Manage Publication in AEM.` };
  }
  return {
    ok: true,
    paths: [jcrPath, ...found.filter((p) => !p.deactivated).map((p) => p.path)],
    skipped: found.filter((p) => p.deactivated).length,
  };
}

/**
 * Preview of a tree publish (nothing is published): how many pages would go live and how
 * many were left out because they were unpublished on purpose.
 * @returns {Promise<{ok:boolean, count?:number, skipped?:number, sample?:string[], error?:string}>}
 */
export async function previewTreeActivate(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const plan = await planTreePublish(cfg, jcrPath);
  if (!plan.ok) return plan;
  return { ok: true, count: plan.paths.length, skipped: plan.skipped, sample: plan.paths.slice(0, 8) };
}

/**
 * Tree publish: replicate the page and all descendant pages.
 * Works on AEM as a Cloud Service (no /etc/replication/treeactivation.html):
 * lists descendants (see planTreePublish) and activates them in batches via the
 * replication servlet. A failing batch does not stop the others.
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, count?:number, published?:string[], failed?:string[], error?:string}>}
 */
export async function treeActivate(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const plan = await planTreePublish(cfg, jcrPath);
  if (!plan.ok) return plan;
  const r = await replicateInBatches(cfg, 'Activate', plan.paths);
  if (r.failed.length) {
    return { ok: false, count: r.published.length, published: r.published, failed: r.failed, error: partialFailure('published', r) };
  }
  return { ok: true, count: r.published.length, published: r.published, failed: [] };
}

/**
 * Preview of a tree unpublish: how many pages would be deactivated.
 * @returns {Promise<{ok:boolean, count?:number, skipped?:number, sample?:string[], error?:string}>}
 */
export async function previewTreeDeactivate(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const plan = await planTreePublish(cfg, jcrPath);
  if (!plan.ok) return plan;
  return { ok: true, count: plan.paths.length, skipped: 0, sample: plan.paths.slice(0, 8) };
}

/**
 * Tree unpublish: unpublish (deactivate) the page and all descendant pages.
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, count?:number, published?:string[], failed?:string[], error?:string}>}
 */
export async function treeDeactivate(envName, jcrPath) {
  const { cfg } = await getEnvConfig(envName);
  const plan = await planTreePublish(cfg, jcrPath);
  if (!plan.ok) return plan;
  const r = await replicateInBatches(cfg, 'Deactivate', plan.paths);
  if (r.failed.length) {
    return { ok: false, count: r.published.length, published: r.published, failed: r.failed, error: partialFailure('unpublished', r) };
  }
  return { ok: true, count: r.published.length, published: r.published, failed: [] };
}

/**
 * Search for pages under a root path using the QueryBuilder API.
 * @param {string} envName
 * @param {string} rootPath  JCR path to search under
 * @param {string} query     text query (matches jcr:title)
 * @param {number} [limit]
 * @returns {Promise<{ok:boolean, results?:Array<{path:string,title:string}>, error?:string}>}
 */
export async function searchPages(envName, rootPath, query, limit = 20) {
  const { cfg } = await getEnvConfig(envName);
  const qLower = String(query || '').toLowerCase();
  const qCap = qLower ? qLower.charAt(0).toUpperCase() + qLower.slice(1) : '';
  const params = new URLSearchParams({
    'path': rootPath,
    'type': 'cq:Page',
    'group.p.or': 'true',
    'group.1_fulltext': query,
    'group.1_fulltext.relPath': 'jcr:content',
    'group.2_nodename': `*${qLower}*`,
    'group.3_nodename': `*${query}*`,
    'group.4_property': 'jcr:content/jcr:title',
    'group.4_property.operation': 'like',
    'group.4_property.value': `%${query}%`,
    'group.5_property': 'jcr:content/jcr:title',
    'group.5_property.operation': 'like',
    'group.5_property.value': `%${qLower}%`,
    'group.6_property': 'jcr:content/jcr:title',
    'group.6_property.operation': 'like',
    'group.6_property.value': `%${qCap}%`,
    'p.limit': String(Math.min(Math.max(Number(limit) || 20, 1), 100)),
    'p.hits': 'selective',
    'p.properties': 'jcr:path jcr:content/jcr:title',
  });

  const res = await aemRequest(cfg, `/bin/querybuilder.json?${params.toString()}`);
  if (!res.ok) return res;
  const results = (res.data.hits || []).map((h) => ({
    path:  h['jcr:path'] || '',
    title: h['jcr:content']?.['jcr:title'] || h['jcr:path'] || '',
  }));
  return { ok: true, results };
}

/** The configured Universal Editor organisation, or 'adobe' when unset or not a plain name. */
function validImsOrg(org) {
  const s = String(org || '').replace(/^@/, '').trim();
  return /^[\w.-]{1,64}$/.test(s) ? s : 'adobe';
}

/**
 * Get all URL variants for a JCR path (author editor, author view, publish, dispatcher).
 * The dispatcher URL always applies the configured URL mappings (e.g. /content/site/en → /en).
 * Publish and preview URLs apply them only when the environment's `publishUsesMappings` is on
 * (the host sits behind a dispatcher/CDN); otherwise they use the full JCR path.
 * Author URLs always use the JCR path.
 * @param {string} envName
 * @param {string} jcrPath
 */
export async function getUrlVariants(envName, jcrPath) {
  const { cfg, config } = await getEnvConfig(envName);
  const publicPath = mapJcrToPublic(jcrPath, parseMappings(config.urlMappings));
  const publishPath = cfg.publishUsesMappings === true ? publicPath : jcrPath;
  const cdnOpts = { html: cfg.dispatcherOmitHtml !== true };
  // Publish / Preview behind a dispatcher/CDN (mappings applied) follow the same extension rule
  const publishOpts = cfg.publishUsesMappings === true ? cdnOpts : {};
  const a = cfg.authorHost;
  return {
    authorEditUrl:     a ? `${a}/editor.html${jcrPath}.html` : '',
    authorTouchUrl:    a ? `${a}${jcrPath}.html` : '',
    // Author view with the editing layer disabled (what visitors will see)
    authorDisabledUrl: a ? `${a}${jcrPath}.html?wcmmode=disabled` : '',
    // Column view shows the page itself as the selected item; list view would list its children
    sitesConsoleUrl:   a ? `${a}/sites.html${jcrPath}?layout=column` : '',
    propertiesUrl:     a
      ? `${a}/mnt/overlay/wcm/core/content/sites/properties.html?item=${encodeURIComponent(jcrPath)}`
      : '',
    crxdeUrl:          a ? `${a}/crx/de/index.jsp#${jcrPath}/jcr%3Acontent` : '',
    // Universal Editor (experience.adobe.com) on the author page
    universalEditorUrl: a ? getUniversalEditorUrl(`${a}${jcrPath}.html`, validImsOrg(config.imsOrg)) : '',
    imsOrg:            validImsOrg(config.imsOrg),
    // Developer / debug views (author)
    modelJsonUrl:      a ? `${a}${jcrPath}.model.json` : '',
    jcrJsonUrl:        a ? `${a}${jcrPath}/jcr:content.infinity.json` : '',
    debugClientLibsUrl: a ? `${a}${jcrPath}.html?wcmmode=disabled&debugClientLibs=true` : '',
    // Publish / preview use the public path only when a dispatcher/CDN is in front of them
    publishUrl:        buildPageUrl(cfg.publishHost, publishPath, publishOpts),
    previewUrl:        buildPageUrl(cfg.previewHost, publishPath, publishOpts),
    dispatcherUrl:     buildPageUrl(cfg.dispatcherHost, publicPath, cdnOpts),
    // What visitors see: the CDN when one is configured, otherwise the Publish tier
    liveUrl:           cfg.dispatcherHost
      ? buildPageUrl(cfg.dispatcherHost, publicPath, cdnOpts)
      : buildPageUrl(cfg.publishHost, publishPath, publishOpts),
  };
}

/**
 * Map page URLs (e.g. the hreflang links of a page) onto the tier / view the user is on:
 * edit stays edit, view stays view, publish stays publish. The link's own host does not
 * matter (hreflang often points at another host than the one in use): only its page path
 * is read, and the result is built on the hosts of the configured environment. Links
 * without a recognisable page path are returned unchanged.
 * @param {string} envName
 * @param {string[]} urls
 * @param {{tier?:string, inEditor?:boolean, wcmDisabled?:boolean}} mode
 * @returns {Promise<string[]>}  same length and order as `urls`
 */
export async function resolveLocaleUrls(envName, urls, mode = {}) {
  const config = await getConfig();
  const mappings = parseMappings(config.urlMappings);
  const pagePath = (url) => {
    const known = parsePageUrl(url, config).jcrPath;
    if (known) return known;
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return mapPublicToJcr(extractResourcePath(u), mappings, config.contentRoot);
  };
  return Promise.all((urls || []).slice(0, 200).map(async (url) => {
    const jcrPath = pagePath(url);
    if (!jcrPath) return url;
    const variants = await getUrlVariants(envName, jcrPath);
    return sameTierUrl(variants, mode.tier, !!mode.inEditor, !!mode.wcmDisabled) || url;
  }));
}

/**
 * Multi Site Manager neighbours of a page: the language master and the live copies
 * of the same page that really exist (not guessed from a fixed list).
 *   - on a language master:  every live copy
 *   - on a live copy:        the language master and the live copies in other regions
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, msm?:object|null, targets?:Array<{role:'master'|'livecopy', region:string, lang:string, path:string}>, error?:string}>}
 */
export async function getMsmTargets(envName, jcrPath) {
  const msm = parseMsmPath(jcrPath);
  if (!msm) return { ok: true, msm: null, targets: [] };
  const { cfg } = await getEnvConfig(envName);
  const site = await aemRequest(cfg, `${encPath(msm.siteRoot)}.2.json`);
  if (!site.ok) return site;

  const isPage = (n) => n && typeof n === 'object' && n['jcr:primaryType'] === 'cq:Page';
  const rel = msm.relPath ? `/${msm.relPath}` : '';
  const candidates = [];
  if (msm.kind === 'livecopy' && isPage(site.data['language-masters']?.[msm.lang])) {
    candidates.push({ role: 'master', region: '', lang: msm.lang, path: `${msm.siteRoot}/language-masters/${msm.lang}${rel}` });
  }
  for (const [region, node] of Object.entries(site.data)) {
    if (region === 'language-masters' || !isPage(node) || !isPage(node[msm.lang])) continue;
    if (msm.kind === 'livecopy' && region === msm.region) continue;
    candidates.push({ role: 'livecopy', region, lang: msm.lang, path: `${msm.siteRoot}/${region}/${msm.lang}${rel}` });
  }

  // The language root exists by construction; deeper pages must be checked.
  const checked = await Promise.all(candidates.slice(0, 40).map(async (c) => {
    if (!msm.relPath) return c;
    const r = await aemRequest(cfg, `${encPath(c.path)}/jcr:content.json`);
    return r.ok ? c : null;
  }));
  const targets = checked.filter(Boolean).sort((a, b) => a.role.localeCompare(b.role) || a.region.localeCompare(b.region));
  return { ok: true, msm, targets };
}

/**
 * Author URLs for a component resource (used by the component inspector).
 * @param {string} envName
 * @param {string} resourcePath  e.g. /content/site/page/jcr:content/root/text
 * @param {string} resourceType  e.g. myapp/components/text
 */
export async function getComponentUrls(envName, resourcePath, resourceType) {
  const { cfg } = await getEnvConfig(envName);
  const a = cfg.authorHost;
  if (!a) return { crxdeNodeUrl: '', crxdeTypeUrl: '' };
  const typePath = resourceType && !resourceType.startsWith('/') ? `/apps/${resourceType}` : resourceType;
  return {
    crxdeNodeUrl: resourcePath ? `${a}/crx/de/index.jsp#${resourcePath.replace(/:/g, '%3A')}` : '',
    crxdeTypeUrl: typePath ? `${a}/crx/de/index.jsp#${typePath}` : '',
  };
}

// ─── DAM asset details ─────────────────────────────────────────────────────────

/**
 * Detect whether a JCR path is a DAM asset (lives under /content/dam).
 * @param {string} jcrPath
 * @returns {boolean}
 */
export function isDamAsset(jcrPath) {
  return typeof jcrPath === 'string' && jcrPath.startsWith('/content/dam/');
}

/**
 * Fetch DAM asset metadata from jcr:content/metadata node.
 * @param {string} envName
 * @param {string} assetPath  e.g. /content/dam/site/image.jpg
 * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
 */
export async function getDamAssetMetadata(envName, assetPath) {
  const { cfg } = await getEnvConfig(envName);
  return aemRequest(cfg, `${encPath(assetPath)}/jcr:content/metadata.infinity.json`);
}

/**
 * Build the DAM asset editor URL (Assets console touch-UI).
 * @param {string} authorHost
 * @param {string} assetPath
 * @returns {string}
 */
export function getDamEditorUrl(authorHost, assetPath) {
  if (!authorHost || !assetPath) return '';
  return `${authorHost}/assetdetails.html${assetPath}`;
}

// ─── Content sync (copy a page between environments) ──────────────────────────

/** Why a sync cannot even be planned, or null when the paths/envs are acceptable. */
function syncPreconditionError(sourceEnv, targetEnv, jcrPath) {
  if (!jcrPath || !jcrPath.startsWith('/content/')) return 'Only /content/ paths can be synced.';
  if (isDamAsset(jcrPath)) return 'DAM assets cannot be synced — only pages.';
  if (sourceEnv === targetEnv) return 'Source and target environments must differ.';
  return null;
}

/** Why Sync (and undoing it) is unavailable: it is a developer feature. Null when allowed. */
function devModeError(config) {
  if (config.enableDevMode !== true || config.devToolsButtons?.sync === false) {
    return 'Sync is a developer feature. Turn on Developer Mode (and its Sync button) in Settings.';
  }
  return null;
}

/** Why a sync is refused by the safety settings (Developer Mode, copy direction), or null when allowed. */
async function syncDirectionError(sourceEnv, targetEnv) {
  const config = await getConfig();
  const devOff = devModeError(config);
  if (devOff) return devOff;
  if (isSyncAllowed(config.envOrder, sourceEnv, targetEnv, config.allowUpwardSync === true)) return null;
  return `Copying from ${sourceEnv} to ${targetEnv} (lower to higher) is turned off. Enable "Allow syncing to higher environments" in Settings → Safety.`;
}

/**
 * Does the node exist on that environment?
 * @returns {Promise<{ok:true, exists:boolean}|{ok:false, error:string}>}
 */
async function nodeExists(cfg, path) {
  const res = await aemRequest(cfg, `${encPath(path)}.json`);
  if (res.ok) return { ok: true, exists: true };
  if (res.status === 404) return { ok: true, exists: false };
  return { ok: false, error: res.error };
}

/**
 * Look at the target before syncing: does the page exist there, and which
 * parent pages are missing (outermost first)? Used to ask the user before
 * anything is created.
 * @returns {Promise<{ok:boolean, exists?:boolean, missingParents?:string[], error?:string}>}
 */
export async function getSyncPlan(sourceEnv, targetEnv, jcrPath) {
  const bad = syncPreconditionError(sourceEnv, targetEnv, jcrPath) || await syncDirectionError(sourceEnv, targetEnv);
  if (bad) return { ok: false, error: bad };

  const { cfg } = await getEnvConfig(targetEnv);
  const page = await nodeExists(cfg, jcrPath);
  if (!page.ok) return { ok: false, error: `Check on ${targetEnv} failed: ${page.error}` };
  if (page.exists) return { ok: true, exists: true, missingParents: [] };

  // Walk up until an ancestor exists; everything below it is missing.
  const missingParents = [];
  for (let p = parentPath(jcrPath); p.startsWith('/content/'); p = parentPath(p)) {
    const r = await nodeExists(cfg, p);
    if (!r.ok) return { ok: false, error: `Check on ${targetEnv} failed: ${r.error}` };
    if (r.exists) break;
    missingParents.unshift(p);
  }
  return { ok: true, exists: false, missingParents };
}

/**
 * Create a page on the target with a proper cq:PageContent node (importing into
 * a missing jcr:content would make it nt:unstructured). Title and template come
 * from the same page on the source when readable.
 */
async function createPageSkeleton(srcCfg, tgtCfg, path) {
  const src = await aemRequest(srcCfg, `${encPath(path)}/jcr:content.json`);
  const props = src.ok ? src.data : {};
  const body = new URLSearchParams({
    'jcr:primaryType': 'cq:Page',
    'jcr:content/jcr:primaryType': 'cq:PageContent',
    'jcr:content/jcr:title': props['jcr:title'] || path.split('/').pop(),
    _charset_: 'utf-8',
  });
  ['sling:resourceType', 'cq:template'].forEach((k) => { if (props[k]) body.append(`jcr:content/${k}`, props[k]); });
  return aemRequest(tgtCfg, encPath(path), { method: 'POST', form: body, json: false });
}

/**
 * Copy a page's JCR content from a source environment to a target environment.
 * Reads the full jcr:content tree from the source and writes it via POST to
 * the Sling POST servlet on the target.
 *
 * When the page (or some of its parents) does not exist on the target, nothing
 * is created unless `createMissing` is set; then the missing parent pages and
 * the page itself are created first.
 *
 * Before overwriting an EXISTING target page, an AEM version of it is saved
 * (label "before-sync-from-<source>-<timestamp>"), so the previous content can be restored from
 * AEM's Versions. If that backup fails, nothing is written. A page created by this
 * call has no previous content, so it gets no backup.
 *
 * Constraints / guardrails:
 *   - Only works for /content/ pages (never /apps, /libs, DAM assets, etc.)
 *   - Does not replicate after import — the caller should publish separately
 *   - Volatile props (uuid, versions, etc.) are stripped before the write
 *
 * @param {string} sourceEnv   env to read from (e.g. 'prod')
 * @param {string} targetEnv   env to write to  (e.g. 'stage')
 * @param {string} jcrPath     e.g. /content/site/en/page
 * @param {{createMissing?:boolean}} [opts]
 * @returns {Promise<{ok:boolean, code?:string, created?:string[], backup?:boolean, error?:string}>}
 */
export async function syncContentPage(sourceEnv, targetEnv, jcrPath, { createMissing = false } = {}) {
  const bad = syncPreconditionError(sourceEnv, targetEnv, jcrPath) || await syncDirectionError(sourceEnv, targetEnv);
  if (bad) return { ok: false, error: bad };

  // 1. Read jcr:content tree from source (infinity depth)
  const { cfg: srcCfg } = await getEnvConfig(sourceEnv);
  const readResult = await aemRequest(srcCfg, `${encPath(jcrPath)}/jcr:content.infinity.json`);
  if (!readResult.ok) {
    return { ok: false, error: `Read from ${sourceEnv} failed: ${readResult.error}` };
  }

  // 2. Strip volatile / identity properties before write
  const content = stripVolatileForSync(readResult.data);

  // 3. Make sure the page exists on the target (create it only when asked to)
  const { cfg: tgtCfg } = await getEnvConfig(targetEnv);
  const plan = await getSyncPlan(sourceEnv, targetEnv, jcrPath);
  if (!plan.ok) return plan;
  const created = [];
  if (!plan.exists) {
    if (!createMissing) {
      return { ok: false, code: 'TARGET_MISSING', error: `Page does not exist on ${targetEnv}.` };
    }
    for (const p of [...plan.missingParents, jcrPath]) {
      const r = await createPageSkeleton(srcCfg, tgtCfg, p);
      if (!r.ok) return { ok: false, error: `Creating ${p} on ${targetEnv} failed: ${r.error}`, created };
      created.push(p);
    }
  }

  // 4. Save the target's current content as a version first (only when it already existed)
  let undo = false;
  if (plan.exists) {
    // A JCR label can sit on one version per page, so a repeated sync from the same environment would
    // leave the label on the OLD version. A timestamp keeps every backup label unique (digits and hyphens only; millisecond resolution).
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
    const saved = await createVersion(targetEnv, jcrPath, `before-sync-from-${sourceEnv}-${stamp}`);
    if (!saved.ok) {
      return { ok: false, error: `Could not save a backup of the page on ${targetEnv}, so nothing was changed: ${saved.error}`, created };
    }
    undo = await saveSyncSnapshot(tgtCfg, targetEnv, sourceEnv, jcrPath);
  }

  // 5. Write to target via Sling POST servlet
  const writeResult = await writeContent(tgtCfg, jcrPath, content);
  if (!writeResult.ok) {
    return { ok: false, error: `Write to ${targetEnv} failed: ${writeResult.error}`, created };
  }
  return { ok: true, created, backup: plan.exists, ...(undo ? { undo: true } : {}) };
}

/** Properties that must not be copied across environments during sync. */
const SYNC_STRIP_PROPS = /^(jcr:(uuid|baseVersion|predecessors|versionHistory|isCheckedOut|lockOwner|lockIsDeep|mixinTypes|created|createdBy)|cq:(lastReplicated.*|lastReplicationAction.*|lastReplicatedBy.*|lastRolledout|lastRolledoutBy))$/;

/**
 * Strips repository UUIDs, replication timestamps, and internal metadata before syncing a page to another environment.
 *
 * @param {object} node - Deep JCR content node tree.
 * @returns {object} Clean content tree ready for Sling POST import.
 */
function stripVolatileForSync(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (SYNC_STRIP_PROPS.test(k)) continue;
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? stripVolatileForSync(v) : v;
  }
  return out;
}

/**
 * Write a jcr:content tree to a page through the Sling POST servlet (import operation), so that
 * afterwards the target holds what the source holds:
 *  - `:replaceProperties` updates the properties that are in the source;
 *  - `:replace` removes child nodes (components) that are not in the source;
 *  - properties that exist only on the target are removed in a second request. Properties AEM
 *    owns on the target (uuid, versioning, replication state, see SYNC_STRIP_PROPS) are kept.
 *
 * @param {typeof ENV_DEFAULTS} cfg - Target environment configuration.
 * @param {string} jcrPath - Page path (the content is written to `<jcrPath>/jcr:content`).
 * @param {object} content - Clean content tree (see stripVolatileForSync).
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function writeContent(cfg, jcrPath, content) {
  const target = `${encPath(jcrPath)}/jcr:content`;
  const current = await aemRequest(cfg, `${target}.json`);
  const body = new URLSearchParams();
  body.append(':operation', 'import');
  body.append(':contentType', 'json');
  body.append(':replace', 'true');
  body.append(':replaceProperties', 'true');
  body.append(':content', JSON.stringify(content));
  body.append('_charset_', 'utf-8');
  const res = await aemRequest(cfg, target, { method: 'POST', form: body, json: false });
  if (!res.ok || !current.ok) return res.ok ? { ok: true } : res;

  const leftovers = Object.entries(current.data || {})
    .filter(([k, v]) => !(k in content) && k !== 'jcr:primaryType' && !SYNC_STRIP_PROPS.test(k) && (v === null || typeof v !== 'object'))
    .map(([k]) => k);
  if (!leftovers.length) return { ok: true };
  const del = new URLSearchParams({ _charset_: 'utf-8' });
  leftovers.forEach((k) => del.append(`${k}@Delete`, ''));
  const cleaned = await aemRequest(cfg, target, { method: 'POST', form: del, json: false });
  return cleaned.ok ? { ok: true } : { ok: false, error: `Content was copied, but ${leftovers.length} leftover propert${leftovers.length === 1 ? 'y' : 'ies'} could not be removed.` };
}

/**
 * Keep the target page's current content on this device before a sync overwrites it, so the
 * sync can be undone with one click. Skipped (returns false) when the page cannot be read or
 * is too large; the AEM version backup still exists in that case.
 * @returns {Promise<boolean>} true when a snapshot was stored
 */
async function saveSyncSnapshot(tgtCfg, env, sourceEnv, jcrPath) {
  const res = await aemRequest(tgtCfg, `${encPath(jcrPath)}/jcr:content.infinity.json`);
  if (!res.ok) return false;
  const content = stripVolatileForSync(res.data);
  if (JSON.stringify(content).length > SYNC_SNAPSHOT_MAX_CHARS) return false;
  const { syncSnapshots = [] } = await storageGet('local', { syncSnapshots: [] });
  const rest = syncSnapshots.filter((s) => !(s.env === env && s.path === jcrPath));
  await storageSet('local', {
    syncSnapshots: [{ env, path: jcrPath, sourceEnv, ts: Date.now(), content }, ...rest].slice(0, SYNC_SNAPSHOTS_MAX),
  });
  return true;
}

/**
 * Undo the last sync of a page on an environment: writes back the content that was
 * there before. Same rules as Sync (Developer Mode, /content pages only).
 * @param {string} targetEnv
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function undoSync(targetEnv, jcrPath) {
  const config = await getConfig();
  const bad = devModeError(config);
  if (bad) return { ok: false, error: bad };
  if (!config.environments[targetEnv]) return { ok: false, error: 'Unknown environment.' };
  if (!jcrPath || !jcrPath.startsWith('/content/') || isDamAsset(jcrPath)) {
    return { ok: false, error: 'Only /content/ pages can be restored.' };
  }
  const { syncSnapshots = [] } = await storageGet('local', { syncSnapshots: [] });
  const snap = syncSnapshots.find((s) => s.env === targetEnv && s.path === jcrPath);
  if (snap) {
    const r = await writeContent(config.environments[targetEnv], jcrPath, snap.content);
    if (!r.ok) return { ok: false, error: `Restore on ${targetEnv} failed: ${r.error}` };
    await storageSet('local', { syncSnapshots: syncSnapshots.filter((s) => s !== snap) });
    return { ok: true };
  }

  // Fallback to restoring the AEM version created before sync
  const versionsRes = await getPageVersions(targetEnv, jcrPath);
  if (versionsRes.ok && versionsRes.versions?.length) {
    const backupVersion = versionsRes.versions.find((v) =>
      v.labels?.some((l) => l.startsWith('before-sync-from-')) || v.name?.startsWith('before-sync-from-')
    );
    if (backupVersion) {
      const rest = await restoreVersion(targetEnv, jcrPath, backupVersion.name);
      if (rest.ok) return { ok: true, restoredVersion: backupVersion.name };
      return { ok: false, error: `Restore version failed: ${rest.error}` };
    }
  }

  return { ok: false, error: 'Nothing to undo for this page. Restore the "before-sync-from-…" version in AEM Versions instead.' };
}

/**
 * Query replication agent or distribution queue status.
 * @param {string} envName
 * @returns {Promise<{ok:boolean, queueStatus:'idle'|'pending'|'blocked'|'error', queueCount?:number, error?:string}>}
 */
export async function getReplicationQueueStatus(envName) {
  const { cfg } = await getEnvConfig(envName);
  const agentRes = await aemRequest(cfg, '/etc/replication/agents.author/publish.queue.json');
  if (agentRes.ok && Array.isArray(agentRes.data)) {
    const queueCount = agentRes.data.length;
    const isBlocked = agentRes.data.some((item) => item.status === 'BLOCKED' || item.processing === false);
    return {
      ok: true,
      queueStatus: queueCount === 0 ? 'idle' : isBlocked ? 'blocked' : 'pending',
      queueCount,
    };
  }
  const distRes = await aemRequest(cfg, '/libs/sling/distribution/services/agents/publish.json');
  if (distRes.ok && distRes.data?.status) {
    const status = distRes.data.status;
    const queueCount = distRes.data.queueItemsCount || 0;
    return {
      ok: true,
      queueStatus: queueCount > 0 ? (status === 'BLOCKED' ? 'blocked' : 'pending') : 'idle',
      queueCount,
    };
  }
  return { ok: true, queueStatus: 'idle', queueCount: 0 };
}

/**
 * Search for text or property value across descendant pages.
 * @param {string} envName
 * @param {string} rootPath
 * @param {string} searchTerm
 * @param {object} [options]
 * @returns {Promise<{ok:boolean, matches?:Array<{pagePath:string, propPath:string, key:string, oldValue:string}>, count?:number, error?:string}>}
 */
export async function findAcrossPages(envName, rootPath, searchTerm, { propertyName = '', maxPages = 40 } = {}) {
  if (!searchTerm) return { ok: false, error: 'Search term is required.' };
  const { cfg } = await getEnvConfig(envName);
  const query = new URLSearchParams({
    path: rootPath,
    type: 'cq:Page',
    'p.limit': String(maxPages),
    'p.hits': 'selective',
    'p.properties': 'jcr:path',
  });
  if (!propertyName) {
    query.append('fulltext', searchTerm);
  } else {
    query.append('property', `jcr:content/${propertyName}`);
    query.append('property.value', `%${searchTerm}%`);
    query.append('property.operation', 'like');
  }

  const res = await aemRequest(cfg, `/bin/querybuilder.json?${query.toString()}`);
  const paths = [rootPath];
  if (res.ok && Array.isArray(res.data?.hits)) {
    res.data.hits.forEach((h) => {
      if (h['jcr:path'] && !paths.includes(h['jcr:path'])) paths.push(h['jcr:path']);
    });
  }

  const matches = [];
  const lowerSearch = searchTerm.toLowerCase();

  function scanNode(pagePath, nodePath, obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('jcr:uuid') || k.startsWith('cq:lastRepl') || k.startsWith(':')) continue;
      const currentPath = `${nodePath}/${k}`;
      if (typeof v === 'string') {
        if ((!propertyName || k === propertyName || currentPath.endsWith(propertyName)) && v.toLowerCase().includes(lowerSearch)) {
          matches.push({
            pagePath,
            propPath: currentPath,
            key: k,
            oldValue: v,
          });
        }
      } else if (Array.isArray(v)) {
        v.forEach((item, idx) => {
          if (typeof item === 'string' && item.toLowerCase().includes(lowerSearch)) {
            matches.push({
              pagePath,
              propPath: `${currentPath}[${idx}]`,
              key: k,
              oldValue: item,
            });
          }
        });
      } else if (typeof v === 'object') {
        scanNode(pagePath, currentPath, v);
      }
    }
  }

  for (const pagePath of paths.slice(0, maxPages)) {
    const nodeRes = await aemRequest(cfg, `${encPath(pagePath)}/jcr:content.infinity.json`);
    if (nodeRes.ok && nodeRes.data) {
      scanNode(pagePath, `${pagePath}/jcr:content`, nodeRes.data);
    }
  }

  return { ok: true, matches: matches.slice(0, 100), count: matches.length };
}

/**
 * Apply replacements across pages.
 *
 * Safety rules:
 *  - only properties under a page's jcr:content can be written;
 *  - each affected page gets an AEM version ("before-find-replace") first, and
 *    a page whose backup fails is left untouched;
 *  - a change to one item of a multi-value property rewrites the whole array
 *    (read fresh from AEM), so the other items are kept.
 * @param {string} envName
 * @param {Array<{propPath:string, newValue:string}>} replacements  propPath may end in [idx]
 * @returns {Promise<{ok:boolean, updatedCount?:number, failed?:string[], error?:string}>}
 */
export async function replaceAcrossPages(envName, replacements) {
  if (!Array.isArray(replacements) || !replacements.length) return { ok: false, error: 'No replacements provided.' };
  const { cfg } = await getEnvConfig(envName);

  // Group by page → property so each property is written once.
  const pages = new Map();
  const failed = [];
  for (const item of replacements) {
    if (!item || typeof item.propPath !== 'string' || typeof item.newValue !== 'string') continue;
    const m = /^(.*?)\/jcr:content\/(.+?)(?:\[(\d+)\])?$/.exec(item.propPath);
    if (!m || m[2].includes('..')) { failed.push(item.propPath); continue; }
    const [, pagePath, relPath, idx] = m;
    const slash = relPath.lastIndexOf('/');
    const nodePath = `${pagePath}/jcr:content${slash >= 0 ? `/${relPath.slice(0, slash)}` : ''}`;
    const propName = relPath.slice(slash + 1);
    if (!pages.has(pagePath)) pages.set(pagePath, new Map());
    const props = pages.get(pagePath);
    const key = `${nodePath}\n${propName}`;
    if (!props.has(key)) props.set(key, { nodePath, propName, whole: null, items: new Map(), propPath: item.propPath });
    const entry = props.get(key);
    if (idx === undefined) entry.whole = item.newValue;
    else entry.items.set(Number(idx), item.newValue);
  }

  let updatedCount = 0;
  for (const [pagePath, props] of pages) {
    const backup = await createVersion(envName, pagePath, 'before-find-replace');
    if (!backup.ok) { failed.push(pagePath); continue; }

    for (const { nodePath, propName, whole, items, propPath } of props.values()) {
      const body = new URLSearchParams({ _charset_: 'utf-8' });
      if (items.size) {
        const cur = await aemRequest(cfg, `${encPath(nodePath)}.json`);
        const arr = cur.ok ? cur.data?.[propName] : null;
        if (!Array.isArray(arr)) { failed.push(propPath); continue; }
        const next = arr.map((v, i) => (items.has(i) ? items.get(i) : v));
        body.append(`${propName}@TypeHint`, 'String[]');
        next.forEach((v) => body.append(propName, String(v)));
      } else {
        body.append(propName, whole);
      }
      const res = await aemRequest(cfg, encPath(nodePath), { method: 'POST', form: body, json: false });
      if (res.ok) updatedCount += Math.max(items.size, 1);
      else failed.push(propPath);
    }
  }

  if (!updatedCount && failed.length) return { ok: false, error: 'No replacements were applied.', failed };
  return { ok: true, updatedCount, ...(failed.length ? { failed } : {}) };
}

/**
 * Look up the template, content policy and allowed components for a component.
 *
 * Editable-template policy mappings live under `<template>/policies/jcr:content`.
 * A component type is mapped by its resource-type path (e.g. `wknd/components/title`);
 * a container is mapped by its structure path (e.g. `root/container`). The mapped
 * `cq:policy` is relative to the site's `.../settings/wcm/policies` folder.
 * @param {string} envName
 * @param {string} pagePath
 * @param {string} resourceType     component sling:resourceType
 * @param {string} [componentPath]  absolute path of the component under the page
 * @returns {Promise<{ok:boolean, template?:string, policyPath?:string, policyTitle?:string, allowedComponents?:string[], error?:string}>}
 */
export async function getComponentPolicy(envName, pagePath, resourceType, componentPath = '') {
  const { cfg } = await getEnvConfig(envName);
  if (!pagePath) return { ok: false, error: 'Page path is required.' };

  const pageRes = await aemRequest(cfg, `${encPath(pagePath)}/jcr:content.json`);
  if (!pageRes.ok) return { ok: false, error: 'Could not read page content.' };
  const template = pageRes.data?.['cq:template'] || '';
  const none = { ok: true, template, policyPath: '', policyTitle: '', allowedComponents: [] };
  const m = /^(.*)\/templates\/[^/]+$/.exec(template);
  if (!template || !m) return none;

  const mapRes = await aemRequest(cfg, `${encPath(template)}/policies/jcr:content.infinity.json`);
  if (!mapRes.ok || !mapRes.data) return none;

  const walk = (segments) => segments.reduce((n, seg) => (n && typeof n === 'object' ? n[seg] : undefined), mapRes.data);
  const candidates = [];
  const rt = String(resourceType || '').replace(/^\/(apps|libs)\//, '').split('/').filter(Boolean);
  if (rt.length) candidates.push(rt);
  const rel = componentPath.includes('/jcr:content/') ? componentPath.split('/jcr:content/')[1] : '';
  const structure = rel.split('/').filter(Boolean);
  for (let i = structure.length; i > 0; i--) candidates.push(structure.slice(0, i));

  let mapped = '';
  for (const segs of candidates) {
    const node = walk(segs);
    if (node && typeof node['cq:policy'] === 'string') { mapped = node['cq:policy']; break; }
  }
  if (!mapped || mapped.includes('..')) return none;

  const policyPath = `${m[1]}/policies/${mapped}`;
  const polRes = await aemRequest(cfg, `${encPath(policyPath)}.json`);
  if (!polRes.ok || !polRes.data) return { ...none, policyPath };
  const comps = polRes.data.components;
  return {
    ok: true,
    template,
    policyPath,
    policyTitle: polRes.data['jcr:title'] || polRes.data.policyTitle || '',
    allowedComponents: Array.isArray(comps) ? comps : comps ? [comps] : [],
  };
}

/**
 * Flush the Dispatcher cache for a path by triggering the author's "flush" replication agent
 * (the classic Dispatcher Flush agent, AEM 6.x / AMS / on-premise).
 *
 * The agent is addressed through the replication servlet, never by writing to its
 * configuration node. AEM as a Cloud Service has no such agent (its CDN cache is purged
 * differently), and a disabled or missing agent is reported as such rather than as success.
 * @param {string} envName
 * @param {string} path  /content path whose cached copy is flushed
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function flushDispatcher(envName, path) {
  if (typeof path !== 'string' || !/^\/content\/\S+$/.test(path)) return { ok: false, error: 'Only /content paths can be flushed.' };
  const { cfg } = await getEnvConfig(envName);
  const res = await replicate(cfg, 'Activate', [path], 'flush');
  if (res.ok) return { ok: true };
  if (res.status === 400) return { ok: false, error: 'No enabled Dispatcher flush agent was found on this environment (AEM as a Cloud Service has none).' };
  return res;
}

/**
 * Inspect whether a path is a Content Fragment and extract its model and variations.
 * @param {string} envName
 * @param {string} jcrPath
 * @returns {Promise<{ok:boolean, isContentFragment:boolean, model?:string, title?:string, variations?:string[], error?:string}>}
 */
export async function getContentFragmentInfo(envName, jcrPath) {
  if (typeof jcrPath !== 'string' || !/^\/content\/dam\/\S+$/.test(jcrPath) || jcrPath.includes('..')) {
    return { ok: false, error: 'A /content/dam path is required.' };
  }
  const { cfg } = await getEnvConfig(envName);
  const res = await aemRequest(cfg, `${encPath(jcrPath)}/jcr:content.json`);
  if (!res.ok || !res.data) return { ok: false, error: res.error || 'Failed to read node' };
  const d = res.data;
  const isCF = d['contentFragment'] === true || !!d['cq:model'] || !!d.data?.['cq:model'];
  if (!isCF) return { ok: true, isContentFragment: false };

  // On a real instance jcr:content.json only carries a stub for "data"; the model and the
  // variation nodes live one level below jcr:content/data.
  const dataRes = await aemRequest(cfg, `${encPath(jcrPath)}/jcr:content/data.1.json`);
  const data = dataRes.ok && dataRes.data && typeof dataRes.data === 'object' ? dataRes.data : d.data;

  const model = d['cq:model'] || data?.['cq:model'] || '';
  const title = d['jcr:title'] || '';
  const variations = [];
  if (data && typeof data === 'object') {
    Object.keys(data).forEach((k) => {
      if (k !== 'master' && !k.startsWith('jcr:') && data[k] && typeof data[k] === 'object') variations.push(k);
    });
  }
  return {
    ok: true,
    isContentFragment: true,
    model,
    modelName: model.split('/').filter(Boolean).pop() || '',
    title,
    variations,
  };
}

/**
 * Run a multi-tier health diagnostic for an environment (Author, CSRF, Publish, Preview, Dispatcher).
 * @param {string} envName
 * @param {object} [cfgOverride]  Unsaved options-form values (Options page only); defaults to the saved config.
 * @returns {Promise<{ok:boolean, env:string, author:object, csrf:object, publish:object, preview:object, dispatcher:object}>}
 */
export async function runDiagnostics(envName, cfgOverride) {
  const cfg = cfgOverride ? { ...ENV_DEFAULTS, ...cfgOverride } : (await getEnvConfig(envName)).cfg;
  const out = {
    ok: true,
    env: envName,
    author: { checked: false },
    csrf: { checked: false },
    publish: { checked: false },
    preview: { checked: false },
    dispatcher: { checked: false },
  };

  const tasks = [];

  // 1. Author & CSRF
  if (cfg.authorHost) {
    tasks.push(
      (async () => {
        out.author.checked = true;
        const t0 = Date.now();
        const ping = await aemRequest(cfg, '/libs/granite/core/content/login.html', { method: 'GET', json: false, csrf: false });
        out.author.latencyMs = Math.max(1, Date.now() - t0);
        out.author.ok = ping.ok || ping.status === 200 || ping.status === 302;
        out.author.status = ping.status || (ping.ok ? 200 : 0);
        out.author.error = ping.error;
      })(),
      (async () => {
        out.csrf.checked = true;
        const tok = await getCsrfToken(cfg);
        out.csrf.ok = !!tok;
      })()
    );
  }

  // 2. Publish
  if (cfg.publishHost) {
    tasks.push((async () => {
      out.publish.checked = true;
      const t0 = Date.now();
      try {
        const r = await fetch(`${cfg.publishHost}/`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        out.publish.latencyMs = Math.max(1, Date.now() - t0);
        out.publish.ok = r.ok || (r.status >= 200 && r.status < 400);
        out.publish.status = r.status;
      } catch (e) {
        out.publish.ok = false;
        out.publish.error = e?.message;
      }
    })());
  }

  // 3. Preview
  if (cfg.previewHost) {
    tasks.push((async () => {
      out.preview.checked = true;
      const t0 = Date.now();
      try {
        const r = await fetch(`${cfg.previewHost}/`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        out.preview.latencyMs = Math.max(1, Date.now() - t0);
        out.preview.ok = r.ok || (r.status >= 200 && r.status < 400);
        out.preview.status = r.status;
      } catch (e) {
        out.preview.ok = false;
        out.preview.error = e?.message;
      }
    })());
  }

  // 4. Dispatcher
  if (cfg.dispatcherHost) {
    tasks.push((async () => {
      out.dispatcher.checked = true;
      const t0 = Date.now();
      try {
        const r = await fetch(`${cfg.dispatcherHost}/`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        out.dispatcher.latencyMs = Math.max(1, Date.now() - t0);
        out.dispatcher.ok = r.ok || (r.status >= 200 && r.status < 400);
        out.dispatcher.status = r.status;
      } catch (e) {
        out.dispatcher.ok = false;
        out.dispatcher.error = e?.message;
      }
    })());
  }

  await Promise.allSettled(tasks);
  return out;
}
