// Chapter 2 (v4) - Toolbar, Live Persona Switching, Scrollable Viewport Locales & Toasts.
// Run: ORBIT_ADMIN_PW=admin python3 video/env/demo-content.py
//      ORBIT_ADMIN_PW=admin node video/chapters/02-toolbar.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const CONTENT = '/content/wknd/us/en'
const VIEW = '?wcmmode=disabled'
const MAGAZINE = `${AUTHOR.dev}${CONTENT}/magazine.html${VIEW}`
const EDITOR = `${AUTHOR.dev}/editor.html${CONTENT}/magazine.html`
const STATUS_DEMO = `${AUTHOR.dev}${CONTENT}/orbit-demo/status-demo.html${VIEW}`
const LIVE_COPY = `${AUTHOR.dev}/content/wknd/ca/en/magazine.html${VIEW}`
const TOAST_DEMO = `${AUTHOR.dev}${CONTENT}/orbit-demo/toast-demo.html${VIEW}`

const SHIFT = 8, META = 4

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

async function openMenu(rec, selector) {
  await rec.click(selector, 800)
  await rec.waitFor('#asp-menu .asp-menu-item', 12000)
  await sleep(700)
}

async function menuItemRect(rec, text) {
  return rec.tab.eval(`(() => {
    const items = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
    const q = ${JSON.stringify(text.toLowerCase())}
    const byTitle = items.find((b) => (b.querySelector('.asp-menu-title')?.textContent || '').trim().toLowerCase().includes(q))
    const it = byTitle || items.find((b) => b.textContent.trim().toLowerCase().includes(q))
    if (!it) return null
    it.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = it.getBoundingClientRect()
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  })()`)
}

async function clickMenuItem(rec, text) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 800)
  await sleep(350)
  await rec.clickHere()
}

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

async function openPicker(rec) {
  await rec.click('#asp-env-chip', 800)
  await rec.waitFor('.asp-env-pick-btn[data-env="stage"]')
  await sleep(700)
}

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

