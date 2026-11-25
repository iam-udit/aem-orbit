// Product Video Teaser Generator for AEM Orbit (v4)
// Run: node video/scripts/build-teaser.mjs
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { listTargets, Target } from '../lib/cdp.mjs'
import { synth } from '../lib/narrate.mjs'
import { logoSpiralPaths } from '../../src/shared/spiral.js'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'video', 'out')
const WORK = path.join(ROOT, 'video', 'work', 'teaser-v4')
fs.mkdirSync(WORK, { recursive: true })

const SEGMENTS = [
  { id: 'seg1', file: '00-intro-v4.mp4', start: 5.5, dur: 6.2, badge: 'Unified Cross-Browser HUD', voice: 'Meet AEM Orbit, built for Chrome, Edge, Firefox, and Safari.' },
  { id: 'seg2', file: '01-orb-v4.mp4', start: 14.0, dur: 5.2, badge: 'Persona-Adaptive Radial Orb', voice: 'Open the radial fan with persona-adaptive leaves anywhere.' },
  { id: 'seg3', file: '02-toolbar-v4.mp4', start: 17.0, dur: 5.8, badge: 'Live Personas & Scrollable Locales', voice: 'Switch Author, QA, Developer, or Custom workflows live.' },
  { id: 'seg4', file: '03-authoring-v4.mp4', start: 12.0, dur: 4.8, badge: 'Pre-Flight & Prod Guard', voice: 'Publish safely with pre-flight checks and Production Guard.' },
  { id: 'seg5', file: '04-devtools-v4.mp4', start: 8.0, dur: 5.6, badge: 'Expandable JCR & Dev Inspectors', voice: 'Expand full JCR trees and inspect CDN cache headers live.' },
  { id: 'seg6', file: '07-workspace-v4.mp4', start: 16.0, dur: 5.8, badge: 'QA Readiness & Popup Hub', voice: 'Run multi-tier QA readiness checks right from the Workspace popup.' },
  { id: 'seg7', file: '10-settings-v4.mp4', start: 22.0, dur: 5.4, badge: 'Brand Profiles & Diagnostics', voice: 'Configure brand profiles and run five-tier latency diagnostics.' },
  { id: 'seg8', file: '11-shortcuts-v4.mp4', start: 11.0, dur: 5.2, badge: '⌘K Fuzzy Command Palette', voice: 'Press Command+K to trigger any audit or command instantly.' },
  { id: 'seg9a', isTutorial: true, dur: 4.6, voice: 'Master every feature in our thirteen-chapter tutorial.' },
  { id: 'seg9b', isOutro: true, dur: 6.4, voice: 'Zero telemetry. Cross-browser. Get AEM Orbit today.' },
]

let runningOffset = 0
const voiceFiles = []
for (const seg of SEGMENTS) {
  const s = synth(seg.voice)
  voiceFiles.push({ id: seg.id, file: s.file, offsetMs: Math.round((runningOffset + 0.2) * 1000) })
  runningOffset += seg.dur
}

const targets = await listTargets()
const tabInfo = targets.find((t) => t.type === 'page')
if (!tabInfo) throw new Error('No Chrome page found on port 9333')
const tab = await new Target(tabInfo).open()
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })

const spiralSvg = logoSpiralPaths()

async function captureHtml(html, destPng, transparent = false) {
  const tmpHtmlPath = destPng.replace(/\.png$/, '.html')
  fs.writeFileSync(tmpHtmlPath, html)
  if (transparent) await tab.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  else await tab.send('Emulation.setDefaultBackgroundColorOverride')
  await tab.send('Page.navigate', { url: `file://${tmpHtmlPath}` })
  await new Promise((r) => setTimeout(r, 400))
  const shot = await tab.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  fs.writeFileSync(destPng, Buffer.from(shot.data, 'base64'))
}

for (let i = 0; i < SEGMENTS.length; i++) {
  const seg = SEGMENTS[i]
  if (seg.isTutorial || seg.isOutro) continue
  const topPx = seg.id === 'seg7' ? 44 : 118
  const html = `<!DOCTYPE html><html><body style="margin:0;background:transparent"><div style="position:fixed;top:${topPx}px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:12px;padding:10px 26px;border-radius:999px;background:rgba(13,17,23,.92);border:1.5px solid rgba(96,165,250,.55);color:#f3f6fb;font:700 25px/1.2 -apple-system,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.6)"><span style="width:10px;height:10px;border-radius:50%;background:#60a5fa"></span>${seg.badge}</div></body></html>`
  await captureHtml(html, path.join(WORK, `badge-${i + 1}.png`), true)
}

