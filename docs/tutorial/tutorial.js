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
      id: '00-intro', label: '0', title: 'Introduction & Personas Architecture', duration: 97,
      description: 'Cross-browser WebExtension for Adobe Experience Manager with role-tailored Author, QA, Developer, and Custom personas.',
      topics: ['Cross-browser WebExtension across Chromium, Firefox MV3, and Safari', 'Local, Dev, Stage, and Prod; Author, Preview, Publish, and CDN', 'Role-tailored Author, QA, Developer, and Custom personas', 'Privacy: zero telemetry, zero analytics, isolated credentials'],
    },
    {
      id: '01-orb', label: '1', title: 'The Orb & Persona Fan', duration: 173,
      description: 'The animated Orb, its publication badge, radial leaves adapting live to QA/Author/Dev personas, and JCR Expand/Collapse controls.',
      topics: ['Orb caption and live environment color coding', 'Radial leaves adapting dynamically across Custom and QA personas', 'Environment sub-leaves with Production crimson warning glow', 'In-page JCR inspector with Expand All, Collapse All, live search, and path copy'],
    },
    {
      id: '01b-orb-position', label: '1b', title: 'Positioning the Orb', duration: 130,
      description: 'Drag the Orb anywhere, watch the fan dynamically adapt to viewport bounds, summon via long-press, or toggle Classic Mini-Bar.',
      topics: ['Dragging to all corners and screen edges; radial fan flips orientation', 'Per-domain position persistence across page reloads', 'Long-press pointer summon and Esc dismissal', 'Radial Orb versus classic horizontal Mini-Bar across browsers'],
    },
    {
      id: '02-toolbar', label: '2', title: 'Toolbar & Personas', duration: 210,
      description: 'Expanded toolbar with live More-menu persona switching, tiers, cross-env jumps, viewport-bounded scrollable locales, and toasts.',
      topics: ['Live persona switching (QA vs Custom) directly from the More menu', 'Tier switcher: Edit, View, Preview, Published, Live CDN', 'Environment chip with Shift-click and Cmd-click new tab behavior', 'Viewport-bounded scrollable Language Masters and 20-locale MSM lists', 'Live details panel and action toasts with instantaneous Undo'],
    },
    {
      id: '03-authoring', label: '3', title: 'Authoring & Replication Governance', duration: 259,
      description: 'Publish safely: pre-flight dependency checks, preview tier, page lock, tree/bulk publishing with dry runs, and Prod Guard.',
      topics: ['Publish and unpublish with pre-flight reference detection', 'Cloud Preview tier replication', 'Locking and unlocking pages via Cmd+K with Touch UI status updates', 'Tree publishing with QueryBuilder dry run and skipped count', 'Bulk replication (up to 200 paths) with error isolation & retry', 'Safe delete with force=false reference warnings and Prod Guard'],
    },
    {
      id: '04-devtools', label: '4', title: 'Developer Tools & Inspectors', duration: 349,
      description: 'Expandable JCR tree, SHA-256 diff, component & DAM cards, Content Fragment headless JSON, dev links, overlays, and cache headers.',
      topics: ['Viewport-bounded JCR tree with Expand All, Collapse All, search & path copy', 'Cross-environment SHA-256 comparison and Stage vs Dev property diff', 'Component inspector with CRXDE Lite, Model JSON & Infinity JSON links', 'Highlight components and DAM / Content Fragment headless JSON inspectors', 'Developer links, CDN cache header HIT/MISS inspection, hard reload & overlays'],
    },
    {
      id: '05-sync', label: '5', title: 'Content Synchronization', duration: 93,
      description: 'Guardrailed cross-environment sync: downward Pull/Push safety, pre-sync diff, automatic version backup, and instant rollback.',
      topics: ['1-click content sync between environments without CRX packages', 'Direction safety: higher -> lower protection vs upward override', 'Pre-sync visual property diff before writing target node', 'Automatic timestamped AEM version snapshot and instant Undo rollback', 'Pre-stage 404 to post-stage page creation from Prod CDN to Local'],
    },
    {
      id: '06-seo', label: '6', title: 'SEO & Accessibility Audits', duration: 82,
      description: 'Viewport-bounded audit engine checking metadata, headings, alt text, duplicate DOM IDs, broken/unsized images, 404 links & JSON export.',
      topics: ['1-click Audit action from QA/Dev toolbar or Cmd+K', 'Benchmarking passing (92/100) vs failing (32/100) pages', 'Duplicate DOM IDs, broken images, missing width/height dimensions & 404 links', 'Copy JSON and Export JSON audit reports for ticket workflows'],
    },
    {
      id: '07-workspace', label: '7', title: 'Popup Workspace & QA Readiness', duration: 108,
      description: 'Multi-page console with header Persona & Env switchers, QA Release Readiness, SHA-256 Diff Back/Copy, Versions & Find & Replace.',
      topics: ['Header Persona switcher pill and clickable Environment badge', 'One-click QA Release Readiness checklist in QA/Dev persona', 'Cross-env SHA-256 compare with visual diff Back & Copy Diff JSON', 'Recent/starred page bookmarks with per-item cleanup & Version checkpoints', 'URL Variants, Quick Links, CSV Action Log, Find & Replace & Dispatcher Flush'],
    },
    {
      id: '08-eds', label: '8', title: 'Edge Delivery Services & Universal Editor', duration: 56,
      description: 'Bidirectional EDS (.aem.page / .aem.live) tier switching with query preservation, deduplicated Copy URLs, and Universal Editor canvas.',
      topics: ['Deduplicated Universal Editor URL variants with IMS tenant mapping', 'EDS host detection (.aem.page preview vs .aem.live production)', 'Bidirectional EDS tier switching preserving query parameters', 'Direct Universal Editor visual canvas launch'],
    },
    {
      id: '09-enterprise', label: '9', title: 'Enterprise Governance & Policies', duration: 71,
      description: 'Multi-site brand profiles CRUD, zero-trust storage, SAML SSO enforcement, persona policy locking, and administrator configuration lockdown.',
      topics: ['Multi-Site Brand Profiles CRUD resolving site roots & mappings dynamically', 'Zero-trust storage: zero telemetry, strict extension origin verification', 'EnforceSessionAuthOnly disabling local passwords and tokens', 'ControlPolicy & allowedPersonas locking out Developer persona', 'LockConfiguration read-only administrator banner & disabled Save'],
    },
    {
      id: '10-settings', label: '10', title: 'Settings Console & 4 Personas', duration: 120,
      description: 'Dynamic Author/QA/Dev/Custom settings cards, Customize-in-Custom cloning, Brand Profiles, 5-tier latency diagnostics & Toolbar Editor.',
      topics: ['Dynamic 4-Persona switching (Author, QA, Dev, Custom) & Clone to Custom', '3-step Quick Setup card, themes & JSON backup/shareable setup URL', 'Per-env panels with CSRF check and 5-tier millisecond diagnostics', 'Live style switching (Orb vs Classic Mini-Bar) & Toolbar Customizer', 'Developer Mode granular toggles, QA verification switches & Factory Reset'],
    },
    {
      id: '11-shortcuts', label: '11', title: 'Keyboard Shortcuts & Command Palette', duration: 58,
      description: 'Keyboard-first workflows: Option+Shift+K toggle, Cmd+K keyword-indexed search ranking, A-Z menu jumps & universal Escape dismissal.',
      topics: ['Option+Shift+K instant toolbar collapse and expansion', 'Cmd+K / Ctrl+K Command Palette with keyword-indexed ranking (audit, jcr, persona)', 'Arrow Up/Down navigation & Enter instant execution', 'Type-ahead A-Z menu jumps and universal Escape cancellation'],
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
    player.src = `${VIDEO_BASE}${c.id}-v4.mp4`
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
