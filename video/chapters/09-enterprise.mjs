// Chapter 9 (v4) - Enterprise Governance, Brand Profiles & Persona Policy Lockdown.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/09-enterprise.mjs
import fs from 'node:fs'
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep, Target } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const log = (...a) => console.log(' ', ...a)

const START_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`
const EXT_ID = fs.readFileSync('video/work/extension-id.txt', 'utf8').trim()
const OPTIONS_URL = `chrome-extension://${EXT_ID}/src/options/options.html`

async function setPolicy(rec, policy) {
  await rec.tab.eval('(() => { window.onbeforeunload = null; if (typeof setDirty === "function") setDirty(false); })()').catch(() => {})
  if (policy) {
    await rec.tab.eval(`new Promise((r) => chrome.storage.local.set({ _managedShim: ${JSON.stringify(policy)} }, r))`)
  } else {
    await rec.tab.eval(`new Promise((r) => chrome.storage.local.remove('_managedShim', r))`)
  }
  await rec.tab.eval('(() => { window.onbeforeunload = null; if (typeof setDirty === "function") setDirty(false); })()').catch(() => {})
}

async function cleanupShim() {
  try {
    const res = await fetch(`http://127.0.0.1:9333/json/new?${OPTIONS_URL}`, { method: 'PUT' }).then((r) => r.json())
    const t = await new Target(res).open()
    await sleep(900)
    await t.eval('new Promise((r) => chrome.storage.local.remove("_managedShim", r))')
    t.close()
    await fetch(`http://127.0.0.1:9333/json/close/${res.id}`)
    log('shim cleaned up successfully')
  } catch (err) {
    log('shim cleanup notice:', err.message)
  }
}

try {
  await runChapter('09-enterprise-v4', {
    url: START_PAGE,
    steps: (rec) => [
      {
        say: 'Welcome to Chapter 9. Orbit brings enterprise-grade governance: multi-site brand profiles, zero-trust storage, SAML session enforcement, persona constraints, and administrator configuration locks.',
        do: async () => {
          await rec.title('Chapter 9 · <b>Enterprise Governance</b> &amp; Policies', 'Brand Profiles CRUD, persona policies, SAML enforcement &amp; read-only lockdown')
          await sleep(3500)
          await rec.untitle()
          await sleep(400)
          await T.expand(rec)
          await sleep(1000)
        },
      },
      {
        say: 'Inside Settings, Multi-Site Brand Profiles let teams map multiple sites cleanly—each carrying its own JCR content root, application name, domains, and URL mappings resolved automatically by host or path.',
        do: async () => {
          await rec.goto(OPTIONS_URL, 2000)
          await rec.tab.eval(`document.getElementById('profilesSection')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
          await sleep(1000)
          await rec.click('#addProfileBtn', 600)
          await sleep(700)
          await rec.tab.eval(`(() => {
            document.getElementById('prof-id').value = 'brand_demo'
            document.getElementById('prof-label').value = 'Global Demo Brand'
            document.getElementById('prof-root').value = '/content/brand-global'
            document.getElementById('prof-app').value = 'brandglobal'
            document.getElementById('prof-domains').value = 'www.brandglobal.com'
          })()`)
          await rec.click('#profSaveBtn', 600)
          await sleep(1400)
          await rec.hover('#profilesList .profile-row:last-child', 900)
          await rec.tab.eval(`document.querySelector('#profilesList .profile-row:last-child .btn-danger')?.click()`)
          await sleep(600)
          await rec.tab.eval('if (typeof setDirty === "function") setDirty(false)')
        },
      },
      {
        say: 'With enforceSessionAuthOnly active via browser enterprise policy, passwords and Bearer tokens stay disabled while users authenticate purely via SAML session cookies.',
        do: async () => {
          await setPolicy(rec, { enforceSessionAuthOnly: true })
          await rec.goto(OPTIONS_URL, 1600)
          await rec.click('.tab[data-tab="dev"]', 600)
          await rec.tab.eval(`document.querySelector('.auth-selector[data-env="dev"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
          await sleep(1000)
          await rec.hover('.auth-selector[data-env="dev"] .auth-option[data-type="session"]', 800)
          await rec.hover('.auth-selector[data-env="dev"] .auth-option[data-type="basic"]:disabled', 1200)
        },
      },
      {
        say: 'Adding controlPolicy and allowedPersonas centrally restricts destructive controls—notice how disabling Developer Mode automatically locks out the Developer workspace persona across Settings, Toolbar, and Popup.',
        do: async () => {
          await setPolicy(rec, {
            enforceSessionAuthOnly: true,
            controlPolicy: {
              disabledControls: ['delete', 'sync', 'developerMode'],
              byEnvironment: { prod: { disabledControls: ['publish'] } },
            },
          })
          await rec.goto(OPTIONS_URL, 1600)
          await rec.tab.eval(`document.getElementById('personaGrid')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
          await sleep(1000)
          await rec.hover('#personaGrid .persona-card[data-persona="dev"]', 1200)
          await rec.tab.eval(`document.getElementById('policyNote')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
          await sleep(900)
          await rec.hover('#policyNote', 1200)
        },
      },
      {
        say: 'Activating lockConfiguration switches the entire Settings console read-only with an official administrator notice banner and disabled Save controls—immediately reflected in the live page toolbar.',
        do: async () => {
          await setPolicy(rec, {
            lockConfiguration: true,
            enforceSessionAuthOnly: true,
            controlPolicy: {
              disabledControls: ['delete', 'sync', 'developerMode'],
              byEnvironment: { prod: { disabledControls: ['publish'] } },
            },
          })
          await rec.goto(OPTIONS_URL, 1600)
          await rec.tab.eval(`window.scrollTo({ top: 0, behavior: 'smooth' })`)
          await sleep(1000)
          await rec.hover('#lockBanner', 1400)
          await rec.hover('#save:disabled', 1100)
          await rec.tab.eval('window.onbeforeunload = null')
          await rec.goto(START_PAGE, 3000)
          await T.expand(rec)
          await T.openMenu(rec, '#asp-more-btn')
          await sleep(2200)
          await rec.key('Escape')
        },
      },
    ],
  })
} finally {
  await cleanupShim()
}
process.exit(process.exitCode || 0)