const introCardFile = path.join(WORK, 'intro-card.png')
await captureHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 1920px; height: 1080px; background: #0c0d10; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center; position: relative;
  }
  .glow {
    position: absolute; width: 1000px; height: 1000px; border-radius: 50%;
    background: radial-gradient(circle, rgba(235, 16, 0, 0.38) 0%, rgba(12, 13, 16, 0) 70%);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
  }
  .content {
    position: relative; z-index: 10; display: flex; flex-direction: column;
    align-items: center; text-align: center; gap: 22px; max-width: 1120px;
  }
  .logo-box {
    width: 112px; height: 112px; border-radius: 26px;
    background: linear-gradient(135deg, #eb1000 0%, #ff5a36 100%);
    display: flex; align-items: center; justify-content: center; padding: 20px;
    box-shadow: 0 12px 48px rgba(235, 16, 0, 0.55);
  }
  .logo-box svg { width: 70px; height: 70px; }
  h1.title {
    margin: 6px 0 0; color: #ffffff; font-size: 84px; font-weight: 800;
    letter-spacing: -2px; line-height: 1.05;
  }
  p.tagline {
    margin: 0; color: #b8bfcc; font-size: 28px; font-weight: 450; letter-spacing: -0.2px;
  }
  .tiers-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
  .tier-tag {
    padding: 8px 20px; background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px;
    color: #e5e8ee; font-size: 16px; font-weight: 600;
  }
</style></head><body>
  <div class="glow"></div>
  <div class="content">
    <div class="logo-box"><svg viewBox="0 0 24 24" fill="none">${spiralSvg}</svg></div>
    <h1 class="title">AEM Orbit</h1>
    <p class="tagline">Cross-Browser Personas &middot; Author &middot; QA &middot; Developer &middot; Custom</p>
    <div class="tiers-row">
      <div class="tier-tag">Author</div>
      <div class="tier-tag">Preview</div>
      <div class="tier-tag">Publish</div>
      <div class="tier-tag">Dispatcher CDN</div>
    </div>
  </div>
</body></html>`, introCardFile, false)

const tutorialCardFile = path.join(WORK, 'tutorial-card.png')
await captureHtml(`<!DOCTYPE html><html><body style="margin:0;width:1920px;height:1080px;background:#0a0d14;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:-apple-system,sans-serif;color:#fff"><h1 style="font-size:56px;margin:0 0 18px">13-Chapter AEM Orbit Masterclass</h1><p style="font-size:26px;color:#93c5fd;margin:0">iam-udit.github.io/aem-orbit/tutorial/</p></body></html>`, tutorialCardFile, false)

const outroCardFile = path.join(WORK, 'outro-card.png')
await captureHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 1920px; height: 1080px; background: #0c0d10; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center; position: relative;
  }
  .glow {
    position: absolute; width: 1060px; height: 1060px; border-radius: 50%;
    background: radial-gradient(circle, rgba(235, 16, 0, 0.34) 0%, rgba(12, 13, 16, 0) 70%);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
  }
  .content {
    position: relative; z-index: 10; display: flex; flex-direction: column;
    align-items: center; text-align: center; gap: 22px; max-width: 1080px;
  }
  .logo-box {
    width: 104px; height: 104px; border-radius: 24px;
    background: linear-gradient(135deg, #eb1000 0%, #ff5a36 100%);
    display: flex; align-items: center; justify-content: center; padding: 18px;
    box-shadow: 0 12px 45px rgba(235, 16, 0, 0.55);
  }
  .logo-box svg { width: 66px; height: 66px; }
  h1.title {
    margin: 0; color: #ffffff; font-size: 66px; font-weight: 800;
    letter-spacing: -1.8px; line-height: 1.08;
  }
  p.desc { margin: 0; color: #b8bfcc; font-size: 25px; max-width: 820px; line-height: 1.4; }
  .pills-row { display: flex; gap: 12px; margin-top: 2px; }
  .pill {
    padding: 8px 20px; border-radius: 999px;
    background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e5e8ee; font-size: 16px; font-weight: 600;
  }
  .cta-container {
    margin-top: 8px; padding: 20px 44px;
    background: linear-gradient(135deg, rgba(235, 16, 0, 0.24) 0%, rgba(255, 90, 54, 0.14) 100%);
    border: 1px solid rgba(235, 16, 0, 0.55); border-radius: 20px;
    box-shadow: 0 16px 48px rgba(235, 16, 0, 0.35);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .cta-headline { color: #ffffff; font-size: 24px; font-weight: 700; }
  .cta-link {
    color: #ff6b5e; font-size: 22px; font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style></head><body>
  <div class="glow"></div>
  <div class="content">
    <div class="logo-box"><svg viewBox="0 0 24 24" fill="none">${spiralSvg}</svg></div>
    <h1 class="title">Upgrade Your AEM Workflow</h1>
    <p class="desc">Chrome &middot; Edge &middot; Firefox &middot; Safari &middot; Zero Telemetry</p>
    <div class="pills-row">
      <div class="pill">4 Workspace Personas</div>
      <div class="pill">100% Client-Side</div>
      <div class="pill">Manifest V3</div>
      <div class="pill">Open Source</div>
    </div>
    <div class="cta-container">
      <div class="cta-headline">Watch the Full 13-Chapter Masterclass</div>
      <div class="cta-link">iam-udit.github.io/aem-orbit/tutorial/</div>
    </div>
  </div>
</body></html>`, outroCardFile, false)

