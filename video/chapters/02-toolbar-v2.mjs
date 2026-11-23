// Chapter 2 (v2) - Enhanced Toolbar & Navigation with Christopher Neural voiceover and jointed acronyms.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/02-toolbar-v2.mjs
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
async function menuTab(rec, buttonSel, text, watch = 2800) {
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

async function togglePill(rec) {
  await rec.click('#asp-status-pill', 800)
  await sleep(1200)
}

await runChapter('02-toolbar-v2', {
  url: MAGAZINE,
  steps: (rec) => [
    // ---- pill expansion -------------------------------------------------------------------
    {
      say: 'The Orb is the compact face of the toolbar. Clicking it expands the interface into the full horizontal toolbar.',
      do: async () => {
        await rec.title('Chapter 2 · The <b>toolbar</b> &amp; navigation', 'Tiers, environments, locales, page details, and interactive feedback')
        await rec.hover('#asp-logo-btn', 1100)
        await sleep(900)
        await rec.click('#asp-logo-btn', 600)
        await sleep(1500)
      },
    },
    {
      say: 'From left to right: the live page publication status pill, the environment chip, the tier switcher, publishing controls, locales and MSM, content sync, developer inspectors, and the overflow menu with deep tools.',
      do: async () => {
        await rec.hover('#asp-status-pill', 1000)
        await sleep(600)
        await rec.hover('#asp-env-chip', 600)
        await sleep(500)
        await rec.hover('#asp-tier-btn', 600)
        await sleep(500)
        await rec.hover('#asp-publish-menu-btn', 500)
        await sleep(400)
        await rec.hover('#asp-locales-btn', 500)
        await sleep(400)
        await rec.hover('#asp-sync-btn', 500)
        await sleep(400)
        await rec.hover('#asp-inspect-btn', 500)
        await sleep(400)
        await rec.hover('#asp-more-btn', 500)
        await sleep(800)
      },
    },

    // ---- tier switcher --------------------------------------------------------------------
    {
      say: 'The tier switcher displays your current rendering mode, here View, and lets you transition seamlessly across Edit, View, Preview, Published, and Live for the exact same page.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        await sleep(2200)
      },
    },
    {
      say: 'Select Preview, and the page opens on the Cloud Preview tier, allowing authors to validate staged changes before wide activation.',
      do: async () => {
        const before = await rec.pageIds()
        await clickMenuItem(rec, 'Preview')
        const tab = await rec.follow(before, 9000, 2200)
        console.log(`  Preview -> ${tab.url}`)
        await sleep(2400)
        await rec.back()
        await rec.resync()
      },
    },
    {
      say: 'Published takes you directly to the Publish tier instances.',
      do: async () => {
        await menuTab(rec, '#asp-tier-btn', 'Published', 2600)
      },
    },
    {
      say: 'And Live opens the public website through the CDN, applying your domain mapping rules to show the customer-facing address.',
      do: async () => {
        await menuTab(rec, '#asp-tier-btn', 'Live', 3200)
      },
    },

    // ---- cross-environment ----------------------------------------------------------------
    {
      say: 'The environment chip jumps between Local, Dev, Stage, and Prod, maintaining the exact same page path and view mode.',
      do: async () => {
        await openPicker(rec)
        await sleep(1500)
      },
    },
    {
      say: 'Choose Stage, and you land instantly on the Stage author, still in View mode.',
      do: async () => {
        await rec.click('.asp-env-pick-btn[data-env="stage"]', 800)
        await sleep(2800)
        console.log(`  stage -> ${await here(rec)}`)
        await sleep(2200)
        await rec.resync()
      },
    },
    {
      say: 'Switching to Local brings you to the local author instance running on port 4502 on this machine.',
      do: async () => {
        await expand(rec)
        await openPicker(rec)
        await rec.click('.asp-env-pick-btn[data-env="local"]', 800)
        await sleep(2800)
        console.log(`  local -> ${await here(rec)}`)
        await sleep(2000)
        await rec.resync()
      },
    },
    {
      say: 'Hold Shift while clicking an environment, and Orbit performs in-place retargeting without navigating. The toolbar actions, publishing targets, and status chip immediately point at Prod while keeping you on your current tab.',
      do: async () => {
        await expand(rec)
        await openPicker(rec)
        await rec.tag('⇧ Shift + Click')
        await modClick(rec, '.asp-env-pick-btn[data-env="prod"]', SHIFT)
        await sleep(3600)
        console.log(`  shift-click prod -> still ${await here(rec)}`)
        await rec.tag('')
      },
    },
    {
      say: 'Hold Command on Mac, or Control on Windows, and the target environment opens in a new background tab instead. Here, Dev opens cleanly in a separate tab.',
      do: async () => {
        await openPicker(rec)
        await rec.tag('⌘ Cmd / Ctrl + Click')
        const before = await rec.pageIds()
        await modClick(rec, '.asp-env-pick-btn[data-env="dev"]', META)
        const tab = await rec.follow(before, 9000, 2200)
        await rec.tag('')
        console.log(`  cmd-click dev -> ${tab.url}`)
        await sleep(3000)
        await rec.back()
        await rec.resync()
      },
    },

    // ---- MSM / locales --------------------------------------------------------------------
    {
      say: 'Back on Dev. The Locales menu automatically discovers the Multi Site Manager configuration for this site, identifying the Language Master and every live copy.',
      do: async () => {
        await rec.goto(MAGAZINE, 3800)
        await expand(rec)
        await openMenu(rec, '#asp-locales-btn')
        await sleep(2800)
      },
    },
    {
      say: 'Locales preserve your active view mode. Being in View mode, selecting the Canadian English live copy keeps all editing chrome disabled.',
      do: async () => {
        await clickMenuItem(rec, 'CA / EN')
        await sleep(3200)
        console.log(`  locales view -> ${await here(rec)}`)
        await sleep(2400)
        await rec.resync()
      },
    },
    {
      say: 'The same intelligence applies inside the author editor. Open the page in Edit mode, choose Switch to Language Master, and Orbit keeps you right inside the Touch UI editor.',
      do: async () => {
        await rec.goto(EDITOR, 7500)
        await expand(rec)
        await openMenu(rec, '#asp-locales-btn')
        await sleep(1200)
        await clickMenuItem(rec, 'Switch to Language Master')
        await sleep(7000)
        console.log(`  locales edit -> ${await here(rec)}`)
        await sleep(2200)
        await rec.resync()
      },
    },

    // ---- status badge + details panel -----------------------------------------------------
    {
      say: 'The status pill indicates whether a page is Published, Draft, or Modified. Clicking it opens the comprehensive page details panel, revealing modification dates, author username, publication timestamps, and Preview tier status.',
      do: async () => {
        await rec.goto(MAGAZINE, 3800)
        await expand(rec)
        await togglePill(rec)
        await sleep(5200)
        await togglePill(rec)
      },
    },
    {
      say: 'On pages with workflows, it indicates who currently holds the lock, along with future publication and unpublication schedules.',
      do: async () => {
        await rec.goto(STATUS_DEMO, 3800)
        await expand(rec)
        await togglePill(rec)
        await sleep(6200)
        await togglePill(rec)
      },
    },
    {
      say: 'And on a Multi Site Manager live copy, the panel explicitly highlights the master inheritance relationship.',
      do: async () => {
        await rec.goto(LIVE_COPY, 3800)
        await expand(rec)
        await togglePill(rec)
        await sleep(5200)
        await togglePill(rec)
      },
    },

    // ---- toasts ---------------------------------------------------------------------------
    {
      say: 'Every action is accompanied by an interactive toast that offers the logical next step. Let us publish a new page from the Publish menu.',
      do: async () => {
        await rec.goto(TOAST_DEMO, 3800)
        await expand(rec)
        await openMenu(rec, '#asp-publish-menu-btn')
        await sleep(1500)
        await clickMenuItem(rec, 'Publish page')
        await rec.waitFor('#asp-toast.asp-toast-show', 8000)
        await sleep(1500)
      },
    },
    {
      say: 'Once published, the toast offers View live, and because the page was previously a draft, it provides an instant Undo button.',
      do: async () => {
        await toastBtnRect(rec, 'Undo')
        await sleep(2800)
      },
    },
    {
      say: 'Clicking Undo unpublishes the page immediately, and the follow-up toast offers Publish again.',
      do: async () => {
        await clickToastBtn(rec, 'Undo')
        await toastBtnRect(rec, 'Publish again')
        await sleep(2400)
      },
    },
    {
      say: 'Publishing again, we can click View live to jump straight to the live page on the Publish tier.',
      do: async () => {
        await clickToastBtn(rec, 'Publish again')
        await toastBtnRect(rec, 'View live')
        await sleep(900)
        const before = await rec.pageIds()
        await clickToastBtn(rec, 'View live')
        const tab = await rec.follow(before, 9000, 2200)
        console.log(`  View live -> ${tab.url}`)
        await sleep(3000)
        await rec.back()
        await rec.resync()
      },
    },
    {
      hold: 0.5,
      do: async () => {
        await rec.moveTo(1250, 520, 800)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
