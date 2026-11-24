// Chapter 5 (v2) - Enhanced Cross-Environment Content Sync with Christopher Neural voiceover and jointed acronyms.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch5-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/05-sync-v2.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const log = (...a) => console.log(' ', ...a)

const SYNC_PAGE = '/content/wknd/us/en/orbit-demo/sync-demo.html?wcmmode=edit'
const DEV_URL = `${AUTHOR.dev}${SYNC_PAGE}`

const EXPEDITION_CDN = 'https://www.wknd.com/expedition'
const EXPEDITION_LOC = `${AUTHOR.local}/content/wknd/us/en/expedition.html`
const EXPEDITION_LOC_EDIT = `${AUTHOR.local}/content/wknd/us/en/expedition.html?wcmmode=edit`

async function syncItemRect(rec, text) {
  return rec.tab.eval(`(() => {
    const it = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
      .find((b) => b.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
    if (!it) return null
    const q = it.getBoundingClientRect()
    return q.width ? { cx: q.x + q.width / 2, cy: q.y + q.height / 2 } : null
  })()`)
}

async function hoverSyncItem(rec, text, dwell = 600) {
  const r = await syncItemRect(rec, text)
  if (!r) throw new Error(`menu item not found for hover: ${text}`)
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(dwell)
}

async function clickSyncItem(rec, text) {
  const r = await syncItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 700)
  await sleep(300)
  await rec.clickHere()
}

async function toastBtnRect(rec, text, timeout = 12000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const r = await rec.tab.eval(`(() => {
      const b = [...document.querySelectorAll('#asp-toast .asp-toast-btn')]
        .find((x) => x.textContent.trim() === ${JSON.stringify(text)})
      if (!b) return null
      const q = b.getBoundingClientRect()
      return q.width ? { cx: q.x + q.width / 2, cy: q.y + q.height / 2 } : null
    })()`)
    if (r) return r
    await sleep(150)
  }
  throw new Error(`toast button not found: ${text}`)
}

