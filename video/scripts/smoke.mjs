// Smoke test: title + cursor path + orb hover/fan, rendered to 1080p60. Output: video/work/smoke.mp4
import { Recorder } from '../lib/recorder.mjs'
import { sleep } from '../lib/cdp.mjs'

const rec = await new Recorder('video/work/smoke-frames').open()
await rec.goto('https://dev-cloud-author.com/content/wknd/us/en/magazine.html?wcmmode=disabled', 3500)
await rec.start()
await rec.title('Chapter 1 · The <b>Orb</b> & HUD', 'Floating, per-site, colour-coded by environment')
await sleep(1200)
await rec.moveTo(1200, 500, 900)
await rec.hover('#asp-logo-btn', 1100)
await sleep(1800)
const fan = await rec.tab.eval(`(() => { const f = (function find(r){ const e = r.querySelector('#asp-orb-fan'); if (e) return e; for (const n of r.querySelectorAll('*')) if (n.shadowRoot) { const x = find(n.shadowRoot); if (x) return x } return null })(document);
  return f ? [...f.children].map(c => ({ id: c.id, label: c.getAttribute('aria-label') || c.title })) : null })()`)
console.log('fan leaves:', JSON.stringify(fan))
await sleep(800)
await rec.untitle()
await sleep(600)
console.log('frames', await rec.stop())
console.log(rec.render('video/work/smoke.mp4'))
const shot = await rec.tab.send('Page.captureScreenshot', { format: 'png' })
const fs = await import('node:fs')
fs.writeFileSync('video/work/smoke-fan.png', Buffer.from(shot.data, 'base64'))
await rec.close()
process.exit(0)
