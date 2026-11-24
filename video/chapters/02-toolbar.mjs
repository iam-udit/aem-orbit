// Chapter 2 - Toolbar & navigation. Run: ORBIT_ADMIN_PW=admin node video/chapters/02-toolbar.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const CONTENT = '/content/wknd/us/en'
const VIEW = '?wcmmode=disabled'
const MAGAZINE = `${AUTHOR.dev}${CONTENT}/magazine.html${VIEW}`
const EDITOR = `${AUTHOR.dev}/editor.html${CONTENT}/magazine.html`
const STATUS_DEMO = `${AUTHOR.dev}${CONTENT}/orbit-demo/status-demo.html${VIEW}`
const LIVE_COPY = `${AUTHOR.dev}/content/wknd/ca/en/magazine.html${VIEW}`
const TOAST_DEMO = `${AUTHOR.dev}${CONTENT}/orbit-demo/toast-demo.html${VIEW}`

const SHIFT = 8, META = 4 // CDP modifier bits
const here = (rec) => rec.tab.eval('location.href')

/** Make sure the Orb has opened into the full horizontal toolbar (click the logo if it has not). */
async function expand(rec) {
  await rec.waitFor('#asp-logo-btn')
  for (let i = 0; i < 3; i++) {
    const r = await rec.rectOf('#asp-tier-btn')
    if (r?.vis) return
    await rec.click('#asp-logo-btn', 800)
    await sleep(1300)
  }
  throw new Error('toolbar did not expand')
}

/** Click a toolbar button and wait for the menu it opens. */
async function openMenu(rec, selector) {
  await rec.click(selector, 800)
  await rec.waitFor('#asp-menu .asp-menu-item', 12000)
  await sleep(700)
}

async function menuItemRect(rec, text) {
  return rec.tab.eval(`(() => { const it = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
    .find((b) => b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())})); if (!it) return null
    const r = it.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } })()`)
}

async function clickMenuItem(rec, text) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 800)
  await sleep(350)
  await rec.clickHere()
}

/** Pick a menu entry that opens a new tab, follow it, show where it went, and come back. */
async function menuTab(rec, buttonSel, text, watch = 2600) {
  await openMenu(rec, buttonSel)
  const before = await rec.pageIds()
  await clickMenuItem(rec, text)
  const tab = await rec.follow(before, 9000, 2200)
  console.log(`  ${text} -> ${tab.url}`)
  await sleep(watch)
  await rec.back()
  await rec.resync()
}

/** Open the environment picker from the env chip. */
async function openPicker(rec) {
  await rec.click('#asp-env-chip', 800)
  await rec.waitFor('.asp-env-pick-btn[data-env="stage"]')
  await sleep(700)
}

/** Click with modifier keys held (real mouse events carrying the modifier bits). */
async function modClick(rec, selector, modifiers) {
  const r = await rec.waitFor(selector)
  await rec.moveTo(r.cx, r.cy, 800)
  await sleep(500)
  const { x, y } = rec.mouse
  await rec.tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers })
  await sleep(70)
  await rec.tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, modifiers })
}

async function toastBtnRect(rec, text, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const r = await rec.tab.eval(`(() => { const b = [...document.querySelectorAll('#asp-toast .asp-toast-btn')]
      .find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null
      const r = b.getBoundingClientRect(); return r.width ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null })()`)
    if (r) return r
    await sleep(150)
  }
  throw new Error(`toast button not found: ${text}`)
}

async function clickToastBtn(rec, text) {
  const r = await toastBtnRect(rec, text)
  await rec.moveTo(r.cx, r.cy, 700)
  await rec.clickHere()
}

async function togglePill(rec) { await rec.click('#asp-status-pill', 800); await sleep(1200) }

