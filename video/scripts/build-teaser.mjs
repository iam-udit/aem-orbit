// Professional Product Video Generator for AEM Orbit
// Run: node video/scripts/build-teaser.mjs
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { listTargets, Target } from '../lib/cdp.mjs'
import { synth } from '../lib/narrate.mjs'
import { logoSpiralPaths } from '../../src/shared/spiral.js'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'video', 'out')
const WORK = path.join(ROOT, 'video', 'work', 'teaser')
fs.mkdirSync(WORK, { recursive: true })

console.log('=== Step 1: Synthesizing Spoken Topic Voiceovers ===')
// 11 Segments covering all primary capabilities, mathematically timed to exactly 60.00s
const SEGMENTS = [
  {
    id: 'seg1',
    file: '00-intro-v3.mp4',
    start: 5.5,
    dur: 6.5,
    badge: 'Unified Floating HUD',
    voice: 'Meet AEM Orbit. Unified floating controls for Experience Manager.',
  },
  {
    id: 'seg2',
    file: '01-orb-v3.mp4',
    start: 15.0,
    dur: 5.2,
    badge: '7-Leaf Radial Fan Menu',
    voice: 'Open the seven-leaf radial fan, or dock the Orb anywhere.',
  },
  {
    id: 'seg3',
    file: '02-toolbar-v3.mp4',
    start: 46.0,
    dur: 5.8,
    badge: 'Multi-Tier Switching',
    voice: 'Switch between Dev, Stage, and Prod across Author and CDN.',
  },
  {
    id: 'seg4',
    file: '03-authoring-v3.mp4',
    start: 72.0,
    dur: 4.8,
    badge: 'Production Guard & Locks',
    voice: 'Publish safely with pre-flight checks and Production Guard.',
  },
  {
    id: 'seg5',
    file: '04-devtools-v3.mp4',
    start: 35.0,
    dur: 5.8,
    badge: 'In-Page JCR Tree & Dev Tools',
    voice: 'Inspect live JCR trees and check CDN cache headers on page.',
  },
  {
    id: 'seg6',
    file: '05-sync-v3.mp4',
    start: 18.0,
    dur: 5.0,
    badge: 'Guardrailed Content Sync',
    voice: 'Sync content between environments with visual diff and undo.',
  },
  {
    id: 'seg7',
    file: '07-workspace-v3.mp4',
    start: 13.0,
    dur: 5.5,
    badge: 'Extension Popup Workspace',
    voice: 'Popup workspace for page search, compare, and quick tools.',
  },
  {
    id: 'seg8',
    file: '10-settings-v3.mp4',
    start: 14.0,
    dur: 5.2,
    badge: 'Configuration & Safety Settings',
    isSettings: true,
    voice: 'Configure environments, safety locks, and toolbar buttons.',
  },
  {
    id: 'seg9',
    file: '11-shortcuts-v3.mp4',
    start: 12.0,
    dur: 5.0,
    badge: '⌘K Fuzzy Command Palette',
    voice: 'Press Command+K to trigger any action with fuzzy search.',
  },
  {
    id: 'seg10a',
    isTutorial: true,
    dur: 4.6,
    voice: 'Master every feature in our thirteen-chapter tutorial.',
  },
  {
    id: 'seg10b',
    isOutro: true,
    dur: 6.6,
    voice: 'Zero telemetry. Open source. Get AEM Orbit today.',
  },
]

// Compute offsets and synthesize voice tracks
let runningOffset = 0
const voiceFiles = []
for (let i = 0; i < SEGMENTS.length; i++) {
  const seg = SEGMENTS[i]
  const s = synth(seg.voice)
  const offsetMs = Math.round((runningOffset + 0.2) * 1000)
  voiceFiles.push({ id: seg.id, file: s.file, dur: s.seconds, offsetMs, text: seg.voice })
  console.log(`  [${seg.id}] offset: ${(offsetMs / 1000).toFixed(2)}s | voice: ${s.seconds.toFixed(2)}s / seg ${seg.dur}s | "${seg.voice}"`)
  runningOffset += seg.dur
}

const totalVideoDur = SEGMENTS.reduce((sum, s) => sum + s.dur, 0)
console.log(`\nTotal Teaser Duration: ${totalVideoDur.toFixed(2)} seconds\n`)

