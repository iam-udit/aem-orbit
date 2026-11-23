// Chapter 4 (v2) - Enhanced Developer Tools & In-Page Inspectors with Christopher Neural voiceover and jointed acronyms.
// Read-only chapter: it changes no content. Needs the proxy (8443), Dev/Stage/Prod authors and the CDN simulation up.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/04-devtools-v2.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import { openPopup } from '../lib/popup.mjs'
import * as T from '../lib/toolbar.mjs'

const PAGE = '/content/wknd/us/en/magazine'
const DEV = `${AUTHOR.dev}${PAGE}.html?wcmmode=edit`
const EDITOR = `${AUTHOR.dev}/editor.html${PAGE}.html`
const CDN = 'https://wwwdev.wknd.com/magazine'
// A real Content Fragment on Dev (model "adventure", master variation). Opened in the fragment editor.
const CF = '/content/dam/wknd-shared/en/adventures/riverside-camping-australia/riverside-camping-australia'
const CF_EDITOR = `${AUTHOR.dev}/editor.html${CF}`

const log = (...a) => console.log(' ', ...a)

/** Click a button inside a card/panel row, found by the row's label and the button's text. */
async function rowBtn(rec, cardId, key, text) {
  const r = await rec.tab.eval(`(() => { const row = [...document.querySelectorAll('#${cardId} .asp-cc-row')].find((x) => x.querySelector('.asp-cc-key')?.textContent === ${JSON.stringify(key)})
    const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim().endsWith(${JSON.stringify(text)})); if (!b) return null
    const q = b.getBoundingClientRect(); return { cx: q.x + q.width / 2, cy: q.y + q.height / 2 } })()`)
  if (!r) throw new Error(`button not found: ${key} / ${text}`)
  await rec.moveTo(r.cx, r.cy, 800)
  await sleep(300)
  await rec.clickHere()
}

