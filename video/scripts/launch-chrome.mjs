// Launch Chrome for Testing with the demo extension, detached from this process.
//   node video/scripts/launch-chrome.mjs [--fresh]
// Hostnames resolve through --host-resolver-rules to the local edge proxy (127.0.0.1:8443), so no /etc/hosts edit is needed.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const profile = process.env.ORBIT_PROFILE || '/tmp/orbit-chrome-profile'
const chrome = path.join(root, 'video/build/browser/chrome/mac_arm-158.0.8127.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
const ext = path.join(root, 'video/build/extension')

if (!fs.existsSync(chrome)) throw new Error('Chrome for Testing missing: run `npx @puppeteer/browsers install chrome@158.0.8127.36 --path video/build/browser`')
if (process.argv.includes('--fresh')) fs.rmSync(profile, { recursive: true, force: true })
fs.mkdirSync(profile, { recursive: true })

// Pin the Orbit icon to the toolbar (the recorder clicks it with a real OS click to open the popup). Chrome must not be running
// while Preferences is edited, which is why it is done here, before the launch. The id is cached by video/lib/cdp.mjs.
const idFile = path.join(root, 'video/work/extension-id.txt')
if (fs.existsSync(idFile)) {
  const id = fs.readFileSync(idFile, 'utf8').trim()
  const prefsFile = path.join(profile, 'Default', 'Preferences')
  fs.mkdirSync(path.dirname(prefsFile), { recursive: true })
  const prefs = fs.existsSync(prefsFile) ? JSON.parse(fs.readFileSync(prefsFile, 'utf8')) : {}
  prefs.extensions ??= {}
  const pinned = new Set(prefs.extensions.pinned_extensions ?? [])
  if (!pinned.has(id)) {
    pinned.add(id)
    prefs.extensions.pinned_extensions = [...pinned]
    fs.writeFileSync(prefsFile, JSON.stringify(prefs))
    console.log(`pinned extension ${id}`)
  }
}

const rules = [
  '*.wknd.com', '*-cloud-author.com', '*-cloud-publish.com', '*-cloud-preview.com',
].map((h) => `MAP ${h} 127.0.0.1:8443`).join(', ')

const child = spawn(chrome, [
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=9333', '--remote-debugging-address=127.0.0.1',
  '--remote-allow-origins=http://127.0.0.1:9333',
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter', '--disable-infobars',
  '--force-device-scale-factor=1', '--window-size=1920,1080', '--window-position=0,0',
  `--load-extension=${ext}`, `--host-resolver-rules=${rules}`,
  'about:blank',
], { detached: true, stdio: 'ignore' })
child.unref()
console.log(`chrome pid ${child.pid}, profile ${profile}`)
