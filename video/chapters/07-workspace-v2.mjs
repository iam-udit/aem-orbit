// Chapter 7 (v2) - Popup Workspace & Multi-Page Operations.
// Covers all 10 features from video/FEATURES.md:
//   1. Multi-page workspace dashboard
//   2. Live page search + viewing another page notice & return button
//   3. Cross-environment compare + SHA-256 fingerprinting + visual property diff
//   4. Recent & starred favourites (20 recents, 50 starred)
//   5. Version timeline & checkpoints (save version, version history, diff)
//   6. URL variants hub (1-click copy & open for Author, View, Live, Publish, CRXDE, Props, Model JSON, Universal Editor)
//   7. Quick links launchpad (Sites, Assets, CRXDE, Packages, OSGi, Cloud Manager)
//   8. Audit action history log (200 ops, CSV export with formula injection guard)
//   9. Find and replace across pages (search terms, matched properties across trees)
//  10. Dispatcher flush (cache invalidation for active path)
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
  await rec.waitFor('#mainPanel.open', 8000)
  await rec.tab.eval(`(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    const p = document.getElementById('mainPanel')
    if (p) p.scrollIntoView({ block: 'end', behavior: 'smooth' })
  })()`)
  await sleep(700)
}

async function closePanelAndScrollTop(rec) {
  await popClick(rec, '#closePanelBtn', 500)
  await rec.tab.eval(`(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })()`)
  await sleep(600)
}

async function showDialog(rec) {
  await rec.waitFor('.asp-dlg', 8000)
  await rec.tab.eval(`(() => {
    const d = document.querySelector('.asp-dlg')
    if (d) d.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })()`)
  await sleep(400)
}

