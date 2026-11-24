// Chapter 10 (v3) - Settings (Options Page) - Complete Configuration Matrix.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/10-settings-v3.mjs
import fs from 'node:fs'
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const log = (...a) => console.log(' ', ...a)

const EXT_ID = fs.readFileSync('video/work/extension-id.txt', 'utf8').trim()
const OPTIONS_URL = `chrome-extension://${EXT_ID}/src/options/options.html`
const AEM_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

async function optScroll(rec, selector) {
  await rec.tab.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })()`)
  await sleep(700)
}

async function clearDirty(rec) {
  await rec.tab.eval('(() => { window.onbeforeunload = null; if (typeof setDirty === "function") setDirty(false); })()').catch(() => {})
}

await runChapter('10-settings-v3', {
  url: OPTIONS_URL,
  settle: 2000,
  setup: async (rec) => {
    await clearDirty(rec)
    // Guarantee clean initial baseline: classicBar is OFF, enableDevMode is ON
    await rec.tab.eval(`new Promise((r) => chrome.storage.sync.set({ classicBar: false, enableDevMode: true }, r))`)
    await rec.tab.eval('location.reload()')
    await sleep(1200)
  },
  steps: (rec) => [
    // 1. Overview & Top Header Controls
    {
      say: 'Welcome to Chapter 10. In this chapter, we explore AEM Orbit\'s complete settings console, where administrators and developers configure environments, authentication, safety guards, and toolbar button layouts.',
      do: async () => {
        await rec.title('Chapter 10 · <b>Settings Console</b> &amp; options matrix', 'Full configuration matrix: Quick setup, environments, diagnostics, safety, toolbar editor, and developer controls')
        await sleep(3500)
        await rec.untitle()
        await sleep(500)

        // Show header
        await rec.tab.eval('window.scrollTo({ top: 0, behavior: ' + "'smooth'" + ' })')
        await sleep(1000)

        // Hover Save button
        await rec.hover('#save', 800)

        // Click Theme Switcher (cycles Auto -> Light -> Dark -> Auto)
        log('cycling theme toggle...')
        await rec.click('#theme-toggle', 600)
        await sleep(1200)
        await rec.click('#theme-toggle', 600)
        await sleep(1200)
        await rec.click('#theme-toggle', 600)
        await sleep(1000)

        // Open Backup / Settings Menu
        log('opening backup menu...')
        await rec.click('#backupMenuBtn', 600)
        await sleep(1200)

        // Hover menu items
        await rec.hover('#exportSettings', 700)
        await rec.hover('#importSettings', 700)
        await rec.hover('#shareSettingsUrl', 900)

        // Close menu
        await rec.click('#backupMenuBtn', 400)
        await sleep(500)
      },
    },

    // 2. Quick Setup Card & First-Run Provisioning
    {
      say: 'For new installations, the Quick Setup card accelerates onboarding in three steps: selecting your target environment tier, entering your author URL, and choosing your authentication method before running an instant connection test.',
      do: async () => {
        // Reveal Quick Setup card for demonstration
        await rec.tab.eval(`(() => {
          const qs = document.getElementById('quickSetup')
          if (qs) {
            qs.style.display = ''
            qs.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        })()`)
        await sleep(1000)

        await rec.hover('#qs-env', 800)
        await rec.hover('#qs-host', 800)
        await rec.hover('#qs-auth', 800)
        await rec.hover('#qs-test', 800)
        await sleep(1000)
      },
    },

    // 3. Environment Tabs & Custom Environments
    {
      say: 'Orbit supports multi-tier architectures with dedicated panels for Local, Dev, Stage, and Production environments. Teams can also provision custom environments for feature branches, performance clusters, or regional testing.',
      do: async () => {
        await optScroll(rec, '#env-tabs')

        // Switch tabs: Dev -> Stage -> Prod -> Local -> Dev
        log('switching environment tabs...')
        await rec.click('.tab[data-tab="dev"]', 700)
        await sleep(800)
        await rec.click('.tab[data-tab="stage"]', 700)
        await sleep(800)
        await rec.click('.tab[data-tab="prod"]', 700)
        await sleep(800)
        await rec.click('.tab[data-tab="local"]', 700)
        await sleep(800)
        await rec.click('.tab[data-tab="dev"]', 700)
        await sleep(800)

        // Hover Add Environment button
        await rec.hover('#btn-add-env', 1200)
      },
    },

    // 4. Authentication Modes & 1-Click Latency Diagnostics
    {
      say: 'Each environment provides granular authentication: browser SAML session reuse, Basic auth, or Bearer tokens. The built-in connection test performs live CSRF token verification and measures real-time millisecond latency directly to your AEM author instance.',
      do: async () => {
        await optScroll(rec, '.auth-selector[data-env="dev"]')

        // Hover auth options in Dev panel
        await rec.hover('.auth-selector[data-env="dev"] [data-type="session"]', 800)
        await rec.hover('.auth-selector[data-env="dev"] [data-type="basic"]', 700)
        await rec.hover('.auth-selector[data-env="dev"] [data-type="bearer"]', 700)
        await rec.hover('.auth-selector[data-env="dev"] [data-type="none"]', 700)

        // Select Browser Session and click Test Connection
        await rec.click('.auth-selector[data-env="dev"] [data-type="session"]', 600)
        await sleep(600)

        log('clicking Test Connection...')
        await optScroll(rec, 'button[data-test="dev"]')
        await rec.click('button[data-test="dev"]', 600)
        await sleep(2200)

        // Hover connection status
        await rec.hover('#dev-connStatus', 1200)
      },
    },

    // 5. Per-Environment Governance & URL Rewriting Toggles
    {
      say: 'Advanced switches tailor Orbit to your hosting architecture. The Protected environment toggle enables typed confirmation safeguards for destructive operations, while URL mapping and HTML extension stripping adapt links for Dispatchers and CDNs.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#dev-protected)')

        // Hover protected toggle
        await rec.hover('label.toggle:has(#dev-protected) .toggle-slider', 1000)

        // Hover URL mapping and omit .html toggles
        await optScroll(rec, 'label.toggle:has(#dev-publishUsesMappings)')
        await rec.hover('label.toggle:has(#dev-publishUsesMappings) .toggle-slider', 1000)
        await rec.hover('label.toggle:has(#dev-dispatcherOmitHtml) .toggle-slider', 1200)
      },
    },

    // 6. General Settings & Multi-Site Brand Profiles
    {
      say: 'The General section manages global content roots, application folders, Universal Editor organization handles, request timeouts, and multi-line Dispatcher URL rewriting rules supporting exact and prefix mapping.',
      do: async () => {
        await optScroll(rec, '#contentRoot')
        await rec.hover('#contentRoot', 800)
        await rec.hover('#appName', 800)
        await rec.hover('#imsOrg', 800)

        // Step request timeout
        log('adjusting request timeout stepper...')
        await optScroll(rec, '#requestTimeoutSec-inc')
        await rec.click('#requestTimeoutSec-inc', 500)
        await sleep(400)
        await rec.click('#requestTimeoutSec-inc', 500)
        await sleep(600)
        await rec.click('#requestTimeoutSec-dec', 500)
        await sleep(600)

        // Hover urlMappings textarea
        await optScroll(rec, '#urlMappings')
        await rec.hover('#urlMappings', 1500)
      },
    },

    // 7. Environment Precedence Order
    {
      say: 'Under Environment Order, you can reorder tiers to establish content sync hierarchy. Content replication and promotion workflows strictly respect this ranking to protect upper environments from accidental overwrites.',
      do: async () => {
        await optScroll(rec, '#order-section')
        await rec.hover('#env-order-list', 1500)
      },
    },

    // 8. Enterprise Safety Guards & Session Credentials
    {
      say: 'Enterprise safety guards prevent authoring accidents. Administrators can require typed confirmations before page deletion and publication, allow upward content sync with audit logging, toggle system notifications, and isolate credentials in browser memory.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#confirmDelete)')
        await rec.hover('label.toggle:has(#confirmDelete) .toggle-slider', 700)
        await rec.hover('label.toggle:has(#confirmPublish) .toggle-slider', 700)
        await rec.hover('label.toggle:has(#allowUpwardSync) .toggle-slider', 800)
        await rec.hover('label.toggle:has(#notifyOnActions) .toggle-slider', 700)
        await rec.hover('label.toggle:has(#sessionOnlyCredentials) .toggle-slider', 1200)
      },
    },

    // 9. Toolbar Visibility & Keyboard Shortcuts
    {
      say: 'Under Toolbar Visibility, control where Orbit appears across Author, Publish, and CDN hostnames. You can toggle toolbar presence using the Option+Shift+K shortcut, and configure last-modified timestamps on the status pill.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#showOnAuthor)')
        await rec.hover('label.toggle:has(#showOnAuthor) .toggle-slider', 700)
        await rec.hover('label.toggle:has(#showOnPublish) .toggle-slider', 700)
        await rec.hover('label.toggle:has(#showOnDispatcher) .toggle-slider', 800)

        await optScroll(rec, 'label.toggle:has(#enableKeyboardShortcut)')
        await rec.hover('label.toggle:has(#enableKeyboardShortcut) .toggle-slider', 900)
        await rec.hover('label.toggle:has(#showLastModified) .toggle-slider', 1000)
      },
    },

    // 10. Collapsed Bar Style & Live Pre/Post Demonstration
    {
      say: 'Choose your preferred collapsed appearance. Toggling Classic Mini-Bar replaces the circular Orb with a compact horizontal bar. We save the setting and jump straight to the live AEM page to see the Mini-Bar in action.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#classicBar)')
        await sleep(500)
        await rec.click('label.toggle:has(#classicBar) .toggle-slider', 700)
        await sleep(600)
        const barChecked = await rec.tab.eval(`document.getElementById('classicBar')?.checked`)
        if (!barChecked) {
          await rec.tab.eval(`(() => {
            const cb = document.getElementById('classicBar')
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })) }
          })()`)
          await sleep(400)
        }
        await optScroll(rec, '#save')
        await sleep(500)
        await rec.click('#save', 700)
        await sleep(1500)
        // Show Classic Mini-Bar live on AEM page
        await rec.goto(AEM_PAGE, 3500)
        await rec.hover('#asp-bar', 1200)
        await sleep(1800)
      },
    },
    {
      say: 'Now switch back. In Settings, we disable Classic Mini-Bar to restore the animated Orb and its seven-leaf sunburst fan.',
      do: async () => {
        await rec.goto(OPTIONS_URL, 3000)
        await rec.waitFor('#save')
        await sleep(500)
        await optScroll(rec, 'label.toggle:has(#classicBar)')
        await sleep(500)
        // Visibly click toggle-slider with mouse pointer to turn it OFF
        await rec.click('label.toggle:has(#classicBar) .toggle-slider', 700)
        await sleep(600)
        const stillChecked = await rec.tab.eval(`document.getElementById('classicBar')?.checked`)
        if (stillChecked) {
          await rec.tab.eval(`(() => {
            const cb = document.getElementById('classicBar')
            if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })) }
          })()`)
          await sleep(400)
        }
        await optScroll(rec, '#save')
        await sleep(500)
        await rec.click('#save', 700)
        await sleep(1500)
        // Show restored Orb live on AEM page
        await rec.goto(AEM_PAGE, 3500)
        await rec.hover('#asp-logo-btn', 1200)
        await sleep(1800)
        await rec.goto(OPTIONS_URL, 3000)
        await rec.waitFor('#save')
        await sleep(500)
      },
    },

    // 11. Toolbar Button Layout Editor
    {
      say: 'The drag-and-drop Toolbar Button Editor lets teams customize exact button layouts across Mini and Expanded bars. Drag buttons to reorder, add high-frequency tools, and allow surplus actions to overflow cleanly into the More menu.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#customizeToolbar)')
        await sleep(500)
        // Visibly click toggle-slider with mouse to enable
        await rec.click('label.toggle:has(#customizeToolbar) .toggle-slider', 700)
        await sleep(600)
        const isCustomChecked = await rec.tab.eval(`document.getElementById('customizeToolbar')?.checked`)
        if (!isCustomChecked) {
          await rec.tab.eval(`(() => {
            const cb = document.getElementById('customizeToolbar')
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })) }
          })()`)
          await sleep(500)
        }

        // Wait for tbReset to be present and visible
        await rec.waitFor('#tbReset', 6000)
        await optScroll(rec, '#tbReset')
        await sleep(600)

        // Hover editor bar and reset button
        await rec.hover('.tb-bar', 1500)
        await rec.hover('#tbReset', 1000)

        // Visibly click toggle-slider with mouse to disable
        await optScroll(rec, 'label.toggle:has(#customizeToolbar)')
        await sleep(500)
        await rec.click('label.toggle:has(#customizeToolbar) .toggle-slider', 700)
        await sleep(600)
        const isStillChecked = await rec.tab.eval(`document.getElementById('customizeToolbar')?.checked`)
        if (isStillChecked) {
          await rec.tab.eval(`(() => {
            const cb = document.getElementById('customizeToolbar')
            if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })) }
          })()`)
          await sleep(400)
        }
      },
    },

    // 12. Developer Mode Controls Matrix (Pre & Post Live Demonstration)
    {
      say: 'The Developer Mode matrix provides granular switches for advanced tooling. Turning off Developer Mode cleanly removes all technical inspectors from the toolbar and menus, creating a simplified interface for pure content authors.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#enableDevMode)')
        await sleep(500)

        // Visibly click toggle-slider with mouse pointer to turn Developer Mode OFF
        await rec.click('label.toggle:has(#enableDevMode) .toggle-slider', 700)
        await sleep(600)
        const devChecked = await rec.tab.eval(`document.getElementById('enableDevMode')?.checked`)
        if (devChecked) {
          await rec.tab.eval(`(() => {
            const cb = document.getElementById('enableDevMode')
            if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })) }
          })()`)
          await sleep(400)
        }
        await optScroll(rec, '#save')
        await sleep(500)
        await rec.click('#save', 700)
        await sleep(1500)

        // Navigate to AEM page to show developer tools are hidden
        await rec.goto(AEM_PAGE, 3500)
        await rec.click('#asp-logo-btn', 800)
        await sleep(1800)
      },
    },
    {
      say: 'Returning to Settings, we re-enable Developer Mode to instantly restore the full suite of engineering tools, including in-page JCR inspection, component overlays, and log streams.',
      do: async () => {
        await rec.goto(OPTIONS_URL, 3000)
        await rec.waitFor('#save')
        await sleep(500)
        await optScroll(rec, 'label.toggle:has(#enableDevMode)')
        await sleep(500)

        // Visibly click toggle-slider with mouse pointer to turn Developer Mode back ON
        await rec.click('label.toggle:has(#enableDevMode) .toggle-slider', 700)
        await sleep(600)
        const devUnchecked = await rec.tab.eval(`!document.getElementById('enableDevMode')?.checked`)
        if (devUnchecked) {
          await rec.tab.eval(`(() => {
            const cb = document.getElementById('enableDevMode')
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })) }
          })()`)
          await sleep(400)
        }
        await optScroll(rec, '#save')
        await sleep(500)
        await rec.click('#save', 700)
        await sleep(1500)

        // Navigate to AEM page to show developer tools restored
        await rec.goto(AEM_PAGE, 3500)
        await rec.click('#asp-logo-btn', 800)
        await sleep(1800)
        await rec.goto(OPTIONS_URL, 3000)
        await rec.waitFor('#save')
        await sleep(500)
      },
    },

    // 13. Data Management & Wrap-up
    {
      say: 'Finally, the actions footer allows resetting configurations to factory defaults or clearing cached workspace data. This completes Chapter 10, delivering complete governance and customization across the entire AEM Orbit extension.',
      do: async () => {
        await optScroll(rec, '.actions')
        await rec.hover('#reset', 1000)
        await rec.hover('#clearAll', 1200)

        // Scroll top to save button and highlight dirty note
        await rec.tab.eval('window.scrollTo({ top: 0, behavior: ' + "'smooth'" + ' })')
        await sleep(1000)
        await rec.hover('#save', 1200)
        await clearDirty(rec)
        await sleep(1000)

        // Ensure baseline settings are preserved for subsequent chapters
        await rec.tab.eval(`(async () => {
          await new Promise((r) => chrome.storage.sync.set({ classicBar: false, enableDevMode: true }, r))
          chrome.runtime.sendMessage({ type: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null)
        })()`)
      },
    },
  ],
})
process.exit(process.exitCode || 0)

