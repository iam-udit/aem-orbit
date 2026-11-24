// Chapter 9 (v3) - Enterprise Governance, Security & Managed Policies.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/09-enterprise-v3.mjs
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
    await sleep(1000)
    await t.eval('new Promise((r) => chrome.storage.local.remove("_managedShim", r))')
    t.close()
    await fetch(`http://127.0.0.1:9333/json/close/${res.id}`)
    log('shim cleaned up successfully')
  } catch (err) {
    log('shim cleanup notice:', err.message)
  }
}

try {
  await runChapter('09-enterprise-v3', {
    url: START_PAGE,
    steps: (rec) => [
      // 1. Overview & Intro
      {
        say: 'Welcome to Chapter 9. In this chapter, we explore AEM Orbit\'s enterprise governance, zero-trust security architecture, and centralized Chrome managed policies.',
        do: async () => {
          await rec.title('Chapter 9 · <b>Enterprise Governance</b> &amp; managed policies', 'Multi-site brand profiles, policy locking, SAML session enforcement, and administrative control policies')
          await sleep(3500)
          await rec.untitle()
          await sleep(500)
          await T.expand(rec)
          await sleep(1200)
        },
      },

      // 2. Open Options Page & Multi-Site Brand Profiles
      {
        say: 'Large organizations often operate multiple distinct brands across a single AEM cluster. In the Options console, Orbit provides multi-site brand profiles that resolve content roots, application namespaces, and Dispatcher URL mappings dynamically based on the current domain or content path.',
        do: async () => {
          await rec.goto(OPTIONS_URL)
          await sleep(1500)

          // scroll down to General / Content Path Mapping
          await rec.tab.eval(`(() => {
            const el = document.getElementById('contentRoot')
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          })()`)
          await sleep(1200)

          // Hover contentRoot and appName
          await rec.hover('#contentRoot', 800)
          await rec.hover('#appName', 800)
          await rec.hover('#urlMappings', 1200)
        },
      },

      // 3. Privacy & Zero-Trust Security Architecture
      {
        say: 'Security is paramount for enterprise deployments. Orbit is built on a strict privacy architecture: zero telemetry, zero analytics tracking, and zero external network calls. All secret credentials remain strictly isolated inside the service-worker context, never injected into the page DOM or window scope.',
        do: async () => {
          // scroll up to Environment panels
          await rec.tab.eval(`(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          })()`)
          await sleep(1200)

          // Switch to Dev tab and inspect auth options
          const devTab = await rec.waitFor('.tab[data-tab="dev"]', 5000)
          await rec.moveTo(devTab.cx, devTab.cy, 600)
          await sleep(200)
          await rec.clickHere()
          await sleep(1000)

          // Hover auth options in Dev panel
          await rec.hover('.auth-selector[data-env="dev"] .auth-option[data-type="basic"]', 700)
          await rec.hover('.auth-selector[data-env="dev"] .auth-option[data-type="none"]', 700)
          await rec.hover('.auth-selector[data-env="dev"] .auth-option[data-type="bearer"]', 900)
        },
      },

      // 4. Managed Policy: Enforce Session Auth Only
      {
        say: 'IT administrators can centrally enforce corporate single sign-on through Google Chrome enterprise policies. When the enforceSessionAuthOnly policy is active, Orbit disallows local passwords and IMS tokens, compelling users to authenticate exclusively via existing browser SAML session cookies.',
        do: async () => {
          log('applying enforceSessionAuthOnly policy...')
          await setPolicy(rec, {
            enforceSessionAuthOnly: true,
          })
          await sleep(500)
          await rec.goto(OPTIONS_URL)
          await sleep(1200)

          // Switch to Dev tab to show enforced session auth
          const devTab = await rec.waitFor('.tab[data-tab="dev"]', 5000)
          await rec.moveTo(devTab.cx, devTab.cy, 600)
          await sleep(200)
          await rec.clickHere()
          await sleep(800)

          // Scroll down so full Auth section and options are cleanly visible in view
          await rec.tab.eval(`(() => {
            const authSec = document.querySelector('.auth-selector[data-env="dev"]')
            if (authSec) authSec.scrollIntoView({ block: 'center', behavior: 'smooth' })
          })()`)
          await sleep(1000)

          // Hover over session auth and disabled basic auth button showing enforcement tooltip
          const sessionBtn = await rec.waitFor('.auth-selector[data-env="dev"] .auth-option[data-type="session"]', 5000)
          await rec.moveTo(sessionBtn.cx, sessionBtn.cy, 600)
          await sleep(1000)

          const basicBtn = await rec.waitFor('.auth-selector[data-env="dev"] .auth-option[data-type="basic"]:disabled', 5000)
          await rec.moveTo(basicBtn.cx, basicBtn.cy, 600)
          await sleep(1800)
        },
      },

      // 5. Managed Policy: Control Policy
      {
        say: 'Using the controlPolicy configuration, administrators can centrally disable high-risk actions across the fleet. Here, our enterprise policy has disabled content sync, page deletion, and Developer Mode globally, while restricting page publication on production environments.',
        do: async () => {
          log('applying controlPolicy...')
          await setPolicy(rec, {
            enforceSessionAuthOnly: true,
            controlPolicy: {
              disabledControls: ['delete', 'sync', 'developerMode'],
              byEnvironment: { prod: { disabledControls: ['publish'] } },
            },
          })
          await sleep(500)
          await rec.goto(OPTIONS_URL)
          await sleep(1200)

          // Scroll to policyNote
          await rec.tab.eval(`(() => {
            const el = document.getElementById('policyNote')
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          })()`)
          await sleep(1000)

          // Highlight policyNote
          const note = await rec.waitFor('#policyNote', 5000)
          await rec.moveTo(note.cx, note.cy, 600)
          await sleep(2000)

          // Scroll to Developer Mode toggle and show it is locked off
          await rec.tab.eval(`(() => {
            const el = document.getElementById('enableDevMode')
            if (el) el.closest('.toggle-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          })()`)
          await sleep(1000)
          await rec.hover('#enableDevMode + .toggle-slider', 1500)
        },
      },

      // 6. Managed Policy: Lock Configuration
      {
        say: 'To guarantee compliance and eliminate configuration drift, administrators can activate lockConfiguration. Orbit instantly locks the entire Options console, rendering every field read-only and displaying an official administrator management banner.',
        do: async () => {
          log('applying lockConfiguration...')
          await setPolicy(rec, {
            lockConfiguration: true,
            enforceSessionAuthOnly: true,
            controlPolicy: {
              disabledControls: ['delete', 'sync', 'developerMode'],
              byEnvironment: { prod: { disabledControls: ['publish'] } },
            },
          })
          await sleep(500)
          await rec.goto(OPTIONS_URL)
          await sleep(1200)

          // Scroll top to show lock banner
          await rec.tab.eval(`window.scrollTo({ top: 0, behavior: 'smooth' })`)
          await sleep(1200)

          const banner = await rec.waitFor('#lockBanner', 5000)
          await rec.moveTo(banner.cx, banner.cy, 600)
          await sleep(2200)

          // Show Save button is disabled
          await rec.hover('#save:disabled', 1500)
        },
      },

      // 7. Live Page Governance Verification
      {
        say: 'Returning to the live AEM author page, Orbit reflects the enterprise policy immediately. With sync and delete restricted by policy, destructive actions are completely removed from the toolbar and developer menus, keeping your production assets safe.',
        do: async () => {
          await rec.tab.eval('(() => { window.onbeforeunload = null; if (typeof setDirty === "function") setDirty(false); })()').catch(() => {})
          await rec.goto(START_PAGE)
          await sleep(2000)
          await T.expand(rec)
          await sleep(1200)

          // Open More menu and show Developer links lacks Delete and Sync
          await T.openMenu(rec, '#asp-more-btn')
          await sleep(2500)
        },
      },

      // 8. Wrap-up
      {
        say: 'This concludes Chapter 9. With brand profiles, SAML session enforcement, administrative policy locks, and zero-trust telemetry isolation, AEM Orbit provides enterprise-grade control at any scale.',
        do: async () => {
          await sleep(2000)
        },
      },
    ],
  })
} finally {
  await cleanupShim()
}
process.exit(process.exitCode || 0)

