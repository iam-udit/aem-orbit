// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file Cross-Browser WebExtension & Web API Compatibility Layer.
 * @module shared/browser-compat
 *
 * Normalizes differences across Chromium browsers (Chrome, Edge, Brave, Arc, Opera, Vivaldi),
 * Mozilla Firefox (MV3), and Apple Safari Web Extensions so extension code works uniformly
 * without uncaught TypeErrors when optional browser APIs are absent.
 */

/**
 * Returns the active WebExtension runtime namespace (`chrome` or `browser`).
 *
 * @returns {typeof chrome|null} The extension API root object, or null in non-extension contexts.
 */
export function getExtApi() {
  if (typeof globalThis.chrome === 'object' && globalThis.chrome) return globalThis.chrome;
  if (typeof globalThis.browser === 'object' && globalThis.browser) return globalThis.browser;
  return null;
}

/**
 * Safely returns a `storage` area object (`sync`, `local`, `session`, `managed`), or null if unsupported.
 *
 * @param {'sync'|'local'|'session'|'managed'} area - Storage area name.
 * @returns {chrome.storage.StorageArea|null}
 */
export function getStorageArea(area) {
  const api = getExtApi();
  return api?.storage?.[area] || null;
}

/**
 * Promisified storage.get supporting both callback-based (`chrome.*`) and Promise-based (`browser.*`)
 * implementations while gracefully handling missing areas (e.g., `session` or `managed`).
 *
 * @param {'sync'|'local'|'session'|'managed'} area - Storage area name.
 * @param {object|string|string[]|null} keys - Storage keys/defaults to read.
 * @returns {Promise<object>}
 */
export function compatStorageGet(area, keys) {
  const store = getStorageArea(area);
  const fallback = () => (keys && typeof keys === 'object' && !Array.isArray(keys) ? { ...keys } : {});
  if (!store || typeof store.get !== 'function') return Promise.resolve(fallback());

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      try { void getExtApi()?.runtime?.lastError; } catch { /* ignore */ }
      resolve(res && typeof res === 'object' ? res : fallback());
    };
    const fail = (err) => {
      if (area === 'managed' || area === 'session') return finish(fallback());
      if (settled) return;
      settled = true;
      reject(err);
    };
    try {
      const maybePromise = store.get(keys, finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish, fail);
      }
    } catch (err) {
      fail(err);
    }
  });
}

/**
 * Promisified storage.set supporting both callback and Promise storage implementations.
 *
 * @param {'sync'|'local'|'session'} area - Storage area name.
 * @param {object} data - Key-value pairs to store.
 * @returns {Promise<void>}
 */
export function compatStorageSet(area, data) {
  const store = getStorageArea(area);
  if (!store || typeof store.set !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { void getExtApi()?.runtime?.lastError; } catch { /* ignore */ }
      resolve();
    };
    try {
      const maybePromise = store.set(data, finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish, finish);
      }
    } catch {
      finish();
    }
  });
}

/**
 * Promisified storage.remove supporting both callback and Promise storage implementations.
 *
 * @param {'sync'|'local'|'session'} area - Storage area name.
 * @param {string|string[]} keys - Key or keys to remove.
 * @returns {Promise<void>}
 */
export function compatStorageRemove(area, keys) {
  const store = getStorageArea(area);
  if (!store || typeof store.remove !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { void getExtApi()?.runtime?.lastError; } catch { /* ignore */ }
      resolve();
    };
    try {
      const maybePromise = store.remove(keys, finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish, finish);
      }
    } catch {
      finish();
    }
  });
}

/**
 * Promisified storage.clear supporting both callback and Promise storage implementations.
 *
 * @param {'sync'|'local'|'session'} area - Storage area name.
 * @returns {Promise<void>}
 */
export function compatStorageClear(area) {
  const store = getStorageArea(area);
  if (!store || typeof store.clear !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { void getExtApi()?.runtime?.lastError; } catch { /* ignore */ }
      resolve();
    };
    try {
      const maybePromise = store.clear(finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish, finish);
      }
    } catch {
      finish();
    }
  });
}

/**
 * Returns the hostname used as the extension's initiator domain in DNR rules.
 * Chrome uses the extension ID, whereas Firefox/Safari assign a dynamic UUID host
 * inside `getURL('')` (`moz-extension://<uuid>/` / `safari-web-extension://<uuid>/`).
 *
 * @returns {string}
 */
