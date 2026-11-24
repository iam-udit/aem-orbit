/**
 * @file Shared UI Action Controllers and Message Orchestrators.
 * @module ui/page-actions
 *
 * UI controllers shared across the in-page toolbar (content script) and the extension popup.
 * Bundled into each context by esbuild. Only uses chrome.runtime messaging and themed modal
 * dialogs in ./dialog.js.
 */

import { confirmDialog, promptDialog } from './dialog.js';

/** Dialog implementations; tests swap these because Node has no DOM. */
export const ui = { confirm: confirmDialog, prompt: promptDialog };

// ─── Escaping ─────────────────────────────────────────────────────────────────

/** Escapes all five HTML-significant characters (safe for text and quoted attributes). */
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Returns msg(action, payload) that sends to the service worker. The env from
 * getEnv() (if any) is added so the worker never has to guess the target.
 */
export function createMessenger(getEnv) {
  return (action, payload = {}) => new Promise((resolve) => {
    const env  = getEnv();
    const full = env ? { env, ...payload } : payload;
    chrome.runtime.sendMessage({ action, payload: full }, (r) => resolve(r || { ok: false, error: 'No response' }));
  });
}

/**
 * Shows a failure toast. When the worker says the cause is an expired Browser Session
 * (`r.login`), the toast stays longer and carries a "Log in to <env>" button that opens the
 * environment's author host in a new tab, so the user can sign in and retry.
 *
 * @param {{msg: Function, toast: Function}} ui  The caller's messenger and toast.
 * @param {string} message  Full text to show.
 * @param {{login?: {label:string, url:string}}} r  The failed response.
 * @param {number} [duration]
 */
export function failToast({ msg, toast }, message, r, duration = 4000) {
  if (!r?.login) return toast(message, 'error', duration);
  toast(message, 'error', Math.max(duration, 10000), [{
    label: `Log in to ${r.login.label}`,
    onClick: () => msg('OPEN_TAB', { url: r.login.url }),
  }]);
}

// ─── Confirmations ────────────────────────────────────────────────────────────

/**
 * Confirm a destructive action in a centred dialog. Protected envs require
 * typing the page name (the worker re-validates it).
 * @returns {Promise<string|null>} confirmText to send to the worker, or null if cancelled
 */
export async function confirmDestructive(actionLabel, path, { env, isProtected, confirmDelete, always = false, tone = 'default' }) {
  const name = path.split('/').filter(Boolean).pop() || '';
  if (isProtected) {
    const typed = await ui.prompt({
      title: 'Confirm on protected environment',
      message: actionLabel,
      detail: path,
      env,
      isProtected: true,
      tone: 'danger',
      confirmLabel: 'Confirm',
      input: { label: `Type the page name "${name}" to confirm`, placeholder: name, expect: name },
    });
    return typed === null ? null : name;
  }
  if (!always && confirmDelete === false) return name;
  const ok = await ui.confirm({ title: 'Please confirm', message: actionLabel, detail: path, env, tone });
  return ok ? name : null;
}

/**
 * Pre-publish check: warn about referenced items that are not live or are
 * outdated. Returns false only if the user cancels; a failed check never blocks.
 */
export async function confirmReferences(msg, jcrPath, toast) {
  toast('Checking references…', 'info');
  const r = await msg('CHECK_REFERENCES', { jcrPath });
  if (!r.ok || !r.warning) return true;
  return ui.confirm({ title: 'Unpublished references', message: r.warning, tone: 'warn', confirmLabel: 'Publish anyway' });
}

// ─── Page actions ─────────────────────────────────────────────────────────────

export const REPLICATION = {
  publish:   { action: 'PUBLISH_PAGE',    ask: 'Publish this page',            busy: 'Publishing…',            done: '✓ Page published',       fail: 'Publish failed', checkRefs: true, live: true },
  preview:   { action: 'PUBLISH_PREVIEW', ask: 'Publish this page to Preview', busy: 'Publishing to Preview…', done: '✓ Published to Preview', fail: 'Preview publish failed' },
  unpublish: { action: 'UNPUBLISH_PAGE',  ask: 'Unpublish this page',          busy: 'Unpublishing…',          done: '✓ Page unpublished',     fail: 'Unpublish failed', undo: 'publish', undoLabel: 'Publish again', tone: 'danger' },
};

/**
 * Publish / Publish to Preview / Unpublish the page, with toasts.
 *
 * After a success the toast may carry buttons (4th argument of `toast`, an array of
 * {label, onClick}): "View live" after Publish, and an undo. Undoing a publish would
 * unpublish, which is only right if the page was a draft before — so that undo is offered
 * only when the caller says so via previousStatus === 'draft'.
 *
 * `guard` is {env, isProtected, confirmPublish}. On a protected environment the page name must
 * be typed (the worker re-validates it); elsewhere a plain confirmation appears only when
 * `confirmPublish` is on. Without a guard nothing is asked.
 */
export async function runReplication(kind, { msg, jcrPath, toast, onDone, previousStatus, guard }) {
  const def = REPLICATION[kind];
  if (!jcrPath) return toast('No JCR path available', 'warn');
  const confirmText = await confirmDestructive(def.ask, jcrPath, {
    ...guard, confirmDelete: guard?.confirmPublish === true, tone: def.tone,
  });
  if (confirmText === null) return toast('Cancelled', 'warn');
  if (def.checkRefs && !(await confirmReferences(msg, jcrPath, toast))) return toast('Publish cancelled', 'warn');
  toast(def.busy, 'info');
  const r = await msg(def.action, { jcrPath, confirmText });
  if (r.ok) {
    const actions = [];
    if (def.live) {
      actions.push({
        label: 'View live',
        onClick: async () => {
          const v = await msg('GET_URL_VARIANTS', { jcrPath });
          const url = v.publishUrl || v.dispatcherUrl;
          if (url) window.open(url, '_blank', 'noopener');
        },
      });
    }
    const undoKind  = def.undo || (kind === 'publish' && previousStatus === 'draft' ? 'unpublish' : null);
    const undoLabel = def.undoLabel || 'Undo';
    if (undoKind) actions.push({ label: undoLabel, onClick: () => runReplication(undoKind, { msg, jcrPath, toast, onDone, guard }) });
    if (actions.length) toast(def.done, 'success', 8000, actions); else toast(def.done, 'success');
    onDone?.(r);
  } else failToast({ msg, toast }, `✗ ${def.fail}: ${r.error}`, r);
  return r;
}

/** Delete the page after confirmation (typed on protected envs). */
export async function runDelete({ msg, jcrPath, toast, guard, onDone }) {
  if (!jcrPath) return toast('No JCR path available', 'warn');
  const confirmText = await confirmDestructive('Delete page permanently (this cannot be undone)', jcrPath, { ...guard, tone: 'danger' });
  if (confirmText === null) return;
  toast('Deleting…', 'info');
  const r = await msg('DELETE_PAGE', { jcrPath, confirmText });
  if (r.ok) { toast('✓ Page deleted', 'success'); onDone?.(r); }
  else failToast({ msg, toast }, `✗ Delete failed: ${r.error}`, r, 5000);
  return r;
}