await runChapter('02-toolbar-v4', {
  url: MAGAZINE,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 2. Clicking the Orb expands it into Orbit’s horizontal toolbar with live persona switching, tier navigation, cross-environment jumps, and scrollable locale menus.',
      do: async () => {
        await rec.title('Chapter 2 · The <b>toolbar</b> &amp; Personas', 'Tiers, environments, scrollable locales, live persona switching, details, and toasts')
        await sleep(3500)
        await rec.untitle()
        await rec.hover('#asp-logo-btn', 1000)
        await sleep(700)
        await rec.click('#asp-logo-btn', 600)
        await sleep(1400)
      },
    },
    {
      say: 'Right from the More menu, you can switch workspace persona on the fly without reloading the page. Switching to QA immediately reconfigures the toolbar with Audit and Cache Header shortcuts while hiding publishing actions; switching back to Custom restores your saved layout.',
      do: async () => {
        await openMenu(rec, '#asp-more-btn')
        await sleep(900)
        await clickMenuItem(rec, 'QA')
        await rec.waitFor('#asp-audit-btn', 6000)
        await sleep(1600)
        await rec.hover('#asp-audit-btn', 700)
        await rec.hover('#asp-cache-btn', 700)
        await openMenu(rec, '#asp-more-btn')
        await sleep(800)
        await clickMenuItem(rec, 'Custom')
        await rec.waitFor('#asp-jcr-btn', 6000)
        await sleep(1200)
      },
    },
    {
      say: 'The tier switcher spans Edit, View, Preview, Published, and Live CDN, resolving domain mapping rules automatically for each tier.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        await sleep(1600)
        const before = await rec.pageIds()
        await clickMenuItem(rec, 'Preview')
        const tab = await rec.follow(before, 9000, 2200)
        console.log(`  Preview -> ${tab.url}`)
        await sleep(1800)
        await rec.back()
        await rec.resync()
        await menuTab(rec, '#asp-tier-btn', 'Published', 2200)
        await menuTab(rec, '#asp-tier-btn', 'Live', 2400)
      },
    },
    {
      say: 'The environment chip switches between Stage, Local, Dev, and Prod on the exact same page path. Holding Shift retargets background actions to Prod without navigating, while Command or Control Click opens Dev in a fresh tab.',
      do: async () => {
        await openPicker(rec)
        await sleep(1000)
        await rec.click('.asp-env-pick-btn[data-env="stage"]', 800)
        await sleep(2800)
        await expand(rec)
        await openPicker(rec)
        await rec.click('.asp-env-pick-btn[data-env="local"]', 800)
        await sleep(2800)
        await expand(rec)
        await openPicker(rec)
        await rec.tag('⇧ Shift + Click')
        await modClick(rec, '.asp-env-pick-btn[data-env="prod"]', SHIFT)
        await sleep(2600)
        await rec.tag('')
        await openPicker(rec)
        await rec.tag('⌘ Cmd / Ctrl + Click')
        const before = await rec.pageIds()
        await modClick(rec, '.asp-env-pick-btn[data-env="dev"]', META)
        await rec.follow(before, 9000, 2200)
        await rec.tag('')
        await sleep(2000)
        await rec.back()
        await rec.resync()
      },
    },
    {
      say: 'Back on Dev, long Multi Site Manager and hreflang locale lists stay centered comfortably inside your viewport height with a clean internal scrollbar, never overflowing off screen.',
      do: async () => {
        await rec.goto(MAGAZINE, 3600)
        await expand(rec)
        await rec.tab.eval(`(() => {
          for (let i = 1; i <= 20; i++) {
            const l = document.createElement('link')
            l.setAttribute('rel', 'alternate')
            l.setAttribute('hreflang', 'region-' + String(i).padStart(2, '0'))
            l.setAttribute('href', 'https://wwwdev.wknd.com/locale-' + i)
            l.dataset.demoLocale = '1'
            document.head.appendChild(l)
          }
        })()`)
        await openMenu(rec, '#asp-locales-btn')
        await sleep(1200)
        await rec.tab.eval(`(() => {
          const list = document.querySelector('#asp-menu .asp-menu-items')
          if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
        })()`)
        await sleep(1800)
        await rec.tab.eval(`(() => {
          const list = document.querySelector('#asp-menu .asp-menu-items')
          if (list) list.scrollTo({ top: 0, behavior: 'smooth' })
          document.querySelectorAll('link[data-demo-locale]').forEach((el) => el.remove())
        })()`)
        await sleep(800)
        await rec.key('Escape')
      },
    },
    {
      say: 'Selecting a real live copy or Language Master preserves your current mode cleanly, keeping View mode unframed and Touch UI Edit mode right inside the editor.',
      do: async () => {
        await openMenu(rec, '#asp-locales-btn')
        await sleep(1000)
        await clickMenuItem(rec, 'CA / EN')
        await sleep(3000)
        await rec.resync()
        await rec.goto(EDITOR, 7000)
        await expand(rec)
        await openMenu(rec, '#asp-locales-btn')
        await sleep(1000)
        await clickMenuItem(rec, 'Switch to Language Master')
        await sleep(6500)
        await rec.resync()
      },
    },
    {
      say: 'Clicking the status pill reveals page details including lock owners, scheduled on and off timestamps, Preview tier state, and live-copy inheritance.',
      do: async () => {
        await rec.goto(MAGAZINE, 3500)
        await expand(rec)
        await togglePill(rec)
        await sleep(3000)
        await togglePill(rec)
        await rec.goto(STATUS_DEMO, 3500)
        await expand(rec)
        await togglePill(rec)
        await sleep(3600)
        await togglePill(rec)
        await rec.goto(LIVE_COPY, 3500)
        await expand(rec)
        await togglePill(rec)
        await sleep(3200)
        await togglePill(rec)
      },
    },
    {
      say: 'Finally, every action toast offers the immediate next step: Publish gives instant Undo on drafts, Undo offers Publish again, and View live launches the published page.',
      do: async () => {
        await rec.goto(TOAST_DEMO, 3500)
        await expand(rec)
        await openMenu(rec, '#asp-publish-menu-btn')
        await clickMenuItem(rec, 'Publish page')
        await toastBtnRect(rec, 'Undo')
        await sleep(1800)
        await clickToastBtn(rec, 'Undo')
        await toastBtnRect(rec, 'Publish again')
        await sleep(1600)
        await clickToastBtn(rec, 'Publish again')
        await toastBtnRect(rec, 'View live')
        await sleep(800)
        const before = await rec.pageIds()
        await clickToastBtn(rec, 'View live')
        await rec.follow(before, 9000, 2200)
        await sleep(2400)
        await rec.back()
        await rec.resync()
      },
    },
  ],
})
process.exit(process.exitCode || 0)