console.log('=== Step 2: Generating HUD Heading Pills & Cards via CDP ===')
const targets = await listTargets()
const tabInfo = targets.find((t) => t.type === 'page')
if (!tabInfo) throw new Error('No Chrome page found on port 9333')
const tab = await new Target(tabInfo).open()
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })

const spiralSvg = logoSpiralPaths()

// Helper to capture a full 1920x1080 screenshot from HTML content via file navigation
async function captureHtml(html, destPng, transparent = false) {
  const tmpHtmlPath = destPng.replace(/\.png$/, '.html')
  fs.writeFileSync(tmpHtmlPath, html)
  if (transparent) {
    await tab.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  } else {
    await tab.send('Emulation.setDefaultBackgroundColorOverride')
  }
  await tab.send('Page.navigate', { url: `file://${tmpHtmlPath}` })
  await new Promise((r) => setTimeout(r, 450))
  const shot = await tab.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  fs.writeFileSync(destPng, Buffer.from(shot.data, 'base64'))
}

// 1. HUD Heading Pills
// For WKND frames: top: 118px (10px lower than 108px, centered vertically in the WKND black header)
// For Settings page: top: 44px (centered directly in browser URL bar, avoiding the settings header)
// Tutorial frame: heading pill omitted per user requirement
for (let i = 0; i < SEGMENTS.length; i++) {
  const seg = SEGMENTS[i]
  if (seg.isTutorial || seg.isOutro) continue

  const pillTop = seg.isSettings ? '44px' : '118px'
  const badgeHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1920px;
      height: 1080px;
      background: transparent;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Inter", sans-serif;
    }
    .hud-pill {
      position: absolute;
      top: ${pillTop};
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 6px 20px 6px 10px;
      background: rgba(10, 12, 16, 0.92);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), 0 0 18px rgba(235, 16, 0, 0.25);
    }
    .logo-orb {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #eb1000 0%, #ff5a36 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 10px rgba(235, 16, 0, 0.5);
      flex-shrink: 0;
    }
    .logo-orb svg { width: 17px; height: 17px; }
    .brand-tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.6px;
      color: #ff6b5e;
      text-transform: uppercase;
    }
    .sep {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.20);
    }
    .feature-label {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #00ff88;
      box-shadow: 0 0 8px #00ff88;
      margin-left: 2px;
    }
  </style></head><body>
    <div class="hud-pill">
      <div class="logo-orb"><svg viewBox="0 0 24 24" fill="none">${spiralSvg}</svg></div>
      <div class="brand-tag">AEM ORBIT</div>
      <div class="sep"></div>
      <div class="feature-label">${seg.badge}</div>
      <div class="live-dot"></div>
    </div>
  </body></html>`
  const badgeFile = path.join(WORK, `badge-${i + 1}.png`)
  await captureHtml(badgeHtml, badgeFile, true)
  console.log(`  Rendered HUD Pill ${i + 1} at top: ${pillTop} (${seg.badge})`)
}

// 2. Cold Open Card (Clean red glow background, kicker pill removed)
const introHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1920px;
    height: 1080px;
    background: #0c0d10;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Inter", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .glow {
    position: absolute;
    width: 1000px;
    height: 1000px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(235, 16, 0, 0.35) 0%, rgba(12, 13, 16, 0) 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 24px;
    max-width: 1100px;
  }
  .logo-box {
    width: 96px;
    height: 96px;
    border-radius: 24px;
    background: linear-gradient(135deg, #eb1000 0%, #ff5a36 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 45px rgba(235, 16, 0, 0.55);
  }
  .logo-box svg { width: 62px; height: 62px; }
  h1.title {
    margin: 0;
    color: #ffffff;
    font-size: 80px;
    font-weight: 850;
    letter-spacing: -2px;
    line-height: 1.05;
  }
  p.tagline {
    margin: 0;
    color: #9aa1ae;
    font-size: 28px;
    font-weight: 450;
    max-width: 860px;
    line-height: 1.35;
    letter-spacing: -0.3px;
  }
  .tiers-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 6px;
  }
  .tier-tag {
    padding: 8px 18px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    color: #e5e8ee;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }
</style></head><body>
  <div class="glow"></div>
  <div class="content">
    <div class="logo-box">
      <svg viewBox="0 0 24 24" fill="none">${spiralSvg}</svg>
    </div>
    <h1 class="title">AEM Orbit</h1>
    <p class="tagline">The unified floating control surface for Adobe Experience Manager.</p>
    <div class="tiers-row">
      <div class="tier-tag">Author</div>
      <div class="tier-tag">Preview</div>
      <div class="tier-tag">Publish</div>
      <div class="tier-tag">Dispatcher CDN</div>
    </div>
  </div>
</body></html>`
const introCardFile = path.join(WORK, 'intro-card.png')
await captureHtml(introHtml, introCardFile, false)
console.log('  Rendered Cold Open Card (Clean red glow background, kicker pill removed)')

