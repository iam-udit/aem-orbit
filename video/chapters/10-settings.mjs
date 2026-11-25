// Chapter 10 (v4) - Settings Console: 4-Persona Switching, Multi-Site Profiles, Diagnostics & All-Browser Architecture.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/10-settings.mjs
import fs from 'node:fs'
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const EXT_ID = fs.readFileSync('video/work/extension-id.txt', 'utf8').trim()
const OPTIONS_URL = `chrome-extension://${EXT_ID}/src/options/options.html`
const AEM_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

async function optScroll(rec, selector) {
  await rec.tab.eval(`new Promise((resolve) => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return resolve()
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    let last = window.scrollY, same = 0
    const start = Date.now()
    const tick = () => {
      const now = window.scrollY
      if (Math.abs(now - last) < 1) same++
      else { same = 0; last = now }
      if (same >= 5 || Date.now() - start > 1800) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })`)
  await sleep(250)
}

async function clearDirty(rec) {
  await rec.tab.eval('(() => { window.onbeforeunload = null; if (typeof setDirty === "function") setDirty(false); })()').catch(() => {})
}

await runChapter('10-settings-v4', {
  url: OPTIONS_URL,
  settle: 2000,
  setup: async (rec) => {
    await clearDirty(rec)
    await rec.tab.eval(`new Promise((r) => chrome.storage.sync.set({ persona: 'custom', classicBar: false, enableDevMode: true }, r))`)
    await rec.tab.eval('location.reload()')
    await sleep(1200)
  },
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 10. Orbit’s Settings console adapts dynamically to your workspace persona and runs across Chromium browsers, Firefox Manifest V3, and Safari Web Extensions.',
      do: async () => {
        await rec.title('Chapter 10 · <b>Settings Console</b> &amp; 4 Personas', 'Dynamic Author/QA/Dev/Custom settings, Brand Profiles, 5-tier Diagnostics &amp; Toolbar Editor')
        await sleep(3500)
        await rec.untitle()
        await rec.tab.eval('window.scrollTo({ top: 0, behavior: "smooth" })')
        await sleep(800)
        await rec.hover('#save', 700)
        await rec.click('#theme-toggle', 500)
        await sleep(900)
        await rec.click('#theme-toggle', 500)
        await sleep(900)
        await rec.click('#theme-toggle', 500)
        await rec.click('#backupMenuBtn', 500)
        await sleep(900)
        await rec.click('#backupMenuBtn', 400)
      },
    },
    {
      say: 'Choose a Workspace Persona card and every section below updates live. Author hides technical switches cleanly. QA enables SEO audit, Cache Headers, and QA Readiness checks across Dispatcher hosts while keeping view tools safe.',
      do: async () => {
        await optScroll(rec, '#personaGrid')
        await rec.click('[data-persona="author"]', 700)
        await sleep(1400)
        await optScroll(rec, 'label.toggle:has(#showOnDispatcher)')
        await sleep(1200)
        await optScroll(rec, '#personaGrid')
        await rec.click('[data-persona="qa"]', 700)
        await sleep(1200)
        await optScroll(rec, '#qaSection')
        await sleep(1600)
      },
    },
    {
      say: 'Developer enables full JCR, Sync, and Delete capabilities, while Custom preserves classic defaults and unlocks full manual control—or clones any preset in one click via Customize in Custom mode.',
      do: async () => {
        await optScroll(rec, '#personaGrid')
        await rec.click('[data-persona="dev"]', 700)
        await sleep(1200)
        await optScroll(rec, '#devModeSection')
        await sleep(1400)
        await optScroll(rec, '#personaGrid')
        await rec.click('#personaCloneCustom', 700)
        await sleep(1100)
        await rec.hover('[data-persona="custom"]', 600)
        await rec.tab.eval(`(() => {
          const d = document.getElementById('enableDevMode')
          const c = document.getElementById('customizeToolbar')
          if (d && !d.checked) d.click()
          if (c && c.checked) c.click()
        })()`)
        await sleep(800)
      },
    },
    {
      say: 'First-run onboarding takes three steps with Quick Setup, while Multi-Site Brand Profiles let enterprise teams customize roots and mappings per site.',
      do: async () => {
        await rec.tab.eval(`(() => { const qs = document.getElementById('quickSetup'); if (qs) { qs.style.display = '' } })()`)
        await optScroll(rec, '#quickSetup')
        await sleep(1100)
        await rec.tab.eval(`(() => { const qs = document.getElementById('quickSetup'); if (qs) { qs.style.display = 'none' } })()`)
        await optScroll(rec, '#profilesSection')
        await rec.hover('#activeProfileSelect', 900)
        await sleep(800)
      },
    },
    {
      say: 'Per-environment panels configure Session SSO, Basic, or Bearer auth. Test Connection verifies Author sign-in, while Run Diagnostics checks all five tiers—Author, CSRF token, Publish, Preview, and CDN—reporting live status and millisecond latency.',
      do: async () => {
        await optScroll(rec, '#env-tabs')
        await rec.click('.tab[data-tab="dev"]', 600)
        await rec.waitFor('#panel-dev.visible', 6000)
        await sleep(500)
        await optScroll(rec, 'button[data-test="dev"]')
        await rec.click('button[data-test="dev"]', 600)
        await rec.waitFor('#dev-connDot.ok', 10000)
        await sleep(800)
        await rec.click('#dev-diagBtn', 600)
        await rec.waitFor('#dev-diagList .dot.ok', 12000)
        await sleep(2400)
      },
    },
    {
      say: 'Environment safety switches, URL mappings, timeout steppers, precedence order, and QA Verification toggles keep governance consistent across Author, Publish, and CDN domains.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#dev-protected)')
        await rec.hover('label.toggle:has(#dev-dispatcherOmitHtml) .toggle-slider', 900)
        await optScroll(rec, '#contentRoot')
        await rec.hover('#urlMappings', 1000)
        await optScroll(rec, '#order-section')
        await sleep(900)
        await optScroll(rec, 'label.toggle:has(#confirmDelete)')
        await rec.hover('label.toggle:has(#sessionOnlyCredentials) .toggle-slider', 900)
        await optScroll(rec, '#qaSection')
        await rec.hover('#qaBtn-audit + .toggle-slider', 800)
      },
    },
    {
      say: 'Live style switching lets you choose between Classic horizontal bar and radial floating Orb—saving immediately updates every open AEM tab.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#classicBar)')
        await rec.click('label.toggle:has(#classicBar) .toggle-slider', 700)
        await sleep(500)
        if (!(await rec.tab.eval(`document.getElementById('classicBar')?.checked`))) {
          await rec.tab.eval(`(() => { const cb = document.getElementById('classicBar'); if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })) } })()`)
          await sleep(400)
        }
        await optScroll(rec, '#save')
        await rec.click('#save', 700)
        await sleep(1400)
        await rec.goto(AEM_PAGE, 3200)
        await rec.hover('#asp-bar', 1200)
        await sleep(1200)
        await rec.goto(OPTIONS_URL, 2800)
        await rec.waitFor('#save', 8000)
        await optScroll(rec, 'label.toggle:has(#classicBar)')
        await rec.click('label.toggle:has(#classicBar) .toggle-slider', 700)
        await sleep(500)
        if (await rec.tab.eval(`document.getElementById('classicBar')?.checked`)) {
          await rec.tab.eval(`(() => { const cb = document.getElementById('classicBar'); if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })) } })()`)
          await sleep(400)
        }
        await optScroll(rec, '#save')
        await rec.click('#save', 700)
        await sleep(1400)
      },
    },
    {
      say: 'Finally, Toolbar Customizer reorders Mini and Expanded bar buttons, Developer Mode toggles individual engineering actions, and Data Management offers clean Factory Reset or Full Wipe.',
      do: async () => {
        await optScroll(rec, 'label.toggle:has(#customizeToolbar)')
        await rec.click('label.toggle:has(#customizeToolbar) .toggle-slider', 700)
        await sleep(500)
        if (!(await rec.tab.eval(`document.getElementById('customizeToolbar')?.checked`))) {
          await rec.tab.eval(`(() => { const cb = document.getElementById('customizeToolbar'); if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })) } })()`)
          await sleep(400)
        }
        await rec.waitFor('#tbReset', 6000)
        await optScroll(rec, '#tbReset')
        await rec.hover('.tb-bar', 1200)
        await optScroll(rec, 'label.toggle:has(#customizeToolbar)')
        await rec.click('label.toggle:has(#customizeToolbar) .toggle-slider', 600)
        await sleep(400)
        if (await rec.tab.eval(`document.getElementById('customizeToolbar')?.checked`)) {
          await rec.tab.eval(`(() => { const cb = document.getElementById('customizeToolbar'); if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })) } })()`)
          await sleep(300)
        }
        await optScroll(rec, '.actions')
        await rec.hover('#reset', 800)
        await rec.hover('#clearAll', 800)
        await clearDirty(rec)
        await rec.tab.eval(`(async () => {
          await new Promise((r) => chrome.storage.sync.set({ persona: 'custom', classicBar: false, enableDevMode: true, customizeToolbar: false }, r))
          chrome.runtime.sendMessage({ action: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null)
        })()`)
        await sleep(1000)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