export function getExtensionInitiatorDomain() {
  const api = getExtApi();
  try {
    const base = api?.runtime?.getURL?.('');
    if (base) return new URL(base).hostname;
  } catch { /* fallback to runtime.id */ }
  return api?.runtime?.id || '';
}

/**
 * Creates an `AbortSignal` that times out after `ms` milliseconds, with a manual
 * `AbortController` fallback for environments lacking `AbortSignal.timeout`.
 *
 * @param {number} ms - Timeout duration in milliseconds.
 * @returns {{signal: AbortSignal, cancel: () => void}}
 */
export function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), cancel: () => {} };
  }
  const ctrl = new AbortController();
  const id = setTimeout(() => {
    const err = new Error('TimeoutError');
    err.name = 'TimeoutError';
    ctrl.abort(err);
  }, ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

/**
 * Copies text to the clipboard using `navigator.clipboard.writeText`, falling back to
 * a hidden `<textarea>` + `document.execCommand('copy')` for HTTP / Safari contexts
 * where the async Clipboard API is unavailable or denied.
 *
 * @param {string} text - Text to copy.
 * @returns {Promise<boolean>} True if copy succeeded.
 */
export async function copyToClipboard(text) {
  const str = String(text ?? '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str);
      return true;
    } catch { /* fallback below */ }
  }
  if (typeof document === 'undefined' || !document.body) return false;
  const ta = document.createElement('textarea');
  ta.value = str;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try {
    return !!document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

/**
 * Opens the extension options page across Chrome, Edge, Firefox, and Safari, falling back
 * to creating a tab with the options URL if `runtime.openOptionsPage` is unavailable.
 *
 * @returns {Promise<void>}
 */
export async function openOptionsCompat() {
  const api = getExtApi();
  if (!api) return;
  try {
    if (typeof api.runtime?.openOptionsPage === 'function') {
      await api.runtime.openOptionsPage();
      return;
    }
  } catch { /* fallback to tabs.create */ }
  const url = api.runtime?.getURL?.('src/options/options.html');
  if (url && api.tabs?.create) api.tabs.create({ url });
}

/**
 * Displays a browser notification when `notifications.create` is supported (no-op on
 * platforms such as Safari where `chrome.notifications` is unavailable).
 *
 * @param {{title: string, message: string, iconUrl?: string}} opts - Notification payload.
 * @returns {Promise<void>}
 */
export async function notifyCompat({ title, message, iconUrl }) {
  const api = getExtApi();
  if (!api?.notifications?.create) return;
  await api.notifications.create({
    type: 'basic',
    iconUrl: iconUrl || api.runtime?.getURL?.('icons/icon48.png') || '',
    title,
    message,
  });
}

/**
 * Reloads a tab bypassing caches across Chrome/Firefox/Safari.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {Promise<boolean>}
 */
export async function reloadTabCompat(tabId) {
  const api = getExtApi();
  if (!api?.tabs?.reload || !tabId) return false;
  try {
    await api.tabs.reload(tabId, { bypassCache: true });
    return true;
  } catch {
    try {
      await api.tabs.reload(tabId);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Requests optional host permissions safely across Chromium, Firefox, and Safari.
 * Returns `true` immediately when all requested origins are already granted (e.g., via
 * manifest host_permissions, enterprise policy, or a previous prompt), avoiding unnecessary
 * user-gesture errors on `permissions.request`.
 *
 * @param {string[]} origins - Chrome/WebExtension match patterns.
 * @returns {Promise<boolean>}
 */
export async function requestOriginsCompat(origins) {
  if (!origins?.length) return true;
  const api = getExtApi();
  if (!api?.permissions) return true;

  if (typeof api.permissions.contains === 'function') {
    try {
      const alreadyGranted = await new Promise((resolve) => {
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          try { void api.runtime?.lastError; } catch { /* ignore */ }
          resolve(!!ok);
        };
        const maybe = api.permissions.contains({ origins }, done);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(done, () => done(false));
        }
      });
      if (alreadyGranted) return true;
    } catch { /* fall through to permissions.request */ }
  }

  if (typeof api.permissions.request !== 'function') return true;
  try {
    return await new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        try { void api.runtime?.lastError; } catch { /* ignore */ }
        resolve(!!ok);
      };
      const maybe = api.permissions.request({ origins }, done);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(done, () => done(false));
      }
    });
  } catch {
    return false;
  }
}
