// Chapter 1 (v2) - Enhanced Orb & HUD walkthrough with Christopher Neural voiceover.
// Run: ORBIT_ADMIN_PW=admin python3 video/scripts/detach.py /tmp/ch1-v2.log node video/chapters/01-orb-v2.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

/** Click a fan leaf that opens a new tab, follow it for `watch` ms, then return to the page. */
async function leafTab(rec, selector, watch = 3800) {
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
  await sleep(1000)
}

const parkAway = async (rec) => {
  await rec.moveTo(1180, 470, 700)
  await sleep(900)
}

await runChapter('01-orb-v2', {
  url: `${AUTHOR.dev}${PAGE}`,
  steps: (rec) => [
    {
      say: 'Welcome to AEM Orbit. Everything in this walkthrough is recorded live in a real browser against real AEM Cloud author, publish, and dispatcher tiers without mock stubs.',
      do: async () => {
        await rec.title('Chapter 1 · The <b>Orb</b> &amp; HUD', 'Floating, per-site control surface for Adobe Experience Manager')
        await rec.moveTo(1250, 520, 1400)
        await sleep(2500)
      },
    },
    {
      say: 'Anchored at the bottom of the viewport floats the Orb. Its internal geometry forms the AEM helix. A subtle orbiting pulse shows the active connection to the extension engine, while its accent color immediately identifies the environment you are working in.',
      do: async () => {
        await rec.moveTo(960, 960, 1200)
        await sleep(3500)
      },
    },
    {
      say: 'Hovering over the Orb displays a live status badge showing the current environment and page state: here, Dev, Published. Orbit resolves this in real time by checking replication metadata on the underlying JCR node.',
      do: async () => {
        await rec.hover('#asp-logo-btn', 1000)
        await sleep(3500)
      },
    },
    {
      say: 'Without requiring a single click, hovering gently expands the Orb into a radial sunburst fan of seven action leaves, placing the most common authoring and developer workflows within milliseconds of reach.',
      do: async () => {
        await sleep(3000)
      },
    },
    {
      say: 'The Edit leaf opens the page directly inside the Touch UI author editor in a new tab, allowing content authors to immediately add components and update page copy.',
      do: async () => {
        await leafTab(rec, '#asp-mini-edit-btn', 4000)
        await openFan(rec)
      },
    },
    {
      say: 'The View leaf opens the page on Author with all authoring frames and editing chrome disabled. This gives authors and QA teams an exact preview of the rendered page layout, typography, and interactive behaviors.',
      do: async () => {
        await leafTab(rec, '#asp-mini-view-btn', 3500)
        await openFan(rec)
      },
    },
    {
      say: 'The Live leaf jumps straight to the public website. Because Orbit understands dispatcher domain mapping rules, it transforms the internal content path into the clean public CDN address: wwwdev.wknd.com.',
      do: async () => {
        await leafTab(rec, '#asp-mini-live-btn', 4000)
        await openFan(rec)
      },
    },
    {
      say: 'The Page Properties leaf opens the native Granite page properties dialog in a new tab, allowing you to edit metadata, tags, and publication schedules without navigating through folder hierarchies.',
      do: async () => {
        await leafTab(rec, '#asp-mini-props-btn', 3800)
        await openFan(rec)
      },
    },
    {
      say: 'The Sites leaf navigates directly to the parent folder inside the AEM Sites console, eliminating the tedious manual tree expansion usually required in large content repositories.',
      do: async () => {
        await leafTab(rec, '#asp-sites-btn', 3800)
        await openFan(rec)
      },
    },
    {
      say: 'The JCR leaf opens Orbit’s in-page JCR inspector. Instead of leaving the page to open CRXDE Lite, you can inspect the full node hierarchy, resource types, and property table right over the live page.',
      do: async () => {
        await rec.click('#asp-jcr-btn', 800)
        await sleep(3500)
      },
    },
    {
      say: 'The inspector is searchable in real time. Typing lastReplicated instantly filters the properties to show replication timestamps and user ID. Clearing and searching for template isolates the cq template property in milliseconds.',
      do: async () => {
        await rec.click('#asp-inspector-search', 900)
        await sleep(300)
        await rec.type('lastReplicated', 95)
        await sleep(3600)
        await rec.tab.eval(`(() => { const f=(r,s)=>{const e=r.querySelector(s); if(e) return e; for(const n of r.querySelectorAll('*')) if(n.shadowRoot){const x=f(n.shadowRoot,s); if(x) return x} return null}; const i=f(document,'#asp-inspector-search'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})) })()`)
        await sleep(400)
        await rec.click('#asp-inspector-search', 600)
        await rec.type('template', 90)
        await sleep(3500)
      },
    },
    {
      say: 'Click the JCR leaf again to close the overlay. When Developer Mode is turned off in Settings, this leaf serves as a one-click shortcut to copy the exact JCR path to your clipboard.',
      do: async () => {
        await openFan(rec)
        await rec.click('#asp-jcr-btn', 700)
        await sleep(1500)
      },
    },
    {
      say: 'Clicking the Environment leaf opens four sub-leaves representing your configured environments: Local, Dev, Stage, and Prod.',
      do: async () => {
        await openFan(rec)
        await rec.click('#asp-orb-env-btn', 800)
        await sleep(2500)
      },
    },
    {
      say: 'Click Stage, and Orbit transports you to the exact same page on the Stage author environment, preserving your view mode. Notice the Orb immediately re-colors itself in Stage amber.',
      do: async () => {
        await rec.click('.asp-orb-envopt[data-env="stage"]', 900)
        await sleep(2200)
        await sleep(2200)
        await rec.resync()
      },
    },
    {
      say: 'Next, the Production author. Orbit navigates to Prod and colors the Orb in a prominent crimson warning tone, making it impossible to confuse live production with lower development tiers.',
      do: async () => {
        await rec.hover('#asp-logo-btn', 800)
        await sleep(600)
        await rec.click('#asp-orb-env-btn', 800)
        await sleep(900)
        await rec.click('.asp-orb-envopt[data-env="prod"]', 900)
        await sleep(2200)
        await sleep(2200)
        await rec.resync()
      },
    },
    {
      say: 'Finally, switch to Local. Orbit lands directly on your local development quickstart on port 4502, keeping your workflow unified from local code to cloud production.',
      do: async () => {
        await rec.hover('#asp-logo-btn', 800)
        await sleep(600)
        await rec.click('#asp-orb-env-btn', 800)
        await sleep(900)
        await rec.click('.asp-orb-envopt[data-env="local"]', 900)
        await sleep(2200)
        await sleep(2200)
        await rec.resync()
      },
    },
    {
      say: 'That is the Orb and Heads-Up Display: zero-click access, instant tier navigation, and in-page JCR inspection.',
      do: async () => {
        await parkAway(rec)
        await sleep(2500)
      },
    },
  ],
})
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