await runChapter('05-sync-v2', {
  url: DEV_URL,
  steps: (rec) => [
    // ---- 1. intro & title ------------------------------------------------------------------------
    {
      say: 'Chapter five: cross-environment content sync. Moving content between environments usually means exporting packages, downloading files, or copying JCR nodes by hand. Orbit brings content sync right onto the page.',
      do: async () => {
        rec.tab.ws.addEventListener('close', () => console.log('  !! recording tab socket closed'))
        await rec.title('Chapter 5 · Content <b>sync</b>', 'Cross-environment push &amp; pull, safe directionality, pre-sync property diff, version backups, and instant undo')
        await T.expand(rec)
        const btn = await rec.rectOf('#asp-sync-btn')
        if (btn) await rec.moveTo(btn.cx, btn.cy, 1000)
        await sleep(1500)
      },
    },

    // ---- 2. safe directionality (on Dev) ---------------------------------------------------------
    {
      say: 'The Sync button on the toolbar opens the sync menu. Notice the direction: by default, content only flows downstream, from higher environments to lower ones. On Dev, you can pull from Stage or Prod, or push down to Local. Copying upward is locked to protect higher tiers, unless you enable the safety override.',
      do: async () => {
        await rec.click('#asp-sync-btn', 800)
        await rec.waitFor('#asp-menu .asp-menu-item', 10000)
        await sleep(600)
        const items = await rec.tab.eval(`[...document.querySelectorAll('#asp-menu .asp-menu-item')].map((e) => e.innerText.trim()).join(' | ')`)
        log('sync menu dev ->', items)
        await hoverSyncItem(rec, 'pull from stage', 800)
        await hoverSyncItem(rec, 'pull from prod', 800)
        await hoverSyncItem(rec, 'push to local', 1200)
        await sleep(1200)
      },
    },

    // ---- 3. pre-sync property diff & automatic version backup -----------------------------------
    {
      say: 'Choose Push to Local. Before anything is modified, Orbit runs a pre-sync property diff. It inspects the target page and lists up to six exact property changes: added, removed, or changed values. And notice the safety promise: Orbit saves the current target page as an AEM version before writing.',
      do: async () => {
        await clickSyncItem(rec, 'push to local')
        const d = await T.waitDialog(rec, 15000)
        log('dialog ->', d.title, '|', d.msg.replace(/\n+/g, ' ').slice(0, 200))
        await sleep(5500)
      },
    },

    // ---- 4. sync execution & toast with undo -----------------------------------------------------
    {
      say: 'Confirm the copy. Orbit imports the page content through the Sling post servlet. The success toast confirms the page was copied and the previous content was saved, complete with an instant Undo button.',
      do: async () => {
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'Page copied', 15000)
        log('sync toast ->', t)
        const b = await toastBtnRect(rec, 'Undo', 8000)
        await rec.moveTo(b.cx, b.cy, 800)
        await sleep(2500)
      },
    },

    // ---- 5. instant undo (multi-tier rollback) ---------------------------------------------------
    {
      say: 'Click Undo. In one click, the local snapshot restores the page to exactly how it was before the sync. Even if you close the tab, the automatic AEM version backup remains in repository version history as a multi-tier safety net.',
      do: async () => {
        await rec.clickHere()
        const t = await T.waitToolbarToast(rec, 'restored', 15000)
        log('undo toast ->', t)
        await sleep(3500)
      },
    },

    // ---- 6. pre-stage on Local (non-existing page / 404) -----------------------------------------
    {
      say: 'Now, what if a page exists on Production, but does not exist at all in your local development environment? Here on Local, opening the expedition story returns a 404 error: the page does not exist yet.',
      do: async () => {
        await rec.goto(EXPEDITION_LOC, 5000)
        await rec.moveTo(600, 320, 1000)
        await sleep(1500)
        await rec.moveTo(850, 450, 1000)
        await sleep(2000)
      },
    },

    // ---- 7. live production domain (www.wknd.com) & mapping --------------------------------------
    {
      say: 'Here is that same story live on the public production site, www.wknd.com. Notice the Orbit toolbar identifies the production environment and maps the clean public URL straight back to its JCR path.',
      do: async () => {
        await rec.goto(EXPEDITION_CDN, 5500)
        await T.expand(rec)
        await rec.moveTo(700, 360, 1000)
        await sleep(1200)
        await rec.moveTo(700, 520, 1000)
        await sleep(1800)
      },
    },

    // ---- 8. push missing page from Prod domain to Local ------------------------------------------
    {
      say: 'Open the Sync menu on Prod. Because Prod is the top tier, you can push down to any lower environment: Stage, Dev, or Local. Choose Push to Local. Orbit detects that the page is completely missing on Local, and offers to create the page skeleton and copy the content directly.',
      do: async () => {
        await rec.click('#asp-sync-btn', 800)
        await rec.waitFor('#asp-menu .asp-menu-item', 10000)
        await sleep(600)
        const items = await rec.tab.eval(`[...document.querySelectorAll('#asp-menu .asp-menu-item')].map((e) => e.innerText.trim()).join(' | ')`)
        log('sync menu prod cdn ->', items)
        await clickSyncItem(rec, 'push to local')
        const d = await T.waitDialog(rec, 15000)
        log('dialog prod cdn ->', d.title, '|', d.msg.replace(/\n+/g, ' ').slice(0, 200))
        await sleep(4500)
      },
    },

    // ---- 9. confirm copy & toast (created) -------------------------------------------------------
    {
      say: 'Confirm the copy. Orbit creates the page node and imports the content. The toast confirms the page was copied and created on Local.',
      do: async () => {
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        const t = await T.waitToolbarToast(rec, 'created', 15000)
        log('created toast ->', t)
        await sleep(2500)
      },
    },

    // ---- 10. post-stage result on Local ----------------------------------------------------------
    {
      say: 'Now switch back to Local. Where there was once a 404, the Himalayan Expedition page is now live in your local editor, with its complete content tree and draft status, ready for development.',
      do: async () => {
        await rec.goto(EXPEDITION_LOC_EDIT, 6000)
        await T.expand(rec)
        await rec.moveTo(700, 280, 1000)
        await sleep(1200)
        await rec.moveTo(700, 480, 1000)
        await sleep(3000)
      },
    },

    // ---- 11. wrap-up -----------------------------------------------------------------------------
    {
      say: 'From property-level diffs on existing pages to cloning brand-new pages straight from the live production CDN: that is AEM Orbit’s cross-environment content sync.',
      do: async () => {
        const b = await rec.rectOf('#asp-sync-btn')
        if (b) await rec.moveTo(b.cx, b.cy, 800)
        await sleep(2500)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
