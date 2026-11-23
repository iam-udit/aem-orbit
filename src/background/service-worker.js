/**
 * @file Background Service Worker for AEM Orbit.
 * @module background/service-worker
 *
 * Responsibilities:
 * - Central message broker between content scripts, popup, and options pages.
 * - Handles all AEM REST API calls in a privileged background context to prevent CORS restrictions.
 * - Manages dynamic content script injection on user-authorized host domains.
 * - Enforces dynamic Declarative Net Request (DNR) session rules for same-origin Referer headers.
 * - Implements security verification for destructive operations on protected environments.
 * - Maintains local audit logging and system notifications for replication actions.
 */

import {
  getConfig,
  getPublicConfig,
  migrateSecretsToLocal,
  testConnection,
  parsePageUrl,
  fetchJcrNode,
  getPageStatus,
  publishPage,
  publishToPreview,
  getComponentUrls,
  unpublishPage,
  deletePage,
  getPageVersions,
  createVersion,
  restoreVersion,
  diffVersions,
  treeActivate,
  previewTreeActivate,
  treeDeactivate,
  previewTreeDeactivate,
  previewBulkReplicate,
  getReplicationQueueStatus,
  findAcrossPages,
  replaceAcrossPages,
  getComponentPolicy,
  flushDispatcher,
  searchPages,
  getUrlVariants,
  getMsmTargets,
  resolveLocaleUrls,
  setPageLock,
  checkReferences,
  compareEnvironments,
  diffEnvironments,
  undoSync,
  bulkReplicate,
  getPageLists,
  recordRecent,
  toggleFavourite,
  logAction,
  getActionLog,
  clearActionLog,
  getDamAssetMetadata,
  getDamEditorUrl,
  getContentFragmentInfo,
  runDiagnostics,
  syncContentPage,
  getSyncPlan,
  controlPolicyError,
} from '../shared/aem-api.js';
import { controlForAction } from '../shared/control-policy.js';
import { configuredOriginPatterns, quickLinks, parsePathList, firstConfiguredEnv } from '../shared/url-utils.js';
import { evaluateAudit } from '../shared/page-audit.js';
import { loginTarget } from '../shared/auth-error.js';

const CONTENT_SCRIPT_ID = 'asp-toolbar';

const ACTIVE_ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

const DISABLED_ICONS = {
  16: 'icons/icon-disabled16.png',
  32: 'icons/icon-disabled32.png',
  48: 'icons/icon-disabled48.png',
  128: 'icons/icon-disabled128.png',
};

// ─── Tab Action State Management (Enabled on AEM, Disabled on other pages) ────

/**
 * Updates the extension action icon, badge, popup, and enabled/disabled state for a tab
 * based on whether the tab URL matches a configured AEM environment and page.
 *
 * @async
 * @param {number} tabId - Target tab ID.
 * @param {string} [url] - Tab URL.
 * @returns {Promise<void>}
 */
async function updateTabAction(tabId, url) {
  if (!tabId || tabId === chrome.tabs.TAB_ID_NONE) return;

  try {
    if (!url) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      url = tab?.url || '';
    }

    const config = await getConfig();
    const { matchedEnv, tier } = parsePageUrl(url, config);

    if (matchedEnv) {
      // Allowed AEM Environment (Active state)
      await chrome.action.enable(tabId);
      await chrome.action.setIcon({ tabId, path: ACTIVE_ICONS });
      await chrome.action.setPopup({ tabId, popup: 'src/popup/popup.html' });
      await chrome.action.setTitle({
        tabId,
        title: `AEM Orbit (${matchedEnv.toUpperCase()} • ${tier || 'AEM'})`,
      });
    } else {
      // Disallowed / Non-AEM Page (Disabled state: greyscale icon & no popup on click)
      await chrome.action.disable(tabId);
      await chrome.action.setIcon({ tabId, path: DISABLED_ICONS });
      await chrome.action.setPopup({ tabId, popup: '' });
      await chrome.action.setTitle({
        tabId,
        title: 'AEM Orbit (Disabled - Navigate to an AEM page)',
      });
    }
  } catch {
    /* tab closed or action update failed */
  }
}

/**
 * Updates the action state across all open browser tabs.
 *
 * @async
 * @returns {Promise<void>}
 */
