// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file Accessible Modal Dialogs for AEM Orbit.
 * @module ui/dialog
 *
 * Provides themed, keyboard-trapped modal dialogs conforming to WAI-ARIA modal dialog patterns.
 * Replaces native window.confirm / window.prompt with custom styled UI.
 * Used by the in-page toolbar (content script), extension popup, and options page.
 *
 * Security: All text is injected via DOM textContent (never innerHTML).
 * Styling: src/ui/dialog.css.
 */

const ID = 'asp-dialog';
const BUILTIN_ENVS = ['local', 'dev', 'stage', 'prod'];

let closeCurrent = null;

/**
 * DOM helper to instantiate an element with classes and text content securely.
 *
 * @param {string} tag - HTML tag name.
 * @param {string} [cls] - CSS class names.
 * @param {string} [text] - Text content.
 * @returns {HTMLElement}
 */
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

/**
 * @param {object}  o
 * @param {string}  o.title
 * @param {string} [o.message]       paragraph text (line breaks are kept)
 * @param {string} [o.detail]        monospace line, e.g. a JCR path
 * @param {string} [o.env]           environment key, shown as a coloured tag
 * @param {boolean}[o.isProtected]   red ring + PROTECTED tag
 * @param {'default'|'danger'|'warn'} [o.tone]
 * @param {string} [o.confirmLabel]
 * @param {string} [o.cancelLabel]
 * @param {object} [o.input]         { label, placeholder, expect } — expect: confirm stays disabled until the text matches
 * @returns {Promise<{ok:boolean, value:string}>}
 */
function openDialog(o) {
  closeCurrent?.();
  const opener = document.activeElement;

  return new Promise((resolve) => {
    const overlay = h('div', 'asp-dlg-overlay');
    overlay.id = ID;
    const box = h('div', 'asp-dlg');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.dataset.tone = o.tone || 'default';
    if (o.isProtected) box.classList.add('asp-dlg-protected');

    const head = h('div', 'asp-dlg-head');
    const title = h('span', 'asp-dlg-title', o.title);
    title.id = `${ID}-title`;
    box.setAttribute('aria-labelledby', title.id);
    head.appendChild(title);
    if (o.isProtected) head.appendChild(h('span', 'asp-dlg-tag asp-dlg-tag-protected', 'Protected'));
    if (o.env) {
      const key = BUILTIN_ENVS.includes(o.env) ? o.env : 'custom';
      head.appendChild(h('span', `asp-dlg-tag asp-dlg-env-${key}`, String(o.env).toUpperCase()));
    }

    const body = h('div', 'asp-dlg-body');
    if (o.message) body.appendChild(h('div', 'asp-dlg-msg', o.message));
    if (o.detail) body.appendChild(h('div', 'asp-dlg-detail', o.detail));

    let input = null;
    if (o.input) {
      if (o.input.label) body.appendChild(h('label', 'asp-dlg-label', o.input.label));
      input = h('input', 'asp-dlg-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (o.input.placeholder) input.placeholder = o.input.placeholder;
      body.appendChild(input);
    }

    const foot = h('div', 'asp-dlg-foot');
    const cancel = h('button', 'asp-dlg-btn', o.cancelLabel || 'Cancel');
    const ok = h('button', 'asp-dlg-btn asp-dlg-primary', o.confirmLabel || 'Confirm');
    cancel.type = 'button';
    ok.type = 'button';
    foot.append(cancel, ok);

    box.append(head, body, foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const expect = o.input?.expect;
    const canConfirm = () => expect === undefined || expect === null || input.value.trim() === String(expect);
    const sync = () => { ok.disabled = !canConfirm(); };

    const finish = (accepted) => {
      closeCurrent = null;
      overlay.remove();
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
      resolve({ ok: accepted, value: input ? input.value.trim() : '' });
    };
    closeCurrent = () => finish(false);

    ok.addEventListener('click', () => { if (canConfirm()) finish(true); });
    cancel.addEventListener('click', () => finish(false));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(false); });
    overlay.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep page shortcuts (e.g. the AEM editor's) from reacting
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && e.target !== cancel) { e.preventDefault(); if (canConfirm()) finish(true); }
      else if (e.key === 'Tab') {
        const items = [input, cancel, ok].filter((x) => x && !x.disabled);
        const i = items.indexOf(document.activeElement);
        const next = items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length];
        e.preventDefault();
        next.focus();
      }
    });
    overlay.addEventListener('keyup', (e) => e.stopPropagation());

    if (input) input.addEventListener('input', sync);
    sync();
    (input || (o.tone === 'danger' ? cancel : ok)).focus();
  });
}

/** @returns {Promise<boolean>} */
export async function confirmDialog(o) {
  return (await openDialog(o)).ok;
}

/**
 * @param {object} o  same as openDialog, with o.input = { label, placeholder, expect }
 * @returns {Promise<string|null>} the trimmed text, or null when cancelled
 */
export async function promptDialog(o) {
  const r = await openDialog({ ...o, input: o.input || {} });
  return r.ok ? r.value : null;
}
