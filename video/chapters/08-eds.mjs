// Chapter 8 (v4) - Edge Delivery Services (.aem.page / .aem.live) & Universal Editor Integration.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/08-eds.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { openPopup } from '../lib/popup.mjs'
import { Target, sleep, extensionWorker } from '../lib/cdp.mjs'

const log = (...a) => console.log(' ', ...a)

const START_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`
const EDS_PREVIEW = 'https://main--wknd--hlxsites.aem.page/magazine?ref=campaign&preview=true'

function getMockHtml(url) {
  const isUE = url.includes('experience.adobe.com')
  const isPreview = url.includes('.aem.page')
  if (isUE) {
    const target = url.split('/canvas/')[1] || 'main--wknd--hlxsites.aem.page/magazine'
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Adobe Experience Cloud — Universal Editor</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,sans-serif;background:#1e1e1e;color:#fff;height:100vh;display:flex;flex-direction:column}
.top-bar{height:48px;background:#262626;border-bottom:1px solid #333;display:flex;align-items:center;padding:0 16px;gap:14px}
.ue-badge{background:#0265dc;color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px}
.target-url{font-size:12px;color:#888;font-family:monospace;margin-left:auto;background:#1a1a1a;padding:4px 10px;border-radius:4px;border:1px solid #333}
.canvas-container{flex:1;background:#181818;padding:32px;display:flex;justify-content:center}
.canvas-frame{width:1100px;height:680px;background:#fff;border-radius:8px;border:2px solid #0265dc;padding:40px;color:#111}
.canvas-highlight{border:2px dashed #0265dc;background:rgba(2,101,220,.05);padding:20px;border-radius:6px}</style></head>
<body><div class="top-bar"><span>Adobe Experience Cloud · Universal Editor</span><span class="ue-badge">Connected</span><span class="target-url">${target}</span></div>
<div class="canvas-container"><div class="canvas-frame"><div class="canvas-highlight"><h1>WKND Magazine — Universal Editor</h1><p>Direct canvas editing connected cleanly across Edge Delivery and AEM Cloud.</p></div></div></div></body></html>`
  }
  const badgeText = isPreview ? 'EDS Preview (.aem.page)' : 'EDS Live (.aem.live)'
  const badgeColor = isPreview ? '#e06c00' : '#107c41'
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WKND Magazine — ${badgeText}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,sans-serif;background:#fdfdfd;color:#1c1c1c}
header{background:#121212;color:#fff;padding:16px 40px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid ${badgeColor}}
.tier-badge{background:${badgeColor};color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:12px;text-transform:uppercase}
.hero{background:linear-gradient(135deg,#1f2937,#111827);color:#fff;padding:80px 40px;text-align:center}
.hero h1{font-size:42px;margin:0 0 16px}.container{max-width:1100px;margin:40px auto;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:0 24px}
.card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:24px}</style></head>
<body><header><strong>WKND Edge Delivery</strong><div class="tier-badge">${badgeText}</div></header>
<div class="hero"><h1>WKND Magazine — ${badgeText}</h1><p>Sub-second edge delivery seamlessly connected with AEM Orbit.</p></div>
<div class="container"><div class="card"><h3>Alaskan Adventure</h3></div><div class="card"><h3>Western Australia</h3></div><div class="card"><h3>Yosemite High Sierra</h3></div></div></body></html>`
}

async function startGlobalInterceptor() {
  const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json()
  const browser = await new Target({ webSocketDebuggerUrl: ver.webSocketDebuggerUrl }).open()
  browser.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }) => {
    if (targetInfo.type !== 'page') return
    await browser.send('Fetch.enable', {
      patterns: [
        { urlPattern: '*aem.page*', requestStage: 'Request' },
        { urlPattern: '*aem.live*', requestStage: 'Request' },
        { urlPattern: '*experience.adobe.com*', requestStage: 'Request' },
      ],
    }, sessionId).catch(() => {})
    if (waitingForDebugger) await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {})
  })
  browser.on('Fetch.requestPaused', async (params) => {
    const html = getMockHtml(params.request.url)
    await browser.send('Fetch.fulfillRequest', {
      requestId: params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from(html, 'utf8').toString('base64'),
    }, params.sessionId).catch(() => {})
  })
  await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  return browser
}

async function expand(rec) {
  await rec.waitFor('#asp-logo-btn')
  for (let i = 0; i < 3; i++) {
    const r = await rec.rectOf('#asp-tier-btn')
    if (r?.vis) return
    await rec.click('#asp-logo-btn', 800)
    await sleep(1200)
  }
}

async function openMenu(rec, selector) {
  await expand(rec)
  await rec.click(selector, 800)
  await rec.waitFor('#asp-menu .asp-menu-item', 12000)
  await sleep(600)
}

async function menuItemRect(rec, text) {
  return rec.tab.eval(`(() => {
    const items = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
    const q = ${JSON.stringify(text.toLowerCase())}
    const byTitle = items.find((b) => (b.querySelector('.asp-menu-title')?.textContent || '').trim().toLowerCase().includes(q))
    const it = byTitle || items.find((b) => b.textContent.toLowerCase().includes(q))
    if (!it) return null
    it.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = it.getBoundingClientRect()
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  })()`)
}

async function hoverMenuItem(rec, text, ms = 1400) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(ms)
}

async function clickMenuItem(rec, text) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(300)
  await rec.clickHere()
}

async function popClick(rec, selector, ms = 450) {
  await rec.tab.eval(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center', behavior: 'instant' })`)
  await sleep(250)
  await rec.click(selector, ms)
}

