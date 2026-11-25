// Chapter 11 (v4) - Keyboard Shortcuts, Command Palette Keyword Search & Persona Commands.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/11-shortcuts.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const START_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

await runChapter('11-shortcuts-v4', {
  url: START_PAGE,
  settle: 3000,
  steps: (rec) => [
    {
      say: 'Welcome to Chapter 11. AEM Orbit delivers keyboard-first speed via Option+Shift+K toggling, Command+K fuzzy command search, A-to-Z menu jumps, and universal Escape cancellation.',
      do: async () => {
        await rec.title('Chapter 11 · <b>Keyboard Shortcuts</b> &amp; Command Palette', 'Option+Shift+K toggle, Cmd+K keyword search, arrows+Enter &amp; Esc dismissal')
        await sleep(3500)
        await rec.untitle()
        await T.expand(rec)
        await sleep(900)
        await rec.key('k', { code: 'KeyK', modifiers: 9 })
        await sleep(1400)
        await rec.hover('#asp-logo-btn', 800)
        await rec.key('k', { code: 'KeyK', modifiers: 9 })
        await sleep(1200)
      },
    },
    {
      say: 'Press Command+K or Control+K anywhere to summon the Command Palette. Enhanced keyword indexing now matches synonyms intuitively—type audit to locate the SEO and Accessibility audit immediately, and press Enter to run it live.',
      do: async () => {
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await rec.waitFor('#asp-palette', 5000)
        await sleep(900)
        await rec.type('audit', 80)
        await sleep(1400)
        await rec.key('Enter')
        await rec.waitFor('#asp-audit-panel .asp-audit-score', 12000)
        await sleep(1800)
        await rec.key('Escape')
        await sleep(900)
      },
    },
    {
      say: 'Summon Command+K again and filter by jcr or persona to inspect nodes or switch workspace persona purely from the keyboard. Arrow keys move selection, Enter executes, and Escape dismisses panels cleanly.',
      do: async () => {
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await rec.waitFor('#asp-palette', 5000)
        await rec.type('jcr', 80)
        await sleep(1200)
        await rec.key('ArrowDown')
        await sleep(450)
        await rec.key('ArrowUp')
        await sleep(450)
        await rec.key('Enter')
        await rec.waitFor('#asp-inspector', 8000)
        await sleep(1600)
        await rec.key('Escape')
        await sleep(800)
      },
    },
    {
      say: 'Inside any toolbar menu, press A through Z to jump directly to matching commands, or press Escape to exit inspection modes cleanly—completing the AEM Orbit walkthrough.',
      do: async () => {
        await T.openMenu(rec, '#asp-more-btn')
        await sleep(800)
        await rec.key('ArrowDown')
        await sleep(400)
        await rec.key('c')
        await sleep(600)
        await rec.key('d')
        await sleep(600)
        await rec.key('Escape')
        await sleep(800)
        await rec.click('#asp-inspect-btn', 600)
        await sleep(1100)
        await rec.key('Escape')
        await sleep(1400)
      },
    },
  ],
})
process.exit(process.exitCode || 0)
