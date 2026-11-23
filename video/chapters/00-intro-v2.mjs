// Chapter 0 (v2) - Enhanced introduction to AEM Orbit with Christopher Neural voiceover.
// Run: ORBIT_ADMIN_PW=admin python3 video/scripts/detach.py /tmp/ch0-v2.log node video/chapters/00-intro-v2.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

await runChapter('00-intro-v2', {
  url: `${AUTHOR.dev}${PAGE}`,
  steps: (rec) => [
    {
      say: 'This is AEM Orbit, an enterprise browser extension built specifically for authors, developers, and architects working across Adobe Experience Manager every day.',
      do: async () => {
        await rec.title('Chapter 0 · <b>Introduction</b> &amp; Architecture', 'Author, publish, and CDN in one unified floating control surface')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await rec.moveTo(1250, 480, 1400)
        await sleep(1500)
        await rec.moveTo(1100, 560, 1000)
      },
    },
    {
      say: 'Managing distributed AEM Cloud environments usually means juggling dozens of browser tabs, manually editing complex JCR paths, and switching between author, publish, and CDN hostnames. Orbit eliminates this friction by embedding a unified, context-aware control surface directly inside every page you visit.',
      do: async () => {
        await rec.moveTo(960, 750, 1200)
        await sleep(2500)
        await rec.moveTo(960, 960, 1200)
        await sleep(2500)
      },
    },
    {
      say: 'Whether you are working locally on port 4502, or across Dev, Stage, and Production tiers, Orbit keeps the exact same content synchronized across Author, Preview, Publisher, and live CDN domains with a single click.',
      do: async () => {
        await rec.hover('#asp-logo-btn', 900)
        await sleep(4000)
      },
    },
    {
      say: 'Content teams can edit, preview, and publish pages immediately, run automatic reference pre-flight checks before activation, and safeguard live environments with Production Guard typed confirmations.',
      do: async () => {
        await rec.moveTo(850, 920, 800)
        await sleep(2500)
        await rec.moveTo(1070, 920, 800)
        await sleep(3000)
      },
    },
    {
      say: 'For developers, Orbit delivers instant in-page diagnostics: an interactive JCR tree inspector, component and DAM asset cards, cache header analysis with one-line verdicts, cross-environment content sync, and automated SEO and accessibility audits.',
      do: async () => {
        await rec.moveTo(960, 960, 800)
        await sleep(4500)
      },
    },
    {
      say: 'Crucially, Orbit operates with complete client-side security. There is zero telemetry, no external services, and your authentication credentials and session tokens never leave your browser sandbox.',
      do: async () => {
        await rec.moveTo(1250, 520, 1000)
        await sleep(3500)
      },
    },
    {
      say: 'Let us begin by exploring the core interaction hub of AEM Orbit: the floating Orb and Heads-Up Display.',
      do: async () => {
        await rec.untitle()
        await rec.moveTo(960, 960, 1000)
        await sleep(2000)
      },
    },
  ],
})
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
