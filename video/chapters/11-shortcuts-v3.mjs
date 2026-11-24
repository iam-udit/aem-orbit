// Chapter 11 (v3) - Keyboard Shortcuts & Command Palette.
// Run: ORBIT_ADMIN_PW=admin node video/chapters/11-shortcuts-v3.mjs
import { runChapter, AUTHOR } from '../lib/chapter.mjs'
import { sleep } from '../lib/cdp.mjs'
import * as T from '../lib/toolbar.mjs'

const log = (...a) => console.log(' ', ...a)

const START_PAGE = `${AUTHOR.dev}/content/wknd/us/en/magazine.html?wcmmode=disabled`

await runChapter('11-shortcuts-v3', {
  url: START_PAGE,
  settle: 3000,
  steps: (rec) => [
    // 1. Overview & Option+Shift+K Toolbar Toggle
    {
      say: 'Welcome to Chapter 11. In this chapter, we explore keyboard shortcuts designed for power users, enabling rapid navigation, command execution, and interface control without reaching for the mouse.',
      do: async () => {
        await rec.title('Chapter 11 · <b>Keyboard Shortcuts</b> &amp; command palette', 'Fast keyboard navigation: Command palette Cmd+K, Alt+Shift+K toolbar toggle, Esc dismissal, and arrow navigation')
        await sleep(3500)
        await rec.untitle()
        await sleep(500)

        await T.expand(rec)
        await sleep(1000)

        // Press Option+Shift+K (modifiers: 9 = Alt+Shift) to collapse toolbar into Orb
        log('pressing Option+Shift+K to collapse...')
        await rec.key('k', { code: 'KeyK', modifiers: 9 })
        await sleep(1500)

        // Hover collapsed orb
        await rec.hover('#asp-logo-btn', 1000)

        // Press Option+Shift+K again to expand back into full toolbar
        log('pressing Option+Shift+K to expand...')
        await rec.key('k', { code: 'KeyK', modifiers: 9 })
        await sleep(1500)
      },
    },

    // 2. Open Command Palette via Cmd+K
    {
      say: 'Pressing Command+K on macOS or Control+K on Windows instantly summons the Command Palette. The palette provides a fast, keyboard-first modal overlay that indexes every action across the extension.',
      do: async () => {
        log('pressing Cmd+K to open Command Palette...')
        await rec.key('k', { code: 'KeyK', modifiers: T.META })
        await rec.waitFor('#asp-palette', 5000)
        await sleep(1500)

        // Hover command palette input
        await rec.hover('#asp-palette .asp-inspector-search-input', 1000)
      },
    },

    // 3. Fuzzy Search across All Actions
    {
      say: 'The command palette features live fuzzy search. Typing search terms instantly filters available actions—including publishing, versioning, CRXDE links, cache invalidation, and developer inspectors.',
      do: async () => {
        log('typing fuzzy search: pub...')
        await rec.type('pub', 80)
        await sleep(1500)

        // Clear query
        await rec.tab.eval(`(() => {
          const inp = document.querySelector('#asp-palette .asp-inspector-search-input')
          if (inp) {
            inp.value = ''
            inp.dispatchEvent(new Event('input', { bubbles: true }))
          }
        })()`)
        await sleep(600)

        // Type: jcr
        log('typing fuzzy search: jcr...')
        await rec.type('jcr', 80)
        await sleep(1500)
      },
    },

    // 4. Arrow Up/Down and Enter Selection
    {
      say: 'You can navigate results seamlessly using the Arrow Up and Down keys, highlighting actions with keyboard focus, and press Enter to execute the selected operation immediately.',
      do: async () => {
        log('navigating palette with arrow keys...')
        await rec.key('ArrowDown')
        await sleep(600)
        await rec.key('ArrowUp')
        await sleep(600)

        log('pressing Enter on selected command...')
        await rec.key('Enter')
        await rec.waitFor('#asp-inspector', 8000)
        await sleep(2200)

        // Close JCR inspector panel
        await rec.click('#asp-inspector-close', 600)
        await sleep(1000)
      },
    },

    // 5. Menu Keyboard Navigation, A-Z Letter Jump & Universal Escape
    {
      say: 'Menus also support rapid keyboard navigation. You can navigate items using Arrow keys or press any letter key to jump directly to matching actions—such as pressing C for Copy URL or D for Developer links. Pressing Escape provides universal dismissal, cleanly closing menus, inspectors, and modal dialogs.',
      do: async () => {
        // Open More menu and navigate with ArrowDown
        log('opening More menu...')
        await T.openMenu(rec, '#asp-more-btn')
        await sleep(1000)

        log('navigating menu with ArrowDown...')
        await rec.key('ArrowDown')
        await sleep(500)
        await rec.key('ArrowDown')
        await sleep(600)

        log('jumping with letter keys: c, d...')
        await rec.key('c')
        await sleep(700)
        await rec.key('d')
        await sleep(700)

        // Press Escape to close More menu
        log('pressing Escape to close menu...')
        await rec.key('Escape')
        await sleep(1200)

        // Activate Component Inspector mode
        log('activating Component Inspector...')
        await rec.click('#asp-inspect-btn', 600)
        await sleep(1500)

        // Press Escape to cancel Component Inspector
        log('pressing Escape to cancel inspect mode...')
        await rec.key('Escape')
        await sleep(1500)
      },
    },

    // 6. Wrap-up
    {
      say: 'This concludes Chapter 11. With Command+K, Option+Shift+K, arrow navigation, and universal Escape dismissal, AEM Orbit provides keyboard-first speed and productivity for every AEM author and developer.',
      do: async () => {
        await sleep(1000)
        await rec.hover('#asp-status-pill', 1500)
        await sleep(1000)
      },
    },
  ],
})
process.exit(process.exitCode || 0)

