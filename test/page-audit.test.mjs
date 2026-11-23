import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudit } from '../src/shared/page-audit.js';

const good = {
  title: 'A well sized page title for search engines',          // 43
  description: 'A meta description that is long enough to be useful in search results and short enough.',
  canonical: 'https://www.example.com/en/page.html',
  robots: 'index,follow',
  lang: 'en',
  viewport: true,
  hreflang: ['en-us', 'x-default'],
  og: { 'og:title': 't', 'og:description': 'd', 'og:image': 'i' },
  headings: [1, 2, 3, 2],
  imgsMissingAlt: [],
  linksNoText: 0,
  buttonsNoName: 0,
  inputsNoLabel: 0,
  brokenLinks: [],
  linksChecked: 10,
};

const byMsg = (r, re) => r.checks.find((c) => re.test(c.message));

test('a clean page scores 100 with no warnings or failures', () => {
  const r = evaluateAudit(good);
  assert.equal(r.score, 100);
  assert.ok(r.checks.every((c) => c.status === 'pass' || c.status === 'info'));
});

test('missing title / description / lang / h1 / alt are failures', () => {
  const r = evaluateAudit({ ...good, title: '', description: '', lang: '', headings: [2, 3], imgsMissingAlt: ['/a.png'] });
  assert.equal(byMsg(r, /Missing <title>/).status, 'fail');
  assert.equal(byMsg(r, /Missing meta description/).status, 'fail');
  assert.equal(byMsg(r, /html lang/).status, 'fail');
  assert.equal(byMsg(r, /No <h1>/).status, 'fail');
  assert.deepEqual(byMsg(r, /without alt/).details, ['/a.png']);
  assert.ok(r.score < 100);
});

test('length, multiple h1, skipped headings, noindex, OG and canonical warnings', () => {
  const r = evaluateAudit({
    ...good,
    title: 'Short',
    headings: [1, 1, 3],
    robots: 'noindex',
    og: {},
    canonical: '/relative',
  });
  assert.equal(byMsg(r, /Title is 5 chars/).status, 'warn');
  assert.equal(byMsg(r, /2 <h1>/).status, 'warn');
  assert.deepEqual(byMsg(r, /Heading levels skipped/).details, ['h1 → h3']);
  assert.equal(byMsg(r, /noindex/).status, 'warn');
  assert.match(byMsg(r, /Missing Open Graph/).message, /og:title, og:description, og:image/);
  assert.equal(byMsg(r, /not absolute/).status, 'warn');
});

test('broken links are listed (capped) and fail', () => {
  const broken = Array.from({ length: 15 }, (_, i) => ({ href: `https://x/${i}`, status: 404 }));
  const r = evaluateAudit({ ...good, brokenLinks: broken });
  const c = byMsg(r, /broken internal link/);
  assert.equal(c.status, 'fail');
  assert.equal(c.details.length, 10);
  assert.equal(c.details[0], '404 https://x/0');
});

test('missing x-default is informational only', () => {
  const r = evaluateAudit({ ...good, hreflang: ['en', 'de'] });
  assert.equal(byMsg(r, /hreflang/).status, 'info');
  assert.equal(r.score, 100);
});

test('evaluateAudit tolerates empty input', () => {
  const r = evaluateAudit();
  assert.ok(r.checks.length > 0);
  assert.ok(r.score >= 0);
});
