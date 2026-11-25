// Chapter 5 (v4) - Guardrailed Cross-Environment Content Sync, Diff, Backups & Undo.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/ch5-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/05-sync.mjs
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
    const items = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
    const q = ${JSON.stringify(text.toLowerCase())}
    const byTitle = items.find((b) => (b.querySelector('.asp-menu-title')?.textContent || '').trim().toLowerCase().includes(q))
    const it = byTitle || items.find((b) => b.textContent.trim().toLowerCase().includes(q))
    if (!it) return null
    it.scrollIntoView({ block: 'center', behavior: 'instant' })
    const qRect = it.getBoundingClientRect()
    return qRect.width ? { cx: qRect.x + qRect.width / 2, cy: qRect.y + qRect.height / 2 } : null
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

await runChapter('05-sync-v4', {
  url: DEV_URL,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 5: guardrailed cross-environment content sync. Copy pages cleanly between environments without exporting packages or editing JCR XML.',
      do: async () => {
        await rec.title('Chapter 5 · Content <b>sync</b>', 'Safe downstream push &amp; pull, pre-sync diff, version checkpoints, and instant undo')
        await sleep(3500)
        await rec.untitle()
        await T.expand(rec)
        const btn = await rec.rectOf('#asp-sync-btn')
        if (btn) await rec.moveTo(btn.cx, btn.cy, 900)
        await sleep(1200)
      },
    },
    {
      say: 'The Sync menu enforces directional safety automatically. On Dev, you can pull from Stage or Prod, or push downstream to Local, while upward pushes stay gated behind explicit configuration.',
      do: async () => {
        await rec.click('#asp-sync-btn', 800)
        await rec.waitFor('#asp-menu .asp-menu-item', 10000)
        await sleep(600)
        await hoverSyncItem(rec, 'pull from stage', 800)
        await hoverSyncItem(rec, 'pull from prod', 800)
        await hoverSyncItem(rec, 'push to local', 1100)
        await sleep(1000)
      },
    },
    {
      say: 'Choose Push to Local. Orbit previews up to six exact property changes before writing, and creates a timestamped version checkpoint automatically so previous content is never lost.',
      do: async () => {
        await clickSyncItem(rec, 'push to local')
        const d = await T.waitDialog(rec, 15000)
        log('dialog ->', d.title, '|', d.msg.replace(/\n+/g, ' ').slice(0, 180))
        await sleep(5000)
      },
    },
    {
      say: 'Confirming executes the content import via Sling and returns a toast with one-click Undo. Clicking Undo rolls Local cleanly back using the local snapshot or repository version checkpoint.',
      do: async () => {
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitToolbarToast(rec, 'Page copied', 15000)
        const b = await toastBtnRect(rec, 'Undo', 8000)
        await rec.moveTo(b.cx, b.cy, 700)
        await sleep(2200)
        await rec.clickHere()
        await T.waitToolbarToast(rec, 'restored', 15000)
        await sleep(3000)
      },
    },
    {
      say: 'Sync also handles missing pages seamlessly. On Local, the expedition article initially returns a 404. Visiting the live production domain on www.wknd.com lets us push the missing page straight down to Local, creating its hierarchy and restoring the full page inside local Touch UI in seconds.',
      do: async () => {
        await rec.goto(EXPEDITION_LOC, 4500)
        await rec.moveTo(750, 380, 900)
        await sleep(1800)
        await rec.goto(EXPEDITION_CDN, 5000)
        await T.expand(rec)
        await rec.click('#asp-sync-btn', 800)
        await rec.waitFor('#asp-menu .asp-menu-item', 10000)
        await clickSyncItem(rec, 'push to local')
        await T.waitDialog(rec, 15000)
        await sleep(3600)
        await T.dialogConfirm(rec)
        await T.dialogGone(rec)
        await T.waitToolbarToast(rec, 'created', 15000)
        await sleep(2000)
        await rec.goto(EXPEDITION_LOC_EDIT, 5500)
        await T.expand(rec)
        await rec.moveTo(700, 320, 900)
        await sleep(2800)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
