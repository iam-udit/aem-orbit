/**
 * @file Headless SEO & Accessibility Audit Evaluator.
 * @module shared/page-audit
 *
 * Performs pure rule-based evaluation of DOM facts collected by the content script.
 * Zero browser or chrome.* dependencies, allowing 100% unit testing in Node.js.
 */

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN  = 70;
const DESC_MAX  = 160;
const DETAILS_MAX = 10;

const list = (arr) => (arr || []).slice(0, DETAILS_MAX).map(String);

/**
 * @typedef {object} AuditFacts
 * @property {string}   title
 * @property {string}   description
 * @property {string}   canonical
 * @property {string}   robots
 * @property {string}   lang
 * @property {boolean}  viewport
 * @property {string[]} hreflang          e.g. ["en-us", "x-default"]
 * @property {Object<string,string>} og   og:title, og:description, og:image …
 * @property {number[]} headings          heading levels in document order
 * @property {string[]} imgsMissingAlt    src of <img> without an alt attribute
 * @property {number}   linksNoText
 * @property {number}   buttonsNoName
 * @property {number}   inputsNoLabel
 * @property {Array<{href:string,status:number}>} brokenLinks
 * @property {number}   linksChecked
 */

/**
 * @param {AuditFacts} f
 * @returns {{score:number, checks:Array<{group:string, status:'pass'|'warn'|'fail'|'info', message:string, details?:string[]}>}}
 */
export function evaluateAudit(f = {}) {
  const checks = [];
  const add = (group, status, message, details) => checks.push({ group, status, message, ...(details?.length ? { details } : {}) });

  // ── SEO ──
  const title = String(f.title || '').trim();
  if (!title) add('SEO', 'fail', 'Missing <title>');
  else if (title.length < TITLE_MIN || title.length > TITLE_MAX) add('SEO', 'warn', `Title is ${title.length} chars (aim for ${TITLE_MIN}–${TITLE_MAX})`, [title]);
  else add('SEO', 'pass', `Title length OK (${title.length})`);

  const desc = String(f.description || '').trim();
  if (!desc) add('SEO', 'fail', 'Missing meta description');
  else if (desc.length < DESC_MIN || desc.length > DESC_MAX) add('SEO', 'warn', `Description is ${desc.length} chars (aim for ${DESC_MIN}–${DESC_MAX})`, [desc]);
  else add('SEO', 'pass', `Description length OK (${desc.length})`);

  if (!f.canonical) add('SEO', 'warn', 'No canonical link');
  else if (!/^https?:\/\//i.test(f.canonical)) add('SEO', 'warn', 'Canonical URL is not absolute', [f.canonical]);
  else add('SEO', 'pass', 'Canonical present', [f.canonical]);

  if (/noindex/i.test(f.robots || '')) add('SEO', 'warn', 'Page is set to noindex', [f.robots]);

  const hl = f.hreflang || [];
  if (hl.length) {
    add('SEO', hl.some((h) => String(h).toLowerCase() === 'x-default') ? 'pass' : 'info',
      `${hl.length} hreflang alternate(s)${hl.some((h) => String(h).toLowerCase() === 'x-default') ? '' : ' (no x-default)'}`, list(hl));
  }

  const og = f.og || {};
  const missingOg = ['og:title', 'og:description', 'og:image'].filter((k) => !og[k]);
  if (missingOg.length) add('SEO', 'warn', `Missing Open Graph: ${missingOg.join(', ')}`);
  else add('SEO', 'pass', 'Open Graph title, description and image present');

  if (!f.viewport) add('SEO', 'warn', 'No meta viewport (mobile rendering)');

  // ── Accessibility ──
  if (!f.lang) add('Accessibility', 'fail', 'Missing <html lang>');

  const levels = f.headings || [];
  const h1 = levels.filter((l) => l === 1).length;
  if (h1 === 0) add('Accessibility', 'fail', 'No <h1> on the page');
  else if (h1 > 1) add('Accessibility', 'warn', `${h1} <h1> elements (use one)`);
  else add('Accessibility', 'pass', 'Single <h1>');

  const skips = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) skips.push(`h${levels[i - 1]} → h${levels[i]}`);
  }
  if (skips.length) add('Accessibility', 'warn', `Heading levels skipped ${skips.length}×`, list(skips));

  const noAlt = f.imgsMissingAlt || [];
  if (noAlt.length) add('Accessibility', 'fail', `${noAlt.length} image(s) without alt`, list(noAlt));
  else add('Accessibility', 'pass', 'All images have alt');

  if (f.linksNoText > 0)   add('Accessibility', 'warn', `${f.linksNoText} link(s) without accessible text`);
  if (f.buttonsNoName > 0) add('Accessibility', 'fail', `${f.buttonsNoName} button(s) without accessible name`);
  if (f.inputsNoLabel > 0) add('Accessibility', 'fail', `${f.inputsNoLabel} form field(s) without label`);

  // ── Links ──
  const broken = f.brokenLinks || [];
  if (broken.length) add('Links', 'fail', `${broken.length} broken internal link(s)`, list(broken.map((b) => `${b.status} ${b.href}`)));
  else if (f.linksChecked > 0) add('Links', 'pass', `${f.linksChecked} internal link(s) checked`);
  else add('Links', 'info', 'No internal links checked');

  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  return { score: Math.max(0, 100 - fails * 10 - warns * 4), checks };
}
