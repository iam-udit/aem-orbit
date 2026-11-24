// Chapter 4 - Developer tools & in-page inspectors.
// Read-only chapter: it changes no content. Needs the proxy (8443), Dev/Stage/Prod authors and the CDN simulation up.
// Run: python3 video/scripts/detach.py /tmp/ch4.log node video/chapters/04-devtools.mjs
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
  await T.openMenu(rec, '#asp-more-btn')
  await sleep(500)
  await T.clickMenuItem(rec, item)
}

/** More -> Developer links -> entry; for entries that open a new tab, follow it, show the address and come back. */
async function devItem(rec, item, { dwell = 0, tab = false, watch = 3200 } = {}) {
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

await runChapter('04-devtools', {
  url: DEV,
  steps: (rec) => [
    // ---- JCR tree inspector -----------------------------------------------------------------------
    { say: 'Chapter four: developer tools. Everything a developer would open in another tab is one click away, on the page itself. First, the J C R inspector. It reads the content node of this page and shows it as a tree, properties first, then the child nodes, each with its type.',
      do: async () => { rec.tab.ws.addEventListener('close', () => console.log('  !! recording tab socket closed')); await rec.title('Chapter 4 · <b>Developer tools</b> &amp; inspectors', 'JCR tree, component and asset inspectors, overlays, deep links, cache headers, hard reload'); await openJcr(rec); await sleep(2500) } },
    { say: 'The filter searches names and values as you type, and opens the branches that match. Typing teaser main leaves exactly that component, with its title and its image.',
      do: async () => { await filterJcr(rec, 'teaser_main'); await sleep(2800) } },
    { say: 'Environment comparison starts with the same panel on another environment. I switch this page to Stage, open the inspector, and filter the same way. Same page, same component, and the Stage teaser tells a different story.',
      do: async () => { await rec.click('#asp-env-chip', 800); await rec.click('.asp-env-pick-btn[data-env="stage"]', 800); await sleep(5200); await openJcr(rec); await filterJcr(rec, 'teaser_main'); await sleep(3600) } },
    { say: 'For a full comparison, the popup does the work. It reads the page on every environment, and tells you which ones are in sync and which differ.',
      do: async () => { await rec.goto(DEV, 3800); globalThis.__pop = await openPopup(rec); await sleep(1500)
        await rec.click('#compareBtn', 800); await rec.waitFor('#panelContent .list-row', 40000); log('compare ->', (await rec.tab.eval(`document.getElementById('panelContent').innerText`)).replace(/\n+/g, ' | ')); await sleep(3500) } },
    { say: 'Show diff lists every property that differs, from one environment to the other, with the old and the new value.',
      do: async () => { await rec.tab.eval(`document.querySelector('#panelContent [data-diff="stage"]').scrollIntoView({ block: 'center', behavior: 'smooth' })`); await sleep(900); await rec.click('#panelContent [data-diff="stage"]', 800); await waitText(rec, 'panelContent', 'jcr:content', 30000); log('diff ->', (await rec.tab.eval(`document.getElementById('panelContent').innerText`)).replace(/\n+/g, ' | ').slice(0, 220)); await sleep(6500) } },

    // ---- component inspector ----------------------------------------------------------------------
    { say: 'Back on the page, the component inspector. Switch it on, move over the page, and every component is outlined as you reach it. Click the title.',
      do: async () => { await globalThis.__pop.close(); await T.expand(rec); await rec.click('#asp-inspect-btn', 800); await sleep(900); await rec.moveTo(700, 560, 1100); await sleep(900); await rec.moveTo(700, 255, 900); await sleep(1000); await rec.clickHere(); await waitText(rec, 'asp-component-card', 'Resource path'); await sleep(1500) } },
    { say: 'The card shows the resource type of the component, its exact path in the repository, and the page template. Copy puts any of them on the clipboard.',
      do: async () => { log('component card ->', (await rec.tab.eval(`document.getElementById('asp-component-card').innerText`)).replace(/\n+/g, ' | ')); await rowBtn(rec, 'asp-component-card', 'Resource path', 'Copy'); const t = await T.waitToolbarToast(rec, 'Copied', 8000); log('copy ->', t); await sleep(2800) } },
    { say: 'And C R X D E opens this very node in C R X D E Lite, ready to edit.',
      do: async () => { const before = await rec.pageIds(); await rowBtn(rec, 'asp-component-card', 'Resource path', 'CRXDE'); const t = await rec.follow(before, 14000, 3000); log('CRXDE node ->', t.url); await sleep(4200); await rec.back(); await rec.resync(); await rec.click('#asp-component-card .asp-icon-btn', 700) } },

    // ---- highlighting -----------------------------------------------------------------------------
    { say: 'Highlight components outlines every component on the page with a dashed border and its name. It draws on a separate layer, so the layout of the page does not move by a single pixel. Switch it off in the same way.',
      do: async () => { await more(rec, 'Highlight components'); await sleep(5200); await more(rec, 'Highlight components'); await sleep(1800) } },

    // ---- DAM asset inspector ----------------------------------------------------------------------
    { say: 'The asset inspector does the same for images. Choose Inspect an image or asset, hover the picture, and click.',
      do: async () => { await more(rec, 'Inspect an image'); await sleep(1200); await rec.moveTo(700, 560, 1000); await sleep(1500); await rec.clickHere(); await waitText(rec, 'asp-asset-card', 'MIME Type', 20000); await sleep(1500) } },
    { say: 'Orbit finds the D A M asset behind it and shows its path, its publish status, the file type, the size in pixels, and the file size. Open takes you straight to the asset in A E M.',
      do: async () => { log('asset card ->', (await rec.tab.eval(`document.getElementById('asp-asset-card').innerText`)).replace(/\n+/g, ' | ').slice(0, 260)); await sleep(3600)
        const before = await rec.pageIds(); await rowBtn(rec, 'asp-asset-card', 'Asset Editor', 'Open'); const t = await rec.follow(before, 14000, 3000); log('asset editor ->', t.url); await sleep(3600); await rec.back(); await rec.resync(); await rec.click('#asp-asset-card .asp-icon-btn', 700) } },

    // ---- Content Fragment inspector (added after the first render; needs a re-record, see HANDOFF) -----
    { say: 'The same card understands Content Fragments. Here is an adventure fragment open in the fragment editor. From the More menu, choose Asset or Content Fragment details.',
      do: async () => { await rec.goto(CF_EDITOR, 5200); await T.expand(rec); await sleep(800); await more(rec, 'Content Fragment details'); await waitText(rec, 'asp-asset-card', 'Headless JSON', 25000); await sleep(1500) } },
    { say: 'The title now says Content Fragment. Besides the path and the publish status, it shows the model the fragment is built on, here adventure, and its variations. Headless J S O N opens the fragment through the assets A P I, exactly what a headless front end would receive.',
      do: async () => { log('cf card ->', (await rec.tab.eval(`document.getElementById('asp-asset-card').innerText`)).replace(/\n+/g, ' | ').slice(0, 300)); await sleep(4200)
        const before = await rec.pageIds(); await rowBtn(rec, 'asp-asset-card', 'Headless JSON', 'Open'); const t = await rec.follow(before, 14000, 3000); log('headless json ->', t.url); await sleep(4200); await rec.back(); await rec.resync()
        await rec.goto(DEV, 4200) } },

    // ---- developer links --------------------------------------------------------------------------
    { say: 'The developer links collect everything else in one menu. Open in C R X D E Lite jumps to this page in the repository browser.',
      do: async () => { await devItem(rec, 'Open in CRXDE Lite', { dwell: 3000, tab: true, watch: 4200 }) } },
    { say: 'Open C R X package manager goes to the package console of this A E M instance.',
      do: async () => { await devItem(rec, 'Open CRX Package Manager', { tab: true, watch: 3600 }) } },
    { say: 'Sling Model J S O N shows what the page exports to a front end, and the J C R content J S O N, called infinity, dumps the whole content tree of the page.',
      do: async () => { await devItem(rec, 'Sling Model JSON', { tab: true, watch: 3200 }); await devItem(rec, 'JCR content JSON', { tab: true, watch: 3200 }) } },
    { say: 'Debug client libraries reloads the page with the style and script libraries served un-minified and un-concatenated, so you can read them in the browser.',
      do: async () => { await devItem(rec, 'Debug client libraries', { tab: true, watch: 3600 }) } },
    { say: 'Layout debug adds the layout parameter to this page, which is useful on the Author instance. And Clear debug params removes every debug parameter again, in one click.',
      do: async () => { await devItem(rec, 'Layout debug'); await sleep(5200); log('layout url ->', await rec.tab.eval('location.href')); await T.expand(rec); await sleep(1200); await devItem(rec, 'Clear debug'); await sleep(5200); log('clear url ->', await rec.tab.eval('location.href')) } },

    // ---- hard reload ------------------------------------------------------------------------------
    { say: 'Hard reload bypasses the browser cache completely. The extension asks the browser to reload this tab, so you always see what the server sends right now.',
      do: async () => { await T.expand(rec); await rec.tab.eval('window.__beforeReload = 1'); await more(rec, 'Hard reload'); await sleep(5200); log('page was reloaded ->', (await rec.tab.eval('window.__beforeReload ?? "yes"')) === 'yes') } },

    // ---- cache headers (CDN) ----------------------------------------------------------------------
    { say: 'On the public site, the cache headers inspector shows what the Dispatcher or the C D N is doing. Here is the live page, served through the cache.',
      do: async () => { await fetch('http://127.0.0.1:8480/dispatcher/invalidate.cache', { headers: { 'CQ-Handle': PAGE } }).catch(() => {}); await rec.goto(CDN, 4200); await T.expand(rec); await sleep(800)
        await devItem(rec, 'Cache & dispatcher'); await waitText(rec, 'asp-cache-panel', 'HTTP 200'); log('cache panel 1 ->', (await rec.tab.eval(`document.getElementById('asp-cache-panel').innerText`)).replace(/\n+/g, ' | ').slice(0, 200)); await sleep(2500) } },
    { say: 'One line gives the verdict, here that the page came from the cache, with its age. Below it are the headers behind it: age, cache control, via, and the edge headers.',
      do: async () => { await sleep(6500) } },
    { say: 'Bypass cache adds a unique query string, so the C D N has to fetch a fresh copy. And the inspector now reports a cache miss, fetched from the origin.',
      do: async () => { await devItem(rec, 'Bypass cache'); await sleep(5200); await T.expand(rec); await devItem(rec, 'Cache & dispatcher'); await waitText(rec, 'asp-cache-panel', 'HTTP 200'); log('cache panel 2 ->', (await rec.tab.eval(`document.getElementById('asp-cache-panel').innerText`)).replace(/\n+/g, ' | ').slice(0, 200)); await sleep(5200) } },

    // ---- editor overlays --------------------------------------------------------------------------
    { say: 'Last, the editor itself. In the page editor, every component has an overlay for selecting and editing it, and you can see it light up as I move over the page.',
      do: async () => { await rec.goto(EDITOR, 9500); await T.expand(rec); await rec.moveTo(900, 330, 1000); await sleep(900); await rec.moveTo(900, 560, 1000); await sleep(1800) } },
    { say: 'Show or hide overlays removes those frames and borders, so you can see the page exactly as a visitor does, while you are still in the editor. The same command brings them back.',
      do: async () => { await more(rec, 'Show / hide overlays'); const t = await T.waitToolbarToast(rec, 'Overlays', 8000); log('overlays ->', t); await rec.moveTo(1000, 640, 900); await sleep(3600); await more(rec, 'Show / hide overlays'); const t2 = await T.waitToolbarToast(rec, 'shown', 8000); log('overlays ->', t2); await rec.moveTo(900, 520, 900); await sleep(2600) } },
    { say: 'That is the developer toolbox: the repository, the component, the asset, the links, the cache, and the editor, all without leaving the page.',
      do: async () => { await rec.moveTo(1250, 500, 800); await sleep(1500) } },
  ],
})
process.exit(process.exitCode || 0)
