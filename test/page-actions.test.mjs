import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  escHtml, createMessenger, failToast, confirmDestructive, confirmReferences, runReplication, runDelete, ui,
} from '../src/ui/page-actions.js';

// ─── Mocks: chrome.runtime, confirm/prompt, toast ─────────────────────────────

let sent = [];
let replies = {};
globalThis.chrome = {
  runtime: {
    sendMessage(message, cb) {
      sent.push(message);
      const r = replies[message.action];
      cb(typeof r === 'function' ? r(message) : r);
    },
  },
};

// The themed dialogs need a DOM; swap them for fakes that record what was asked.
let confirmAnswer = true;
let promptAnswer  = null;   // text the user "types"; null = cancelled
let dialogs = [];
ui.confirm = async (o) => { dialogs.push(o); return confirmAnswer; };
ui.prompt  = async (o) => {
  dialogs.push(o);
  if (promptAnswer === null) return null;
  const t = promptAnswer.trim();
  return o.input?.expect !== undefined && t !== String(o.input.expect) ? null : t; // the real dialog keeps Confirm disabled
};

let toasts = [];
const toast = (m, type) => toasts.push({ m, type });

beforeEach(() => {
  sent = []; replies = {}; toasts = []; dialogs = [];
  confirmAnswer = true; promptAnswer = null;
});

const msg = createMessenger(() => 'dev');

// ─── Tests ────────────────────────────────────────────────────────────────────

test('escHtml escapes all five characters and handles null', () => {
  assert.equal(escHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escHtml(null), '');
});

test('createMessenger adds env, lets payload override it, and handles no response', async () => {
  replies.PING = { ok: true };
  assert.deepEqual(await msg('PING', { a: 1 }), { ok: true });
  assert.deepEqual(sent[0], { action: 'PING', payload: { env: 'dev', a: 1 } });
  await msg('PING', { env: 'prod' });
  assert.equal(sent[1].payload.env, 'prod');
  assert.deepEqual(await createMessenger(() => null)('NOPE'), { ok: false, error: 'No response' });
  assert.deepEqual(sent[2].payload, {});
});

test('confirmDestructive: protected env requires the exact page name', async () => {
  const guard = { env: 'prod', isProtected: true };
  promptAnswer = 'wrong';
  assert.equal(await confirmDestructive('Delete', '/content/site/en/page', guard), null);
  promptAnswer = ' page ';
  assert.equal(await confirmDestructive('Delete', '/content/site/en/page', guard), 'page');
  promptAnswer = null;
  assert.equal(await confirmDestructive('Delete', '/content/site/en/page', guard), null);
  // the dialog is told what to expect, so Confirm stays disabled until it matches
  assert.equal(dialogs[0].input.expect, 'page');
  assert.equal(dialogs[0].isProtected, true);
  assert.equal(dialogs[0].env, 'prod');
});

test('confirmDestructive: confirmDelete=false skips the dialog unless always', async () => {
  confirmAnswer = false;
  assert.equal(await confirmDestructive('Delete', '/content/a/b', { confirmDelete: false }), 'b');
  assert.equal(dialogs.length, 0);
  assert.equal(await confirmDestructive('Tree', '/content/a/b', { confirmDelete: false, always: true }), null);
  confirmAnswer = true;
  assert.equal(await confirmDestructive('Tree', '/content/a/b', { confirmDelete: true }), 'b');
  assert.equal(dialogs.length, 2);
});

test('confirmReferences never blocks on a failed check', async () => {
  replies.CHECK_REFERENCES = { ok: false, error: 'boom' };
  assert.equal(await confirmReferences(msg, '/content/a', toast), true);
  replies.CHECK_REFERENCES = { ok: true, warning: 'refs!' };
  confirmAnswer = false;
  assert.equal(await confirmReferences(msg, '/content/a', toast), false);
});

test('runReplication publish checks references, then publishes and calls onDone', async () => {
  replies.CHECK_REFERENCES = { ok: true, warning: '' };
  replies.PUBLISH_PAGE     = { ok: true };
  let done = 0;
  await runReplication('publish', { msg, jcrPath: '/content/a', toast, onDone: () => done++ });
  assert.deepEqual(sent.map((s) => s.action), ['CHECK_REFERENCES', 'PUBLISH_PAGE']);
  assert.equal(done, 1);
  assert.equal(toasts.at(-1).type, 'success');
});

test('runReplication: cancelled reference warning does not publish; unpublish skips the check', async () => {
  replies.CHECK_REFERENCES = { ok: true, warning: 'refs' };
  confirmAnswer = false;
  await runReplication('publish', { msg, jcrPath: '/content/a', toast });
  assert.deepEqual(sent.map((s) => s.action), ['CHECK_REFERENCES']);

  sent = [];
  replies.UNPUBLISH_PAGE = { ok: false, error: 'nope' };
  await runReplication('unpublish', { msg, jcrPath: '/content/a', toast });
  assert.deepEqual(sent.map((s) => s.action), ['UNPUBLISH_PAGE']);
  assert.match(toasts.at(-1).m, /Unpublish failed: nope/);
});

test('runReplication / runDelete without a path send nothing', async () => {
  await runReplication('preview', { msg, jcrPath: null, toast });
  await runDelete({ msg, jcrPath: null, toast, guard: {} });
  assert.equal(sent.length, 0);
});

