// Chapter 1b - Position, summon and style. Run: ORBIT_ADMIN_PW=admin node video/chapters/01b-orb-position.mjs
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
  if (on !== classic) { await rec.click('label.toggle:has(#classicBar)', 1000); await sleep(900) }
  await rec.click('#save', 900)
  await sleep(1800)
  await rec.back()
  await rec.goto(PAGE, 3200)
}

/** Drag the Orb to (x, y), then move off it and back on, so the fan opens and shows which way it points from there. */
async function dragAndFan(rec, x, y, hoverMs = 2600) {
  const r = await rec.waitFor('#asp-logo-btn')
  await rec.drag(r.cx, r.cy, x, y, 1500)
  await sleep(500)
  const o = await rec.waitFor('#asp-logo-btn')
  await rec.moveTo(o.cx + (o.cx < 960 ? 150 : -150), o.cy + (o.cy < 540 ? 150 : -150), 600)
  await sleep(300)
  await rec.moveTo(o.cx, o.cy, 700)
  await sleep(hoverMs)
}

await runChapter('01b-orb-position', {
  url: PAGE,
  steps: (rec, ctx) => [
    { say: 'The Orb goes wherever you need it. Grab it and drag it anywhere on the viewport.',
      do: async () => { await rec.title('Chapter 1 · Position, <b>summon</b> &amp; style', 'Per-site placement, long-press summon, two collapsed styles'); await rec.moveTo(960, 960, 900)
        const r = await rec.waitFor('#asp-logo-btn'); await rec.drag(r.cx, r.cy, 470, 640, 1400) } },
    { say: 'The position is remembered per site. Reload the page, and the Orb is right where you left it.',
      do: async () => { await sleep(500); await rec.goto(PAGE, 3400); await sleep(1500) } },
    { say: 'Wherever it sits, the fan adapts. Drag the Orb into the top left corner, and the leaves open downwards and to the right, always staying on screen.',
      do: async () => { await dragAndFan(rec, 40, 40) } },
    { say: 'In the top right corner, the fan turns to open down and to the left.',
      do: async () => { await dragAndFan(rec, 1880, 40) } },
    { say: 'In the bottom right corner, it opens upwards and to the left.',
      do: async () => { await dragAndFan(rec, 1880, 1040) } },
    { say: 'In the bottom left corner, upwards and to the right.',
      do: async () => { await dragAndFan(rec, 40, 1040) } },
    { say: 'Along the sides, the leaves fan inwards, away from the edge. Here on the left edge.',
      do: async () => { await dragAndFan(rec, 40, 540) } },
    { say: 'On the right edge.',
      do: async () => { await dragAndFan(rec, 1880, 540) } },
    { say: 'At the top centre, the fan opens downwards.',
      do: async () => { await dragAndFan(rec, 960, 40) } },
    { say: 'And back at the bottom centre, the familiar upward arc. The spot is saved for this site, so the Orb stays where you leave it.',
      do: async () => { await dragAndFan(rec, 960, 1040, 2200) } },

    { say: 'Prefer not to have anything on screen? Press and hold on any empty part of the page for about half a second, and the Orb is summoned right at your cursor.',
      do: async () => { await rec.moveTo(1700, 520, 1000); await sleep(400); await rec.hold(1100); await sleep(2200) } },
    { say: 'It opens fanned out, ready to use. Press Escape, or click anywhere else, and it flies back to its saved spot.',
      do: async () => { await sleep(900); await rec.key('Escape'); await sleep(2400) } },
    { say: 'Two collapsed styles are available. In Settings, under Toolbar, you can switch from the animated Orb to the Classic Mini Bar.',
      do: async () => { await setStyle(rec, ctx.extId, true); await sleep(1500) } },
    { say: 'The Mini Bar keeps four buttons one click away: Edit, View, Live and Properties.',
      do: async () => { await rec.moveTo(960, 940, 900); await sleep(2800) } },
    { say: 'And switching back to the Orb is just as easy.',
      do: async () => { await setStyle(rec, ctx.extId, false); await sleep(1800) } },
  ],
})
process.exit(process.exitCode || 0)
