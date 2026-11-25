// Seed the demo extension's settings straight into chrome.storage (setup only; the Settings chapter
// is recorded through the real Options page). Needs ORBIT_ADMIN_PW; the password is never written to a file.
//   ORBIT_ADMIN_PW=... node video/scripts/seed-settings.mjs [--bare]
//   --bare  environments + hosts only (so the first-run Settings flow can be recorded)
import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extensionWorker } from '../lib/cdp.mjs'

const pw = process.env.ORBIT_ADMIN_PW
if (!pw) throw new Error('Set ORBIT_ADMIN_PW')
const here = path.dirname(fileURLToPath(import.meta.url))
const mappings = fs.readFileSync(path.join(here, '..', 'env', 'url-mappings.txt'), 'utf8')
const bare = process.argv.includes('--bare')

const cloud = (env, cdn, extra = {}) => ({
  authorHost: `https://${env}-cloud-author.com`,
  publishHost: `https://${env}-cloud-publish.com`,
  previewHost: `https://${env}-cloud-preview.com`,
  dispatcherHost: `https://${cdn}`,
  authType: 'basic',
  dispatcherOmitHtml: true,   // "Append .html" off: extension-less CDN URLs
  publishUsesMappings: true,  // apply URL mappings to Publish / Preview URLs
  ...extra,
})

const sync = {
  environments: {
    local: { authorHost: 'http://localhost:4502', publishHost: 'http://localhost:4503', authType: 'basic' },
    dev: cloud('dev', 'wwwdev.wknd.com'),
    stage: cloud('stage', 'wwwstage.wknd.com'),
    prod: cloud('prod', 'www.wknd.com', { protected: true }),
  },
  envOrder: ['local', 'dev', 'stage', 'prod'],
  contentRoot: '/content/wknd',
  appName: 'wknd',
  urlMappings: mappings,
  optionsTheme: 'dark',
  showOnAuthor: true, showOnPublish: true, showOnDispatcher: true,
  ...(bare ? {} : {
    enableDevMode: true, summonOnLongPress: true, classicBar: false,
    confirmDelete: true, confirmPublish: false, notifyOnActions: false,
    showLastModified: true, enableKeyboardShortcut: true,
  }),
}
const secrets = Object.fromEntries(['local', 'dev', 'stage', 'prod'].map((e) => [e, { username: 'admin', password: pw }]))

const sw = await extensionWorker()
await sw.eval(`(async () => {
  await chrome.storage.sync.clear(); await chrome.storage.local.clear(); await chrome.storage.session.clear();
  await chrome.storage.sync.set(${JSON.stringify(sync)});
  await chrome.storage.local.set({ secrets: ${JSON.stringify(secrets)} });
  const granted = await chrome.permissions.getAll();
  return granted.origins.length;
})()`).then((n) => console.log(`settings seeded (${n} host grants)`))
await sw.eval(`chrome.runtime.sendMessage({ action: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null), 1`)
sw.close()
