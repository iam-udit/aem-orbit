// Recorder: drives a real Chrome tab with real mouse/keyboard input over CDP and captures timed
// screencast frames, then renders them to a constant 60 fps H.264 clip with ffmpeg.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { listTargets, newTab, sleep, Target } from './cdp.mjs'
import { OVERLAY_SOURCE } from './overlay.mjs'

export const W = 1920
export const H = 1080

function getScreenLayout() {
  const js = `ObjC.import('AppKit');
    const count = $.NSScreen.screens.count;
    let chosen = { index: 0, left: 0, width: 1920 };
    for (let i = 0; i < count; i++) {
      const s = $.NSScreen.screens.objectAtIndex(i).frame;
      if (s.size.width >= 1920) {
        chosen = { index: i, left: s.origin.x, width: s.size.width };
        break;
      }
    }
    JSON.stringify(chosen)`
  const res = spawnSync('osascript', ['-l', 'JavaScript', '-e', js], { encoding: 'utf8' })
  try { return JSON.parse(res.stdout) } catch { return { index: 0, left: 0, width: 1920 } }
}

export const SCREEN_LAYOUT = getScreenLayout()
export const WINDOW_LEFT = Number(process.env.ORBIT_WINDOW_LEFT ?? SCREEN_LAYOUT.left)
export const SCREEN_DEVICE = process.env.ORBIT_SCREEN_DEVICE || String(SCREEN_LAYOUT.index + 1)
export const WINDOW_TOP = Number(process.env.ORBIT_WINDOW_TOP || 30) // below the macOS menu bar

/** Park the physical OS mouse completely outside the Chrome window so it never hovers or triggers tooltips. */
export function parkPhysicalMouse() {
  const parkX = WINDOW_LEFT + (SCREEN_LAYOUT.width > 1940 ? Math.min(SCREEN_LAYOUT.width - 20, 2500) : SCREEN_LAYOUT.width - 10)
  const js = `ObjC.import('AppKit'); ObjC.import('CoreGraphics');
    const p = { x: ${parkX}, y: 500 };
    const e = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, p, 0);
    $.CGEventPost($.kCGHIDEventTap, e); 'ok'`
  spawnSync('osascript', ['-l', 'JavaScript', '-e', js], { encoding: 'utf8' })
}

// Screen mode (the default; ORBIT_SCREEN=0 = legacy page-only CDP screencast): record the real Chrome window (tab strip + URL bar + page) from the display with ffmpeg. The window is placed at 1920x1080, so the output is 1920x1080 with the browser UI.
// ORBIT_SCREEN_DEVICE = avfoundation video device index of the display holding the window (see `ffmpeg -f avfoundation -list_devices true -i ""`).
const CDP_HTTP = process.env.ORBIT_CDP || 'http://127.0.0.1:9333'
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2) // easeInOutCubic

export class Recorder {
  /** @param {string} workDir directory for frames of this clip */
  constructor(workDir, { screen = process.env.ORBIT_SCREEN !== '0' } = {}) {
    this.screen = screen
    this.dir = workDir
    this.frames = [] // { file, t }
    this.mouse = { x: 960, y: 640 }
    this.t0 = 0
  }

  async open(url = 'about:blank') {
    await this.#setup(await newTab('about:blank'))
    if (this.screen) await this.#prepareWindow()
    if (url !== 'about:blank') await this.goto(url)
    return this
  }