test('runDelete sends the typed confirmText on protected envs', async () => {
  replies.DELETE_PAGE = { ok: true };
  promptAnswer = 'page';
  await runDelete({ msg, jcrPath: '/content/a/page', toast, guard: { env: 'prod', isProtected: true } });
  assert.equal(dialogs[0].tone, 'danger');
  assert.deepEqual(sent[0].payload, { env: 'dev', jcrPath: '/content/a/page', confirmText: 'page' });
});

test('runReplication: success toast offers View live, and Undo only for a page that was a draft', async () => {
  replies.CHECK_REFERENCES = { ok: true, warning: '' };
  replies.PUBLISH_PAGE     = { ok: true };
  replies.UNPUBLISH_PAGE   = { ok: true };
  const rich = [];
  const richToast = (m, type, duration, actions) => rich.push({ m, type, actions });

  await runReplication('publish', { msg, jcrPath: '/content/a', toast: richToast, previousStatus: 'published' });
  assert.deepEqual(rich.at(-1).actions.map((a) => a.label), ['View live']);   // re-publish: no unpublish "undo"

  await runReplication('publish', { msg, jcrPath: '/content/a', toast: richToast, previousStatus: 'draft' });
  assert.deepEqual(rich.at(-1).actions.map((a) => a.label), ['View live', 'Undo']);

  sent = [];
  await rich.at(-1).actions[1].onClick();                                     // Undo = unpublish
  assert.deepEqual(sent.map((s) => s.action), ['UNPUBLISH_PAGE']);
  assert.deepEqual(rich.at(-1).actions.map((a) => a.label), ['Publish again']);

  await runReplication('preview', { msg, jcrPath: '/content/a', toast: richToast });
  assert.equal(rich.at(-1).actions, undefined);
});

test('runReplication: protected env asks for the page name first, and sends it', async () => {
  replies.PUBLISH_PAGE = { ok: true };
  replies.UNPUBLISH_PAGE = { ok: true };
  const guard = { env: 'prod', isProtected: true };

  promptAnswer = null;                                       // cancelled: nothing is sent
  await runReplication('unpublish', { msg, jcrPath: '/content/a/page', toast, guard });
  assert.equal(sent.length, 0);
  assert.equal(dialogs[0].isProtected, true);
  assert.equal(dialogs[0].message, 'Unpublish this page');

  promptAnswer = 'page';
  await runReplication('unpublish', { msg, jcrPath: '/content/a/page', toast, guard });
  assert.deepEqual(sent[0].payload, { env: 'dev', jcrPath: '/content/a/page', confirmText: 'page' });

  // Preview publish asks too, even with confirmPublish off
  sent = []; replies.PUBLISH_PREVIEW = { ok: true };
  await runReplication('preview', { msg, jcrPath: '/content/a/page', toast, guard: { ...guard, confirmPublish: false } });
  assert.equal(sent[0].payload.confirmText, 'page');
});

test('runReplication: other envs ask only when confirmPublish is on', async () => {
  replies.PUBLISH_PREVIEW = { ok: true };
  const off = { env: 'dev', isProtected: false, confirmPublish: false };
  await runReplication('preview', { msg, jcrPath: '/content/a/page', toast, guard: off });
  assert.equal(dialogs.length, 0);
  assert.equal(sent.length, 1);

  sent = []; confirmAnswer = false;                          // asked, then declined: nothing is sent
  await runReplication('preview', { msg, jcrPath: '/content/a/page', toast, guard: { ...off, confirmPublish: true } });
  assert.equal(dialogs.length, 1);
  assert.equal(sent.length, 0);
  assert.equal(toasts.at(-1).m, 'Cancelled');

  confirmAnswer = true;
  await runReplication('preview', { msg, jcrPath: '/content/a/page', toast, guard: { ...off, confirmPublish: true } });
  assert.equal(sent[0].action, 'PUBLISH_PREVIEW');
});

// ─── Signed-out environments: "Log in" shortcut ──────────────────────────────

const LOGIN = { env: 'dev', label: 'Dev', url: 'https://author-p1-e1.adobeaemcloud.com/' };

test('failToast: a plain failure is a normal error toast', () => {
  const rich = [];
  failToast({ msg, toast: (m, t, d, a) => rich.push({ m, t, d, a }) }, '✗ Boom', { ok: false, error: 'Boom' });
  assert.deepEqual(rich, [{ m: '✗ Boom', t: 'error', d: 4000, a: undefined }]);
});

test('failToast: a signed-out failure offers a Log in button that opens the login page', async () => {
  const rich = [];
  failToast({ msg, toast: (m, t, d, a) => rich.push({ m, t, d, a }) }, '✗ Publish failed: Session expired', { ok: false, login: LOGIN });
  assert.equal(rich[0].t, 'error');
  assert.ok(rich[0].d >= 10000);                       // long enough to click
  assert.deepEqual(rich[0].a.map((b) => b.label), ['Log in to Dev']);
  await rich[0].a[0].onClick();
  assert.deepEqual(sent.map((s) => [s.action, s.payload.url]), [['OPEN_TAB', LOGIN.url]]);
});

test('runReplication: a signed-out publish failure carries the Log in button', async () => {
  replies.CHECK_REFERENCES = { ok: true, warning: '' };
  replies.PUBLISH_PAGE = { ok: false, error: 'Session expired', login: LOGIN };
  const rich = [];
  await runReplication('publish', { msg, jcrPath: '/content/a', toast: (m, t, d, a) => rich.push({ m, t, a }) });
  assert.deepEqual(rich.at(-1).a.map((b) => b.label), ['Log in to Dev']);
});