async function popCopyRow(rec, text) {
  await rec.tab.eval(`(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    const it = [...document.querySelectorAll('.url-item')].find(el => el.textContent.includes(${JSON.stringify(text)}))
    if (it) it.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })()`)
  await sleep(700)
  const pos = await rec.tab.eval(`(() => {
    const it = [...document.querySelectorAll('.url-item')].find(el => el.textContent.includes(${JSON.stringify(text)}))
    const btn = it?.querySelector('.url-copy')
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  })()`)
  if (!pos) throw new Error(`url row not found: ${text}`)
  await rec.moveTo(pos.cx, pos.cy, 600)
  await sleep(300)
  await rec.clickHere()
  await sleep(900)
}

let browserInterceptor = null

await runChapter('08-eds-v4', {
  url: START_PAGE,
  settle: 3500,
  setup: async () => {
    browserInterceptor = await startGlobalInterceptor()
    const sw = await extensionWorker()
    await sw.eval(`(async () => {
      const s = await chrome.storage.sync.get()
      s.environments.dev.previewHost = 'https://main--wknd--hlxsites.aem.page'
      s.environments.dev.dispatcherHost = 'https://main--wknd--hlxsites.aem.live'
      await chrome.storage.sync.set(s)
      chrome.runtime.sendMessage({ action: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null)
    })()`)
    sw.close()
  },
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 8. AEM Orbit supports both traditional AEM Cloud authoring and Edge Delivery Services, plus deep links into the Adobe Universal Editor.',
      do: async () => {
        await rec.title('Chapter 8 · <b>Edge Delivery</b> &amp; Universal Editor', 'EDS host detection (.aem.page / .aem.live), parameter retention &amp; Universal Editor canvas')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await openMenu(rec, '#asp-tier-btn')
        await hoverMenuItem(rec, 'Universal Editor', 1400)
        await rec.key('Escape')
      },
    },
    {
      say: 'In the Popup Copy URLs hub, Universal Editor links are now cleanly deduplicated and expose the canvas address using your configured organization tenant.',
      do: async () => {
        const pop = await openPopup(rec)
        await sleep(600)
        await rec.tab.eval(`(() => {
          document.getElementById('groupWorkspace').open = true
          document.getElementById('groupDeveloper').open = true
        })()`)
        await popClick(rec, '#urlVariantsBtn')
        await rec.waitFor('#mainPanel.open', 8000)
        await popCopyRow(rec, 'Universal Editor')
        await sleep(1000)
        await pop.close()
      },
    },
    {
      say: 'On Edge Delivery dot AEM dot page or dot AEM dot live sites, Orbit mounts cleanly and surfaces instant bidirectional switching between EDS Preview and EDS Live while keeping tracking query parameters.',
      do: async () => {
        await rec.goto(EDS_PREVIEW, 3000)
        await expand(rec)
        await openMenu(rec, '#asp-tier-btn')
        await hoverMenuItem(rec, 'EDS Live', 1400)
        const before = await rec.pageIds()
        await clickMenuItem(rec, 'EDS Live')
        const tab = await rec.follow(before, 9000, 2200)
        log('live ->', tab.url)
        await sleep(1400)
        await openMenu(rec, '#asp-tier-btn')
        await hoverMenuItem(rec, 'EDS Preview', 1400)
        await rec.key('Escape')
      },
    },
    {
      say: 'Opening Universal Editor launches the visual canvas focused cleanly on your page, completing the unified bridge between AEM Cloud and Edge Delivery.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        const before = await rec.pageIds()
        await clickMenuItem(rec, 'Universal Editor')
        await rec.follow(before, 9000, 2200)
        await sleep(2200)
        await rec.back()
        await rec.resync()
        await sleep(1000)
        if (browserInterceptor) browserInterceptor.close()
        const sw = await extensionWorker()
        await sw.eval(`(async () => {
          const s = await chrome.storage.sync.get()
          s.environments.dev.previewHost = 'https://dev-cloud-preview.com'
          s.environments.dev.dispatcherHost = 'https://wwwdev.wknd.com'
          await chrome.storage.sync.set(s)
          chrome.runtime.sendMessage({ action: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null)
        })()`)
        sw.close()
      },
    },
  ],
})
process.exit(process.exitCode || 0)
