// Final Walkthrough Assembly & Highlights Cut for v3
// Concatenates all 13 v3 chapters into orbit-for-aem-walkthrough.mp4 with embedded MP4 chapter markers,
// generates a ~3-minute executive highlights reel, promotes v3 to canonical release files,
// updates -final symlinks, and extracts high-res tutorial posters.
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'video', 'out')
const TUTORIAL = path.join(ROOT, 'docs', 'tutorial')
const POSTERS = path.join(TUTORIAL, 'posters')
const VIDEOS = path.join(TUTORIAL, 'videos')

const CHAPTERS = [
  { id: '00-intro', num: '00', title: 'Introduction & Architecture' },
  { id: '01-orb', num: '01', title: 'The Orb & HUD Radial Fan' },
  { id: '01b-orb-position', num: '01b', title: 'Positioning & Summoning' },
  { id: '02-toolbar', num: '02', title: 'Toolbar & Navigation' },
  { id: '03-authoring', num: '03', title: 'Authoring & Replication Governance' },
  { id: '04-devtools', num: '04', title: 'Developer Tools & JCR Tree' },
  { id: '05-sync', num: '05', title: 'Content Synchronization' },
  { id: '06-seo', num: '06', title: 'SEO & Accessibility Audit' },
  { id: '07-workspace', num: '07', title: 'Popup Workspace Console' },
  { id: '08-eds', num: '08', title: 'Edge Delivery Services & Universal Editor' },
  { id: '09-enterprise', num: '09', title: 'Enterprise Governance & Managed Policies' },
  { id: '10-settings', num: '10', title: 'Settings & Options Console' },
  { id: '11-shortcuts', num: '11', title: 'Keyboard Shortcuts & Command Palette' },
]

console.log('=== Step 1: Probing v3 chapters and computing timestamps ===')
let currentMs = 0
const chapterMetadata = []
const concatList = []

for (const ch of CHAPTERS) {
  const file = path.join(OUT, `${ch.id}-v3.mp4`)
  if (!fs.existsSync(file)) {
    throw new Error(`Missing v3 chapter file: ${file}`)
  }
  const probe = JSON.parse(
    execSync(`ffprobe -v error -show_entries format=duration -of json "${file}"`).toString()
  )
  const durSec = parseFloat(probe.format.duration)
  const durMs = Math.round(durSec * 1000)
  const startMs = currentMs
  const endMs = currentMs + durMs
  currentMs = endMs

  chapterMetadata.push({
    ...ch,
    durSec,
    startMs,
    endMs,
  })
  concatList.push(`file '${file}'`)
  console.log(`  ${ch.num} - ${ch.title.padEnd(42)}: ${(startMs / 1000).toFixed(1)}s -> ${(endMs / 1000).toFixed(1)}s (${durSec.toFixed(1)}s)`)
}

const totalSec = currentMs / 1000
console.log(`Total duration: ${totalSec.toFixed(1)}s (${(totalSec / 60).toFixed(2)} min)\n`)

// Write FFMETADATA file
const metaLines = [
  ';FFMETADATA1',
  'major_brand=isom',
  'minor_version=512',
  'compatible_brands=isomiso2avc1mp41',
  'title=AEM Orbit — Comprehensive Walkthrough (v3)',
  'comment=Recorded against live AEM instances in 1920x1080 60fps with Christopher Neural voiceover',
  'encoder=Antigravity AEM Orbit Video Pipeline v3',
]

for (const ch of chapterMetadata) {
  metaLines.push('')
  metaLines.push('[CHAPTER]')
  metaLines.push('TIMEBASE=1/1000')
  metaLines.push(`START=${ch.startMs}`)
  metaLines.push(`END=${ch.endMs}`)
  metaLines.push(`title=Chapter ${ch.num} · ${ch.title}`)
}

const metaFile = path.join(OUT, 'chapters-metadata.txt')
fs.writeFileSync(metaFile, metaLines.join('\n') + '\n')

const concatListFile = path.join(OUT, 'concat-list.txt')
fs.writeFileSync(concatListFile, concatList.join('\n') + '\n')

console.log('=== Step 2: Concatenating full walkthrough video with chapters ===')
const fullOutput = path.join(OUT, 'orbit-for-aem-walkthrough.mp4')
const tempConcat = path.join(OUT, 'orbit-for-aem-walkthrough.temp.mp4')

// 1. Concat streams without re-encoding
execSync(
  `ffmpeg -y -v error -f concat -safe 0 -i "${concatListFile}" -c copy "${tempConcat}"`,
  { stdio: 'inherit' }
)

// 2. Add chapter metadata
execSync(
  `ffmpeg -y -v error -i "${tempConcat}" -i "${metaFile}" -map_metadata 1 -c copy -movflags +faststart "${fullOutput}"`,
  { stdio: 'inherit' }
)
fs.unlinkSync(tempConcat)

