// Chapter 1 - The Orb & HUD. Run: ORBIT_ADMIN_PW=admin node video/chapters/01-orb.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

/** Click a fan leaf that opens a new tab, follow it for `watch` ms, then return to the page. */
async function leafTab(rec, selector, watch = 3200) {
  const before = await rec.pageIds()
  await rec.click(selector, 800)
  const tab = await rec.follow(before, 9000, 2200)
  console.log(`  ${selector} -> ${tab.url}`)
  await sleep(watch)
  await rec.back()
  await rec.resync()
}

const openFan = async (rec) => { await rec.hover('#asp-logo-btn', 900); await sleep(900) }
const parkAway = async (rec) => { await rec.moveTo(1180, 470, 700); await sleep(900) }

await runChapter('01-orb', {
  url: `${AUTHOR.dev}${PAGE}`,
  steps: (rec) => [
    { say: 'Welcome to AEM Orbit. Everything you will see is recorded live, in a real browser, against real AEM author and publish instances.',
      do: async () => { await rec.title('Chapter 1 · The <b>Orb</b> &amp; HUD', 'A floating, per-site control surface for AEM'); await rec.moveTo(1250, 520, 1400) } },
    { say: 'At the bottom of the page floats the Orb. Its spiral is the A E M helix, an orbiting pulse shows it is live, and its colour tells you which environment you are on.',
      do: async () => { await rec.moveTo(960, 960, 1200); await sleep(600) } },
    { say: 'Hover over it and a caption appears with the environment and the publication state of this page. Here: Dev, Published.',
      do: async () => { await rec.hover('#asp-logo-btn', 1000); await sleep(1200) } },
    { say: 'With zero clicks, the Orb fans out into seven action leaves, in a radial sunburst arc.',
      do: async () => { await sleep(1800) } },
    { say: 'Edit jumps straight into the A E M Author page editor.',
      do: async () => { await leafTab(rec, '#asp-mini-edit-btn', 3600); await openFan(rec) } },
    { say: 'View loads the same page on Author with the editing chrome switched off, exactly as a visitor would see it.',
      do: async () => { await leafTab(rec, '#asp-mini-view-btn', 2600); await openFan(rec) } },
    { say: 'Live opens the public site, through the C D N or Dispatcher address when one is configured, or the Publish tier otherwise.',
      do: async () => { await leafTab(rec, '#asp-mini-live-btn', 3200); await openFan(rec) } },
    { say: 'Page Properties opens the native A E M properties dialog for this page.',
      do: async () => { await leafTab(rec, '#asp-mini-props-btn', 3200); await openFan(rec) } },
    { say: 'The Sites console leaf jumps to the parent folder, in A E M Sites.',
      do: async () => { await leafTab(rec, '#asp-sites-btn', 3200); await openFan(rec) } },
    { say: 'The J C R leaf launches the in-page J C R inspector. Properties and node types of this very page, one click away.',
      do: async () => { await rec.click('#asp-jcr-btn', 800); await sleep(3000) } },
    { say: 'It is searchable. Type a few letters, here last replicated, and the table filters live to just the matching properties, so you can find one value among dozens.',
      do: async () => {
        await rec.click('#asp-inspector-search', 900); await sleep(300)
        await rec.type('lastReplicated', 95); await sleep(3600)
        await rec.tab.eval(`(() => { const f=(r,s)=>{const e=r.querySelector(s); if(e) return e; for(const n of r.querySelectorAll('*')) if(n.shadowRoot){const x=f(n.shadowRoot,s); if(x) return x} return null}; const i=f(document,'#asp-inspector-search'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})) })()`)
        await sleep(300)
        await rec.click('#asp-inspector-search', 600); await rec.type('template', 90); await sleep(3000) } },
    { say: 'Click the leaf again to close it. When developer mode is off, this same leaf simply copies the J C R path.',
      do: async () => { await openFan(rec); await rec.click('#asp-jcr-btn', 700); await sleep(1200) } },
    { say: 'The Environment leaf opens sub-leaves: Local, Dev, Stage and Prod.',
      do: async () => { await openFan(rec); await rec.click('#asp-orb-env-btn', 800); await sleep(2200) } },
    { say: 'Pick Stage, and you land on the very same page on the Stage author, same tier, same view mode. Notice the Orb recolours itself.',
      do: async () => { await rec.click('.asp-orb-envopt[data-env="stage"]', 900); await sleep(1800); await sleep(2200); await rec.resync() } },
    { say: 'Now the production environment. It gets its own warning colour, so you always know where you are before you touch anything.',
      do: async () => { await rec.hover('#asp-logo-btn', 800); await sleep(500); await rec.click('#asp-orb-env-btn', 800); await sleep(900)
        await rec.click('.asp-orb-envopt[data-env="prod"]', 900); await sleep(1800); await sleep(2000); await rec.resync() } },
    { say: 'Back on Local. A real instance on port forty five oh two.',
      do: async () => { await rec.hover('#asp-logo-btn', 800); await sleep(500); await rec.click('#asp-orb-env-btn', 800); await sleep(900)
        await rec.click('.asp-orb-envopt[data-env="local"]', 900); await sleep(1800); await sleep(2000); await rec.resync() } },
    { hold: 0.2, do: async () => { await parkAway(rec) } },
  ],
})
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
