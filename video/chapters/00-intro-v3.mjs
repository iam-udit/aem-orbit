// Chapter 0 (v3) - Comprehensive Introduction & Architecture walkthrough.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/00-intro-v3.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

await runChapter('00-intro-v3', {
  url: `${AUTHOR.dev}${PAGE}`,
  settle: 3000,
  steps: (rec) => [
    {
      say: 'Welcome to AEM Orbit, an enterprise browser extension built specifically for authors, developers, and architects working across Adobe Experience Manager every day.',
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
        await T.expand(rec)
        await sleep(1000)
        await rec.hover('#asp-status-pill', 1200)
        await sleep(1500)
        await rec.hover('#asp-env-chip', 1200)
        await sleep(1500)
      },
    },
    {
      say: 'Whether you are working locally on port 4502, or across Dev, Stage, and Production tiers, Orbit keeps the exact same content synchronized across Author, Preview, Publisher, and live CDN domains with a single click.',
      do: async () => {
        await rec.hover('#asp-tier-btn', 1200)
        await sleep(1500)
        await rec.hover('#asp-locales-btn', 1200)
        await sleep(2000)
      },
    },
    {
      say: 'Content teams can edit, preview, and publish pages immediately, run automatic reference pre-flight checks before activation, and safeguard live environments with Production Guard typed confirmations.',
      do: async () => {
        await rec.hover('#asp-publish-menu-btn', 1500)
        await sleep(2000)
        await rec.hover('#asp-status-pill', 1500)
        await sleep(1500)
      },
    },
    {
      say: 'For developers, Orbit delivers instant in-page diagnostics: an interactive JCR tree inspector, component and DAM asset cards, cache header analysis with one-line verdicts, cross-environment content sync, and automated SEO and accessibility audits.',
      do: async () => {
        await rec.hover('#asp-inspect-btn', 1200)
        await sleep(1200)
        await rec.hover('#asp-sync-btn', 1200)
        await sleep(1500)
        await rec.hover('#asp-more-btn', 1200)
        await sleep(1800)
      },
    },
    {
      say: 'Crucially, Orbit operates with complete client-side security. There is zero telemetry, no external services, and your authentication credentials and session tokens never leave your browser sandbox.',
      do: async () => {
        await rec.hover('#asp-status-pill', 1200)
        await sleep(2000)
        await rec.moveTo(1250, 520, 1000)
        await sleep(2000)
      },
    },
    {
      say: 'Let us begin by exploring the core interaction hub of AEM Orbit: the floating Orb and Heads-Up Display.',
      do: async () => {
        await rec.moveTo(960, 960, 1000)
        await sleep(2000)
      },
    },
  ],
})
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