  /** Pin the viewport to exactly 1920x1080 CSS px (the real window is taller than that). */
  async #pin(t) {
    if (this.screen) { await t.send('Emulation.clearDeviceMetricsOverride').catch(() => {}); return } // the real window is the viewport
    await t.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  }

  async #setup(target) {
    this.tab = target
    const t = target
    await t.send('Page.enable')
    await t.send('Runtime.enable')
    t.on('Page.javascriptDialogOpening', async () => {
      await t.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
    })
    await this.#pin(t)
    await t.send('Page.addScriptToEvaluateOnNewDocument', { source: OVERLAY_SOURCE })
    // a new document (same-tab navigation, redirects) starts with an empty overlay: restore title/tag
    t.on('Page.domContentEventFired', () => { this.#reapply(t) })
    t.on('Page.screencastFrame', (p) => {
      if (!this.recording || this.tab !== t) { t.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); return }
      // Every frame must come from a 1920x1080 viewport. If the browser dropped the override (tab switches
      // do that), discard the frame and pin it again immediately instead of recording a stretched/blank-padded one.
      if (p.metadata.deviceWidth !== W || p.metadata.deviceHeight !== H) {
        this.badFrames = (this.badFrames || 0) + 1
        t.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
        this.#pin(t).catch(() => {})
        return
      }
      const n = String(this.frames.length).padStart(6, '0')
      const file = path.join(this.dir, `f${n}.jpg`)
      fs.writeFileSync(file, Buffer.from(p.data, 'base64'))
      this.frames.push({ file, t: p.metadata.timestamp })
      t.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
    })
  }

  /** Screen mode: give the page keyboard focus so the address bar is not left selected (blue) after a navigation or tab switch. */
  async #focusPage() {
    if (this.screen) await this.tab.send('Page.bringToFront').catch(() => {})
  }

  async #startCast(t) {
    if (!this.screen) await t.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
  }

  async #stopCast(t) { if (!this.screen) await t.send('Page.stopScreencast').catch(() => {}) }

  /** Screen mode: only the recording tab stays open, in front, in a 1920x1080 window at the top-left of the display. */
  async #prepareWindow() {
    const me = this.tab.info.id
    for (const x of await listTargets()) if (x.type === 'page' && x.id !== me) await fetch(`${CDP_HTTP}/json/close/${x.id}`).catch(() => {})
    const { windowId } = await this.tab.send('Browser.getWindowForTarget')
    await this.tab.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', left: WINDOW_LEFT, top: WINDOW_TOP, width: W, height: H } })
    spawnSync('osascript', ['-l', 'JavaScript', '-e', `
      const app = Application('Google Chrome for Testing');
      app.activate();
      if (app.windows.length > 0) app.windows[0].bounds = { x: ${WINDOW_LEFT}, y: ${WINDOW_TOP}, width: ${W}, height: ${H} };
    `])
    await fetch(`${CDP_HTTP}/json/activate/${me}`).catch(() => {})
    spawnSync('osascript', ['-e', 'tell application "Google Chrome for Testing" to activate'])
    // Park the physical OS mouse outside the Chrome window to prevent browser hover tooltips and duplicate cursors
    parkPhysicalMouse()
    await sleep(800)
  }

  async #startScreen() {
    this.capFile = path.join(this.dir, 'capture.mp4')
    spawnSync('osascript', ['-e', 'tell application "Google Chrome for Testing" to activate'])
    parkPhysicalMouse()
    this.ffErr = ''
    this.ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'avfoundation', '-framerate', '60', '-capture_cursor', '0', '-pixel_format', 'nv12',
      '-i', `${SCREEN_DEVICE}:none`, '-vf', `crop=${W}:${H}:0:${WINDOW_TOP},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-r', '60', this.capFile], { stdio: ['pipe', 'ignore', 'pipe'] })
    this.ff.stderr.on('data', (d) => { this.ffErr += d })
    this.ffDone = new Promise((resolve) => { this.ff.on('close', resolve) })
    const end = Date.now() + 15000
    while (Date.now() < end && !(fs.existsSync(this.capFile) && fs.statSync(this.capFile).size > 0)) await sleep(100)
    if (!fs.existsSync(this.capFile)) throw new Error(`screen capture did not start: ${this.ffErr.slice(-300)}`)
    await sleep(700)
    // Sync marker: flash the page magenta at a known wall-clock time; render() finds that frame to line video up with the voice cues.
    this.flashWall = Date.now() / 1000
    await this.tab.eval(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#f0f;z-index:2147483646'; document.documentElement.appendChild(d); setTimeout(() => d.remove(), 450) })()`)
    await sleep(1000)
    this.frames = [{ file: this.capFile, t: this.flashWall }]
  }

  #reapply(t) {
    const js = `(() => { const s = window.__orbitDemo; if (!s) return; s.title = ${JSON.stringify(this.titleHtml || '')}; s.sub = ${JSON.stringify(this.titleSub || '')};
      s.tagText = ${JSON.stringify(this.tagText || '')}; if (s.api) { s.title ? s.api.title(s.title, s.sub) : s.api.untitle(); s.api.tag(s.tagText) } })()`
    t.eval(js).catch(() => {})
  }

  /** Page targets currently open (ids), used to notice tabs opened by the extension. */
  async pageIds() { return new Set((await listTargets()).filter((x) => x.type === 'page').map((x) => x.id)) }

  /**
   * Switch recording to the tab the page just opened (window.open / target=_blank), exactly as a viewer
   * would follow it. `before` is the id set from pageIds() taken before the click.
   */
  async follow(before, timeout = 8000, settle = 1500) {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const fresh = (await listTargets()).find((x) => x.type === 'page' && !before.has(x.id) && !x.url.startsWith('chrome://'))
      if (fresh) {
        const next = await new Target(fresh).open()
        if (this.recording) await this.#stopCast(this.tab)
        this.prev = this.tab
        await this.#setup(next)
        await next.send('Target.activateTarget', { targetId: fresh.id }).catch(() => {})
        await fetch(`http://127.0.0.1:9333/json/activate/${fresh.id}`).catch(() => {})
        await next.eval(OVERLAY_SOURCE).catch(() => {})
        await sleep(settle)
        await this.#focusPage()
        if (this.recording) await this.#startCast(next)
        await this.#mouse('mouseMoved', this.mouse.x, this.mouse.y)
        return fresh
      }
      await sleep(150)
    }
    throw new Error('no new tab opened')
  }

  /** Go back to the tab recorded before follow(), closing the one we are on. */
  async back(settle = 800) {
    if (!this.prev) return
    const cur = this.tab, id = cur.info.id
    if (this.recording) await this.#stopCast(cur)
    this.tab = this.prev; this.prev = null
    await fetch(`http://127.0.0.1:9333/json/activate/${this.tab.info.id}`).catch(() => {})
    await this.#pin(this.tab)
    cur.close(); await fetch(`http://127.0.0.1:9333/json/close/${id}`).catch(() => {})
    await sleep(settle)
    await this.#focusPage()
    if (this.recording) await this.#startCast(this.tab)
  }

  async goto(url, settle = 1800) {
    await this.tab.send('Page.navigate', { url })
    await sleep(settle)
    await this.#focusPage()
    await this.tab.eval(OVERLAY_SOURCE).catch(() => {})
    await this.resync()
  }

  /** Re-send the pointer position after a navigation so the new document's cursor appears where it was. */
  async resync() { await this.#mouse('mouseMoved', this.mouse.x, this.mouse.y) }

  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
    this.frames = []
    this.badFrames = 0
    this.recording = true
    await this.#pin(this.tab)
    if (this.screen) { await this.#startScreen(); return }
    await this.tab.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
    await sleep(250)
    // a nudge forces a first frame even on a perfectly still page
    await this.tab.eval('document.body && (document.body.style.outline="0")').catch(() => {})
  }

  async stop() {
    await sleep(400)
    if (this.screen) {
      this.recording = false
      this.ff.stdin.write('q')
      const killer = setTimeout(() => this.ff.kill('SIGINT'), 15000)
      await this.ffDone
      clearTimeout(killer)
      const n = Number(spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', this.capFile], { encoding: 'utf8' }).stdout) || 0
      this.capFrames = n
      return n
    }
    await this.tab.send('Page.stopScreencast')
    this.recording = false
    if (this.badFrames) console.log(`  (${this.badFrames} off-size frames discarded)`)
    return this.frames.length
  }

  // ---- human-like input -------------------------------------------------------------------
  async #mouse(type, x, y, extra = {}) {
    await this.tab.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra })
  }

  /** Smooth curved cursor path to (x,y) over `ms`, dispatching a real mouseMoved every 16 ms. */
  async moveTo(x, y, ms = 900) {
    const { x: x0, y: y0 } = this.mouse
    const dist = Math.hypot(x - x0, y - y0)
    if (dist < 2) return
    const steps = Math.max(8, Math.round(ms / 16))
    const bend = Math.min(140, dist * 0.18) * (x >= x0 ? -1 : 1)
    const cx = (x0 + x) / 2 + (-(y - y0) / dist) * bend
    const cy = (y0 + y) / 2 + ((x - x0) / dist) * bend
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps)
      const px = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x
      const py = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y
      await this.#mouse('mouseMoved', px, py)
      await sleep(16)
    }
    this.mouse = { x, y }
  }

  async rectOf(selector) {
    return this.tab.eval(`(() => { const find = (root, sel) => { const e = root.querySelector(sel); if (e) return e;
      for (const n of root.querySelectorAll('*')) if (n.shadowRoot) { const r = find(n.shadowRoot, sel); if (r) return r } return null };
      const e = find(document, ${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, vis: r.width > 0 && r.height > 0 } })()`)
  }

  async waitFor(selector, timeout = 8000) {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const r = await this.rectOf(selector)
      if (r?.vis) return r
      await sleep(120)
    }
    throw new Error(`timeout waiting for ${selector}`)
  }

  async hover(selector, ms = 800) {
    const r = await this.waitFor(selector)
    await this.moveTo(r.cx, r.cy, ms)
  }

  async click(selector, ms = 800) {
    const r = await this.waitFor(selector)
    await this.moveTo(r.cx, r.cy, ms)
    await this.clickHere()
  }

  async clickHere(count = 1) {
    const { x, y } = this.mouse
    await this.#mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: count })
    await sleep(70)
    await this.#mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: count })
  }

  async clickAt(x, y, ms = 800) { await this.moveTo(x, y, ms); await this.clickHere() }

  /** Press and hold the left button (long-press). */
  async hold(ms) {
    const { x, y } = this.mouse
    await this.#mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 })
    await sleep(ms)
    await this.#mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 })
  }

  async drag(x1, y1, x2, y2, ms = 900) {
    await this.moveTo(x1, y1, 600)
    await this.#mouse('mousePressed', x1, y1, { button: 'left', buttons: 1, clickCount: 1 })
    const steps = Math.round(ms / 16)
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps)
      await this.#mouse('mouseMoved', x1 + (x2 - x1) * e, y1 + (y2 - y1) * e, { button: 'left', buttons: 1 })
      await sleep(16)
    }
    await this.#mouse('mouseReleased', x2, y2, { button: 'left', buttons: 0, clickCount: 1 })
    this.mouse = { x: x2, y: y2 }
  }

  async key(key, { code = key, modifiers = 0, text } = {}) {
    const vk = { Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38, Tab: 9, Backspace: 8 }[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0)
    const base = { key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }
    await this.tab.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) })
    await this.tab.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }

  async type(text, perChar = 55) {
    for (const ch of text) {
      await this.tab.send('Input.dispatchKeyEvent', { type: 'char', text: ch })
      await sleep(perChar + Math.random() * 30)
    }
  }

  // ---- on-screen annotations ----------------------------------------------------------------
  /** Chapter title card: shown at the start only. It clears itself after `ms` (also across navigations), so it is not in every frame. */
  async title(html, sub = '', ms = 4500) {
    clearTimeout(this.titleTimer)
    this.titleHtml = html; this.titleSub = sub; this.#reapply(this.tab)
    if (this.popup?.page) this.#reapply(this.popup.page)
    if (ms > 0) this.titleTimer = setTimeout(() => { this.untitle().catch(() => {}) }, ms)
    await sleep(60)
  }
  async untitle() {
    clearTimeout(this.titleTimer)
    this.titleHtml = ''
    this.titleSub = ''
    this.#reapply(this.tab)
    if (this.popup?.page) this.#reapply(this.popup.page)
    await sleep(60)
  }
  async tag(text) { this.tagText = text || ''; this.#reapply(this.tab); await sleep(60) }

  async close() { this.tab.close() }

  /** Screen mode: locate the sync flash, trim the capture to just after it, re-encode to the final 1080p60 clip. */
  #renderScreen(outFile) {
    const cap = this.capFile
    // one pixel per frame from the centre of the viewport, first 10 s
    const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', cap, '-t', '10', '-vf', 'crop=16:16:952:560,scale=1:1:flags=area,format=rgb24', '-f', 'rawvideo', '-'],
      { maxBuffer: 1 << 24 }).stdout
    const isFlash = (i) => raw[i * 3] > 200 && raw[i * 3 + 1] < 90 && raw[i * 3 + 2] > 200
    let first = -1, last = -1
    for (let i = 0; i < raw.length / 3; i++) if (isFlash(i)) { if (first < 0) first = i; last = i }
    if (first < 0) throw new Error('sync flash not found in the screen capture (is the Chrome window in front, unobscured, on the captured display?)')
    const fps = 60
    const startWall = this.flashWall - first / fps          // wall-clock time of capture frame 0
    const trim = (last + 1) / fps + 0.1
    const t0 = startWall + trim                             // wall-clock time of the first frame of the clip
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', trim.toFixed(3), '-i', cap, '-vf', `fps=60,scale=${W}:${H}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-r', '60', '-movflags', '+faststart', outFile], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`)
    const seconds = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outFile], { encoding: 'utf8' }).stdout)
    this.frames = [{ file: cap, t: t0 }, { file: cap, t: t0 + seconds }]
    console.log(`  (screen capture: flash at frame ${first}-${last}, trimmed ${trim.toFixed(2)} s, ${this.capFrames} captured frames)`)
    return { seconds, frames: this.capFrames, file: outFile }
  }

  /** Constant-60fps H.264 render of the captured frames (variable timestamps -> ffmpeg concat durations). */
  render(outFile) {
    if (this.screen) return this.#renderScreen(outFile)
    const fr = this.frames
    if (fr.length < 2) throw new Error('not enough frames captured')
    const lines = ['ffconcat version 1.0']
    for (let i = 0; i < fr.length; i++) {
      const next = fr[i + 1]?.t ?? fr[i].t + 0.5
      lines.push(`file '${path.resolve(fr[i].file)}'`, `duration ${Math.max(0.001, next - fr[i].t).toFixed(5)}`)
    }
    lines.push(`file '${path.resolve(fr[fr.length - 1].file)}'`)
    const list = path.join(this.dir, 'frames.ffconcat')
    fs.writeFileSync(list, `${lines.join('\n')}\n`)
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `fps=60,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-r', '60', '-movflags', '+faststart', outFile], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`)
    const dur = fr[fr.length - 1].t - fr[0].t
    return { seconds: dur, frames: fr.length, file: outFile }
  }
}

export const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Set ${k}`); return v }