await tab.close()

const segmentFiles = []
for (let i = 0; i < SEGMENTS.length; i++) {
  const seg = SEGMENTS[i]
  const out = path.join(WORK, `cut-${i + 1}.mp4`)
  const badge = path.join(WORK, `badge-${i + 1}.png`)
  if (seg.isOutro || seg.isTutorial) {
    const img = seg.isOutro ? outroCardFile : tutorialCardFile
    execSync(`ffmpeg -y -v error -loop 1 -i "${img}" -t ${seg.dur} -vf "scale=1920:1080,fps=60,format=yuv420p" -c:v libx264 -preset fast -crf 17 "${out}"`, { stdio: 'inherit' })
  } else {
    const src = path.join(OUT, seg.file)
    if (i === 0) {
      execSync(`ffmpeg -y -v error -ss ${seg.start} -i "${src}" -loop 1 -i "${introCardFile}" -i "${badge}" -t ${seg.dur} -filter_complex "[1:v]scale=1920:1080,fps=60,format=rgba,trim=duration=1.6,fade=t=out:st=1.1:d=0.5:alpha=1[intro];[0:v]scale=1920:1080,fps=60,trim=duration=${seg.dur}[vid];[vid][intro]overlay=0:0[withintro];[withintro][2:v]overlay=0:0:enable='between(t,1.6,${seg.dur - 0.2})'[outv]" -map "[outv]" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p "${out}"`, { stdio: 'inherit' })
    } else {
      execSync(`ffmpeg -y -v error -ss ${seg.start} -i "${src}" -i "${badge}" -t ${seg.dur} -filter_complex "[0:v]scale=1920:1080,fps=60,trim=duration=${seg.dur}[vid];[vid][1:v]overlay=0:0:enable='between(t,0.3,${seg.dur - 0.2})'[outv]" -map "[outv]" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p "${out}"`, { stdio: 'inherit' })
    }
  }
  segmentFiles.push(`file '${out}'`)
}

const segList = path.join(WORK, 'segments-list.txt')
fs.writeFileSync(segList, segmentFiles.join('\n') + '\n')
const rawVideo = path.join(WORK, 'video-concat.mp4')
execSync(`ffmpeg -y -v error -f concat -safe 0 -i "${segList}" -c copy "${rawVideo}"`, { stdio: 'inherit' })

const audioInputs = [rawVideo, ...voiceFiles.map((v) => v.file)].map((f) => `-i "${f}"`).join(' ')
const filters = voiceFiles.map((v, i) => `[${i + 1}:a]adelay=${v.offsetMs}|${v.offsetMs},volume=1.0[voice_${i}]`)
filters.push(`${voiceFiles.map((_, i) => `[voice_${i}]`).join('')}amix=inputs=${voiceFiles.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9[master_audio]`)

const outV4 = path.join(OUT, 'orbit-for-aem-teaser-1min-v4.mp4')
execSync(`ffmpeg -y -v error ${audioInputs} -filter_complex "${filters.join(';')}" -map 0:v -map "[master_audio]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "${outV4}"`, { stdio: 'inherit' })
fs.copyFileSync(outV4, path.join(OUT, 'orbit-for-aem-teaser-1min.mp4'))

execSync(`ffmpeg -y -v error -ss 0.6 -i "${outV4}" -vframes 1 -q:v 2 "${path.join(ROOT, 'docs', 'tutorial', 'videos', 'orbit-for-aem-teaser-poster.jpg')}"`)
execSync(`ffmpeg -y -v error -ss 0.6 -i "${outV4}" -vframes 1 -q:v 2 "${path.join(ROOT, 'docs', 'tutorial', 'posters', 'orbit-for-aem-teaser.jpg')}"`)
console.log('=== v4 Teaser Created:', outV4)
