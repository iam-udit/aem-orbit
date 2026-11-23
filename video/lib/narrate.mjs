// Narration: neural TTS per line (edge-tts), measured with ffprobe, then mixed onto the video at the
// exact offsets where each line started while recording.
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { sleep } from './cdp.mjs'

export const VOICE = process.env.ORBIT_VOICE || 'en-US-ChristopherNeural'
const RATE = process.env.ORBIT_RATE || '+3%'
const CACHE = path.resolve('video/work/tts')

export function synth(text) {
  fs.mkdirSync(CACHE, { recursive: true })
  const key = crypto.createHash('sha1').update(`${VOICE}|${RATE}|${text}`).digest('hex').slice(0, 16)
  const file = path.join(CACHE, `${key}.mp3`)
  if (!fs.existsSync(file) || fs.statSync(file).size < 2000) {
    // the service intermittently answers NoAudioReceived for valid text: retry with a growing pause
    for (let attempt = 1; attempt <= 6; attempt++) {
      fs.rmSync(file, { force: true })
      const r = spawnSync('python3', ['-m', 'edge_tts', '--voice', VOICE, `--rate=${RATE}`, '--text', text, '--write-media', file], { encoding: 'utf8', timeout: 60000 })
      if (r.status === 0 && fs.existsSync(file) && fs.statSync(file).size > 2000) break
      if (attempt === 6) throw new Error(`TTS failed for "${text.slice(0, 40)}": ${r.stderr.split('\n').slice(-3).join(' ')}`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500 * attempt)
    }
  }
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return { file, seconds: Number.parseFloat(p.stdout) }
}

/**
 * Run a chapter: each step is { say, do }. The action and the spoken line start together and the next
 * step waits for whichever is longer (plus a short breath), so picture and voice stay in sync.
 * Returns the cues [{ file, at }] with `at` in seconds from the first captured frame.
 */
export async function runSteps(rec, steps, { gap = 0.35 } = {}) {
  const cues = []
  for (const step of steps) {
    const voice = step.say ? synth(step.say) : null
    const startedAt = Date.now() / 1000
    if (voice) cues.push({ file: voice.file, wall: startedAt, text: step.say })
    const action = step.do ? step.do() : Promise.resolve()
    const need = voice ? voice.seconds + gap : (step.hold ?? 0)
    await Promise.all([action, sleep(need * 1000)])
  }
  return cues
}

/** Mix cues onto a silent-safe track and mux with the video. */
export function mux(videoFile, cues, firstFrameT, outFile) {
  const inputs = ['-i', videoFile]
  const filters = []
  cues.forEach((c, i) => {
    inputs.push('-i', c.file)
    const ms = Math.max(0, Math.round((c.wall - firstFrameT) * 1000))
    filters.push(`[${i + 1}:a]adelay=${ms}|${ms},volume=1.0[a${i}]`)
  })
  const mix = cues.map((_, i) => `[a${i}]`).join('')
  const graph = `${filters.join(';')};${mix}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]`
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', outFile], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`mux failed: ${r.stderr}`)
  return outFile
}