async function updateAllTabsAction() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => updateTabAction(tab.id, tab.url)));
  } catch {
    /* ignore */
  }
}

// ─── Content-script registration (only on configured + granted hosts) ────────

/**
 * Dynamically registers or updates the toolbar content script for exactly the configured
 * AEM hosts that the user has granted host permissions for (least-privilege model).
 *
 * @async
 * @returns {Promise<void>}
 */
async function syncContentScripts() {
  const config   = await getConfig();
  const wanted   = configuredOriginPatterns(config.environments);
  const granted  = [];
  for (const origin of wanted) {
    if (await chrome.permissions.contains({ origins: [origin] })) granted.push(origin);
  }

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (!granted.length) return;

  await chrome.scripting.registerContentScripts([{
    id: CONTENT_SCRIPT_ID,
    matches: granted,
    js: ['src/content/content-script.js'],
    css: ['src/content/toolbar.css', 'src/ui/dialog.css'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
}

/**
 * Configures Declarative Net Request (DNR) session rules for configured Author hosts.
 *
 * Rationale:
 * AEM rejects or silently ignores state-changing requests that look cross-origin:
 * the Sling Referrer Filter responds 403 when there is no Referer header, and a foreign
 * `Origin: chrome-extension://…` makes the call a no-op (204). Since fetch() in extension
 * pages cannot set protected headers directly, dynamic DNR session rules rewrite Referer
 * and Origin headers to match the target author host for extension-initiated requests.
 *
 * @async
 * @returns {Promise<void>}
 */
async function syncRefererRules() {
  const { environments } = await getConfig();
  const origins = new Set();
  for (const env of Object.values(environments)) {
    try {
      const u = new URL(env?.authorHost || '');
      if (u.protocol === 'http:' || u.protocol === 'https:') origins.add(u.origin);
    } catch { /* host not configured */ }
  }
  const addRules = [...origins].map((origin, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'referer', operation: 'set', value: `${origin}/` },
        { header: 'origin',  operation: 'set', value: origin },
      ],
    },
    condition: {
      urlFilter: `|${origin}/`,
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: ['xmlhttprequest'],
      requestMethods: ['post', 'put', 'delete'],
    },
  }));
  const old = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: old.map((r) => r.id), addRules });
}

/**
 * Safely triggers content-script, referer rule, and tab action synchronization with error logging.
 *
 * @returns {void}
 */
function safeSync() {
  syncContentScripts().catch((e) => console.error('[ASP] content-script sync failed', { error: e?.message }));
  syncRefererRules().catch((e) => console.error('[ASP] referer rule sync failed', { error: e?.message }));
  updateAllTabsAction().catch((e) => console.error('[ASP] tab action sync failed', { error: e?.message }));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.environments || changes.urlMappings)) safeSync();
});
chrome.permissions.onAdded.addListener(safeSync);
chrome.permissions.onRemoved.addListener(safeSync);

// Tab event listeners for active/disabled state management
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateTabAction(tabId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    updateTabAction(tabId, changeInfo.url || tab?.url).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  safeSync();
});

// ─── Protected-environment guard ─────────────────────────────────────────────

/**
 * Extracts the last path segment (page name) used for typed confirmations on protected environments.
 *
 * @param {string} jcrPath - Repository path (e.g., "/content/mysite/en/home").
 * @returns {string} The last path segment (e.g., "home").
 */
function pageName(jcrPath) {
  return String(jcrPath || '').split('/').filter(Boolean).pop() || '';
}

/**
 * Validates whether a destructive action on a protected environment carries the required confirmation token.
 *
 * @async
 * @param {string} env - Target environment key.
 * @param {object} payload - Action payload containing confirmText and jcrPath.
 * @returns {Promise<{ok:false, error:string}|null>} Error object if blocked, null if permitted.
 */
async function requireConfirmation(env, payload) {
  const { environments } = await getConfig();
  if (!environments[env]?.protected) return null;
  if (payload.confirmText !== pageName(payload.jcrPath)) {
    return { ok: false, error: `Confirmation required on protected environment "${env}".` };
  }
  return null;
}

// ─── Message Router ───────────────────────────────────────────────────────────

