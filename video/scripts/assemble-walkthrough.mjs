// Final Walkthrough Assembly & Highlights Cut for v4
// Preserves all v3 files untouched; concatenates all 13 v4 chapters into orbit-for-aem-walkthrough-v4.mp4
// and updates canonical tutorial posters, symlinks, and highlights reel.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'video', 'out')
const TUTORIAL = path.join(ROOT, 'docs', 'tutorial')
const POSTERS = path.join(TUTORIAL, 'posters')
const VIDEOS = path.join(TUTORIAL, 'videos')

const CHAPTERS = [
  { id: '00-intro', num: '00', title: 'Introduction & Persona Architecture' },
  { id: '01-orb', num: '01', title: 'The Orb & Persona-Adaptive Fan' },
  { id: '01b-orb-position', num: '01b', title: 'Positioning & Summoning' },
  { id: '02-toolbar', num: '02', title: 'Toolbar, Live Personas & Scrollable Locales' },
  { id: '03-authoring', num: '03', title: 'Authoring & Replication Governance' },
  { id: '04-devtools', num: '04', title: 'Developer Tools & Expandable JCR Tree' },
  { id: '05-sync', num: '05', title: 'Content Synchronization' },
  { id: '06-seo', num: '06', title: 'SEO, Accessibility & Image Audits' },
  { id: '07-workspace', num: '07', title: 'Popup Workspace & QA Readiness' },
  { id: '08-eds', num: '08', title: 'Edge Delivery Services & Universal Editor' },
  { id: '09-enterprise', num: '09', title: 'Enterprise Brand Profiles & Persona Policy' },
  { id: '10-settings', num: '10', title: 'Settings Console & Multi-Tier Diagnostics' },
  { id: '11-shortcuts', num: '11', title: 'Keyboard Shortcuts & Command Palette' },
]

console.log('=== Step 1: Probing v4 chapters and computing timestamps ===')
let currentMs = 0
const chapterMetadata = []
const concatList = []

for (const ch of CHAPTERS) {
  const file = path.join(OUT, `${ch.id}-v4.mp4`)
  if (!fs.existsSync(file)) throw new Error(`Missing v4 chapter file: ${file}`)
  const probe = JSON.parse(
    execSync(`ffprobe -v error -show_entries format=duration -of json "${file}"`).toString()
  )
  const durSec = parseFloat(probe.format.duration)
  const durMs = Math.round(durSec * 1000)
  const startMs = currentMs
  const endMs = currentMs + durMs
  currentMs = endMs
  chapterMetadata.push({ ...ch, durSec, startMs, endMs })
  concatList.push(`file '${file}'`)
  console.log(`  ${ch.num.padEnd(3)} - ${ch.title.padEnd(46)}: ${(startMs / 1000).toFixed(1)}s -> ${(endMs / 1000).toFixed(1)}s (${durSec.toFixed(1)}s)`)
}

const metaLines = [
  ';FFMETADATA1',
  'major_brand=isom',
  'minor_version=512',
  'compatible_brands=isomiso2avc1mp41',
  'title=AEM Orbit — Comprehensive Walkthrough',
  'comment=Recorded against live AEM instances in 1920x1080 60fps with Christopher Neural voiceover',
  'encoder=AEM Orbit Video Pipeline',
]
for (const ch of chapterMetadata) {
  metaLines.push('', '[CHAPTER]', 'TIMEBASE=1/1000', `START=${ch.startMs}`, `END=${ch.endMs}`, `title=Chapter ${ch.num} · ${ch.title}`)
}

const metaFile = path.join(OUT, 'chapters-metadata-v4.txt')
const concatListFile = path.join(OUT, 'concat-list-v4.txt')
fs.writeFileSync(metaFile, metaLines.join('\n') + '\n')
fs.writeFileSync(concatListFile, concatList.join('\n') + '\n')

