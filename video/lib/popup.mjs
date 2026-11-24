// Open the REAL extension popup: a real OS click on the pinned Orbit icon in the Chrome toolbar, so the popup drops down
// over the page exactly as it does for a user (screen mode records the real window). The popup is its own page target; while it is
// open `rec.tab` points at it, so rec.click / rec.type / rec.waitFor / the toolbar.mjs helpers work inside it, and the overlay
// cursor + click ripple are injected into it. Needs: screen mode (default), the extension pinned (launch-chrome.mjs / pin step),
// Chrome in front and unobscured, Mac not in use.
import { spawnSync } from 'node:child_process'
import { listTargets, sleep, Target } from './cdp.mjs'
import { OVERLAY_SOURCE } from './overlay.mjs'
import { parkPhysicalMouse, WINDOW_LEFT } from './recorder.mjs'

// Pinned Orbit icon: screen coordinates with the window at WINDOW_LEFT / top 30 (see recorder.mjs). Override with ORBIT_ICON_X / ORBIT_ICON_Y.
const ICON_X = Number(process.env.ORBIT_ICON_X ?? (WINDOW_LEFT + 1771))
const ICON_Y = Number(process.env.ORBIT_ICON_Y || 92)
const WINDOW_TOP = Number(process.env.ORBIT_WINDOW_TOP || 30)

/** A real mouse move + click at screen (x, y) through Quartz events (what a physical mouse does). */
function osClick(x, y) {
  const js = `ObjC.import('AppKit'); ObjC.import('CoreGraphics');
    const main = $.NSScreen.screens.objectAtIndex(0).frame;
    const sw = main.size.width;
    const pAway = sw > 1940 ? { x: Math.min(sw - 20, 2500), y: 500 } : { x: sw - 10, y: 10 };
    const ev = (t, pt) => { const e = $.CGEventCreateMouseEvent($(), t, pt, 0); $.CGEventSetIntegerValueField(e, $.kCGMouseEventClickState, 1); return e };
    const pClick = { x: ${x}, y: ${y} };
    $.CGEventPost($.kCGHIDEventTap, ev($.kCGEventMouseMoved, pClick)); delay(0.04);
    $.CGEventPost($.kCGHIDEventTap, ev($.kCGEventLeftMouseDown, pClick)); delay(0.05);
    $.CGEventPost($.kCGHIDEventTap, ev($.kCGEventLeftMouseUp, pClick)); delay(0.04);
    $.CGEventPost($.kCGHIDEventTap, ev($.kCGEventMouseMoved, pAway)); 'ok'`
  const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', js], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`OS click failed: ${r.stderr.slice(0, 200)}`)
}

const popupTarget = async () => (await listTargets()).find((t) => t.type === 'page' && t.url.endsWith('/src/popup/popup.html'))

/**
 * Click the pinned icon and wait for the popup. The overlay cursor glides to the top edge of the page right under the icon,
 * disappears there (the toolbar is outside the page), and re-appears inside the popup, so the viewer follows it.
 * @param {import('./recorder.mjs').Recorder} rec
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
export async function openPopup(rec) {
  const page = rec.tab
  const pageMouse = { ...rec.mouse }
  spawnSync('open', ['-a', 'Google Chrome for Testing'])
  await page.send('Page.bringToFront').catch(() => {})
  await rec.moveTo(ICON_X, 3, 1000)
  await sleep(250)
  await page.eval('(() => { const s = window.__orbitDemo; if (s) { s.cursorHidden = true; s.api.hide() } })()')
  osClick(ICON_X, ICON_Y)

  let info
  for (let i = 0; i < 40 && !info; i++) {
    info = await popupTarget()
    if (!info) {
      if (i === 12 || i === 24) osClick(ICON_X, ICON_Y)
      await sleep(150)
    }
  }
  if (!info) throw new Error('the popup did not open (is the extension pinned and Chrome in front?)')
  const pop = await new Target(info).open()
  await pop.send('Page.enable')
  await pop.send('Runtime.enable')
  await sleep(900)
  const at = await pop.eval('({ x: window.screenX, y: window.screenY, w: innerWidth, h: innerHeight })')
  await pop.eval(OVERLAY_SOURCE).catch(() => {})
  const entry = { x: Math.max(8, Math.min(at.w - 8, ICON_X - at.x)), y: 4 }
  await pop.eval(`(() => { const s = window.__orbitDemo; if (s?.api) s.api.place(${entry.x}, ${entry.y}) })()`)
  rec.tab = pop
  rec.mouse = entry
  rec.popup = { at, page, pageMouse }
  console.log(`  popup open at screen ${at.x},${at.y} size ${at.w}x${at.h} (video y ${at.y - WINDOW_TOP})`)
  await sleep(700)

  return {
    close: async () => {
      parkPhysicalMouse()
      await pop.eval('window.close()').catch(() => {})
      pop.close()
      rec.tab = page
      rec.mouse = pageMouse
      rec.popup = null
      await sleep(500)
      await page.eval('(() => { const s = window.__orbitDemo; if (s) { s.cursorHidden = false; s.api.hide() } })()')
      await rec.resync()
      await sleep(500)
    },
  }
}