/** Wait until an element's text contains `text`. */
async function waitText(rec, id, text, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await rec.tab.eval(`!!document.getElementById(${JSON.stringify(id)})?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(150)
  }
  throw new Error(`${id} never showed "${text}"`)
}

/** More menu -> entry. */
async function more(rec, item) {
  await T.expand(rec)
  await T.openMenu(rec, '#asp-more-btn')
  await sleep(500)
  await T.clickMenuItem(rec, item)
}

/** More -> Developer links -> entry; for entries that open a new tab, follow it, show the address and come back. */
async function devItem(rec, item, { dwell = 0, tab = false, watch = 3200 } = {}) {
  await T.expand(rec)
  await T.openMenu(rec, '#asp-more-btn')
  await sleep(400)
  await T.clickMenuItem(rec, 'Developer links')
  await sleep(1500 + dwell)
  const before = await rec.pageIds()
  await T.clickMenuItem(rec, item)
  if (!tab) return
  const t = await rec.follow(before, 14000, 2800)
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

await runChapter('04-devtools-v2', {
  url: DEV,
  steps: (rec) => [
    // ---- JCR tree inspector -----------------------------------------------------------------------
    {
      say: 'Chapter four: developer tools. Everything a developer usually opens in separate browser tabs is one click away, directly on the page. First, the in-page JCR inspector. It reads the jcr:content node of this page and displays it as an interactive tree, properties first, followed by child nodes with their primary types.',
      do: async () => {
        rec.tab.ws.addEventListener('close', () => console.log('  !! recording tab socket closed'))
        await rec.title('Chapter 4 · <b>Developer tools</b> &amp; inspectors', 'JCR tree, component and DAM asset inspectors, overlays, deep links, cache headers, and hard reload')
        await openJcr(rec)
        await sleep(2500)
      },
    },
    {
      say: 'The filter searches property names and values in real time, automatically expanding matching branches. Typing teaser_main isolates that specific component, displaying its title, description, and asset fileReference.',
      do: async () => {
        await filterJcr(rec, 'teaser_main')
        await sleep(2800)
      },
    },
    {
      say: 'Cross-environment comparison begins with the same panel on another tier. We switch this page to Stage and open the inspector with the same filter. Same page, same component, yet the Stage teaser displays a different story and asset.',
      do: async () => {
        await rec.click('#asp-env-chip', 800)
        await rec.click('.asp-env-pick-btn[data-env="stage"]', 800)
        await sleep(5200)
        await openJcr(rec)
        await filterJcr(rec, 'teaser_main')
        await sleep(3600)
      },
    },
    {
      say: 'For comprehensive multi-environment analysis, the popup hub provides automated fingerprinting. It reads the page across Local, Dev, Stage, and Prod, calculating canonical SHA-256 hashes to show which environments match and which differ.',
      do: async () => {
        await rec.goto(DEV, 3800)
        globalThis.__pop = await openPopup(rec)
        await sleep(1500)
        await rec.click('#compareBtn', 800)
        await rec.waitFor('#panelContent .list-row', 40000)
        log('compare ->', (await rec.tab.eval(`document.getElementById('panelContent').innerText`)).replace(/\n+/g, ' | '))
        await sleep(3500)
      },
    },
    {
      say: 'Show diff produces an exact side-by-side property diff from one environment to another, highlighting added, removed, or modified values without manual node inspection.',
      do: async () => {
        await rec.tab.eval(`document.querySelector('#panelContent [data-diff="stage"]').scrollIntoView({ block: 'center', behavior: 'smooth' })`)
        await sleep(900)
        await rec.click('#panelContent [data-diff="stage"]', 800)
        await waitText(rec, 'panelContent', 'jcr:content', 30000)
        log('diff ->', (await rec.tab.eval(`document.getElementById('panelContent').innerText`)).replace(/\n+/g, ' | ').slice(0, 220))
        await sleep(6500)
      },
    },

    // ---- component inspector ----------------------------------------------------------------------
    {
      say: 'Back on the page, activate the component inspector. Moving across the layout highlights each component with an outline. Click the page title.',
      do: async () => {
        await globalThis.__pop.close()
        await T.expand(rec)
        await rec.click('#asp-inspect-btn', 800)
        await sleep(900)
        await rec.moveTo(700, 560, 1100)
        await sleep(900)
        await rec.moveTo(700, 255, 900)
        await sleep(1000)
        await rec.clickHere()
        await waitText(rec, 'asp-component-card', 'Resource path')
        await sleep(1500)
      },
    },
    {
      say: 'The card reveals the component resource type, its exact JCR repository path, and the page template. The Copy button places any value onto your clipboard.',
      do: async () => {
        log('component card ->', (await rec.tab.eval(`document.getElementById('asp-component-card').innerText`)).replace(/\n+/g, ' | '))
        await rowBtn(rec, 'asp-component-card', 'Resource path', 'Copy')
        const t = await T.waitToolbarToast(rec, 'Copied', 8000)
        log('copy ->', t)
        await sleep(2800)
      },
    },
    {
      say: 'And clicking CRXDE opens this exact JCR node directly inside CRXDE Lite in a new tab, ready for immediate node editing.',
      do: async () => {
        const before = await rec.pageIds()
        await rowBtn(rec, 'asp-component-card', 'Resource path', 'CRXDE')
        const t = await rec.follow(before, 14000, 3000)
        log('CRXDE node ->', t.url)
        await sleep(4200)
        await rec.back()
        await rec.resync()
        await rec.click('#asp-component-card .asp-icon-btn', 700)
      },
    },

    // ---- highlighting -----------------------------------------------------------------------------
    {
      say: 'Highlight components outlines every component on the page with a dashed border and its component name. Because it renders on an isolated overlay layer, it causes zero layout shift. Toggle it off just as easily.',
      do: async () => {
        await more(rec, 'Highlight components')
        await sleep(5200)
        await more(rec, 'Highlight components')
        await sleep(1800)
      },
    },

    // ---- DAM asset inspector ----------------------------------------------------------------------
    {
      say: 'The asset inspector provides the same inspection for images and media. Choose Inspect an image or asset from the More menu, and click the hero photo.',
      do: async () => {
        await more(rec, 'Inspect an image')
        await sleep(1200)
        await rec.moveTo(700, 560, 1000)
        await sleep(1500)
        await rec.clickHere()
        await waitText(rec, 'asp-asset-card', 'MIME Type', 20000)
        await sleep(1500)
      },
    },
    {
      say: 'Orbit resolves the DAM asset behind the component, displaying its repository path, publication status, MIME type, pixel dimensions, and byte size. Open jumps directly into the AEM DAM asset editor.',
      do: async () => {
        log('asset card ->', (await rec.tab.eval(`document.getElementById('asp-asset-card').innerText`)).replace(/\n+/g, ' | ').slice(0, 260))
        await sleep(3600)
        const before = await rec.pageIds()
        await rowBtn(rec, 'asp-asset-card', 'Asset Editor', 'Open')
        const t = await rec.follow(before, 14000, 3000)
        log('asset editor ->', t.url)
        await sleep(3600)
        await rec.back()
        await rec.resync()
        await rec.click('#asp-asset-card .asp-icon-btn', 700)
      },
    },

    // ---- Content Fragment inspector ---------------------------------------------------------------
    {
      say: 'The inspector also natively understands Content Fragments. Here is an adventure fragment open in the fragment editor. From the More menu, select Asset or Content Fragment details.',
      do: async () => {
        await rec.goto(CF_EDITOR, 5200)
        await T.expand(rec)
        await sleep(800)
        await more(rec, 'Asset / Content Fragment details')
        await waitText(rec, 'asp-asset-card', 'Headless JSON', 25000)
        await sleep(1500)
      },
    },
    {
      say: 'The card identifies it as a Content Fragment, displaying its underlying Content Fragment model, adventure, along with its variations. Clicking Headless JSON opens the live assets API endpoint, showing the exact JSON payload delivered to headless front-end applications.',
      do: async () => {
        log('cf card ->', (await rec.tab.eval(`document.getElementById('asp-asset-card').innerText`)).replace(/\n+/g, ' | ').slice(0, 300))
        await sleep(4200)
        const before = await rec.pageIds()
        await rowBtn(rec, 'asp-asset-card', 'Headless JSON', 'Open')
        const t = await rec.follow(before, 14000, 3000)
        log('headless json ->', t.url)
        await sleep(4200)
        await rec.back()
        await rec.resync()
        await rec.goto(DEV, 4200)
      },
    },

    // ---- developer links --------------------------------------------------------------------------
    {
      say: 'The Developer links menu gathers essential consoles into one place. Open in CRXDE Lite navigates directly to this page in the repository browser.',
      do: async () => {
        await devItem(rec, 'Open in CRXDE Lite', { dwell: 3000, tab: true, watch: 4200 })
      },
    },
    {
      say: 'Open CRX Package Manager jumps straight to the package management console on this AEM instance.',
      do: async () => {
        await devItem(rec, 'Open CRX Package Manager', { tab: true, watch: 3600 })
      },
    },
    {
      say: 'Sling Model JSON exposes the component model export, while JCR content JSON, infinity dot json, provides a complete dump of the page content tree.',
      do: async () => {
        await devItem(rec, 'Sling Model JSON', { tab: true, watch: 3200 })
        await devItem(rec, 'JCR content JSON', { tab: true, watch: 3200 })
      },
    },
    {
      say: 'Debug client libraries reloads the page with CSS and JavaScript served un-minified and un-concatenated, making client-side debugging straightforward.',
      do: async () => {
        await devItem(rec, 'Debug client libraries', { tab: true, watch: 3600 })
      },
    },
    {
      say: 'Layout debug appends layout parameters to inspect responsive grid behavior. And Clear debug params removes all debug queries in one click, restoring the clean URL.',
      do: async () => {
        await devItem(rec, 'Layout debug')
        await sleep(5200)
        log('layout url ->', await rec.tab.eval('location.href'))
        await T.expand(rec)
        await sleep(1200)
        await devItem(rec, 'Clear debug')
        await sleep(5200)
        log('clear url ->', await rec.tab.eval('location.href'))
      },
    },

    // ---- hard reload ------------------------------------------------------------------------------
    {
      say: 'Hard reload bypasses the browser cache completely via background service worker tab reload, guaranteeing that you receive fresh origin responses.',
      do: async () => {
        await T.expand(rec)
        await rec.tab.eval('window.__beforeReload = 1')
        await more(rec, 'Hard reload')
        await sleep(5200)
        log('page was reloaded ->', (await rec.tab.eval('window.__beforeReload ?? "yes"')) === 'yes')
      },
    },

    // ---- cache headers (CDN) ----------------------------------------------------------------------
    {
      say: 'On the public website, the cache headers inspector analyzes Dispatcher and CDN edge caching. Here is the live page served through the proxy cache.',
      do: async () => {
        await fetch('http://127.0.0.1:8480/dispatcher/invalidate.cache', { headers: { 'CQ-Handle': PAGE } }).catch(() => {})
        await rec.goto(CDN, 4200)
        await T.expand(rec)
        await sleep(800)
        await devItem(rec, 'Cache & dispatcher')
        await waitText(rec, 'asp-cache-panel', 'HTTP 200')
        log('cache panel 1 ->', (await rec.tab.eval(`document.getElementById('asp-cache-panel').innerText`)).replace(/\n+/g, ' | ').slice(0, 200))
        await sleep(2500)
      },
    },
    {
      say: 'A single line provides the verdict, confirming a cache HIT with its age. Below it are the full edge headers: Age, Cache-Control, Via, and CDN headers.',
      do: async () => {
        await sleep(6500)
      },
    },
    {
      say: 'Bypass cache appends a unique cache-busting query, forcing the CDN to fetch fresh from origin. The inspector immediately reports a cache MISS.',
      do: async () => {
        await devItem(rec, 'Bypass cache')
        await sleep(5200)
        await T.expand(rec)
        await devItem(rec, 'Cache & dispatcher')
        await waitText(rec, 'asp-cache-panel', 'HTTP 200')
        log('cache panel 2 ->', (await rec.tab.eval(`document.getElementById('asp-cache-panel').innerText`)).replace(/\n+/g, ' | ').slice(0, 200))
        await sleep(5200)
      },
    },

    // ---- editor overlays --------------------------------------------------------------------------
    {
      say: 'Finally, the page editor itself. In Touch UI, every component renders selection overlays that light up as you hover.',
      do: async () => {
        await rec.goto(EDITOR, 9500)
        await T.expand(rec)
        await rec.moveTo(900, 330, 1000)
        await sleep(900)
        await rec.moveTo(900, 560, 1000)
        await sleep(1800)
      },
    },
    {
      say: 'Show or hide overlays strips those frames and borders, allowing you to preview the page exactly as a visitor sees it without leaving the editor. Toggle it again to restore authoring mode.',
      do: async () => {
        await more(rec, 'Show / hide overlays')
        const t = await T.waitToolbarToast(rec, 'Overlays', 8000)
        log('overlays ->', t)
        await rec.moveTo(1000, 640, 900)
        await sleep(3600)
        await more(rec, 'Show / hide overlays')
        const t2 = await T.waitToolbarToast(rec, 'shown', 8000)
        log('overlays ->', t2)
        await rec.moveTo(900, 520, 900)
        await sleep(2600)
      },
    },
    {
      say: 'That is AEM Orbit’s developer suite: live repository trees, component and DAM inspectors, headless endpoints, developer links, cache analytics, and Touch UI overlay control.',
      do: async () => {
        await rec.moveTo(1250, 500, 800)
        await sleep(1500)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
