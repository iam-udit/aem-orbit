// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file "Please log in" errors and the login shortcut built from them.
 * @module shared/auth-error
 *
 * With Browser Session auth the extension reuses the user's AEM login cookie. When that cookie
 * is missing or expired the request fails. The error text names the host, and the service worker
 * turns that into a `login` target so the UI can offer a "Log in to Dev" button. The host sits in
 * the text on purpose: wrapper errors such as "Read from dev failed: …" keep the text, but would
 * drop any extra field.
 */

const MESSAGE_RE = /Session expired — log in to (https?:\/\/[^\s]+?) and try again\./;

/**
 * @param {string} host  Author host of the environment (any form `new URL()` accepts).
 * @returns {string} The error text for an expired or missing browser session.
 */
export function sessionExpiredMessage(host) {
  let origin = String(host || '');
  try { origin = new URL(origin).origin; } catch { /* keep as is */ }
  return `Session expired — log in to ${origin} and try again.`;
}

/**
 * Finds the environment a "session expired" error is about.
 * Only configured environments that use Browser Session auth qualify, so a crafted error text
 * can never point the UI at an unrelated site.
 *
 * @param {unknown} error  An `error` string from a failed response.
 * @param {Record<string, {authorHost?:string, authType?:string, label?:string}>} environments
 * @returns {{env:string, label:string, url:string}|null}
 */
export function loginTarget(error, environments) {
  const m = typeof error === 'string' ? MESSAGE_RE.exec(error) : null;
  if (!m) return null;
  for (const [env, cfg] of Object.entries(environments || {})) {
    if (cfg?.authType !== 'session' || !cfg.authorHost) continue;
    let origin;
    try { origin = new URL(cfg.authorHost).origin; } catch { continue; }
    if (origin !== m[1]) continue;
    const label = (cfg.label || '').trim() || env.replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());
    return { env, label, url: `${origin}/` };
  }
  return null;
}
