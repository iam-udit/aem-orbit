// Builds the extension from src/ into video/build/extension for the demo recording.
// The only difference from `npm run build`: host access for the demo hosts is granted in the manifest,
// because Chrome's optional-permission prompt is browser UI that automation cannot click.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = path.join(root, 'video', 'build', 'extension')

fs.rmSync(out, { recursive: true, force: true })
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
  cwd: root, stdio: 'inherit', env: { ...process.env, ORBIT_BUILD_OUT: out },
})

const file = path.join(out, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
// Chrome only allows a "*." wildcard at the start of a host, so the cloud hosts are listed one by one.
const cloudHosts = ['dev', 'stage', 'prod'].flatMap((env) => ['author', 'publish', 'preview'].map((tier) => `https://${env}-cloud-${tier}.com/*`))
const demoHosts = [
  'http://localhost/*', 'http://127.0.0.1/*',
  'https://*.wknd.com/*', 'https://wknd.com/*',
  ...cloudHosts,
  'https://*.aem.page/*', 'https://*.aem.live/*',
]
manifest.host_permissions = demoHosts
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`demo extension ready: ${path.relative(root, out)} (${demoHosts.length} host patterns granted)`)
