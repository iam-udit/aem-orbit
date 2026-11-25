// Chapter 7 (v4) - Popup Workspace: Persona Switcher, QA Readiness, Env Picker, Compare Diff & Batch Tools.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/07-workspace.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { openPopup } from '../lib/popup.mjs'
import { sleep } from '../lib/cdp.mjs'

const log = (...a) => console.log(' ', ...a)
const START_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

async function popScroll(rec, selector) {
  await rec.tab.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' })
  })()`)
  await sleep(300)
}

async function popClick(rec, selector, ms = 450) {
  await popScroll(rec, selector)
  await rec.click(selector, ms)
}

async function showPanelResults(rec) {
  await rec.waitFor('#mainPanel.open', 10000)
  await rec.tab.eval(`(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    const p = document.getElementById('mainPanel')
    if (p) p.scrollIntoView({ block: 'end', behavior: 'smooth' })
    const c = document.getElementById('panelContent')
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
  })()`)
  await sleep(700)
}

async function closePanelAndScrollTop(rec) {
  await popClick(rec, '#closePanelBtn', 500)
  await rec.tab.eval(`window.scrollTo({ top: 0, behavior: 'smooth' })`)
  await sleep(600)
}

async function showDialog(rec) {
  await rec.waitFor('.asp-dlg', 8000)
  await rec.tab.eval(`document.querySelector('.asp-dlg')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
  await sleep(400)
}

