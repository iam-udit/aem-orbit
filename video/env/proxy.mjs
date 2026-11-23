// Local AEM-Cloud-style edge for the AEM Orbit demo. Binds to 127.0.0.1 only.
//
//   https://<env>-cloud-author.com   -> author  of that env
//   https://<env>-cloud-publish.com  -> publish of that env (URL mapping applied, no dispatcher filter or cache)
//   https://<env>-cloud-preview.com  -> publish of that env (same; the local SDK has no separate preview tier)
//   https://wwwdev.wknd.com / wwwstage.wknd.com / www.wknd.com
//                                    -> dispatcher/CDN simulation: URL mapping, extension-less URLs,
//                                       Age / Cache-Control / Via / X-Cache headers, in-memory cache
//   http://127.0.0.1:8480/dispatcher/invalidate.cache   flush endpoint used by the AEM "flush" agents
//
// Chrome reaches these names through --host-resolver-rules (no /etc/hosts, no port 443).
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMappings, mapPublicToJcr } from '../../src/shared/url-utils.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const CERT_DIR = process.env.ORBIT_DEMO_CERT_DIR || path.join(os.homedir(), '.aem-orbit-demo')
const TLS_PORT = Number(process.env.ORBIT_DEMO_TLS_PORT || 8443)
const FLUSH_PORT = Number(process.env.ORBIT_DEMO_FLUSH_PORT || 8480)
const LOOPBACK = '127.0.0.1'
const CONTENT_ROOT = '/content/wknd'
const MAPPINGS = parseMappings(fs.readFileSync(path.join(here, 'url-mappings.txt'), 'utf8'))

const ENVS = {
  dev:   { author: 4512, publish: 4513, cdn: 'wwwdev.wknd.com' },
  stage: { author: 4522, publish: 4523, cdn: 'wwwstage.wknd.com' },
  prod:  { author: 4532, publish: 4533, cdn: 'www.wknd.com' },
}

/** host -> { kind, env, port } */
const ROUTES = new Map()
for (const [env, e] of Object.entries(ENVS)) {
  ROUTES.set(`${env}-cloud-author.com`, { kind: 'author', env, port: e.author })
  ROUTES.set(`${env}-cloud-publish.com`, { kind: 'publish', env, port: e.publish })
  ROUTES.set(`${env}-cloud-preview.com`, { kind: 'preview', env, port: e.publish })
  ROUTES.set(e.cdn, { kind: 'cdn', env, port: e.publish })
}

// Paths a dispatcher serves as-is instead of treating them as mapped page URLs
const PASSTHROUGH = /^\/(content|etc\.clientlibs|etc|libs|apps|conf|bin|dispatcher|favicon\.ico)(\/|$)/
// Paths a dispatcher filter never lets through
const DENIED = /^\/(system|crx|admin|etc\/packages|etc\/replication|bin\/(querybuilder|wcmcommand|replicate))(\/|\.|$)/

const CACHE_TTL_S = 300
const cache = new Map() // key -> { status, headers, body, at, jcr }

const agent = new http.Agent({ keepAlive: true })

/** Strip the .html/.json extension so a flush handle can be compared with a page path. */
const bare = (p) => p.replace(/\.(html|json|model\.json)$/, '')

function rewriteLocation(loc, host) {
  if (!loc) return loc
  return loc.replace(new RegExp(`^http://${host.replace(/\./g, '\\.')}(:\\d+)?`), `https://${host}`)
}

function toUpstreamPath(route, url) {
  if (route.kind === 'author') return { upstream: url, jcr: null }
  const u = new URL(url, 'https://x')
  if (route.kind !== 'cdn') {
    // Publish / Preview hosts honour the same URL mapping (the extension builds mapped, extension-less URLs
    // when "Apply URL mapping to Publish/Preview" is on), but have no dispatcher filter: anything unmapped passes through.
    const p = u.pathname
    if (PASSTHROUGH.test(p) || /\.[a-z0-9]{2,5}$/i.test(p.split('/').pop() || '')) return { upstream: url, jcr: null }
    const jcr = mapPublicToJcr(p, MAPPINGS, CONTENT_ROOT)
    return jcr ? { upstream: `${jcr}.html${u.search}`, jcr: null } : { upstream: url, jcr: null }
  }
  let p = u.pathname
  if (DENIED.test(p)) return { denied: true }
  if (!PASSTHROUGH.test(p) && !/\.[a-z0-9]{2,5}$/i.test(p.split('/').pop() || '')) {
    const jcr = mapPublicToJcr(p, MAPPINGS, CONTENT_ROOT)
    if (!jcr) return { denied: true }
    return { upstream: `${jcr}.html${u.search}`, jcr }
  }
  return { upstream: `${p}${u.search}`, jcr: p.startsWith('/content') ? bare(p) : null }
}