console.log('\n=== Step 2: Concatenating full v4 walkthrough ===')
const fullV4 = path.join(OUT, 'orbit-for-aem-walkthrough-v4.mp4')
const tempConcat = path.join(OUT, 'orbit-for-aem-walkthrough-v4.temp.mp4')
execSync(`ffmpeg -y -v error -f concat -safe 0 -i "${concatListFile}" -c copy "${tempConcat}"`, { stdio: 'inherit' })
execSync(`ffmpeg -y -v error -i "${tempConcat}" -i "${metaFile}" -map_metadata 1 -c copy -movflags +faststart "${fullV4}"`, { stdio: 'inherit' })
fs.unlinkSync(tempConcat)
fs.copyFileSync(fullV4, path.join(OUT, 'orbit-for-aem-walkthrough.mp4'))

console.log('=== Step 3: Generating ~3-minute Highlights Cut from v4 ===')
const hlClips = [
  { file: '00-intro-v4.mp4', start: 5.0, dur: 22.0 },
  { file: '01-orb-v4.mp4', start: 14.0, dur: 24.0 },
  { file: '02-toolbar-v4.mp4', start: 16.0, dur: 26.0 },
  { file: '04-devtools-v4.mp4', start: 6.0, dur: 24.0 },
  { file: '06-seo-v4.mp4', start: 6.0, dur: 22.0 },
  { file: '07-workspace-v4.mp4', start: 14.0, dur: 26.0 },
  { file: '10-settings-v4.mp4', start: 22.0, dur: 26.0 },
  { file: '11-shortcuts-v4.mp4', start: 10.0, dur: 22.0 },
]
const hlTempDir = path.join(OUT, 'highlights-scratch-v4')
fs.mkdirSync(hlTempDir, { recursive: true })
const hlList = []
for (let i = 0; i < hlClips.length; i++) {
  const c = hlClips[i]
  const out = path.join(hlTempDir, `clip-${i}.mp4`)
  const src = path.join(OUT, c.file)
  const durProbe = JSON.parse(execSync(`ffprobe -v error -show_entries format=duration -of json "${src}"`).toString())
  const actualDur = parseFloat(durProbe.format.duration)
  const ss = Math.max(0, Math.min(c.start, actualDur - 6))
  const t = Math.min(c.dur, Math.max(4, actualDur - ss))
  execSync(`ffmpeg -y -v error -ss ${ss.toFixed(1)} -i "${src}" -t ${t.toFixed(1)} -c:v libx264 -preset fast -crf 17 -r 60 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 1 "${out}"`, { stdio: 'inherit' })
  hlList.push(`file '${out}'`)
}
const hlListFile = path.join(hlTempDir, 'list.txt')
fs.writeFileSync(hlListFile, hlList.join('\n') + '\n')
const hlV4 = path.join(OUT, 'orbit-for-aem-highlights-v4.mp4')
execSync(`ffmpeg -y -v error -f concat -safe 0 -i "${hlListFile}" -c copy -movflags +faststart "${hlV4}"`, { stdio: 'inherit' })
fs.copyFileSync(hlV4, path.join(OUT, 'orbit-for-aem-highlights.mp4'))
fs.rmSync(hlTempDir, { recursive: true, force: true })

console.log('=== Step 4: Extracting Posters & Linking v4 Tutorial Videos ===')
fs.mkdirSync(POSTERS, { recursive: true })
fs.mkdirSync(VIDEOS, { recursive: true })
for (const ch of CHAPTERS) {
  const v4File = path.join(OUT, `${ch.id}-v4.mp4`)
  execSync(`ffmpeg -y -v error -ss 6.0 -i "${v4File}" -vframes 1 -vf "scale=800:450" -q:v 2 "${path.join(POSTERS, `${ch.id}.jpg`)}"`, { stdio: 'inherit' })
  const link = path.join(VIDEOS, `${ch.id}-v4.mp4`)
  try { fs.unlinkSync(link) } catch { /* ignore */ }
  fs.symlinkSync(`../../../video/out/${ch.id}-v4.mp4`, link)
}

console.log(JSON.stringify({ chapters: chapterMetadata.map((c) => ({ id: c.id, duration: Math.round(c.durSec) })) }, null, 2))
console.log('=== v4 Assembly Complete ===')