const fullStat = fs.statSync(fullOutput)
console.log(`Created: ${fullOutput} (${(fullStat.size / (1024 * 1024)).toFixed(1)} MB)\n`)

console.log('=== Step 3: Generating ~3-minute Highlights Cut from v3 ===')
const HIGHLIGHT_CLIPS = [
  { file: '00-intro-v3.mp4', start: 5.0, dur: 25.0, label: 'Intro & Floating HUD' },
  { file: '01-orb-v3.mp4', start: 16.0, dur: 26.0, label: 'Orb 7-Leaf Radial Fan' },
  { file: '02-toolbar-v3.mp4', start: 45.0, dur: 27.0, label: 'Toolbar & Cross-Env Switching' },
  { file: '03-authoring-v3.mp4', start: 30.0, dur: 28.0, label: 'Replication Pre-Flight & Governance' },
  { file: '04-devtools-v3.mp4', start: 10.0, dur: 28.0, label: 'JCR Tree & Component Overlays' },
  { file: '05-sync-v3.mp4', start: 18.0, dur: 24.0, label: '1-Click Content Sync & Diff' },
  { file: '11-shortcuts-v3.mp4', start: 12.0, dur: 24.0, label: 'Command Palette Cmd+K' },
  { file: '00-intro-v3.mp4', start: 82.0, dur: 16.0, label: 'Wrap-up & Zero-Trust Architecture' },
]

const hlConcatList = []
const hlTempDir = path.join(OUT, 'highlights-scratch')
if (!fs.existsSync(hlTempDir)) fs.mkdirSync(hlTempDir, { recursive: true })

for (let i = 0; i < HIGHLIGHT_CLIPS.length; i++) {
  const clip = HIGHLIGHT_CLIPS[i]
  const clipFile = path.join(hlTempDir, `clip-${i}.mp4`)
  const srcFile = path.join(OUT, clip.file)
  console.log(`  Extracting clip ${i + 1}/${HIGHLIGHT_CLIPS.length}: ${clip.label} (${clip.dur}s)`)
  execSync(
    `ffmpeg -y -v error -ss ${clip.start} -i "${srcFile}" -t ${clip.dur} -c:v libx264 -preset fast -crf 17 -r 60 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 1 "${clipFile}"`,
    { stdio: 'inherit' }
  )
  hlConcatList.push(`file '${clipFile}'`)
}

const hlListFile = path.join(hlTempDir, 'highlights-list.txt')
fs.writeFileSync(hlListFile, hlConcatList.join('\n') + '\n')

const highlightsOutput = path.join(OUT, 'orbit-for-aem-highlights.mp4')
execSync(
  `ffmpeg -y -v error -f concat -safe 0 -i "${hlListFile}" -c copy -movflags +faststart "${highlightsOutput}"`,
  { stdio: 'inherit' }
)

// Clean scratch
for (let i = 0; i < HIGHLIGHT_CLIPS.length; i++) {
  fs.unlinkSync(path.join(hlTempDir, `clip-${i}.mp4`))
}
fs.unlinkSync(hlListFile)
fs.rmdirSync(hlTempDir)

const hlStat = fs.statSync(highlightsOutput)
const hlProbe = JSON.parse(
  execSync(`ffprobe -v error -show_entries format=duration -of json "${highlightsOutput}"`).toString()
)
console.log(`Created: ${highlightsOutput} (${parseFloat(hlProbe.format.duration).toFixed(1)}s, ${(hlStat.size / (1024 * 1024)).toFixed(1)} MB)\n`)

console.log('=== Step 4: Extracting Posters & Linking v3 Tutorial Videos ===')
if (!fs.existsSync(POSTERS)) fs.mkdirSync(POSTERS, { recursive: true })
if (!fs.existsSync(VIDEOS)) fs.mkdirSync(VIDEOS, { recursive: true })

for (const ch of CHAPTERS) {
  const v3File = path.join(OUT, `${ch.id}-v3.mp4`)

  // Extract clean poster frame at 6.0s (after title pill auto-dismisses)
  const posterFile = path.join(POSTERS, `${ch.id}.jpg`)
  execSync(
    `ffmpeg -y -v error -ss 6.0 -i "${v3File}" -vframes 1 -vf "scale=800:450" -q:v 2 "${posterFile}"`,
    { stdio: 'inherit' }
  )
  console.log(`  Updated poster for ${ch.id}`)

  // Update relative symlink in docs/tutorial/videos/
  const tutorialVideoLink = path.join(VIDEOS, `${ch.id}-v3.mp4`)
  try {
    if (fs.existsSync(tutorialVideoLink) || fs.lstatSync(tutorialVideoLink)) fs.unlinkSync(tutorialVideoLink)
  } catch { /* ignore */ }
  fs.symlinkSync(`../../../video/out/${ch.id}-v3.mp4`, tutorialVideoLink)
}

console.log('\n=== All Operations Completed Successfully ===')
