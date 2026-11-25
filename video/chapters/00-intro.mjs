// Chapter 0 (v4) - Introduction, Workspace Personas & All-Browser Architecture.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/00-intro.mjs
import { runChapter, AUTHOR, OUT } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const PAGE = '/content/wknd/us/en/magazine.html?wcmmode=disabled'

await runChapter('00-intro-v4', {
  url: `${AUTHOR.dev}${PAGE}`,
  settle: 3000,
  steps: (rec) => [
    {
      say: 'Welcome to AEM Orbit, a cross-browser extension engineered for Chrome, Edge, Firefox, and Safari teams working across Adobe Experience Manager every day.',
      do: async () => {
        await rec.title('Chapter 0 · <b>Introduction</b> &amp; Personas Architecture', 'Cross-browser WebExtension · Author, QA, Developer &amp; Custom Personas')
        await sleep(3500)
        await rec.untitle()
        await sleep(400)
        await rec.moveTo(1250, 480, 1400)
        await sleep(1500)
        await rec.moveTo(1100, 560, 1000)
      },
    },
    {
      say: 'Managing distributed AEM Cloud environments usually means juggling dozens of tabs and switching manually between author, publish, preview, and CDN hostnames. Orbit embeds a unified, persona-aware control surface directly inside every page you visit.',
      do: async () => {
        await T.expand(rec)
        await sleep(1000)
        await rec.hover('#asp-status-pill', 1200)
        await sleep(1400)
        await rec.hover('#asp-env-chip', 1200)
        await sleep(1400)
      },
    },
    {
      say: 'New workspace personas tailor every toolbar button, popup tool, and radial Orb leaf cleanly to your role: Author, QA, Developer, or Custom with granular manual controls.',
      do: async () => {
        await T.openMenu(rec, '#asp-more-btn')
        await sleep(2200)
        await rec.key('Escape')
        await sleep(800)
      },
    },
    {
      say: 'Content authors edit, preview, and publish safely with automatic dependency pre-flight checks and Production Guard typed confirmations. QA engineers get dedicated SEO audits, CDN cache header checks, and a multi-environment readiness matrix without risk of accidental edits.',
      do: async () => {
        await rec.hover('#asp-publish-menu-btn', 1200)
        await sleep(1500)
        await rec.hover('#asp-locales-btn', 1200)
        await sleep(1500)
      },
    },
    {
      say: 'For developers, Orbit delivers instant in-page diagnostics: a searchable JCR tree with Expand All, component and DAM asset cards, cache header analysis, cross-environment content sync, and a keyboard-first Command Palette.',
      do: async () => {
        await rec.hover('#asp-inspect-btn', 1100)
        await sleep(1000)
        await rec.hover('#asp-sync-btn', 1100)
        await sleep(1000)
        await rec.hover('#asp-palette-btn', 1100)
        await sleep(1500)
      },
    },
    {
      say: 'Orbit operates with complete client-side zero-trust security: zero telemetry, strict extension message origin verification, and credentials isolated strictly inside local or session storage.',
      do: async () => {
        await rec.hover('#asp-status-pill', 1200)
        await sleep(1800)
        await rec.moveTo(1250, 520, 1000)
        await sleep(1800)
      },
    },
    {
      say: 'Let us begin by exploring the core interaction hub of AEM Orbit: the floating Orb and persona-adaptive Heads-Up Display.',
      do: async () => {
        await rec.moveTo(960, 960, 1000)
        await sleep(2000)
      },
    },
  ],
})
console.log('chapter written to', OUT)
process.exit(process.exitCode || 0)
