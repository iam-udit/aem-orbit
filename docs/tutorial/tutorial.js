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
      id: '00-intro', label: '0', title: 'Introduction', duration: 54,
      description: 'What AEM Orbit is and how it fits into your day in Adobe Experience Manager.',
      topics: ['A floating control surface on top of any AEM page', 'Local, Dev, Stage and Prod; author, publisher and CDN', 'Developer tools, SEO and accessibility checks', 'Privacy: no telemetry, no external service'],
    },
    {
      id: '01-orb', label: '1', title: 'The Orb and the fan', duration: 166,
      description: 'The animated Orb, its caption, the seven-leaf fan and the environment switch.',
      topics: ['Orb caption and live environment colour', 'The seven leaves: Edit, View, Live, Properties, Environment, JCR, Sites', 'Switching Dev, Stage, Prod and Local from the fan', 'Searching the JCR properties of a page'],
    },
    {
      id: '01b-orb-position', label: '1b', title: 'Positioning the Orb', duration: 143,
      description: 'Drag the Orb anywhere, watch the fan adapt, and choose between the Orb and the Mini-Bar.',
      topics: ['Dragging to the corners and edges; the fan flips direction', 'The position is remembered', 'Long-press summon and Esc to dismiss', 'Orb versus Mini-Bar'],
    },
    {
      id: '02-toolbar', label: '2', title: 'Toolbar and navigation', duration: 251,
      description: 'The horizontal toolbar: status, tiers, cross-environment jumps, locales and toasts.',
      topics: ['Status pill and the page details panel', 'Tier switcher: Author, Preview, Published, Live', 'Environment chip; Shift-click and Cmd-click behaviour', 'Language Masters and live copies', 'Toasts with Undo and View live'],
    },
    {
      id: '03-authoring', label: '3', title: 'Authoring and replication', duration: 337,
      description: 'Publish safely: pre-flight checks, preview tier, locks, tree and bulk publishing, and Prod Guard.',
      topics: ['Publish and unpublish with a pre-flight reference check', 'Preview tier publishing', 'Locking and unlocking a page', 'Tree publish with a dry run', 'Bulk publish from the popup', 'Safe delete', 'Typed confirmations on protected environments'],
    },
    {
      id: '04-devtools', label: '4', title: 'Developer tools', duration: 400,
      description: 'Everything a developer would open in another tab, on the page itself.',
      topics: ['JCR tree inspector with live filter', 'Environment comparison and property diff', 'Component inspector, with CRXDE deep link', 'Highlight components and DAM asset inspector', 'Developer links, CDN cache headers, overlays', 'Hard reload'],
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
    player.src = `${VIDEO_BASE}${c.id}.mp4`
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
