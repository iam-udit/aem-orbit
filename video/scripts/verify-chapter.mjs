// Image-free acceptance check for a rendered chapter: node video/scripts/verify-chapter.mjs 01-orb
// Verifies codec/size/fps, audio length == video length, and that EVERY stored frame is exactly 1920x1080.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const id = process.argv[2]
if (!id) throw new Error('usage: verify-chapter.mjs <chapter-id>')
const file = `video/out/${id}.mp4`
const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,duration', '-of', 'json', file], { encoding: 'utf8' }).stdout)
const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio')
const problems = []
if (v.codec_name !== 'h264' || v.width !== 1920 || v.height !== 1080 || v.r_frame_rate !== '60/1') problems.push(`video is ${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate}`)
if (!a) problems.push('no audio track')
else if (Math.abs(Number(a.duration) - Number(v.duration)) > 0.5) problems.push(`audio ${a.duration}s vs video ${v.duration}s`)

const dir = `video/work/${id}-frames`
const sizes = new Map()
let n = 0
if (fs.existsSync(path.join(dir, 'capture.mp4'))) {
  // screen-mode chapter: no JPEG frames; the output file itself is the single source of truth
  const p = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', file], { encoding: 'utf8' })
  const st = JSON.parse(p.stdout).streams[0]
  n = Number(st.nb_read_frames); sizes.set(`${st.width}x${st.height}`, n)
}
for (const f of (n ? [] : fs.readdirSync(dir).filter((x) => x.endsWith('.jpg')))) {
  const d = fs.readFileSync(path.join(dir, f)); let i = 2; n++
  while (i < d.length) {
    if (d[i] !== 0xFF) { i++; continue }
    const m = d[i + 1]
    if (m >= 0xC0 && m <= 0xC2) { const k = `${d.readUInt16BE(i + 7)}x${d.readUInt16BE(i + 5)}`; sizes.set(k, (sizes.get(k) || 0) + 1); break }
    i += 2 + d.readUInt16BE(i + 2)
  }
}
const bad = [...sizes].filter(([k]) => k !== '1920x1080')
if (bad.length) problems.push(`off-size frames: ${JSON.stringify(Object.fromEntries(bad))}`)
console.log(`${id}: ${Number(v.duration).toFixed(1)}s video, ${a ? Number(a.duration).toFixed(1) : '-'}s audio, ${n} frames, sizes ${JSON.stringify(Object.fromEntries(sizes))}`)
if (problems.length) { console.error('FAIL:', problems.join('; ')); process.exit(1) }
console.log('OK')
