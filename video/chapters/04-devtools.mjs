// Chapter 4 (v4) - Developer Tools, Expandable JCR Tree, Inspectors, Cache Headers & Overlays.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/04-devtools.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import { openPopup } from '../lib/popup.mjs'
import * as T from '../lib/toolbar.mjs'

const PAGE = '/content/wknd/us/en/magazine'
const DEV = `${AUTHOR.dev}${PAGE}.html?wcmmode=edit`
const EDITOR = `${AUTHOR.dev}/editor.html${PAGE}.html`
const CDN = 'https://wwwdev.wknd.com/magazine'
const CF = '/content/dam/wknd-shared/en/adventures/riverside-camping-australia/riverside-camping-australia'
const CF_EDITOR = `${AUTHOR.dev}/editor.html${CF}`

const log = (...a) => console.log(' ', ...a)

async function rowBtn(rec, cardId, key, text) {
  const r = await rec.tab.eval(`(() => { const row = [...document.querySelectorAll('#${cardId} .asp-cc-row')].find((x) => x.querySelector('.asp-cc-key')?.textContent === ${JSON.stringify(key)})
    const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim().endsWith(${JSON.stringify(text)})); if (!b) return null
    const q = b.getBoundingClientRect(); return { cx: q.x + q.width / 2, cy: q.y + q.height / 2 } })()`)
  if (!r) throw new Error(`button not found: ${key} / ${text}`)
  await rec.moveTo(r.cx, r.cy, 700)
  await sleep(250)
  await rec.clickHere()
}

