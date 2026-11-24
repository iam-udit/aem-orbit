// Chapter 1b (v3) - Enhanced Position, Summon, and Style with Christopher Neural voiceover.
// Run: ORBIT_ADMIN_PW=admin python3 video/scripts/detach.py /tmp/ch1b-v2.log node video/chapters/01b-orb-position-v3.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

/** Open the extension's Settings page in a new tab (as the toolbar's Options button does) and follow it. */
async function openSettings(rec, extId) {
  const before = await rec.pageIds()
  await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(`chrome-extension://${extId}/src/options/options.html`)}`, { method: 'PUT' })
  await rec.follow(before, 8000, 2200)
}

/** Flip the Orb / Classic Mini-Bar toggle in Settings, save, and come back. */
async function setStyle(rec, extId, classic) {
  await openSettings(rec, extId)
  await rec.tab.eval(`(() => { const t = document.querySelector('#classicBar'); t && t.scrollIntoView({ block: 'center' }); return !!t })()`)
  await sleep(900)
  const on = await rec.tab.eval(`document.querySelector('#classicBar').checked`)
  if (on !== classic) {
    await rec.click('label.toggle:has(#classicBar)', 1000)
    await sleep(900)
  }
  await rec.click('#save', 900)
  await sleep(1800)
  await rec.back()
  await rec.goto(PAGE, 3200)
}

/** Drag the Orb to (x, y), then move off it and back on, so the fan opens and shows which way it points from there. */
async function dragAndFan(rec, x, y, hoverMs = 2800) {
  const r = await rec.waitFor('#asp-logo-btn')
  await rec.drag(r.cx, r.cy, x, y, 1500)
  await sleep(500)
  const o = await rec.waitFor('#asp-logo-btn')
  await rec.moveTo(o.cx + (o.cx < 960 ? 150 : -150), o.cy + (o.cy < 540 ? 150 : -150), 600)
  await sleep(300)
  await rec.moveTo(o.cx, o.cy, 700)
  await sleep(hoverMs)
}

await runChapter('01b-orb-position-v3', {
  url: PAGE,
  steps: (rec, ctx) => [
    {
      say: 'Welcome to Chapter 1b. The Orb goes wherever you need it. Grab it and drag it anywhere across your viewport to keep it out of the way of sticky headers, chat widgets, or layout elements.',
      do: async () => {
        await rec.title('Chapter 1b · Position, <b>summon</b> &amp; style', 'Per-site placement, long-press summon, and collapsed styles')
        await sleep(3500)
        await rec.untitle()
        await rec.moveTo(960, 960, 900)
        const r = await rec.waitFor('#asp-logo-btn')
        await rec.drag(r.cx, r.cy, 470, 640, 1400)
      },
    },
    {
      say: 'Orbit remembers your preferred position independently for each site. When you reload the page or return tomorrow, the Orb remains exactly where you docked it.',
      do: async () => {
        await sleep(500)
        await rec.goto(PAGE, 3400)
        await sleep(1500)
      },
    },
    {
      say: 'Wherever you position the Orb, the radial fan calculates viewport bounds automatically. Drag it to the top left corner, and the action leaves open downwards and to the right, never clipping off screen.',
      do: async () => {
        await dragAndFan(rec, 40, 40)
      },
    },
    {
      say: 'In the top right corner, the trajectory flips to fan down and to the left.',
      do: async () => {
        await dragAndFan(rec, 1880, 40)
      },
    },
    {
      say: 'In the bottom right corner, it opens upwards and to the left.',
      do: async () => {
        await dragAndFan(rec, 1880, 1040)
      },
    },
    {
      say: 'In the bottom left corner, the leaves arc smoothly upwards and to the right.',
      do: async () => {
        await dragAndFan(rec, 40, 1040)
      },
    },
    {
      say: 'Along the viewport edges, the leaves fan inwards. Here along the left edge.',
      do: async () => {
        await dragAndFan(rec, 40, 540)
      },
    },
    {
      say: 'And here on the right edge, pointing cleanly into the content area.',
      do: async () => {
        await dragAndFan(rec, 1880, 540)
      },
    },
    {
      say: 'Pinned at the top centre, the fan projects directly downwards.',
      do: async () => {
        await dragAndFan(rec, 960, 40)
      },
    },
    {
      say: 'Returning to bottom centre restores the familiar upward arc. Your custom coordinates are saved in local storage, ensuring consistent placement across your entire session.',
      do: async () => {
        await dragAndFan(rec, 960, 1040, 2400)
      },
    },
    {
      say: 'If you prefer a completely clean viewport with no floating elements, use the long-press summon gesture. Press and hold on any empty area of the page for half a second, and the Orb appears right at your cursor tip.',
      do: async () => {
        await rec.moveTo(1700, 520, 1000)
        await sleep(400)
        await rec.hold(1100)
        await sleep(2400)
      },
    },
    {
      say: 'It summons pre-expanded, ready for immediate action. Press Escape or click anywhere else on the page, and the Orb flies smoothly back to its docked home.',
      do: async () => {
        await sleep(900)
        await rec.key('Escape')
        await sleep(2400)
      },
    },
    {
      say: 'Orbit also supports two collapsed display styles. In Settings under Toolbar, you can switch from the circular animated Orb to the Classic Mini-Bar.',
      do: async () => {
        await setStyle(rec, ctx.extId, true)
        await sleep(1500)
      },
    },
    {
      say: 'The Mini-Bar provides a horizontal pill with four direct shortcuts always visible: Edit, View, Live, and Page Properties.',
      do: async () => {
        await rec.moveTo(960, 940, 900)
        await sleep(3000)
      },
    },
    {
      say: 'Switching back to the floating Orb is just as simple, allowing every author to choose the interface style that best fits their daily workflow.',
      do: async () => {
        await setStyle(rec, ctx.extId, false)
        await sleep(2000)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
