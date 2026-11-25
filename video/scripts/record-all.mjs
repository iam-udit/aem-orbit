// Orchestration script to run and record all v4 chapters sequentially with proper content resets and tab cleanliness.
// Run: ORBIT_ADMIN_PW=admin node video/scripts/record-all.mjs [startFromChapter]
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

const CHAPTERS = [
  { id: '00-intro', reset: null },
  { id: '01-orb', reset: null },
  { id: '01b-orb-position', reset: null },
  { id: '02-toolbar', reset: 'video/env/demo-content.py', deactivateToast: true },
  { id: '03-authoring', reset: 'video/env/ch3-content.py' },
  { id: '04-devtools', reset: null },
  { id: '05-sync', reset: 'video/env/ch5-content.py' },
  { id: '06-seo', reset: 'video/env/ch6-content.py' },
  { id: '07-workspace', reset: null },
  { id: '08-eds', reset: null },
  { id: '09-enterprise', reset: null },
  { id: '10-settings', reset: null },
  { id: '11-shortcuts', reset: null },
]

/** Closes extra Chrome tabs so only one clean page tab remains before recording. */
async function cleanTabs() {
  try {
    const res = await fetch('http://127.0.0.1:9333/json/list').then((r) => r.json())
    const pages = res.filter((t) => t.type === 'page')
    for (let i = 1; i < pages.length; i++) {
      await fetch(`http://127.0.0.1:9333/json/close/${pages[i].id}`).catch(() => {})
    }
  } catch (err) {
    console.log('Tab clean error:', err.message)
  }
}

const startArg = process.argv[2]
const endArg = process.argv[3]
const onlySingle = process.argv.includes('--single')
let startIndex = 0
if (startArg && !startArg.startsWith('--')) {
  startIndex = CHAPTERS.findIndex((c) => c.id === startArg || c.id.startsWith(startArg))
  if (startIndex === -1) {
    console.error(`Unknown start chapter: ${startArg}`)
    process.exit(1)
  }
}

let endIndex = onlySingle ? startIndex + 1 : CHAPTERS.length
if (endArg && !endArg.startsWith('--')) {
  const foundEnd = CHAPTERS.findIndex((c) => c.id === endArg || c.id.startsWith(endArg))
  if (foundEnd === -1 || foundEnd < startIndex) {
    console.error(`Unknown or invalid end chapter: ${endArg}`)
    process.exit(1)
  }
  endIndex = foundEnd + 1
}

console.log(`Starting v4 recording run [${CHAPTERS[startIndex].id} .. ${CHAPTERS[endIndex - 1].id}]...`)

const pw = process.env.ORBIT_ADMIN_PW || 'admin'

for (let i = startIndex; i < endIndex; i++) {
  const ch = CHAPTERS[i]
  const script = `video/chapters/${ch.id}.mjs`
  const outFile = `video/out/${ch.id}-v4.mp4`

  console.log(`\n======================================================`)
  console.log(`[${i + 1}/${CHAPTERS.length}] Recording ${ch.id}-v4 ...`)
  console.log(`======================================================`)

  await cleanTabs()
  try {
    execSync('caffeinate -u -t 2', { stdio: 'ignore' })
  } catch { /* ignore */ }

  if (ch.reset) {
    console.log(`Running content reset: ${ch.reset} ...`)
    execSync(`python3 ${ch.reset}`, {
      env: { ...process.env, ORBIT_ADMIN_PW: pw },
      stdio: 'inherit',
    })
  }
  if (ch.deactivateToast) {
    execSync(`curl -sf -u "admin:${pw}" -X POST http://127.0.0.1:4512/bin/replicate.json -d cmd=Deactivate -d path=/content/wknd/us/en/orbit-demo/toast-demo >/dev/null || true`, {
      stdio: 'inherit',
    })
  }

  const startTime = Date.now()
  try {
    execSync(`node ${script}`, {
      env: { ...process.env, ORBIT_ADMIN_PW: pw },
      stdio: 'inherit',
    })
  } catch (err) {
    console.error(`ERROR: Recording failed for ${ch.id}-v4:`, err.message)
    process.exit(1)
  }

  if (!fs.existsSync(outFile)) {
    console.error(`ERROR: Expected output file does not exist: ${outFile}`)
    process.exit(1)
  }

  execSync(`node video/scripts/verify-chapter.mjs ${ch.id}-v4`, { stdio: 'inherit' })
  fs.rmSync(`video/work/${ch.id}-v4-frames/capture.mp4`, { force: true })

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  const stat = fs.statSync(outFile)
  console.log(`SUCCESS: ${outFile} verified (${(stat.size / 1024 / 1024).toFixed(2)} MB in ${durationSec}s)`)
}

console.log('\nAll requested v4 chapters recorded and verified!')
