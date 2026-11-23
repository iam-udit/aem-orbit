// Chapter 8 (v2) - Modern AEM & Edge Delivery Services (EDS).
// Covers all 3 Chapter 8 features from video/FEATURES.md:
//   1. EDS host detection: recognises .aem.page (preview) and .aem.live (production)
//   2. EDS variant computation: 1-click switching between EDS preview and live tiers with parameter retention
//   3. Adobe Universal Editor integration: deep links into the Experience Cloud Universal Editor canvas (https://experience.adobe.com/#/@org/aem/editor/canvas/...)
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Adobe Experience Cloud — Universal Editor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #fff; overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
    .top-bar { height: 48px; background: #262626; border-bottom: 1px solid #333; display: flex; align-items: center; padding: 0 16px; gap: 14px; flex-shrink: 0; }
    .adobe-logo { width: 22px; height: 22px; fill: #eb1000; }
    .brand-title { font-size: 14px; font-weight: 600; color: #eee; }
    .divider { width: 1px; height: 18px; background: #444; }
    .product-title { font-size: 14px; font-weight: 500; color: #ccc; }
    .ue-badge { background: #0265dc; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
    .target-url { font-size: 12px; color: #888; font-family: monospace; margin-left: auto; background: #1a1a1a; padding: 4px 10px; border-radius: 4px; border: 1px solid #333; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #107c41; margin-right: 6px; }
    .main-workspace { display: flex; flex: 1; overflow: hidden; }
    .left-rail { width: 56px; background: #262626; border-right: 1px solid #333; display: flex; flex-direction: column; align-items: center; padding: 12px 0; gap: 16px; }
    .rail-btn { width: 38px; height: 38px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #888; background: transparent; border: none; cursor: pointer; }
    .rail-btn.active { background: #333; color: #0265dc; }
    .rail-btn svg { width: 20px; height: 20px; fill: currentColor; }
    .canvas-container { flex: 1; background: #181818; padding: 24px 32px; display: flex; flex-direction: column; align-items: center; overflow: auto; }
    .canvas-frame { width: 1100px; height: 680px; background: #fff; border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); overflow: hidden; border: 2px solid #0265dc; position: relative; }
    .canvas-bar { height: 36px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; padding: 0 16px; font-size: 12px; color: #4b5563; justify-content: space-between; }
    .canvas-tag { background: #0265dc; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; }
    .canvas-body { padding: 40px; color: #111; font-family: -apple-system, sans-serif; }
    .canvas-highlight { border: 2px dashed #0265dc; background: rgba(2, 101, 220, 0.05); padding: 20px; border-radius: 6px; margin-bottom: 24px; position: relative; }
    .canvas-highlight::before { content: "Editable Block: Hero Title"; position: absolute; top: -10px; left: 12px; background: #0265dc; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 2px; }
    .canvas-highlight h1 { margin: 0 0 12px; font-size: 36px; font-weight: 800; color: #111827; }
    .canvas-highlight p { margin: 0; font-size: 16px; color: #4b5563; line-height: 1.5; }
    .canvas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .canvas-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; background: #fafafa; }
    .canvas-card h4 { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
    .canvas-card p { margin: 0; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="top-bar">
    <svg class="adobe-logo" viewBox="0 0 24 24"><path d="M14.5 3h6.5v18h-6.5zM3 3h6.5v18H3zM8.7 15l3.3-8 3.3 8z"/></svg>
    <span class="brand-title">Adobe Experience Cloud</span>
    <div class="divider"></div>
    <span class="product-title">Universal Editor</span>
    <span class="ue-badge">Connected</span>
    <div class="target-url"><span class="status-dot"></span>Target: ${target}</div>
  </div>
  <div class="main-workspace">
    <div class="left-rail">
      <button class="rail-btn active" title="Components"><svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm0 9h7v7H4zm9-9h7v7h-7zm0 9h7v7h-7z"/></svg></button>
      <button class="rail-btn" title="Content Tree"><svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg></button>
      <button class="rail-btn" title="Assets"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></button>
    </div>
    <div class="canvas-container">
      <div class="canvas-frame">
        <div class="canvas-bar">
          <div>Universal Editor Canvas &bull; WKND Magazine</div>
          <div class="canvas-tag">IN-CONTEXT EDITING</div>
        </div>
        <div class="canvas-body">
          <div class="canvas-highlight">
            <h1>WKND Magazine — Universal Editor</h1>
            <p>Live visual editing surface enabled across Edge Delivery Services preview tier and traditional AEM Cloud service.</p>
          </div>
          <div class="canvas-grid">
            <div class="canvas-card">
              <h4>Alaskan Adventure</h4>
              <p>Edge Delivery Block &bull; Content synced from document sheet</p>
            </div>
            <div class="canvas-card">
              <h4>Western Australia</h4>
              <p>Edge Delivery Block &bull; Direct visual editing</p>
            </div>
            <div class="canvas-card">
              <h4>Yosemite High Sierra</h4>
              <p>Edge Delivery Block &bull; Real-time canvas preview</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
  }

  const badgeText = isPreview ? 'EDS Preview (.aem.page)' : 'EDS Live (.aem.live)'
  const badgeColor = isPreview ? '#e06c00' : '#107c41'
  const heroTag = isPreview ? 'Edge Delivery Services — Preview Tier' : 'Edge Delivery Services — Production Tier'
  const heroTitle = isPreview ? 'WKND Magazine — Preview Tier' : 'WKND Magazine — Live Production'
  const heroDesc = isPreview
    ? 'Modern cloud-native edge rendering. Sub-second publishing, instant visual verification, and unified multi-tier content workflows.'
    : 'Lightning-fast content served directly at the global edge with near-instantaneous 100/100 Core Web Vitals.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WKND Magazine — ${badgeText}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fdfdfd; color: #1c1c1c; }
    header { background: #121212; color: #fff; padding: 16px 40px; display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid ${badgeColor}; }
    .nav-left { display: flex; align-items: center; gap: 28px; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #fff; display: flex; align-items: center; gap: 8px; }
    .logo span { font-weight: 300; opacity: 0.7; font-size: 18px; }
    .nav-links { display: flex; gap: 20px; font-size: 14px; font-weight: 500; }
    .nav-links a { color: #aaa; text-decoration: none; }
    .nav-links a.active { color: #fff; border-bottom: 2px solid ${badgeColor}; padding-bottom: 4px; }
    .tier-badge { background: ${badgeColor}; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; }
    .tier-badge::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #fff; }
    .hero { background: linear-gradient(135deg, #1f2937, #111827); color: #fff; padding: 70px 40px; text-align: center; }
    .hero-tag { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${isPreview ? '#fb923c' : '#34d399'}; margin-bottom: 12px; }
    .hero h1 { font-size: 42px; font-weight: 800; margin: 0 0 16px; letter-spacing: -0.5px; }
    .hero p { font-size: 17px; max-width: 680px; margin: 0 auto; color: #9ca3af; line-height: 1.6; }
    .container { max-width: 1200px; margin: 48px auto; padding: 0 40px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
    .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .card-banner { height: 160px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
    .card:nth-child(2) .card-banner { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
    .card:nth-child(3) .card-banner { background: linear-gradient(135deg, #ec4899, #be185d); }
    .card-content { padding: 24px; }
    .card-tag { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #2563eb; letter-spacing: 0.5px; margin-bottom: 8px; }
    .card h3 { margin: 0 0 10px; font-size: 19px; font-weight: 700; color: #111827; }
    .card p { margin: 0; font-size: 14px; color: #4b5563; line-height: 1.5; }
    footer { background: #111827; color: #6b7280; padding: 32px 40px; text-align: center; font-size: 13px; margin-top: 60px; border-top: 1px solid #1f2937; }
  </style>
</head>
<body>
  <header>
    <div class="nav-left">
      <div class="logo">WKND <span>Edge Delivery</span></div>
      <div class="nav-links">
        <a href="#">Adventures</a>
        <a href="#" class="active">Magazine</a>
        <a href="#">About Us</a>
      </div>
    </div>
    <div class="tier-badge">${badgeText}</div>
  </header>
  <div class="hero">
    <div class="hero-tag">${heroTag}</div>
    <h1>${heroTitle}</h1>
    <p>${heroDesc}</p>
  </div>
  <div class="container">
    <div class="grid">
      <div class="card">
        <div class="card-banner"></div>
        <div class="card-content">
          <div class="card-tag">Wilderness</div>
          <h3>Alaskan Adventure</h3>
          <p>Navigating the frozen fjords of Glacier Bay with edge-optimized delivery.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-banner"></div>
        <div class="card-content">
          <div class="card-tag">Expedition</div>
          <h3>Western Australia</h3>
          <p>Remote surf expeditions and coastal trekking across the Margaret River region.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-banner"></div>
        <div class="card-content">
          <div class="card-tag">Backcountry</div>
          <h3>Yosemite High Sierra</h3>
          <p>Scaling granite monoliths and backcountry hiking through cathedral peaks.</p>
        </div>
      </div>
    </div>
  </div>
  <footer>
    &copy; 2026 WKND Travel &bull; ${heroTag} &bull; AEM Orbit Walkthrough
  </footer>
</body>
</html>`
}

async function startGlobalInterceptor() {
  const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json()
  const browser = await new Target({ webSocketDebuggerUrl: ver.webSocketDebuggerUrl }).open()
  log('global interceptor connected to browser target')

  browser.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }) => {
    if (targetInfo.type !== 'page') return
    await browser.send('Fetch.enable', {
      patterns: [
        { urlPattern: '*aem.page*', requestStage: 'Request' },
        { urlPattern: '*aem.live*', requestStage: 'Request' },
        { urlPattern: '*experience.adobe.com*', requestStage: 'Request' },
      ],
    }, sessionId).catch(() => {})
    if (waitingForDebugger) {
      await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {})
    }
  })

  browser.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const html = getMockHtml(request.url)
    await browser.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'text/html; charset=utf-8' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: Buffer.from(html, 'utf8').toString('base64'),
    }, params.sessionId).catch((err) => log('fulfill error:', err.message))
  })

  await browser.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  })

  return browser
}

async function expand(rec) {
  await rec.waitFor('#asp-logo-btn')
  for (let i = 0; i < 3; i++) {
    const r = await rec.rectOf('#asp-tier-btn')
    if (r?.vis) return
    await rec.click('#asp-logo-btn', 800)
    await sleep(1300)
  }
  throw new Error('toolbar did not expand')
}

async function openMenu(rec, selector) {
  await expand(rec)
  await rec.click(selector, 800)
  await rec.waitFor('#asp-menu .asp-menu-item', 12000)
  await sleep(700)
}

async function menuItemRect(rec, text) {
  for (let i = 0; i < 25; i++) {
    const res = await rec.tab.eval(`(() => {
      const it = [...document.querySelectorAll('#asp-menu .asp-menu-item')]
        .find((b) => b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!it) return null;
      const r = it.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    })()`).catch(() => null)
    if (res) return res
    await sleep(200)
  }
  return null
}

async function hoverMenuItem(rec, text, ms = 1500) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(ms)
}

async function clickMenuItem(rec, text) {
  const r = await menuItemRect(rec, text)
  if (!r) throw new Error(`menu item not found: ${text}`)
  await rec.moveTo(r.cx, r.cy, 600)
  await sleep(350)
  await rec.clickHere()
}

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

async function popCopyRow(rec, text) {
  // First ensure the popup window and the specific url-item are scrolled fully into view
  await rec.tab.eval(`(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    const it = [...document.querySelectorAll('.url-item')].find(el => el.textContent.includes(${JSON.stringify(text)}))
    if (it) it.scrollIntoView({ block: 'center', behavior: 'smooth' })
    else {
      const c = document.getElementById('panelContent')
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
    }
  })()`)
  await sleep(800)

  for (let i = 0; i < 25; i++) {
    const pos = await rec.tab.eval(`(() => {
      const it = [...document.querySelectorAll('.url-item')].find(el => el.textContent.includes(${JSON.stringify(text)}));
      if (!it) return null;
      it.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = it.getBoundingClientRect();
      const btn = it.querySelector('.url-copy');
      const br = btn ? btn.getBoundingClientRect() : null;
      return {
        row: { cx: r.x + r.width / 2, cy: r.y + r.height / 2 },
        copyBtn: br ? { cx: br.x + br.width / 2, cy: br.y + br.height / 2 } : null
      };
    })()`).catch(() => null)
    if (pos && pos.copyBtn) {
      await rec.moveTo(pos.row.cx, pos.row.cy, 600)
      await sleep(800)
      await rec.moveTo(pos.copyBtn.cx, pos.copyBtn.cy, 500)
      await sleep(200)
      await rec.clickHere()
      await sleep(800)
      return
    }
    await sleep(200)
  }
  throw new Error(`url row not found in popup: ${text}`)
}

async function openAndPreparePopup(rec) {
  const pop = await openPopup(rec)
  await sleep(600)
  await rec.tab.eval(`(() => {
    const g1 = document.getElementById('groupWorkspace')
    const g2 = document.getElementById('groupDeveloper')
    if (g1) g1.open = true
    if (g2) g2.open = true
  })()`)
  await sleep(400)
  return pop
}

let browserInterceptor = null

await runChapter('08-eds-v2', {
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
      chrome.runtime.sendMessage({ type: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null)
    })()`)
    sw.close()
  },
  steps: (rec) => [
    // 1. Chapter Title & Intro
    {
      say: 'Modern Adobe Experience Manager architectures seamlessly combine traditional authoring with Edge Delivery Services, commonly known as EDS. In this chapter, we explore AEM Orbit\'s native integration with Edge Delivery preview and live tiers, as well as the Adobe Experience Cloud Universal Editor.',
      do: async () => {
        await rec.title('Chapter 8 · <b>Edge Delivery Services</b> &amp; Universal Editor', 'EDS host detection, 1-click preview and live switching, and Experience Cloud canvas deep links')
        await sleep(3500)
        await rec.untitle()
        await sleep(500)
        await expand(rec)
        await rec.hover('#asp-tier-btn', 700)
      },
    },

    // 2. Universal Editor Deep Link in Tier Menu
    {
      say: 'On any secure HTTPS author instance, AEM Orbit automatically synthesizes deep links into Adobe\'s next-generation Universal Editor canvas, allowing authors and developers to transition directly from in-context Touch UI pages into the cloud-native visual editing surface.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        await sleep(400)
        await hoverMenuItem(rec, 'Universal Editor', 1500)
        await sleep(500)
        await rec.key('Escape')
        await sleep(600)
      },
    },

    // 3. Universal Editor Canvas Link in Popup Workspace
    {
      say: 'From the Workspace popup, the Copy URLs hub exposes the complete Universal Editor canvas address with a single click. The IMS organization segment is fully configurable in settings, defaulting to Adobe and adapting to enterprise tenants.',
      do: async () => {
        const pop = await openAndPreparePopup(rec)
        await popClick(rec, '#urlVariantsBtn')
        await showPanelResults(rec)
        await popCopyRow(rec, 'Universal Editor')
        await sleep(1500)
        await pop.close()
        await sleep(600)
      },
    },

    // 4. EDS Host Detection (.aem.page)
    {
      say: 'When authoring or browsing Edge Delivery Services sites on dot AEM dot page or dot AEM dot live, Orbit instantly recognizes the edge delivery architecture. The toolbar mounts automatically, mapping edge routes back to their canonical content paths.',
      do: async () => {
        log('navigating to EDS preview:', EDS_PREVIEW)
        await rec.goto(EDS_PREVIEW, 3000)
        await sleep(1000)
        await rec.hover('.hero h1', 1200)
        await sleep(400)
      },
    },

    // 5. In-Page Toolbar on EDS Preview Tier
    {
      say: 'Orbit inspects the host domain, identifying dot AEM dot page as the preview tier and dot AEM dot live as production live delivery, adapting its navigation tools specifically for edge workflows.',
      do: async () => {
        await expand(rec)
        await rec.hover('#asp-bar', 800)
        await sleep(400)
        await rec.hover('#asp-tier-btn', 1200)
        await sleep(500)
      },
    },

    // 6. 1-Click EDS Variant Switching (Preview -> Live)
    {
      say: 'Orbit calculates the Edge Delivery sibling tier in real time. On a preview tier page, the tier switcher prominently surfaces EDS Live right at the top of the menu, retaining all query string parameters such as campaign tracking.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        await sleep(400)
        await hoverMenuItem(rec, 'EDS Live', 1500)
        await sleep(500)
      },
    },

    // 7. Navigate to EDS Live
    {
      say: 'With a single click, Orbit navigates directly to the live production tier on dot AEM dot live, preserving the exact resource path and query parameters without any manual URL manipulation.',
      do: async () => {
        const before = await rec.pageIds()
        await clickMenuItem(rec, 'EDS Live')
        const tab = await rec.follow(before, 9000, 2200)
        log('switched to live tier:', tab.url)
        await sleep(1200)
        await rec.hover('.tier-badge', 1200)
        await sleep(400)
      },
    },

    // 8. Bidirectional Switching (Live -> Preview)
    {
      say: 'Bidirectional variant switching works seamlessly in both directions: on the live tier, the menu now immediately surfaces EDS Preview, enabling instant toggling between edge delivery staging and public production.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        await sleep(400)
        await hoverMenuItem(rec, 'EDS Preview', 1500)
        await sleep(500)
        await rec.key('Escape')
        await sleep(600)
      },
    },

    // 9. Popup Workspace on Edge Delivery Page
    {
      say: 'Within the Workspace popup, Orbit\'s URL variants hub dynamically computes and displays both Edge Delivery endpoints alongside the direct Universal Editor canvas deep link for this edge document, giving teams immediate access across preview, production, and cloud editing.',
      do: async () => {
        const pop = await openAndPreparePopup(rec)
        await popClick(rec, '#urlVariantsBtn')
        await showPanelResults(rec)
        await popCopyRow(rec, 'Universal Editor')
        await sleep(1200)
        await pop.close()
        await sleep(600)
      },
    },

    // 10. Open Universal Editor Canvas
    {
      say: 'Deep-linking into Universal Editor opens Adobe Experience Cloud\'s visual canvas directly focused on the target page, bridging modern edge delivery development with enterprise content operations.',
      do: async () => {
        await openMenu(rec, '#asp-tier-btn')
        await sleep(400)
        const before = await rec.pageIds()
        await clickMenuItem(rec, 'Universal Editor')
        const tab = await rec.follow(before, 9000, 2200)
        log('opened Universal Editor canvas:', tab.url)
        await sleep(1500)
        await rec.hover('.ue-badge', 1000)
        await rec.hover('.canvas-highlight', 1500)
        await sleep(1000)
        await rec.back()
        await rec.resync()
        await sleep(800)
      },
    },

    // 11. Conclusion
    {
      say: 'Whether your organization authors in traditional AEM Cloud, delivers through Edge Delivery Services, or edits visually in Universal Editor, AEM Orbit provides a unified, frictionless bridge across every tier.',
      do: async () => {
        await rec.hover('#asp-bar', 1200)
        await sleep(1500)
        if (browserInterceptor) {
          browserInterceptor.close()
        }
        try {
          const sw = await extensionWorker()
          await sw.eval(`(async () => {
            const s = await chrome.storage.sync.get()
            s.environments.dev.previewHost = 'https://dev-cloud-preview.com'
            s.environments.dev.dispatcherHost = 'https://wwwdev.wknd.com'
            await chrome.storage.sync.set(s)
            chrome.runtime.sendMessage({ type: 'SYNC_CONTENT_SCRIPTS' }).catch(() => null)
          })()`)
          sw.close()
        } catch { /* ignore */ }
      },
    },
  ],
})