function proxy(req, res, route, host) {
  const { upstream, jcr, denied } = toUpstreamPath(route, req.url)
  if (denied) {
    res.writeHead(404, { 'content-type': 'text/plain', via: '1.1 dispatcher-sim' })
    return res.end('Not found')
  }

  const bypass = /[?&](nocache|wcmmode|debug)=/.test(req.url)
  const cacheable = route.kind === 'cdn' && req.method === 'GET' && !bypass
  const key = `${host}${req.url}`
  if (route.kind === 'cdn' && (req.method === 'GET' || req.method === 'HEAD') && !bypass) { // a HEAD is answered from the cache too (headers only)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_S * 1000) {
      res.writeHead(hit.status, {
        ...hit.headers,
        age: String(Math.floor((Date.now() - hit.at) / 1000) + 1),
        'x-cache': 'HIT',
      })
      return res.end(hit.body)
    }
  }

  const headers = { ...req.headers, host, 'x-forwarded-proto': 'https', 'x-forwarded-host': host }
  const up = http.request({ host: LOOPBACK, port: route.port, method: req.method, path: upstream, headers, agent }, (ur) => {
    const out = { ...ur.headers }
    if (out.location) out.location = rewriteLocation(out.location, host)
    if (route.kind !== 'cdn') {
      res.writeHead(ur.statusCode, out)
      return ur.pipe(res)
    }
    // CDN / dispatcher view
    delete out['set-cookie']
    out.via = '1.1 dispatcher-sim'
    out.age = '0'
    out['x-cache'] = 'MISS'
    out['x-served-by'] = `cache-${route.env}-edge`
    if (!out['cache-control']) out['cache-control'] = `max-age=${CACHE_TTL_S}, public`
    const chunks = []
    ur.on('data', (c) => chunks.push(c))
    ur.on('end', () => {
      const body = Buffer.concat(chunks)
      if (cacheable && ur.statusCode === 200) {
        const stored = { ...out }
        delete stored['x-cache']
        delete stored.age
        cache.set(key, { status: ur.statusCode, headers: stored, body, at: Date.now(), jcr })
      }
      res.writeHead(ur.statusCode, out)
      res.end(body)
    })
  })
  up.setTimeout(60_000, () => up.destroy(new Error('upstream timeout')))
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('Bad gateway')
  })
  req.pipe(up)
}

const tlsServer = https.createServer(
  { key: fs.readFileSync(path.join(CERT_DIR, 'server.key')), cert: fs.readFileSync(path.join(CERT_DIR, 'server.crt')), minVersion: 'TLSv1.2' },
  (req, res) => {
    const host = (req.headers.host || '').split(':')[0].toLowerCase()
    const route = ROUTES.get(host)
    if (!route) {
      res.writeHead(421, { 'content-type': 'text/plain' })
      return res.end('Unknown host')
    }
    proxy(req, res, route, host)
  },
)

// Flush endpoint: AEM's flush agent sends  GET /dispatcher/invalidate.cache  with  CQ-Handle: /content/...
const flushServer = http.createServer((req, res) => {
  if (!['GET', 'POST'].includes(req.method) || !req.url.startsWith('/dispatcher/invalidate.cache')) {
    res.writeHead(404); return res.end()
  }
  const handle = bare(String(req.headers['cq-handle'] || ''))
  let removed = 0
  for (const [k, v] of cache) {
    if (!handle || (v.jcr && (v.jcr === handle || v.jcr.startsWith(`${handle}/`)))) { cache.delete(k); removed += 1 }
  }
  console.log(`flush ${handle || '(all)'} -> ${removed} entries`)
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('<H1>OK</H1>')
})

tlsServer.listen(TLS_PORT, LOOPBACK, () => console.log(`edge  https://${LOOPBACK}:${TLS_PORT}  (${ROUTES.size} hosts)`))
flushServer.listen(FLUSH_PORT, LOOPBACK, () => console.log(`flush http://${LOOPBACK}:${FLUSH_PORT}/dispatcher/invalidate.cache`))