/**
 * Determines whether a message originates from the extension's internal pages (popup, options)
 * rather than an untrusted web page content script.
 *
 * @param {chrome.runtime.MessageSender} sender - Message sender details.
 * @returns {boolean} True if sender URL starts with the extension base URL.
 */
function isExtensionPage(sender) {
  return typeof sender?.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}

/**
 * A failed response that says "session expired" gets a `login` target ({env, label, url}) so the
 * UI can offer a "Log in to Dev" button. Only environments set to Browser Session qualify.
 *
 * @async
 * @param {object} result - Handler result.
 * @returns {Promise<object>} The same result, plus `login` when it applies.
 */
async function withLoginHint(result) {
  if (!result || result.ok !== false || typeof result.error !== 'string') return result;
  const { environments } = await getConfig();
  const login = loginTarget(result.error, environments);
  return login ? { ...result, login } : result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from this extension's own pages / content scripts.
  if (sender.id !== chrome.runtime.id) return false;
  handleMessage(message, sender)
    .then(withLoginHint)
    .then(sendResponse)
    .catch((err) => {
      // Details stay in the service-worker console; the UI only gets a generic message.
      console.error('[ASP] action failed', { action: message?.action, error: err?.message });
      sendResponse({ ok: false, error: 'Something went wrong. Check the extension console for details.' });
    });
  return true; // keep channel open for async response
});

/**
 * Resolve which environment a request targets, in priority order:
 *   1. explicit payload.env (toolbar env-picker / popup)
 *   2. the env matching the sending tab's URL (content scripts)
 *   3. the stored default env
 * This guarantees actions never hit an environment belonging to another tab.
 */
/**
 * Resolves which environment an action should target based on context priority:
 * 1. Explicit `payload.env` (user-selected in toolbar picker or popup).
 * 2. Environment corresponding to the active tab's URL.
 * 3. Configured default active environment.
 *
 * @async
 * @param {object} payload - Message payload.
 * @param {chrome.runtime.MessageSender} sender - Message sender.
 * @returns {Promise<string>} Environment identifier (e.g., 'local', 'dev', 'stage', 'prod').
 */
async function resolveEnv(payload, sender) {
  const config = await getConfig();
  if (payload?.env && config.environments[payload.env]) return payload.env;
  if (sender?.tab?.url) {
    const { matchedEnv } = parsePageUrl(sender.tab.url, config);
    if (matchedEnv) return matchedEnv;
  }
  return firstConfiguredEnv(config.environments, config.envOrder);
}

/**
 * Triggers a desktop notification for action completion (unless turned off in Settings).
 *
 * @async
 * @param {string} message - Notification text to display.
 * @returns {Promise<void>}
 */
async function notify(message) {
  const { notifyOnActions } = await getConfig();
  if (notifyOnActions === false) return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: 'AEM Orbit',
    message,
  });
}

/**
 * Records an executed operation to the local action log and triggers a desktop notification on success.
 *
 * @async
 * @param {string} env - Environment identifier.
 * @param {string} action - Action verb (e.g., 'Publish', 'Delete', 'Sync').
 * @param {string} path - Target JCR path.
 * @param {object} result - Execution result object.
 * @param {string} [notifyMsg] - Notification text to display if successful.
 * @returns {Promise<object>} The original result object.
 */
async function record(env, action, path, result, notifyMsg) {
  try {
    await logAction({ env, action, path, count: result.count, ok: result.ok, error: result.error });
  } catch (e) {
    console.error('[ASP] action log write failed', { error: e?.message });
  }
  if (result.ok && notifyMsg) await notify(notifyMsg).catch(() => {});
  return result;
}

/**
 * The shared shape of every confirmed, logged action: resolve the environment, check the
 * protected-environment confirmation, run it, write the action log, notify.
 *
 * @async
 * @param {{action:string, payload:object, sender:chrome.runtime.MessageSender}} ctx
 * @param {string} label - Action log label.
 * @param {(env:string) => Promise<object>} run - Performs the action.
 * @param {(env:string, result:object) => string} done - Notification text on success.
 * @returns {Promise<object>}
 */
async function confirmedAction({ payload, sender }, label, run, done) {
  const env = await resolveEnv(payload, sender);
  const blocked = await requireConfirmation(env, payload);
  if (blocked) return blocked;
  const result = await run(env);
  return record(env, label, payload.jcrPath, result, done(env, result));
}