await runChapter('07-workspace-v2', {
  url: START_PAGE,
  steps: (rec) => [
    // 1. Overview & Open Popup
    {
      say: 'Welcome to Chapter 7. In this chapter, we explore AEM Orbit\'s extension popup Workspace, a central dashboard designed for multi-page productivity, cross-environment audits, and governance workflows.',
      do: async () => {
        await rec.title('Chapter 7 · <b>Popup Workspace</b> &amp; multi-page operations', 'Live page search, cross-environment compare, versions, audit history, find &amp; replace, and Dispatcher flush')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)

        log('opening extension popup...')
        globalThis.__pop = await openPopup(rec)
        await sleep(1500)

        // Seed actionLog directly in popup context where chrome.storage is native
        await rec.tab.eval(`(() => {
          return new Promise((resolve) => {
            chrome.storage.local.set({
              actionLog: [
                { ok: true, action: 'Publish page', path: '/content/wknd/us/en/magazine', env: 'dev', ts: Date.now() - 1800000 },
                { ok: true, action: 'Sync from Prod', path: '/content/wknd/us/en/magazine', env: 'dev', ts: Date.now() - 5400000 },
                { ok: true, action: 'Bulk publish', path: '/content/wknd/us/en', count: 3, env: 'dev', ts: Date.now() - 86400000 }
              ]
            }, resolve);
          });
        })()`).catch(() => {})
        await rec.tab.eval(`(() => {
          const g1 = document.getElementById('groupWorkspace')
          const g2 = document.getElementById('groupDeveloper')
          if (g1) g1.open = true
          if (g2) g2.open = true
        })()`)
        await sleep(500)
        await rec.moveTo(180, 140, 700) // hero card
        await sleep(800)
      },
    },

    // 2. Live Page Search
    {
      say: 'At the top of the popup, live page search allows authors to locate any page across the content tree without leaving the active tab. We type ski to find related articles.',
      do: async () => {
        await popClick(rec, '#searchInput', 500)
        await sleep(300)
        await rec.type('ski', 80)
        await sleep(300)
        await popClick(rec, '#searchBtn', 400)
        await rec.waitFor('#searchResults .search-result-item', 15000)
        await sleep(1200)
      },
    },

    // 3. Viewing Another Page Notice & Return
    {
      say: 'Selecting a search result instantly pivots the popup context to that page, showing its JCR path, publish state, and properties. Orbit displays an amber notice reminding authors they are previewing a searched page, complete with a one-click return button.',
      do: async () => {
        const item = await rec.waitFor('#searchResults .search-result-item', 5000)
        await rec.moveTo(item.cx, item.cy, 600)
        await sleep(200)
        await rec.clickHere()
        await rec.waitFor('#viewingNote', 5000)
        await sleep(1500)
        await rec.moveTo(180, 80, 500) // viewing notice
        await sleep(1000)
        await popClick(rec, '#viewingBack', 500)
        await sleep(1200)
      },
    },

    // 4. Cross-Environment Compare & SHA-256 Fingerprinting
    {
      say: 'Detecting environment drift before release is essential. Clicking Compare Environments computes canonical SHA-256 fingerprints across DEV, STAGE, PROD, and LOCAL, automatically filtering volatile timestamps to detect genuine content differences.',
      do: async () => {
        await popClick(rec, '#compareBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent [data-diff]', 25000)
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const c = document.getElementById('panelContent')
          if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
        })()`)
        await sleep(2200)
      },
    },

    // 5. Visual Property Diff
    {
      say: 'Clicking Diff opens a visual property comparison between environments, displaying exact additions, modifications, and deletions with color-coded badges.',
      do: async () => {
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const btn = document.querySelector('#panelContent [data-diff]')
          if (btn) btn.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })()`)
        await sleep(400)
        const diffBtn = await rec.waitFor('#panelContent [data-diff]', 5000)
        await rec.moveTo(diffBtn.cx, diffBtn.cy, 500)
        await sleep(200)
        await rec.clickHere()
        await rec.waitFor('#panelContent .diff-row, #panelContent .list-row, #panelContent table', 15000)
        await sleep(500)
        // scroll through diff table to the very bottom
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const c = document.getElementById('panelContent')
          if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
        })()`)
        await sleep(2500)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 6. Recent & Starred Favourites
    {
      say: 'Orbit bookmarks up to fifty favourite destinations and tracks your twenty most recent navigation paths. Clicking the star button pins the current magazine page.',
      do: async () => {
        await popClick(rec, '#favBtn', 500)
        await sleep(1200)
      },
    },
    {
      say: 'Opening Recent & Favourites categorizes your starred pages and browsing history with environment tags and direct launch buttons.',
      do: async () => {
        await popClick(rec, '#listsBtn', 600)
        await showPanelResults(rec)
        await sleep(1200)
        // scroll lists panel
        await rec.tab.eval(`(() => {
          const c = document.getElementById('panelContent')
          if (c) c.scrollTop = 80
        })()`)
        await sleep(1800)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 7. Save Checkpoint & Version Snapshots
    {
      say: 'Before executing content updates, authors can capture instant JCR snapshots. Clicking Save Version prompts for a checkpoint label, creating a permanent revision.',
      do: async () => {
        await popClick(rec, '#createVersionBtn', 600)
        await showDialog(rec)
        await sleep(600)
        await rec.click('.asp-dlg-input', 400)
        await rec.type('v1-baseline', 70)
        await sleep(500)
        await rec.click('.asp-dlg-primary', 500)
        await rec.waitFor('.toast', 8000)
        await sleep(1500)
      },
    },

    // 8. Version Timeline & Historical Diff
    {
      say: 'Opening Versions reveals the chronological revision timeline with creation timestamps, labels, one-click version diffing, and rollback capabilities.',
      do: async () => {
        await popClick(rec, '#versionsBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent .version-item', 15000)
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const c = document.getElementById('panelContent')
          if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
        })()`)
        await sleep(1500)
        const diffVerBtn = await rec.waitFor('[data-diff-ver]', 5000)
        await rec.moveTo(diffVerBtn.cx, diffVerBtn.cy, 500)
        await sleep(200)
        await rec.clickHere()
        // Scroll down to the very bottom so the historical version diff results are fully visible
        await rec.tab.eval(`(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
          const c = document.getElementById('panelContent')
          if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
        })()`)
        await sleep(2500)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 9. URL Variants Hub
    {
      say: 'The URL variants hub provides one-click copying and direct tab navigation for Author, View, Live, Publish, CRXDE Lite, Page Properties, Model JSON, and Universal Editor URLs.',
      do: async () => {
        await popClick(rec, '#urlVariantsBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent .url-item', 10000)
        await sleep(1500)
        const copyBtn = await rec.waitFor('#panelContent .url-copy', 5000)
        await rec.moveTo(copyBtn.cx, copyBtn.cy, 500)
        await sleep(200)
        await rec.clickHere()
        await rec.waitFor('.toast', 5000)
        await sleep(1500)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 10. Quick Links Launchpad
    {
      say: 'The Quick Links launchpad aggregates essential administrative consoles, including Sites, Assets, CRXDE Lite, Package Manager, OSGi Felix Console, and Adobe Cloud Manager into a single menu.',
      do: async () => {
        await popClick(rec, '#quickLinksBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent .list-row', 10000)
        await sleep(1500)
        await rec.tab.eval(`(() => {
          const c = document.getElementById('panelContent')
          if (c) c.scrollTop = 100
        })()`)
        await sleep(1800)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 11. Audit Action History Log & CSV Export
    {
      say: 'Orbit records your last two hundred operations in a persistent local audit log. Clicking Action History displays every replication, bulk action, and sync with status badges and timestamps.',
      do: async () => {
        await popClick(rec, '#actionLogBtn', 600)
        await showPanelResults(rec)
        await rec.waitFor('#panelContent .list-row', 10000)
        await sleep(1500)
        await rec.tab.eval(`(() => {
          const c = document.getElementById('panelContent')
          if (c) c.scrollTop = 120
        })()`)
        await sleep(1500)
      },
    },
    {
      say: 'The entire history can be copied as a CSV file, guarded against spreadsheet formula injection by sanitizing leading special characters.',
      do: async () => {
        await popClick(rec, '#logExport', 500)
        await rec.waitFor('.toast', 5000)
        await sleep(1500)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 12. Find & Replace Across Pages
    {
      say: 'For batch content refactoring across entire site trees, Find & Replace searches property values across sub-pages and prepares batch replacements. We search for Surfing under the magazine path.',
      do: async () => {
        await popClick(rec, '#findReplaceBtn', 600)
        await showPanelResults(rec)
        await sleep(800)
        await popClick(rec, '#frSearchTerm', 400)
        await rec.type('Surfing', 70)
        await sleep(400)
        await popClick(rec, '#frFindBtn', 500)
        await rec.waitFor('#frResults .list-row, #frResults div', 15000)
        await sleep(2200)
        await closePanelAndScrollTop(rec)
        await sleep(800)
      },
    },

    // 13. Dispatcher Flush & Wrap-up
    {
      say: 'Finally, Flush Cache sends an immediate cache invalidation request to the Dispatcher, purging stale CDN entries in seconds.',
      do: async () => {
        await rec.tab.eval(`(() => {
          const devGroup = document.getElementById('groupDeveloper')
          if (devGroup) devGroup.open = true
        })()`)
        await sleep(300)
        await popScroll(rec, '#dispatcherFlushBtn')
        await rec.click('#dispatcherFlushBtn', 500)
        await showDialog(rec)
        await sleep(800)
        await rec.click('.asp-dlg-primary', 500)
        await rec.waitFor('.toast', 8000)
        await sleep(1500)
      },
    },
    {
      say: 'This concludes Chapter 7. With search, cross-environment diffing, version checkpoints, URL variants, and console launchpads, Orbit transforms the extension popup into a versatile multi-page workspace.',
      do: async () => {
        await sleep(1000)
        log('closing popup...')
        await globalThis.__pop.close()
        await sleep(1000)
      },
    },
  ],
})
