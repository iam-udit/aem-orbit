// Chapter 6 (v3) - Automated SEO & Accessibility (a11y) Audit.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch6-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/06-seo-v3.mjs
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
  await sleep(700)
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
  if (!r) {
    log(`warn: audit row containing "${text}" not found for hover`)
    return
  }
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(dwell)
}

async function closeAudit(rec) {
  const closeRect = await rec.tab.eval(`(() => {
    const btn = document.querySelector('#asp-audit-panel .asp-icon-btn')
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    return r.width ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null
  })()`)
  if (!closeRect) throw new Error('audit panel close button not found')
  await rec.moveTo(closeRect.cx, closeRect.cy, 500)
  await sleep(250)
  await rec.clickHere()
  await sleep(800)
}

async function scrollPage(rec, y, dwell = 1200) {
  await rec.tab.eval(`window.scrollTo({ top: ${y}, behavior: 'smooth' })`)
  await sleep(dwell)
}

await runChapter('06-seo-v3', {
  url: GOOD_PAGE,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 6. In this chapter, we explore AEM Orbit\'s automated SEO, accessibility, and link health audit engine.',
      do: async () => {
        await rec.title('Chapter 6 · <b>SEO</b> &amp; accessibility audits', 'Automated page quality score, meta checks, heading hierarchy, and link health diagnostics')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await T.expand(rec)
        await sleep(1000)
      },
    },
    {
      say: 'Content authors frequently publish pages without realizing that missing alt text, broken hyperlinks, or broken heading hierarchies harm user experience and organic search rank. Orbit runs client-side audits directly on your rendered DOM.',
      do: async () => {
        await scrollPage(rec, 320, 1500)
        await scrollPage(rec, 650, 1600)
        await scrollPage(rec, 0, 1400)
      },
    },
    {
      say: 'From the expanded toolbar, we open Developer links and trigger the SEO & accessibility check. Orbit immediately gathers live page facts and audits internal links concurrently.',
      do: async () => {
        await openAuditFromDevLinks(rec)
      },
    },
    {
      say: 'The audit panel presents an overall quality score of eighty-eight out of one hundred with a green badge. The title length, meta description, and absolute canonical URL all pass inspection cleanly.',
      do: async () => {
        const sr = await auditScoreRect(rec)
        if (sr) {
          await rec.moveTo(sr.cx, sr.cy, 600)
          await sleep(1000)
        }
        await hoverAuditRow(rec, 'Title length OK', 1000)
        await hoverAuditRow(rec, 'Canonical present', 1000)
      },
    },
    {
      say: 'Under Accessibility, Orbit verifies the HTML lang attribute, confirms a single H1 heading with valid hierarchy, and validates that all images include descriptive alt attributes.',
      do: async () => {
        await hoverAuditRow(rec, 'Accessibility', 600)
        await hoverAuditRow(rec, 'Single <h1>', 1100)
        await hoverAuditRow(rec, 'All images have alt', 1200)
      },
    },
    {
      say: 'In the Links section, Orbit executed concurrent background HEAD requests across nineteen same-origin internal links, confirming zero four-oh-four broken links.',
      do: async () => {
        await hoverAuditRow(rec, 'internal link(s) checked', 1500)
      },
    },
    {
      say: 'Now, let us close the panel and test a page intentionally seeded with authoring defects: a three-character title, noindex robots directive, duplicate H1 tags, skipped heading levels, unnamed buttons, and broken links.',
      do: async () => {
        await closeAudit(rec)
        await sleep(1200)
      },
    },
    {
      say: 'Navigating to the defective page, casual visual review might miss structural problems. Let us scroll down to inspect the unlabelled inputs, empty buttons, and missing alt images before running the audit.',
      do: async () => {
        await rec.goto(BAD_PAGE, 2500)
        await scrollPage(rec, 240, 1200)
        await scrollPage(rec, 480, 1600)
        await scrollPage(rec, 0, 1200)
      },
    },
    {
      say: 'We launch the SEO and accessibility check once more. Orbit recalculates every rule and immediately flags critical violations, plunging the page quality score to thirty-two out of one hundred with a red alert badge.',
      do: async () => {
        await openAuditFromDevLinks(rec)
        const sr = await auditScoreRect(rec)
        if (sr) {
          await rec.moveTo(sr.cx, sr.cy, 600)
          await sleep(1200)
        }
      },
    },
    {
      say: 'The SEO group flags a three-character title, short description, missing canonical tag, and an active noindex directive that would prevent search engines from indexing the page.',
      do: async () => {
        await hoverAuditRow(rec, 'Title is 3 chars', 1200)
        await hoverAuditRow(rec, 'Description is 9 chars', 1100)
        await hoverAuditRow(rec, 'Page is set to noindex', 1200)
      },
    },
    {
      say: 'Accessibility warnings highlight duplicate H1 elements and heading levels skipped directly from H2 to H4. Hard failures identify an image missing alt text, an unnamed button, and an unlabelled form input.',
      do: async () => {
        await hoverAuditRow(rec, '2 <h1> elements', 1100)
        await hoverAuditRow(rec, 'Heading levels skipped', 1100)
        await hoverAuditRow(rec, 'without alt', 1200)
        await hoverAuditRow(rec, 'without accessible name', 1200)
        await hoverAuditRow(rec, 'without label', 1200)
      },
    },
    {
      say: 'Finally, Link Health catches a broken four-oh-four internal link. While standard AEM link checker rules often strip invalid links silently in author mode, Orbit exposes the exact failing URL so authors can fix broken references before publication.',
      do: async () => {
        await hoverAuditRow(rec, 'broken internal link', 1300)
        await hoverAuditRow(rec, '404', 1600)
      },
    },
    {
      say: 'With instantaneous, client-side quality audits, AEM Orbit empowers authors and developers to catch SEO regressions, accessibility barriers, and dead links before they reach production.',
      do: async () => {
        await closeAudit(rec)
        await sleep(1000)
        await rec.untitle()
        await sleep(1500)
      },
    },
  ],
})
