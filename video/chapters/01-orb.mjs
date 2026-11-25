// Chapter 1 (v4) - The Orb, Persona-Adaptive Leaves & Interactive JCR Inspector.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/01-orb.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep, extensionWorker } from '../lib/cdp.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

async function setPersona(persona) {
  const sw = await extensionWorker()
  await sw.eval(`new Promise((r) => chrome.runtime.sendMessage({ action: 'SET_PERSONA', payload: { persona: ${JSON.stringify(persona)} } }, r))`)
  sw.close()
}

/** Click a fan leaf that opens a new tab, follow it for `watch` ms, then return to the page. */
async function leafTab(rec, selector, watch = 3500) {
  const before = await rec.pageIds()
  await rec.click(selector, 800)
  const tab = await rec.follow(before, 9000, 2200)
  console.log(`  ${selector} -> ${tab.url}`)
  await sleep(watch)
  await rec.back()
  await rec.resync()
}

const openFan = async (rec) => {
  await rec.hover('#asp-logo-btn', 900)
  await sleep(950)
}

const parkAway = async (rec) => {
  await rec.moveTo(1180, 470, 700)
  await sleep(900)
}

try {
  await runChapter('01-orb-v4', {
    url: `${AUTHOR.dev}${PAGE}`,
    steps: (rec) => [
      {
        say: 'Welcome to Chapter 1: The Orb and Heads-Up Display. Everything here is recorded live against AEM Cloud author, publish, and dispatcher tiers without mock stubs.',
        do: async () => {
          await rec.title('Chapter 1 · The <b>Orb</b> &amp; Persona Fan', 'Floating per-site radial control surface with persona-adaptive leaves')
          await sleep(3500)
          await rec.untitle()
          await rec.moveTo(1250, 520, 1200)
          await sleep(2000)
        },
      },
      {
        say: 'Anchored at the bottom of the viewport floats the Orb. Its AEM spiral pulses steadily while its color immediately identifies your environment tier.',
        do: async () => {
          await rec.moveTo(960, 960, 1200)
          await sleep(3000)
        },
      },
      {
        say: 'Hovering displays a live badge reading Dev Published, resolved directly from replication metadata on the underlying JCR node, and fans out seven quick-action leaves.',
        do: async () => {
          await openFan(rec)
          await sleep(2600)
        },
      },
      {
        say: 'The Edit leaf launches the Touch UI editor in a new tab.',
        do: async () => {
          await leafTab(rec, '#asp-mini-edit-btn', 3200)
          await openFan(rec)
        },
      },
      {
        say: 'The View leaf previews the rendered layout on Author with editing overlays stripped away.',
        do: async () => {
          await leafTab(rec, '#asp-mini-view-btn', 3200)
          await openFan(rec)
        },
      },
      {
        say: 'Live resolves dispatcher mapping rules and opens the clean CDN domain, wwwdev.wknd.com.',
        do: async () => {
          await leafTab(rec, '#asp-mini-live-btn', 3400)
          await openFan(rec)
        },
      },
      {
        say: 'Page Properties opens the Granite metadata dialog, and Sites jumps straight into the parent directory inside AEM Sites.',
        do: async () => {
          await leafTab(rec, '#asp-mini-props-btn', 3000)
          await openFan(rec)
          await leafTab(rec, '#asp-sites-btn', 3000)
          await openFan(rec)
        },
      },
      {
        say: 'The JCR leaf launches Orbit’s in-page JCR inspector. New Expand and Collapse All buttons let you unfurl the entire node hierarchy cleanly or fold nested branches back with one click.',
        do: async () => {
          await rec.click('#asp-jcr-btn', 800)
          await rec.waitFor('#asp-inspector-body .asp-tree-prop', 10000)
          await sleep(1200)
          await rec.click('#asp-inspector-expand', 700)
          await sleep(1600)
          await rec.click('#asp-inspector-collapse', 700)
          await sleep(1200)
        },
      },
      {
        say: 'Live search isolates properties instantly, such as lastReplicated or template. Clicking any property row copies its exact repository path to the clipboard.',
        do: async () => {
          await rec.click('#asp-inspector-search', 800)
          await rec.type('lastReplicated', 90)
          await sleep(2400)
          await rec.tab.eval(`(() => { const i=document.getElementById('asp-inspector-search'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})) })()`)
          await sleep(400)
          await rec.click('#asp-inspector-search', 600)
          await rec.type('template', 90)
          await sleep(2200)
          const row = await rec.waitFor('#asp-inspector-body .asp-tree-prop', 4000)
          await rec.click('#asp-inspector-body .asp-tree-prop', 600)
          await sleep(1500)
          await rec.click('#asp-inspector-close', 700)
          await sleep(1200)
          void row
        },
      },
      {
        say: 'Clicking Environment reveals sub-leaves for Local, Dev, Stage, and Prod. Jumping across Stage and Prod updates the Orb color—even adding a crimson warning glow on Production.',
        do: async () => {
          await openFan(rec)
          await rec.click('#asp-orb-env-btn', 800)
          await sleep(1800)
          await rec.click('.asp-orb-envopt[data-env="stage"]', 800)
          await sleep(3600)
          await rec.hover('#asp-logo-btn', 800)
          await sleep(500)
          await rec.click('#asp-orb-env-btn', 800)
          await sleep(700)
          await rec.click('.asp-orb-envopt[data-env="prod"]', 800)
          await sleep(3600)
          await rec.hover('#asp-logo-btn', 800)
          await sleep(500)
          await rec.click('#asp-orb-env-btn', 800)
          await sleep(700)
          await rec.click('.asp-orb-envopt[data-env="local"]', 800)
          await sleep(3600)
          await rec.resync()
        },
      },
      {
        say: 'The Orb even adapts its radial leaves to your active workspace persona. Switch to the QA persona on Dev, and hovering immediately surfaces View, Live, Audit, Cache, Inspect, Environment, and Props tailored for verification.',
        do: async () => {
          await setPersona('qa')
          await rec.goto(`${AUTHOR.dev}${PAGE}`, 3600)
          await openFan(rec)
          await sleep(3600)
          await setPersona('custom')
          await rec.goto(`${AUTHOR.dev}${PAGE}`, 3200)
        },
      },
      {
        say: 'That is the Orb HUD: persona-aware leaves, viewport navigation, and interactive JCR inspection.',
        do: async () => {
          await parkAway(rec)
          await sleep(1800)
        },
      },
    ],
  })
} finally {
  await setPersona('custom').catch(() => {})
}
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