// 3. Capture Tutorial Masterclass page directly from docs/tutorial/index.html
const tutorialCardFile = path.join(WORK, 'tutorial-card.png')
await tab.send('Emulation.setDefaultBackgroundColorOverride')
await tab.send('Page.navigate', { url: `file://${ROOT}/docs/tutorial/index.html#00-intro` })
await new Promise((r) => setTimeout(r, 1200))
const tutShot = await tab.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
fs.writeFileSync(tutorialCardFile, Buffer.from(tutShot.data, 'base64'))
console.log('  Captured Tutorial Player Page')

// 4. Grand Finale Launch Card (Outro with clean red glow background)
const outroHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1920px;
    height: 1080px;
    background: #0c0d10;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Inter", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .glow {
    position: absolute;
    width: 1100px;
    height: 900px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(235, 16, 0, 0.30) 0%, rgba(12, 13, 16, 0) 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 22px;
    max-width: 1080px;
  }
  .logo-box {
    width: 96px;
    height: 96px;
    border-radius: 24px;
    background: linear-gradient(135deg, #eb1000 0%, #ff5a36 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 45px rgba(235, 16, 0, 0.55);
  }
  .logo-box svg { width: 62px; height: 62px; }
  h1.title {
    margin: 0;
    color: #ffffff;
    font-size: 68px;
    font-weight: 850;
    letter-spacing: -2px;
    line-height: 1.08;
  }
  p.desc {
    margin: 0;
    color: #9aa1ae;
    font-size: 25px;
    max-width: 800px;
    line-height: 1.4;
  }
  .pills-row {
    display: flex;
    gap: 12px;
    margin-top: 2px;
  }
  .pill {
    padding: 8px 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e5e8ee;
    font-size: 15px;
    font-weight: 600;
  }
  .cta-container {
    margin-top: 10px;
    padding: 22px 48px;
    background: linear-gradient(135deg, rgba(235, 16, 0, 0.24) 0%, rgba(255, 90, 54, 0.14) 100%);
    border: 1px solid rgba(235, 16, 0, 0.55);
    border-radius: 20px;
    box-shadow: 0 16px 48px rgba(235, 16, 0, 0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .cta-headline {
    color: #ffffff;
    font-size: 25px;
    font-weight: 750;
    letter-spacing: 0.3px;
  }
  .cta-link {
    color: #ff6b5e;
    font-size: 23px;
    font-weight: 750;
    letter-spacing: 0.6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .meta-badges {
    display: flex;
    align-items: center;
    gap: 16px;
    color: #717886;
    font-size: 15px;
    margin-top: 4px;
  }
  .logo-box svg { width: 62px; height: 62px; }
  h1.title {
    margin: 0;
    color: #ffffff;
    font-size: 68px;
    font-weight: 850;
    letter-spacing: -2px;
    line-height: 1.08;
    background: linear-gradient(180deg, #ffffff 40%, #c8ced8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p.desc {
    margin: 0;
    color: #9aa1ae;
    font-size: 25px;
    max-width: 800px;
    line-height: 1.4;
  }
  .pills-row {
    display: flex;
    gap: 12px;
    margin-top: 2px;
  }
  .pill {
    padding: 8px 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e5e8ee;
    font-size: 15px;
    font-weight: 600;
  }
  .cta-container {
    margin-top: 10px;
    padding: 22px 48px;
    background: linear-gradient(135deg, rgba(235, 16, 0, 0.24) 0%, rgba(255, 90, 54, 0.14) 100%);
    border: 1px solid rgba(235, 16, 0, 0.55);
    border-radius: 20px;
    box-shadow: 0 16px 48px rgba(235, 16, 0, 0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .cta-headline {
    color: #ffffff;
    font-size: 25px;
    font-weight: 750;
    letter-spacing: 0.3px;
  }
  .cta-link {
    color: #ff6b5e;
    font-size: 23px;
    font-weight: 750;
    letter-spacing: 0.6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .meta-badges {
    display: flex;
    align-items: center;
    gap: 16px;
    color: #717886;
    font-size: 15px;
    margin-top: 4px;
  }
</style></head><body>
  <div class="grid-pattern"></div>
  <div class="glow-large"></div>
  <div class="vignette"></div>
  <div class="content">
    <div class="logo-box">
      <svg viewBox="0 0 24 24" fill="none">${spiralSvg}</svg>
    </div>
    <h1 class="title">Upgrade Your AEM Experience</h1>
    <p class="desc">A revolutionary floating workspace built exclusively for Adobe Experience Manager engineers and authors.</p>
    <div class="pills-row">
      <div class="pill">🛡️ 100% Client-Side</div>
      <div class="pill">🔒 Zero Telemetry</div>
      <div class="pill">⚡ Manifest V3</div>
      <div class="pill">🌟 Open Source</div>
    </div>
    <div class="cta-container">
      <div class="cta-headline">👉 Watch the Full 13-Chapter Masterclass</div>
      <div class="cta-link">iam-udit.github.io/aem-orbit/tutorial/</div>
    </div>
    <div class="meta-badges">
      <span>Chrome & Edge Extension</span>
      <span>•</span>
      <span>github.com/iam-udit/aem-orbit</span>
    </div>
  </div>
</body></html>`
const outroCardFile = path.join(WORK, 'outro-card.png')
await captureHtml(outroHtml, outroCardFile, false)
console.log('  Rendered Outro Card\n')

await tab.close()

console.log('=== Step 3: Cutting Video Segments & Overlaying HUD Pills ===')
const segmentFiles = []

for (let i = 0; i < SEGMENTS.length; i++) {
  const seg = SEGMENTS[i]
  const segOutputFile = path.join(WORK, `cut-${i + 1}.mp4`)
  const badgeFile = path.join(WORK, `badge-${i + 1}.png`)

  if (seg.isOutro) {
    // Generate Outro video with slow push-in (zoompan)
    console.log(`  Building Segment ${i + 1}: Outro Card (${seg.dur}s)`)
    execSync(
      `ffmpeg -y -v error -loop 1 -i "${outroCardFile}" -t ${seg.dur} -vf "scale=1920:1080,fps=60,zoompan=z='min(zoom+0.0003,1.035)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p "${segOutputFile}"`,
      { stdio: 'inherit' }
    )
  } else if (seg.isTutorial) {
    // Generate Tutorial player showcase video WITHOUT heading pill per user instruction
    console.log(`  Building Segment ${i + 1}: Tutorial Masterclass Showcase (No Pill) (${seg.dur}s)`)
    execSync(
      `ffmpeg -y -v error -loop 1 -i "${tutorialCardFile}" -t ${seg.dur} -vf "scale=1920:1080,fps=60,zoompan=z='min(zoom+0.0004,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p "${segOutputFile}"`,
      { stdio: 'inherit' }
    )
  } else {
    console.log(`  Building Segment ${i + 1}: ${seg.id} from ${seg.file} (${seg.dur}s)`)
    const srcFile = path.join(OUT, seg.file)

    if (i === 0) {
      // Segment 1: Cold Open intro card fading into live authoring HUD
      execSync(
        `ffmpeg -y -v error -ss ${seg.start} -i "${srcFile}" -loop 1 -i "${introCardFile}" -i "${badgeFile}" -t ${seg.dur} -filter_complex "[1:v]scale=1920:1080,fps=60,format=rgba,trim=duration=1.8,fade=t=out:st=1.3:d=0.5:alpha=1[intro];[0:v]scale=1920:1080,fps=60,trim=duration=${seg.dur}[vid];[vid][intro]overlay=0:0[withintro];[withintro][2:v]overlay=0:0:enable='between(t,1.8,${seg.dur - 0.2})'[outv]" -map "[outv]" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p "${segOutputFile}"`,
        { stdio: 'inherit' }
      )
    } else {
      // Overlay HUD pill with smooth fade
      execSync(
        `ffmpeg -y -v error -ss ${seg.start} -i "${srcFile}" -i "${badgeFile}" -t ${seg.dur} -filter_complex "[0:v]scale=1920:1080,fps=60,trim=duration=${seg.dur}[vid];[vid][1:v]overlay=0:0:enable='between(t,0.3,${seg.dur - 0.2})'[outv]" -map "[outv]" -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p "${segOutputFile}"`,
        { stdio: 'inherit' }
      )
    }
  }

  segmentFiles.push(`file '${segOutputFile}'`)
}

const segListFile = path.join(WORK, 'segments-list.txt')
fs.writeFileSync(segListFile, segmentFiles.join('\n') + '\n')

console.log('\n=== Step 4: Concatenating Video Track ===')
const rawConcatVideo = path.join(WORK, 'video-concat.mp4')
execSync(
  `ffmpeg -y -v error -f concat -safe 0 -i "${segListFile}" -c copy "${rawConcatVideo}"`,
  { stdio: 'inherit' }
)
console.log(`  Combined ${SEGMENTS.length} segments into raw video (${(fs.statSync(rawConcatVideo).size / (1024 * 1024)).toFixed(1)} MB)\n`)

console.log('=== Step 5: Mixing Topic Voiceovers (Zero Click Sounds) ===')
const audioInputs = [rawConcatVideo, ...voiceFiles.map((v) => v.file)]
const inputArgs = audioInputs.map((f) => `-i "${f}"`).join(' ')
const filters = []

// Delay each voice track to its segment start + 200ms
for (let i = 0; i < voiceFiles.length; i++) {
  const inputIdx = 1 + i
  const delayMs = voiceFiles[i].offsetMs
  filters.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=1.0[voice_${i}]`)
}

const voiceMixList = voiceFiles.map((_, i) => `[voice_${i}]`).join('')
filters.push(`${voiceMixList}amix=inputs=${voiceFiles.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9[master_audio]`)

const finalOutputFile = path.join(OUT, 'orbit-for-aem-teaser-1min.mp4')
const filterGraph = filters.join(';')

execSync(
  `ffmpeg -y -v error ${inputArgs} -filter_complex "${filterGraph}" -map 0:v -map "[master_audio]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "${finalOutputFile}"`,
  { stdio: 'inherit' }
)

const stat = fs.statSync(finalOutputFile)
const probe = JSON.parse(
  execSync(`ffprobe -v error -show_entries format=duration -of json "${finalOutputFile}"`).toString()
)
console.log(`\n🎉 Product Video Created: ${finalOutputFile}`)
console.log(`   Duration: ${parseFloat(probe.format.duration).toFixed(2)}s`)
console.log(`   Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`)
console.log('   Resolution: 1920x1080 60fps')
console.log('   Audio: Broadcast -16 LUFS (Topic Voiceovers on Every Section, Zero Clicks)\n')

// Also export poster frames for web video tag at t=1.0s
const posterFile = path.join(ROOT, 'docs', 'tutorial', 'videos', 'orbit-for-aem-teaser-poster.jpg')
const posterGitFile = path.join(ROOT, 'docs', 'tutorial', 'posters', 'orbit-for-aem-teaser.jpg')
execSync(`ffmpeg -y -v error -ss 1.0 -i "${finalOutputFile}" -vframes 1 -q:v 2 "${posterFile}"`)
execSync(`ffmpeg -y -v error -ss 1.0 -i "${finalOutputFile}" -vframes 1 -q:v 2 "${posterGitFile}"`)
console.log(`  Exported poster frames:\n    ${posterFile}\n    ${posterGitFile}\n`)

// Clean scratch segment files
for (let i = 0; i < SEGMENTS.length; i++) {
  try { fs.unlinkSync(path.join(WORK, `cut-${i + 1}.mp4`)) } catch { /* ignore */ }
}
try { fs.unlinkSync(segListFile) } catch { /* ignore */ }
try { fs.unlinkSync(rawConcatVideo) } catch { /* ignore */ }
console.log('=== All Product Video Operations Completed Successfully ===')
