// AEM Orbit video tutorial: chapter player. Plain JS, no dependencies, no external calls except the video files themselves.
// To add a chapter: append an entry to CHAPTERS (`id` = the mp4 file name without extension), upload the mp4 to the release (see docs/tutorial/README.md), add a poster.
(() => {
  'use strict'

  // Where the mp4 files live. On GitHub Pages they are release assets (git is not a good home for ~120 MB of video);
  // when this page is opened locally (file:// or localhost) the same file names are read from ./videos/.
  const RELEASE_BASE = 'https://github.com/iam-udit/aem-orbit/releases/download/tutorial-videos/'
  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname)
  const VIDEO_BASE = isLocal ? 'videos/' : RELEASE_BASE

  const CHAPTERS = [
    {
      id: '00-intro', label: '0', title: 'Introduction & Architecture', duration: 99,
      description: 'What AEM Orbit is and how it fits into your daily workflow across Adobe Experience Manager environments.',
      topics: ['Floating HUD control surface on top of any AEM page', 'Local, Dev, Stage, and Prod; Author, Publisher, and CDN', 'Developer tools, SEO, and accessibility checks', 'Privacy: no telemetry, no analytics, credentials stay in service worker'],
    },
    {
      id: '01-orb', label: '1', title: 'The Orb and the fan', duration: 220,
      description: 'The animated Orb, its caption, the seven-leaf radial fan and the live environment switch.',
      topics: ['Orb caption and live environment status color', 'The seven leaves: Edit, View, Live, Properties, Environment, JCR, Sites', 'Switching Dev, Stage, Prod and Local from the fan', 'Searching and filtering JCR properties in real-time'],
    },
    {
      id: '01b-orb-position', label: '1b', title: 'Positioning the Orb', duration: 167,
      description: 'Drag the Orb anywhere, watch the fan dynamically adapt, and toggle between Orb and Mini-Bar styles.',
      topics: ['Dragging to all corners and screen edges; radial fan flips orientation', 'Per-domain position persistence across page reloads', 'Long-press pointer summon and Esc dismissal', 'Radial Orb versus classic horizontal Mini-Bar'],
    },
    {
      id: '02-toolbar', label: '2', title: 'Toolbar and navigation', duration: 260,
      description: 'The horizontal toolbar: status pill, tier switcher, cross-environment jumps, locales and toasts.',
      topics: ['Status pill and the live page details panel', 'Tier switcher: Author, Preview, Published, Live', 'Environment chip with Shift-click and Cmd-click new tab behavior', 'Language Masters and multi-site MSM live copies', 'Toasts with instantaneous Undo and View Live'],
    },
    {
      id: '03-authoring', label: '3', title: 'Authoring and replication', duration: 365,
      description: 'Publish safely: pre-flight checks, preview tier, page lock, tree and bulk publishing, and Prod Guard.',
      topics: ['Publish and unpublish with pre-flight reference detection', 'Cloud Preview tier replication', 'Locking and unlocking pages with ownership badges', 'Tree publishing with simulated dry run', 'Bulk publishing from the popup workspace', 'Safe delete with reference warnings', 'Prod Guard typed confirmation protection'],
    },
    {
      id: '04-devtools', label: '4', title: 'Developer tools', duration: 451,
      description: 'Everything an AEM developer needs without leaving the page.',
      topics: ['JCR tree inspector with real-time property filtering', 'Environment comparison and property-level diff', 'Component inspector with CRXDE Lite deep links', 'Highlight components and DAM / Content Fragment asset inspectors', 'Developer links, CDN cache headers, and overlay toggles', 'Hard reload bypassing browser and CDN cache'],
    },
    {
      id: '05-sync', label: '5', title: 'Content synchronization', duration: 181,
      description: 'Bi-directional content sync: pull from Prod, push to lower tiers, side-by-side diff, and version backup.',
      topics: ['1-click content sync between environments', 'Direction safety: downward pull vs upward push protection', 'Side-by-side visual diff before applying sync', 'Automatic version snapshot before content overwrite', 'Instant rollback undo'],
    },
    {
      id: '06-seo', label: '6', title: 'SEO and accessibility audit', duration: 172,
      description: 'In-page audit engine: Core Web Vitals, metadata, headings, alt text, link health, and score benchmarks.',
      topics: ['Comprehensive SEO & a11y audit engine with score ring', 'Benchmarking optimized (92/100) vs unoptimized (32/100) pages', 'Broken 404 internal and external link detection', 'Export audit results as downloadable JSON report'],
    },
    {
      id: '07-workspace', label: '7', title: 'Popup Workspace Console', duration: 198,
      description: 'Complete extension workspace: fuzzy search, cross-env SHA-256 compare, recents, quick links, and CDN flush.',
      topics: ['Fuzzy search across all extension operations and pages', 'Cross-environment page compare with SHA-256 content checksums', 'Recent pages history and bookmarked starred pages', 'Audit log export to CSV and batch find & replace', 'Instant CDN edge cache invalidation'],
    },
    {
      id: '08-eds', label: '8', title: 'Edge Delivery Services & Universal Editor', duration: 170,
      description: 'Franklin / EDS block-based authoring integration and Universal Editor workspace workflows.',
      topics: ['Live EDS tier switcher between Preview (.aem.page) and Live (.aem.live)', 'Content source jump to underlying Google Drive / SharePoint docs', 'Universal Editor 1-click launch with IMS org resolution', 'Cloud Manager pipeline status and git repository links'],
    },
    {
      id: '09-enterprise', label: '9', title: 'Enterprise governance & managed policies', duration: 137,
      description: 'Enterprise zero-trust architecture, multi-brand site profiles, and Chrome managed-policy simulation.',
      topics: ['Multi-brand site profiles with automatic root and mapping resolution', 'Zero-trust architecture: zero analytics, zero external calls', 'EnforceSessionAuthOnly: strict SSO session cookies, credentials disabled', 'ControlPolicy: centralized restriction of delete, sync, and dev mode', 'LockConfiguration: read-only policy banner and locked settings'],
    },
    {
      id: '10-settings', label: '10', title: 'Settings & Options Console', duration: 242,
      description: 'The master Options configuration console covering all 13 setup and customization matrices.',
      topics: ['3-step quick onboarding card and light/dark theme switcher', 'Settings export/import JSON and shareable team setup URLs', 'Per-environment host panels with live CSRF check and millisecond ping', 'Drag-and-drop toolbar button layout editor (Mini vs Expanded bar)', 'Developer Mode granular controls matrix and safety toggles'],
    },
    {
      id: '11-shortcuts', label: '11', title: 'Keyboard Shortcuts & Command Palette', duration: 93,
      description: 'Power user keyboard workflows: Cmd+K Command Palette, Option+Shift+K toggle, and universal Escape dismissal.',
      topics: ['Option+Shift+K instant toolbar collapse and expansion', 'Cmd+K / Ctrl+K Command Palette summoning from any page', 'Real-time fuzzy search and arrow key command execution', 'Type-ahead A-Z letter jumping across popover menus', 'Universal Escape dismissal of dialogs, inspectors, and modes'],
    },
  ]

  const $ = (id) => document.getElementById(id)
  const player = $('player')
  const list = $('chapters')
  let current = 0

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

  const buttons = CHAPTERS.map((c, i) => {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chapter'
    const img = document.createElement('img')
    img.src = `posters/${c.id}.jpg`
    img.alt = ''
    img.loading = 'lazy'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = `${c.label}. ${c.title}`
    const sub = document.createElement('span')
    sub.className = 'sub'
    sub.textContent = fmt(c.duration)
    b.append(img, name, sub)
    b.addEventListener('click', () => select(i, true))
    li.append(b)
    list.append(li)
    return b
  })

  const total = CHAPTERS.reduce((n, c) => n + c.duration, 0)
  $('total').textContent = `${CHAPTERS.length} chapters · ${fmt(total)}`

  function select(i, play) {
    current = i
    const c = CHAPTERS[i]
    buttons.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'))
    $('kicker').textContent = `Chapter ${c.label}`
    $('title').textContent = c.title
    $('description').textContent = c.description
    const ul = $('topics')
    ul.replaceChildren(...c.topics.map((t) => Object.assign(document.createElement('li'), { textContent: t })))
    $('prev').disabled = i === 0
    $('next').disabled = i === CHAPTERS.length - 1
    $('fallback').hidden = true
    player.poster = `posters/${c.id}.jpg`
    player.src = `${VIDEO_BASE}${c.id}-v3.mp4`
    player.playbackRate = Number($('speed').value)
    history.replaceState(null, '', `#${c.id}`)
    document.title = `${c.title} · AEM Orbit video tutorial`
    if (play) player.play().catch(() => {})
  }

  $('prev').addEventListener('click', () => select(Math.max(0, current - 1), true))
  $('next').addEventListener('click', () => select(Math.min(CHAPTERS.length - 1, current + 1), true))
  $('speed').addEventListener('change', () => { player.playbackRate = Number($('speed').value) })
  player.addEventListener('loadedmetadata', () => { player.playbackRate = Number($('speed').value) })
  player.addEventListener('error', () => { $('fallback').hidden = false })
  player.addEventListener('ended', () => {
    if ($('autoplay').checked && current < CHAPTERS.length - 1) select(current + 1, true)
  })

  const start = CHAPTERS.findIndex((c) => c.id === location.hash.slice(1))
  select(start >= 0 ? start : 0, false)
})()
