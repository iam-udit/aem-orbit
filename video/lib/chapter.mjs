// Shared chapter runner: open the recording tab, run the narrated steps, render 1080p60, mux the voiceover.
//   const out = await runChapter('01-orb', { url, setup, steps })
import fs from 'node:fs'
import process from 'node:process'
import { Recorder } from './recorder.mjs'
import { mux, runSteps, synth } from './narrate.mjs'
import { extensionWorker, sleep } from './cdp.mjs'

export const OUT = 'video/out'
export const AUTHOR = { local: 'http://localhost:4502', dev: 'https://dev-cloud-author.com', stage: 'https://stage-cloud-author.com', prod: 'https://prod-cloud-author.com' }

export async function extensionId() {
  const sw = await extensionWorker()
  const id = sw.extensionId
  sw.close()
  return id
}

/**
 * @param {string} id chapter id, e.g. "01-orb"
 * @param {{ url: string, settle?: number, setup?: (rec: Recorder, ctx: object) => Promise<void>, steps: (rec: Recorder, ctx: object) => object[] }} def
 */
export async function runChapter(chapterId, def) {
  const id = chapterId + (process.env.ORBIT_OUT_SUFFIX || '') // e.g. ORBIT_OUT_SUFFIX=-screen keeps the page-only render untouched
  // synthesise every voice line up front so recording never waits on the TTS service
  const ctx = { extId: await extensionId() }
  const lines = def.steps(null, ctx).map((s) => s.say).filter(Boolean)
  lines.forEach((l, i) => { synth(l); process.stdout.write(`\rvoice ${i + 1}/${lines.length}`) })
  console.log()
  const rec = await new Recorder(`video/work/${id}-frames`).open()
  await rec.goto(def.url, def.settle ?? 3500)
  if (def.setup) await def.setup(rec, ctx)
  await rec.start()
  await sleep(300)
  let cues
  try {
    cues = await runSteps(rec, def.steps(rec, ctx))
  } catch (e) {
    console.error(`[${id}] step failed:`, e.message)
    const shot = await rec.tab.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
    if (shot) fs.writeFileSync(`video/work/${id}-fail.png`, Buffer.from(shot.data, 'base64'))
    await rec.stop().catch(() => {})
    await rec.close()
    process.exitCode = 1
    return null
  }
  await rec.untitle()
  await sleep(700)
  const n = await rec.stop()
  const silent = `${OUT}/${id}.silent.mp4`
  const info = rec.render(silent)
  const final = `${OUT}/${id}.mp4`
  mux(silent, cues, rec.frames[0].t, final)
  console.log(`[${id}] ${n} frames, ${info.seconds.toFixed(1)}s, ${cues.length} voice lines -> ${final}`)
  await rec.close()
  return { final, seconds: info.seconds, cues }
}