/**
 * Main message dispatch router for all background extension actions.
 *
 * @async
 * @param {{action:string, payload?:object}} message - Action message from UI or content scripts.
 * @param {chrome.runtime.MessageSender} sender - Sender tab or page context.
 * @returns {Promise<object>} Action response payload.
 */
async function handleMessage(message, sender) {
  const { action, payload = {} } = message;

  // Administrator policy: the one enforcement point, so no UI can reach a switched-off control.
  const control = controlForAction(action);
  if (control) {
    const blocked = await controlPolicyError(control, await resolveEnv(payload, sender));
    if (blocked) return { ok: false, error: blocked };
  }

  switch (action) {

    // Never expose credentials to UI contexts.
    case 'GET_CONFIG':
      return getPublicConfig();

    case 'GET_PAGE_INFO': {
      const { url } = payload;
      const config = await getConfig();
      const parsed = parsePageUrl(url, config);
      // Always return ok:true — matchedEnv will be null if no env host matches the URL
      return { ok: true, ...parsed };
    }

    case 'GET_PAGE_STATUS': {
      const env = await resolveEnv(payload, sender);
      return getPageStatus(env, payload.jcrPath);
    }

    case 'FETCH_JCR_NODE': {
      const env = await resolveEnv(payload, sender);
      return fetchJcrNode(env, payload.jcrPath);
    }

    case 'PUBLISH_PAGE':
      return confirmedAction({ payload, sender }, 'Publish',
        (env) => publishPage(env, payload.jcrPath),
        (env) => `[${env}] Page published: ${payload.jcrPath}`);

    case 'PUBLISH_PREVIEW':
      return confirmedAction({ payload, sender }, 'Publish to Preview',
        (env) => publishToPreview(env, payload.jcrPath),
        (env) => `[${env}] Published to Preview: ${payload.jcrPath}`);

    case 'GET_COMPONENT_URLS': {
      const env = await resolveEnv(payload, sender);
      return getComponentUrls(env, payload.resourcePath, payload.resourceType);
    }

    case 'UNPUBLISH_PAGE':
      return confirmedAction({ payload, sender }, 'Unpublish',
        (env) => unpublishPage(env, payload.jcrPath),
        (env) => `[${env}] Page unpublished: ${payload.jcrPath}`);

    case 'DELETE_PAGE':
      return confirmedAction({ payload, sender }, 'Delete',
        (env) => deletePage(env, payload.jcrPath),
        (env) => `[${env}] Page deleted: ${payload.jcrPath}`);

    case 'GET_PAGE_VERSIONS': {
      const env = await resolveEnv(payload, sender);
      return getPageVersions(env, payload.jcrPath);
    }

    case 'CREATE_VERSION': {
      const env = await resolveEnv(payload, sender);
      return createVersion(env, payload.jcrPath, payload.label || '');
    }

    case 'RESTORE_VERSION':
      return confirmedAction({ payload, sender }, 'Restore version',
        (e) => restoreVersion(e, payload.jcrPath, payload.versionName),
        (e) => `[${e}] Version restored: ${payload.jcrPath} (${payload.versionName})`);

    case 'DIFF_VERSIONS': {
      const env = await resolveEnv(payload, sender);
      return diffVersions(env, payload.jcrPath, payload.versionA, payload.versionB);
    }

    case 'TREE_ACTIVATE':
      return confirmedAction({ payload, sender }, 'Tree publish',
        (env) => treeActivate(env, payload.jcrPath),
        (env, result) => `[${env}] Tree published (${result.count} pages): ${payload.jcrPath}`);

    case 'PREVIEW_TREE_ACTIVATE': {
      // Read-only: which pages a tree publish would touch.
      const env = await resolveEnv(payload, sender);
      return previewTreeActivate(env, payload.jcrPath);
    }

    case 'TREE_DEACTIVATE':
      return confirmedAction({ payload, sender }, 'Tree unpublish',
        (env) => treeDeactivate(env, payload.jcrPath),
        (env, result) => `[${env}] Tree unpublished (${result.count} pages): ${payload.jcrPath}`);

    case 'PREVIEW_TREE_DEACTIVATE': {
      const env = await resolveEnv(payload, sender);
      return previewTreeDeactivate(env, payload.jcrPath);
    }

    case 'PREVIEW_BULK_REPLICATE': {
      const env = await resolveEnv(payload, sender);
      const paths = parsePathList(payload.text);
      return previewBulkReplicate(env, paths, payload.cmd);
    }

    case 'GET_REPLICATION_QUEUE': {
      const env = await resolveEnv(payload, sender);
      return getReplicationQueueStatus(env);
    }

    case 'FIND_ACROSS_PAGES': {
      const env = await resolveEnv(payload, sender);
      return findAcrossPages(env, payload.rootPath, payload.searchTerm, payload.options);
    }

    case 'REPLACE_ACROSS_PAGES':
      return confirmedAction({ payload, sender }, 'Find and replace',
        (e) => replaceAcrossPages(e, payload.replacements),
        (e, result) => `[${e}] Replaced ${result.updatedCount || 0} value(s)`);

    case 'GET_COMPONENT_POLICY': {
      const env = await resolveEnv(payload, sender);
      return getComponentPolicy(env, payload.pagePath, payload.resourceType, payload.componentPath);
    }

    case 'FLUSH_DISPATCHER': {
      return confirmedAction({ payload, sender }, 'Dispatcher flush',
        (env) => flushDispatcher(env, payload.path || payload.jcrPath),
        (env) => `[${env}] Dispatcher flushed: ${payload.path || payload.jcrPath}`);
    }

    case 'TEST_CONNECTION': {
      // Options page only (never a content script) — uses unsaved form values.
      if (!isExtensionPage(sender)) return { ok: false, error: 'Not allowed' };
      return testConnection(payload.cfg || {});
    }

    case 'SYNC_CONTENT_SCRIPTS':
      await syncContentScripts();
      return { ok: true };

    case 'RELOAD_TAB': {
      // Real cache-bypassing reload (window.location.reload(true) is ignored by Chrome).
      if (!sender.tab?.id) return { ok: false, error: 'No tab' };
      await chrome.tabs.reload(sender.tab.id, { bypassCache: true });
      return { ok: true };
    }

    case 'LOCK_PAGE':
    case 'UNLOCK_PAGE': {
      const env = await resolveEnv(payload, sender);
      return setPageLock(env, payload.jcrPath, action === 'LOCK_PAGE');
    }

    case 'CHECK_REFERENCES': {
      const env = await resolveEnv(payload, sender);
      return checkReferences(env, payload.jcrPath);
    }

    case 'COMPARE_ENVS':
      return compareEnvironments(payload.jcrPath);

    case 'DIFF_ENVS': {
      // Read-only: property-level difference between this environment and another.
      const env = await resolveEnv(payload, sender);
      const { environments } = await getConfig();
      if (!environments[payload.otherEnv]) return { ok: false, error: 'Unknown environment.' };
      return diffEnvironments(env, payload.otherEnv, payload.jcrPath);
    }

    case 'BULK_REPLICATE': {
      const env   = await resolveEnv(payload, sender);
      const paths = parsePathList(payload.text);
      // Protected envs: the user must type the number of pages.
      const { environments } = await getConfig();
      if (environments[env]?.protected && payload.confirmText !== String(paths.length)) {
        return { ok: false, error: `Confirmation required on protected environment "${env}".` };
      }
      const cmd    = payload.cmd === 'Deactivate' ? 'Deactivate' : 'Activate';
      const verb   = cmd === 'Activate' ? 'publish' : 'unpublish';
      const result = await bulkReplicate(env, paths, cmd);
      return record(env, `Bulk ${verb}`, paths.slice(0, 5).join(', ') + (paths.length > 5 ? ', …' : ''),
        result, `[${env}] Bulk ${verb}: ${result.count} page(s)`);
    }

    case 'GET_ACTION_LOG':
      return getActionLog();

    case 'CLEAR_ACTION_LOG':
      return clearActionLog();

    case 'EVALUATE_AUDIT':
      return { ok: true, ...evaluateAudit(payload.facts || {}) };

    case 'PARSE_PATH_LIST':
      return { ok: true, paths: parsePathList(payload.text) };

    case 'GET_QUICK_LINKS': {
      const env = await resolveEnv(payload, sender);
      const { environments, appName } = await getConfig();
      return { ok: true, links: quickLinks(environments[env], appName) };
    }

    case 'GET_PAGE_LISTS':
      return getPageLists();

    case 'RECORD_RECENT':
      return recordRecent(await resolveEnv(payload, sender), payload.jcrPath, payload.title);

    case 'TOGGLE_FAVOURITE':
      return toggleFavourite(await resolveEnv(payload, sender), payload.jcrPath, payload.title);

    case 'SEARCH_PAGES': {
      const env = await resolveEnv(payload, sender);
      const { rootPath, query, limit } = payload;
      return searchPages(env, rootPath, query, limit);
    }

    case 'GET_URL_VARIANTS': {
      const env = await resolveEnv(payload, sender);
      return getUrlVariants(env, payload.jcrPath);
    }

    case 'RESOLVE_LOCALE_URLS': {
      const env = await resolveEnv(payload, sender);
      const { tier, inEditor, wcmDisabled } = payload;
      return { ok: true, urls: await resolveLocaleUrls(env, payload.urls, { tier, inEditor, wcmDisabled }) };
    }

    case 'GET_MSM_TARGETS': {
      const env = await resolveEnv(payload, sender);
      return getMsmTargets(env, payload.jcrPath);
    }

    case 'GET_DAM_ASSET_METADATA': {
      const env = await resolveEnv(payload, sender);
      return getDamAssetMetadata(env, payload.assetPath);
    }

    case 'GET_SYNC_PLAN': {
      // Read-only: does the page exist on the target, and which parents are missing?
      const targetEnv = await resolveEnv(payload, sender);
      if (!payload.sourceEnv) return { ok: false, error: 'sourceEnv required.' };
      return getSyncPlan(payload.sourceEnv, targetEnv, payload.jcrPath);
    }

    case 'SYNC_CONTENT_PAGE': {
      const targetEnv = await resolveEnv(payload, sender);
      const { sourceEnv, jcrPath } = payload;
      if (!sourceEnv) return { ok: false, error: 'sourceEnv required.' };
      // Protect target: require confirmation on protected environments
      const blocked = await requireConfirmation(targetEnv, payload);
      if (blocked) return blocked;
      const result = await syncContentPage(sourceEnv, targetEnv, jcrPath, { createMissing: payload.createMissing === true });
      return record(targetEnv, 'Sync from ' + sourceEnv, jcrPath, result,
        `[${targetEnv}] Synced from ${sourceEnv}: ${jcrPath}`);
    }

    case 'UNDO_SYNC': {
      const targetEnv = await resolveEnv(payload, sender);
      const blocked = await requireConfirmation(targetEnv, payload);
      if (blocked) return blocked;
      return record(targetEnv, 'Undo sync', payload.jcrPath, await undoSync(targetEnv, payload.jcrPath),
        `[${targetEnv}] Sync undone: ${payload.jcrPath}`);
    }

    case 'GET_DAM_EDITOR_URL': {
      const env = await resolveEnv(payload, sender);
      const config = await getConfig();
      const authorHost = config.environments[env]?.authorHost || '';
      return { ok: true, url: getDamEditorUrl(authorHost, payload.assetPath || '') };
    }

    case 'GET_CONTENT_FRAGMENT_INFO': {
      const env = await resolveEnv(payload, sender);
      return getContentFragmentInfo(env, payload.jcrPath);
    }

    case 'RUN_DIAGNOSTICS': {
      // Options page only: uses the unsaved form values (credentials never reach a content script).
      if (!isExtensionPage(sender)) return { ok: false, error: 'Not allowed' };
      const env = typeof payload.env === 'string' ? payload.env : '';
      return runDiagnostics(env, payload.cfg && typeof payload.cfg === 'object' ? payload.cfg : undefined);
    }

    case 'OPEN_TAB': {
      const { url } = payload;
      if (!/^https?:\/\//i.test(url || '')) return { ok: false, error: 'Invalid URL' };
      chrome.tabs.create({ url });
      return { ok: true };
    }

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      return { ok: true };

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

// ─── Install / Update handler ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await migrateSecretsToLocal();
  safeSync();
  if (reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(safeSync);