await runChapter('02-toolbar', {
  url: MAGAZINE,
  steps: (rec) => [
    // ---- pill expansion -------------------------------------------------------------------
    { say: 'The Orb is the compact face of the toolbar. One click on it, and it opens into the full horizontal toolbar.',
      do: async () => { await rec.title('Chapter 2 · The <b>toolbar</b> &amp; navigation', 'Tiers, environments, locales, page details and feedback'); await rec.hover('#asp-logo-btn', 1100); await sleep(900); await rec.click('#asp-logo-btn', 600); await sleep(1500) } },
    { say: 'From left to right: the live status of the page, the environment chip, then the tier switcher, publishing, locales, sync, the inspectors, and a menu with everything else.',
      do: async () => { await rec.hover('#asp-status-pill', 1000); await sleep(600); await rec.hover('#asp-env-chip', 600); await sleep(500); await rec.hover('#asp-tier-btn', 600); await sleep(500)
        await rec.hover('#asp-publish-menu-btn', 500); await sleep(400); await rec.hover('#asp-locales-btn', 500); await sleep(400); await rec.hover('#asp-sync-btn', 500); await sleep(400); await rec.hover('#asp-inspect-btn', 500); await sleep(400); await rec.hover('#asp-more-btn', 500); await sleep(800) } },

    // ---- tier switcher --------------------------------------------------------------------
    { say: 'The tier switcher shows how you are looking at the page right now, here View, and lets you move across Edit, View, Preview, Published and Live for the same page.',
      do: async () => { await openMenu(rec, '#asp-tier-btn'); await sleep(2200) } },
    { say: 'Choose Preview, and the same page opens on the Cloud Preview tier.',
      do: async () => { const before = await rec.pageIds(); await clickMenuItem(rec, 'Preview'); const tab = await rec.follow(before, 9000, 2200); console.log(`  Preview -> ${tab.url}`); await sleep(2400); await rec.back(); await rec.resync() } },
    { say: 'Published takes you to the Publish tier.',
      do: async () => { await menuTab(rec, '#asp-tier-btn', 'Published', 2400) } },
    { say: 'And Live opens the public address, through the C D N, with the URL mapping rules applied.',
      do: async () => { await menuTab(rec, '#asp-tier-btn', 'Live', 3000) } },

    // ---- cross-environment ----------------------------------------------------------------
    { say: 'The environment chip jumps between Local, Dev, Stage and Prod, landing on the exact same page, in the same tier.',
      do: async () => { await openPicker(rec); await sleep(1500) } },
    { say: 'Pick Stage, and you are on the Stage author, still in View.',
      do: async () => { await rec.click('.asp-env-pick-btn[data-env="stage"]', 800); await sleep(2800); console.log(`  stage -> ${await here(rec)}`); await sleep(2200); await rec.resync() } },
    { say: 'And now Local, the instance running on this machine.',
      do: async () => { await expand(rec); await openPicker(rec); await rec.click('.asp-env-pick-btn[data-env="local"]', 800); await sleep(2800); console.log(`  local -> ${await here(rec)}`); await sleep(2000); await rec.resync() } },
    { say: 'Hold Shift while you click, and nothing navigates. The toolbar simply retargets its actions at that environment, without leaving the tab. Here the actions now point at Prod, and the chip and status follow.',
      do: async () => { await expand(rec); await openPicker(rec); await rec.tag('⇧ Shift + Click'); await modClick(rec, '.asp-env-pick-btn[data-env="prod"]', SHIFT); await sleep(3600); console.log(`  shift-click prod -> still ${await here(rec)}`); await rec.tag('') } },
    { say: 'Hold Command on a Mac, or Control on Windows, and the target environment opens in a new tab instead. Here, Dev.',
      do: async () => { await openPicker(rec); await rec.tag('⌘ Cmd / Ctrl + Click'); const before = await rec.pageIds(); await modClick(rec, '.asp-env-pick-btn[data-env="dev"]', META)
        const tab = await rec.follow(before, 9000, 2200); await rec.tag(''); console.log(`  cmd-click dev -> ${tab.url}`); await sleep(3000); await rec.back(); await rec.resync() } },

    // ---- MSM / locales --------------------------------------------------------------------
    { say: 'Back on Dev. The Locales menu discovers the Multi Site Manager setup of this site by itself: the language master, and every live copy of the page.',
      do: async () => { await rec.goto(MAGAZINE, 3800); await expand(rec); await openMenu(rec, '#asp-locales-btn'); await sleep(2800) } },
    { say: 'Locales keep the view you are in. I am in View, so switching to the Canadian live copy keeps the editing chrome off.',
      do: async () => { await clickMenuItem(rec, 'CA / EN'); await sleep(3200); console.log(`  locales view -> ${await here(rec)}`); await sleep(2400); await rec.resync() } },
    { say: 'The same holds in the editor. Open the page in Edit, choose the language master, and you stay in the editor.',
      do: async () => { await rec.goto(EDITOR, 7500); await expand(rec); await openMenu(rec, '#asp-locales-btn'); await sleep(1200)
        await clickMenuItem(rec, 'Switch to Language Master'); await sleep(7000); console.log(`  locales edit -> ${await here(rec)}`); await sleep(2200); await rec.resync() } },

    // ---- status badge + details panel -----------------------------------------------------
    { say: 'The status pill tells you whether a page is Published, Draft or Modified. Click it, and the page details panel opens: when it was last changed and by whom, when it was last published, and the state of the Preview tier.',
      do: async () => { await rec.goto(MAGAZINE, 3800); await expand(rec); await togglePill(rec); await sleep(5200); await togglePill(rec) } },
    { say: 'It also shows who has the page locked, and when it is scheduled to go live and to go offline.',
      do: async () => { await rec.goto(STATUS_DEMO, 3800); await expand(rec); await togglePill(rec); await sleep(6200); await togglePill(rec) } },
    { say: 'And for a Multi Site Manager live copy, it tells you that this page follows another page.',
      do: async () => { await rec.goto(LIVE_COPY, 3800); await expand(rec); await togglePill(rec); await sleep(5200); await togglePill(rec) } },

    // ---- toasts ---------------------------------------------------------------------------
    { say: 'Every action answers with a toast, and the toast carries the next step. Let me publish a new page from the Publish menu.',
      do: async () => { await rec.goto(TOAST_DEMO, 3800); await expand(rec); await openMenu(rec, '#asp-publish-menu-btn'); await sleep(1500); await clickMenuItem(rec, 'Publish page'); await rec.waitFor('#asp-toast.asp-toast-show', 8000); await sleep(1500) } },
    { say: 'Once it is published, the toast offers View live, and, because the page was a draft before, Undo.',
      do: async () => { await toastBtnRect(rec, 'Undo'); await sleep(2800) } },
    { say: 'Undo unpublishes it again, and the new toast offers Publish again.',
      do: async () => { await clickToastBtn(rec, 'Undo'); await toastBtnRect(rec, 'Publish again'); await sleep(2400) } },
    { say: 'Publish again, and this time, View live opens the page on the Publish tier.',
      do: async () => { await clickToastBtn(rec, 'Publish again'); await toastBtnRect(rec, 'View live'); await sleep(900)
        const before = await rec.pageIds(); await clickToastBtn(rec, 'View live'); const tab = await rec.follow(before, 9000, 2200); console.log(`  View live -> ${tab.url}`); await sleep(3000); await rec.back(); await rec.resync() } },
    { hold: 0.5, do: async () => { await rec.moveTo(1250, 520, 800) } },
  ],
})
process.exit(process.exitCode || 0)