await runChapter('07-workspace-v4', {
  url: START_PAGE,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 7. Orbit’s Workspace popup brings persona switching, QA Readiness verification, cross-environment compare, version checkpoints, URL variants, and batch operations into a compact multi-page console.',
      do: async () => {
        await rec.title('Chapter 7 · <b>Popup Workspace</b> &amp; QA Readiness', 'Header Persona &amp; Env switchers, QA Readiness, SHA-256 Diff, Versions, History, Find &amp; Replace')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)

        log('opening popup...')
        globalThis.__pop = await openPopup(rec)
        await sleep(1400)

        await rec.tab.eval(`(() => {
          chrome.storage.local.set({
            actionLog: [
              { ok: true, action: 'Publish page', path: '/content/wknd/us/en/magazine', env: 'dev', ts: Date.now() - 1800000 },
              { ok: true, action: 'Sync from Prod', path: '/content/wknd/us/en/magazine', env: 'dev', ts: Date.now() - 5400000 },
              { ok: true, action: 'Bulk publish', path: '/content/wknd/us/en', count: 3, env: 'dev', ts: Date.now() - 86400000 }
            ]
          })
          const g1 = document.getElementById('groupWorkspace')
          const g2 = document.getElementById('groupDeveloper')
          if (g1) g1.open = true
          if (g2) g2.open = true
        })()`).catch(() => {})
        await sleep(600)
      },
    },
    {
      say: 'Right in the header sits the new Persona switcher pill alongside the clickable Environment badge. Switching to QA unlocks the dedicated QA Verification group while hiding publishing buttons to prevent accidental mutations.',
      do: async () => {
        await rec.click('#personaBadge', 500)
        await rec.waitFor('#personaDropdown:not([hidden])', 3000)
        await sleep(800)
        await rec.click('#personaDropdown [data-persona-pick="qa"]', 500)
        await rec.waitFor('#groupQa', 4000)
        await sleep(900)
        await popClick(rec, '#qaReadinessBtn', 500)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent .list-row', 15000)
        await sleep(2600)
        await closePanelAndScrollTop(rec)

        await rec.click('#envBadge', 500)
        await rec.waitFor('#envDropdown:not([hidden])', 3000)
        await sleep(900)
        await rec.click('#envDropdown [data-env="stage"]', 500)
        await sleep(1000)
        await rec.click('#envBadge', 500)
        await rec.click('#envDropdown [data-env="dev"]', 500)
        await sleep(600)

        await rec.click('#personaBadge', 500)
        await rec.click('#personaDropdown [data-persona-pick="custom"]', 500)
        await sleep(800)
        await rec.tab.eval(`(() => {
          document.getElementById('groupWorkspace').open = true
          document.getElementById('groupDeveloper').open = true
        })()`)
      },
    },
    {
      say: 'Live search locates any page across the active brand root, pivots the popup with a clear return notice, and hops back in one click.',
      do: async () => {
        await popClick(rec, '#searchInput', 500)
        await rec.type('ski', 80)
        await popClick(rec, '#searchBtn', 400)
        await rec.waitFor('#searchResults .search-result-item', 15000)
        await sleep(1000)
        await rec.click('#searchResults .search-result-item', 500)
        await rec.waitFor('#viewingNote', 5000)
        await sleep(1500)
        await popClick(rec, '#viewingBack', 500)
        await sleep(1000)
      },
    },
    {
      say: 'Compare calculates canonical SHA-256 hashes across environments. Opening Show diff reveals exact property edits along with new Copy Diff JSON and Back navigation buttons.',
      do: async () => {
        await popClick(rec, '#compareBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent [data-diff]', 25000)
        await sleep(1400)
        await rec.tab.eval(`document.querySelector('#panelContent [data-diff]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`)
        await sleep(400)
        await rec.click('#panelContent [data-diff]', 500)
        await rec.waitFor('#diffBackBtn', 15000)
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const c = document.getElementById('panelContent')
          if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
        })()`)
        await sleep(2200)
        await popClick(rec, '#diffCopyBtn', 500)
        await sleep(900)
        await popClick(rec, '#diffBackBtn', 500)
        await rec.waitFor('#panelContent .list-row', 8000)
        await sleep(900)
        await closePanelAndScrollTop(rec)
      },
    },
    {
      say: 'Bookmarking stars pages into Recent and Favourites, now with quick per-item remove and clear controls. Checkpoints and Versions track timeline diffs without leaving the popup.',
      do: async () => {
        await popClick(rec, '#favBtn', 500)
        await sleep(900)
        await popClick(rec, '#listsBtn', 600)
        await showPanelResults(rec)
        await sleep(1600)
        await closePanelAndScrollTop(rec)

        await popClick(rec, '#createVersionBtn', 600)
        await showDialog(rec)
        await rec.click('.asp-dlg-input', 400)
        await rec.type('v4-baseline', 70)
        await rec.click('.asp-dlg-primary', 500)
        await rec.waitFor('.toast', 8000)
        await sleep(1200)

        await popClick(rec, '#versionsBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent [data-diff-ver]', 15000)
        await popClick(rec, '#panelContent [data-diff-ver]', 500)
        await rec.waitFor('#diffBackBtn', 15000)
        await sleep(1800)
        await closePanelAndScrollTop(rec)
      },
    },
    {
      say: 'URL Variants, Quick Links, Action History CSV export, Find & Replace with case and match selection, and instant Dispatcher Flush complete the multi-page workspace.',
      do: async () => {
        await popClick(rec, '#urlVariantsBtn', 500)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent .url-copy', 10000)
        await popClick(rec, '#panelContent .url-copy', 450)
        await sleep(900)
        await closePanelAndScrollTop(rec)

        await popClick(rec, '#quickLinksBtn', 500)
        await showPanelResults(rec)
        await sleep(1200)
        await closePanelAndScrollTop(rec)

        await popClick(rec, '#actionLogBtn', 500)
        await showPanelResults(rec)
        await rec.waitFor('#logExport', 8000)
        await popClick(rec, '#logExport', 500)
        await sleep(900)
        await closePanelAndScrollTop(rec)

        await popClick(rec, '#findReplaceBtn', 500)
        await showPanelResults(rec)
        await popClick(rec, '#frSearchTerm', 400)
        await rec.type('Surfing', 70)
        await popClick(rec, '#frFindBtn', 500)
        await rec.waitFor('#frResults .fr-match-check', 15000)
        await sleep(1800)
        await closePanelAndScrollTop(rec)

        await rec.tab.eval(`document.getElementById('groupDeveloper').open = true`)
        await popScroll(rec, '#dispatcherFlushBtn')
        await rec.click('#dispatcherFlushBtn', 500)
        await showDialog(rec)
        await sleep(700)
        await rec.click('.asp-dlg-primary', 500)
        await rec.waitFor('.toast', 8000)
        await sleep(1500)
        await globalThis.__pop.close()
      },
    },
  ],
})
process.exit(process.exitCode || 0)
