// Chapter 1b (v4) - Orb Positioning, Long-Press Summon, and Collapsed Display Styles.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/01b-orb-position.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

async function openSettings(rec, extId) {
  const before = await rec.pageIds()
  await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(`chrome-extension://${extId}/src/options/options.html`)}`, { method: 'PUT' })
  await rec.follow(before, 8000, 2200)
}

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

async function dragAndFan(rec, x, y, hoverMs = 2600) {
  const r = await rec.waitFor('#asp-logo-btn')
  await rec.drag(r.cx, r.cy, x, y, 1400)
  await sleep(450)
  const o = await rec.waitFor('#asp-logo-btn')
  await rec.moveTo(o.cx + (o.cx < 960 ? 150 : -150), o.cy + (o.cy < 540 ? 150 : -150), 550)
  await sleep(250)
  await rec.moveTo(o.cx, o.cy, 650)
  await sleep(hoverMs)
}

await runChapter('01b-orb-position-v4', {
  url: PAGE,
  steps: (rec, ctx) => [
    {
      say: 'Welcome to Chapter 1b. The Orb goes wherever you need it. Drag it anywhere across your viewport to keep it clear of sticky headers or editor rails.',
      do: async () => {
        await rec.title('Chapter 1b · Position, <b>summon</b> &amp; style', 'Per-site placement, long-press summon, and Orb versus Classic Mini-Bar')
        await sleep(3500)
        await rec.untitle()
        await rec.moveTo(960, 960, 900)
        const r = await rec.waitFor('#asp-logo-btn')
        await rec.drag(r.cx, r.cy, 470, 640, 1400)
      },
    },
    {
      say: 'Orbit persists your preferred coordinates per domain. Reloading the page restores the Orb in the exact spot you chose.',
      do: async () => {
        await sleep(500)
        await rec.goto(PAGE, 3400)
        await sleep(1500)
      },
    },
    {
      say: 'Everywhere you dock it, the radial fan adapts to viewport bounds automatically. Top left opens cleanly down and right.',
      do: async () => {
        await dragAndFan(rec, 40, 40)
      },
    },
    {
      say: 'Top right mirrors down and left, preventing any clipped controls.',
      do: async () => {
        await dragAndFan(rec, 1880, 40)
      },
    },
    {
      say: 'Bottom right angles upwards and left.',
      do: async () => {
        await dragAndFan(rec, 1880, 1040)
      },
    },
    {
      say: 'Bottom left sweeps upwards and right.',
      do: async () => {
        await dragAndFan(rec, 40, 1040)
      },
    },
    {
      say: 'Along viewport side edges and top centre, Orbit switches cleanly to horizontal or downward half rings, then returns to the bottom arc.',
      do: async () => {
        await dragAndFan(rec, 40, 540, 2000)
        await dragAndFan(rec, 1880, 540, 2000)
        await dragAndFan(rec, 960, 40, 2000)
        await dragAndFan(rec, 960, 1040, 2200)
      },
    },
    {
      say: 'For a minimalist workspace, press and hold any empty area for half a second to summon the Orb straight to your cursor, then press Escape to send it home.',
      do: async () => {
        await rec.moveTo(1700, 520, 900)
        await sleep(350)
        await rec.hold(1100)
        await sleep(2200)
        await rec.key('Escape')
        await sleep(2000)
      },
    },
    {
      say: 'In Settings under Toolbar, switch on Classic horizontal bar if you prefer the traditional compact Mini-Bar with Edit, View, Live, and Props.',
      do: async () => {
        await setStyle(rec, ctx.extId, true)
        await rec.moveTo(960, 940, 900)
        await sleep(2800)
      },
    },
    {
      say: 'Switching back restores the floating radial Orb immediately across every browser engine Orbit supports.',
      do: async () => {
        await setStyle(rec, ctx.extId, false)
        await sleep(1800)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
