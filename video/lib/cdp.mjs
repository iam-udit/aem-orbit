// Minimal Chrome DevTools Protocol client (Node 22 built-ins only). Talks to 127.0.0.1 only.
import fs from 'node:fs'
import process from 'node:process'

const BASE = process.env.ORBIT_CDP || 'http://127.0.0.1:9333'

const ID_CACHE = 'video/work/extension-id.txt'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class Target {
  constructor(info) {
    this.info = info
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
  }

  async open() {
    this.ws = new WebSocket(this.info.webSocketDebuggerUrl)
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data)
      if (d.id && this.pending.has(d.id)) {
        const { resolve, reject } = this.pending.get(d.id)
        this.pending.delete(d.id)
        if (d.error) reject(new Error(`${d.error.message}`)); else resolve(d.result)
      } else if (d.method) {
        for (const h of this.handlers.get(d.method) || []) h(d.params)
      }
    }
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject })
    return this
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }

  /** Evaluate an expression in the page (awaits promises, returns JSON-serialisable value). */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }

  close() { try { this.ws.close() } catch { /* already closed */ } }
}

export async function listTargets() {
  return (await fetch(`${BASE}/json/list`)).json()
}

export async function newTab(url = 'about:blank') {
  const info = await (await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  return new Target(info).open()
}

export async function firstPage() {
  const info = (await listTargets()).find((t) => t.type === 'page')
  return new Target(info).open()
}

/**
 * Attach to the AEM Orbit extension context. MV3 service workers sleep when idle, so fall back to an open
 * extension page (same chrome.* APIs); if neither exists, open the options page, which wakes the worker.
 */
export async function extensionWorker() {
  const find = async () => {
    const all = await listTargets()
    return all.find((t) => t.type === 'service_worker' && t.url.endsWith('/src/background/service-worker.js'))
      || all.find((t) => t.type === 'page' && t.url.startsWith('chrome-extension://'))
  }
  let info = await find()
  if (!info) {
    // the id is cached because screen-mode recordings close every extension page, leaving nothing to read it from
    const ids = (await listTargets()).map((t) => t.url.match(/^chrome-extension:\/\/([a-p]{32})\//)?.[1]).find(Boolean)
      || (fs.existsSync(ID_CACHE) ? fs.readFileSync(ID_CACHE, 'utf8').trim() : '')
    if (ids) { await fetch(`${BASE}/json/new?${encodeURIComponent(`chrome-extension://${ids}/src/options/options.html`)}`, { method: 'PUT' }); await sleep(800); info = await find() }
  }
  if (!info) throw new Error('AEM Orbit extension context not found - is the extension loaded?')
  const target = await new Target(info).open()
  target.extensionId = new URL(info.url).host
  try { fs.mkdirSync('video/work', { recursive: true }); fs.writeFileSync(ID_CACHE, target.extensionId) } catch { /* cache only */ }
  return target
}

export async function navigate(target, url, settleMs = 1500) {
  await target.send('Page.enable')
  await target.send('Page.navigate', { url })
  await sleep(settleMs)
}
