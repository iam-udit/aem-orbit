// Chapter 6 (v4) - Automated SEO, Accessibility, Image & Link Health Audits + JSON Export.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch6-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/06-seo.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const log = (...a) => console.log(' ', ...a)

const GOOD_PAGE = `${AUTHOR.dev}/content/wknd/us/en/orbit-demo/seo/good-page.html?wcmmode=disabled`
const BAD_PAGE = `${AUTHOR.dev}/content/wknd/us/en/orbit-demo/seo/bad-page.html?wcmmode=disabled`

async function openAuditFromDevLinks(rec) {
  await T.expand(rec)
  await T.openMenu(rec, '#asp-more-btn')
  await sleep(400)
  await T.clickMenuItem(rec, 'Developer links')
  await sleep(600)
  await T.clickMenuItem(rec, 'SEO & accessibility check')
  await rec.waitFor('#asp-audit-panel .asp-audit-score', 15000)
  await sleep(1000)
}

async function auditScoreRect(rec) {
  return rec.tab.eval(`(() => {
    const el = document.querySelector('#asp-audit-panel .asp-audit-score')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null
  })()`)
}

async function auditRowRect(rec, text) {
  return rec.tab.eval(`(() => {
    const rows = [...document.querySelectorAll('#asp-audit-panel .asp-audit-row, #asp-audit-panel .asp-audit-detail, #asp-audit-panel .asp-audit-group')]
    const target = rows.find(r => r.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
    if (!target) return null
    target.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    const r = target.getBoundingClientRect()
    return r.width ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null
  })()`)
}

async function hoverAuditRow(rec, text, dwell = 900) {
  const r = await auditRowRect(rec, text)
  if (!r) { log(`warn: row "${text}" not found`); return }
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(dwell)
}

async function closeAudit(rec) {
  await rec.click('#asp-audit-panel .asp-icon-btn', 600)
  await sleep(800)
}

async function scrollPage(rec, y, dwell = 1100) {
  await rec.tab.eval(`window.scrollTo({ top: ${y}, behavior: 'smooth' })`)
  await sleep(dwell)
}

await runChapter('06-seo-v4', {
  url: GOOD_PAGE,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 6. In this chapter, we demonstrate AEM Orbit’s SEO, accessibility, and link-health audit engine.',
      do: async () => {
        await rec.title('Chapter 6 · <b>SEO</b> &amp; accessibility audits', 'Page quality score, duplicate IDs &amp; image dimensions, 404 link checks, and JSON report export')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await T.expand(rec)
        await sleep(900)
      },
    },
    {
      say: 'Orbit evaluates the live page directly in the viewport—also accessible as a 1-click Audit button whenever QA or Developer personas are active.',
      do: async () => {
        await scrollPage(rec, 340, 1200)
        await scrollPage(rec, 0, 1200)
        await openAuditFromDevLinks(rec)
      },
    },
    {
      say: 'On our well-structured page, Orbit awards a ninety-two out of one hundred quality score, confirming healthy title length, canonical URL, single H1, alt text, and nineteen passing internal links. New Copy JSON and Export JSON actions let QA teams attach audit reports directly to tickets.',
      do: async () => {
        const sr = await auditScoreRect(rec)
        if (sr) await rec.moveTo(sr.cx, sr.cy, 600)
        await sleep(1200)
        await hoverAuditRow(rec, 'Title length OK', 900)
        await hoverAuditRow(rec, 'Canonical present', 900)
        await hoverAuditRow(rec, 'internal link(s) checked', 1100)
        await rec.click('#asp-audit-panel .asp-audit-actions button', 700)
        await sleep(1600)
        await closeAudit(rec)
      },
    },
    {
      say: 'Now open a defective page intentionally built with SEO, ARIA, and link bugs. Orbit’s viewport-bounded scrollable report immediately drops the score to thirty-two out of one hundred.',
      do: async () => {
        await rec.goto(BAD_PAGE, 2400)
        await scrollPage(rec, 260, 1200)
        await scrollPage(rec, 0, 1000)
        await openAuditFromDevLinks(rec)
        const sr = await auditScoreRect(rec)
        if (sr) await rec.moveTo(sr.cx, sr.cy, 600)
        await sleep(1200)
      },
    },
    {
      say: 'Beyond meta lengths, noindex directives, duplicate H1 tags, skipped heading levels, unlabelled inputs, and four-oh-four broken internal links, Orbit also catches duplicate DOM IDs, broken images, and missing image dimension attributes that harm Core Web Vitals.',
      do: async () => {
        await hoverAuditRow(rec, 'Title is 3 chars', 900)
        await hoverAuditRow(rec, 'Page is set to noindex', 1000)
        await hoverAuditRow(rec, '2 <h1> elements', 900)
        await hoverAuditRow(rec, 'without alt', 1000)
        await hoverAuditRow(rec, 'without label', 1000)
        await hoverAuditRow(rec, 'broken internal link', 1400)
        await closeAudit(rec)
        await sleep(1200)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