async function waitText(rec, id, text, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await rec.tab.eval(`!!document.getElementById(${JSON.stringify(id)})?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(150)
  }
  throw new Error(`${id} never showed "${text}"`)
}

async function more(rec, item) {
  await T.expand(rec)
  await T.openMenu(rec, '#asp-more-btn')
  await sleep(450)
  await T.clickMenuItem(rec, item)
}

async function devItem(rec, item, { dwell = 0, tab = false, watch = 2800 } = {}) {
  await T.expand(rec)
  await T.openMenu(rec, '#asp-more-btn')
  await sleep(400)
  await T.clickMenuItem(rec, 'Developer links')
  await sleep(1200 + dwell)
  const before = await rec.pageIds()
  await T.clickMenuItem(rec, item)
  if (!tab) return
  const t = await rec.follow(before, 14000, 2600)
  log(`${item} -> ${t.url}`)
  await sleep(watch)
  await rec.back()
  await rec.resync()
}

async function openJcr(rec) {
  await T.expand(rec)
  await rec.click('#asp-jcr-btn', 800)
  await rec.waitFor('#asp-inspector-body .asp-tree-prop, #asp-inspector-body .asp-tree-node', 15000)
  await sleep(900)
}

async function filterJcr(rec, term) {
  await rec.click('#asp-inspector-search', 700)
  await rec.type(term, 85)
  await sleep(1200)
  log(`jcr filter "${term}" ->`, (await rec.tab.eval(`document.getElementById('asp-inspector-body').innerText`)).replace(/\n+/g, ' | ').slice(0, 170))
}

await runChapter('04-devtools-v4', {
  url: DEV,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 4: developer tools. First, Orbit’s viewport-bounded JCR tree inspector. New Expand All and Collapse All controls unfurl deeply nested repository nodes or collapse them in a single click.',
      do: async () => {
        await rec.title('Chapter 4 · <b>Developer tools</b> &amp; inspectors', 'Expandable JCR tree, component &amp; DAM cards, Content Fragments, deep links, cache headers, overlays')
        await sleep(3500)
        await rec.untitle()
        await openJcr(rec)
        await rec.click('#asp-inspector-expand', 700)
        await sleep(1400)
        await rec.click('#asp-inspector-collapse', 700)
        await sleep(1000)
      },
    },
    {
      say: 'Live filtering isolates components like teaser_main, and clicking any property copies its repository path straight to your clipboard. Switching to Stage displays how that identical component differs across tiers.',
      do: async () => {
        await filterJcr(rec, 'teaser_main')
        await sleep(2200)
        await rec.click('#asp-env-chip', 800)
        await rec.click('.asp-env-pick-btn[data-env="stage"]', 800)
        await sleep(5000)
        await openJcr(rec)
        await filterJcr(rec, 'teaser_main')
        await sleep(2800)
      },
    },
    {
      say: 'In the Popup workspace, Compare computes canonical SHA-256 hashes across Local, Dev, Stage, and Prod, and Show diff highlights exact property additions, edits, and deletions.',
      do: async () => {
        await rec.goto(DEV, 3600)
        globalThis.__pop = await openPopup(rec)
        await sleep(1400)
        await rec.click('#compareBtn', 800)
        await rec.waitFor('#panelContent .list-row', 40000)
        await sleep(2200)
        await rec.tab.eval(`document.querySelector('#panelContent [data-diff="stage"]').scrollIntoView({ block: 'center', behavior: 'smooth' })`)
        await sleep(800)
        await rec.click('#panelContent [data-diff="stage"]', 800)
        await waitText(rec, 'panelContent', 'jcr:content', 30000)
        await sleep(4200)
      },
    },
    {
      say: 'Back on the page, the Component Inspector reveals the Sling resource type, resource path, and template, alongside instant clipboard copy and one-click links to CRXDE Lite, Sling Model JSON, and JCR Infinity JSON.',
      do: async () => {
        await globalThis.__pop.close()
        await T.expand(rec)
        await rec.click('#asp-inspect-btn', 800)
        await sleep(800)
        await rec.moveTo(700, 560, 1000)
        await sleep(800)
        await rec.moveTo(700, 255, 900)
        await sleep(900)
        await rec.clickHere()
        await waitText(rec, 'asp-component-card', 'Resource path')
        await sleep(1600)
        await rowBtn(rec, 'asp-component-card', 'Resource path', 'Copy')
        await T.waitToolbarToast(rec, 'Copied', 8000)
        await sleep(1800)
        const before = await rec.pageIds()
        await rowBtn(rec, 'asp-component-card', 'Resource path', 'CRXDE')
        await rec.follow(before, 14000, 2800)
        await sleep(2800)
        await rec.back()
        await rec.resync()
        await rec.click('#asp-component-card .asp-icon-btn', 700)
      },
    },
    {
      say: 'Highlight components draws crisp component outlines on an isolated overlay layer without causing layout shift.',
      do: async () => {
        await more(rec, 'Highlight components')
        await sleep(4000)
        await more(rec, 'Highlight components')
        await sleep(1500)
      },
    },
    {
      say: 'The DAM and Content Fragment inspector pulls asset dimensions, MIME types, and repository paths—or displays Content Fragment model metadata and opens the headless assets JSON endpoint directly.',
      do: async () => {
        await more(rec, 'Inspect an image')
        await sleep(1000)
        await rec.moveTo(700, 560, 900)
        await sleep(1200)
        await rec.clickHere()
        await waitText(rec, 'asp-asset-card', 'MIME Type', 20000)
        await sleep(2400)
        const b1 = await rec.pageIds()
        await rowBtn(rec, 'asp-asset-card', 'Asset Editor', 'Open')
        await rec.follow(b1, 14000, 2800)
        await sleep(2400)
        await rec.back()
        await rec.resync()
        await rec.click('#asp-asset-card .asp-icon-btn', 600)

        await rec.goto(CF_EDITOR, 5000)
        await T.expand(rec)
        await more(rec, 'Asset / Content Fragment details')
        await waitText(rec, 'asp-asset-card', 'Headless JSON', 25000)
        await sleep(2800)
        const b2 = await rec.pageIds()
        await rowBtn(rec, 'asp-asset-card', 'Headless JSON', 'Open')
        await rec.follow(b2, 14000, 2800)
        await sleep(2800)
        await rec.back()
        await rec.resync()
        await rec.goto(DEV, 4000)
      },
    },
    {
      say: 'Developer links unite CRXDE Lite, CRX Package Manager, Sling Model JSON, Infinity JSON, unminified debug clientlibs, layout debugging, and clean URL parameter resets.',
      do: async () => {
        await devItem(rec, 'Open in CRXDE Lite', { dwell: 2000, tab: true, watch: 3000 })
        await devItem(rec, 'Open CRX Package Manager', { tab: true, watch: 2600 })
        await devItem(rec, 'Sling Model JSON', { tab: true, watch: 2400 })
        await devItem(rec, 'JCR content JSON', { tab: true, watch: 2400 })
        await devItem(rec, 'Debug client libraries', { tab: true, watch: 2600 })
        await devItem(rec, 'Layout debug')
        await sleep(4200)
        await T.expand(rec)
        await devItem(rec, 'Clear debug')
        await sleep(4200)
      },
    },
    {
      say: 'Hard reload invokes a background cache-bypassing reload directly through the service worker, and on CDN hosts, the Cache Headers panel reports edge HIT versus cache-busted MISS verdicts.',
      do: async () => {
        await T.expand(rec)
        await more(rec, 'Hard reload')
        await sleep(4500)
        await fetch('http://127.0.0.1:8480/dispatcher/invalidate.cache', { headers: { 'CQ-Handle': PAGE } }).catch(() => {})
        await rec.goto(CDN, 3800)
        await T.expand(rec)
        await devItem(rec, 'Cache & dispatcher')
        await waitText(rec, 'asp-cache-panel', 'HTTP 200')
        await sleep(4000)
        await devItem(rec, 'Bypass cache')
        await sleep(4500)
        await T.expand(rec)
        await devItem(rec, 'Cache & dispatcher')
        await waitText(rec, 'asp-cache-panel', 'HTTP 200')
        await sleep(4000)
      },
    },
    {
      say: 'Finally, in the Touch UI editor, toggling overlays strips editing borders on the spot so authors and engineers can verify layout cleanliness without leaving Edit mode.',
      do: async () => {
        await rec.goto(EDITOR, 9000)
        await T.expand(rec)
        await more(rec, 'Show / hide overlays')
        await T.waitToolbarToast(rec, 'Overlays', 8000)
        await sleep(2800)
        await more(rec, 'Show / hide overlays')
        await T.waitToolbarToast(rec, 'shown', 8000)
        await sleep(2400)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
